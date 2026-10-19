/** 端到端功能测试：通过 Chrome DevTools 协议驱动真实浏览器
 *  用法：先 npm run dev，再 node scripts/e2e.mjs
 *  覆盖：空状态、记支出/收入、编辑、删除、账户/分类增改归档、备份导出与导入
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.E2E_PORT || 9444);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.preview');
const PROFILE_DIR = path.join(OUT_DIR, 'e2e-profile');
const DOWNLOAD_DIR = path.join(OUT_DIR, 'downloads');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, { timeout = 20000, interval = 100, label = 'condition' } = {}) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw new Error(`等待超时：${label}${lastError ? `（${lastError.message}）` : ''}`);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  sendWithTimeout(method, params = {}, timeout = 20000) {
    return Promise.race([
      this.send(method, params),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${method} 超时`)), timeout)),
    ]);
  }

  async evaluate(expression) {
    const result = await this.sendWithTimeout('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          '页面脚本执行失败'
      );
    }
    return result.result?.value;
  }

  errors() {
    const result = [];
    for (const event of this.events) {
      if (event.method === 'Runtime.exceptionThrown') {
        const details = event.params.exceptionDetails;
        result.push(details.exception?.description || details.text || '脚本异常');
      }
      if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
        const entry = event.params.entry;
        result.push(`${entry.text}${entry.url ? ` @ ${entry.url}` : ''}`);
      }
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
        result.push(event.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
      }
      if (event.method === 'Network.responseReceived') {
        const { status, url } = event.params.response;
        if (status >= 400) result.push(`HTTP ${status} ${url}`);
      }
    }
    return [...new Set(result)];
  }
}

/* ---------------- 页面操作辅助 ---------------- */

async function waitApp(cdp) {
  return cdp.evaluate(`(async () => {
    const started = Date.now();
    while (Date.now() - started < 15000) {
      if (window.__APP_ERROR__) throw new Error(window.__APP_ERROR__);
      if (window.__APP_READY__) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('应用启动超时');
  })()`);
}

async function waitUntil(cdp, expression, label = '条件', timeout = 8000) {
  return cdp.evaluate(`(async () => {
    const started = Date.now();
    while (Date.now() - started < ${timeout}) {
      try {
        if (${expression}) return true;
      } catch (error) {
        // 页面切换过程中查询可能短暂失败，继续重试
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    throw new Error('等待超时：' + ${JSON.stringify(label)});
  })()`);
}

function waitSelector(cdp, selector, label = selector) {
  return waitUntil(cdp, `document.querySelector(${JSON.stringify(selector)})`, label);
}

async function clickByText(cdp, selector, text, exact = true) {
  const match = exact
    ? `value === ${JSON.stringify(text)}`
    : `value.includes(${JSON.stringify(text)})`;
  return cdp.evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const target = nodes.find((el) => {
      const value = (el.textContent || '').trim();
      return ${match};
    });
    if (!target) throw new Error('找不到可点击元素：' + ${JSON.stringify(text)});
    target.click();
    return true;
  })()`);
}

async function go(cdp, hash) {
  await cdp.evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(250);
}

async function pressKeys(cdp, keys) {
  for (const key of keys) {
    await clickByText(cdp, '.keypad button', key);
  }
}

async function setSheetInputs(cdp, values) {
  await cdp.evaluate(`(() => {
    const sheet = document.querySelector('.sheet');
    if (!sheet) throw new Error('没有打开的弹层');
    const inputs = [...sheet.querySelectorAll('input')];
    const values = ${JSON.stringify(values)};
    values.forEach((value, index) => {
      if (!inputs[index]) return;
      inputs[index].value = value;
      inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
    });
    return inputs.length;
  })()`);
}

async function waitSheetClosed(cdp) {
  await waitUntil(cdp, `!document.querySelector('.sheet')`, '弹层关闭');
}

async function readTotals(cdp) {
  return cdp.evaluate(`(() => {
    const main = document.querySelector('.summary-main .value');
    const side = [...document.querySelectorAll('.summary-side .value')];
    return {
      expense: main ? main.textContent.trim() : null,
      income: side[0] ? side[0].textContent.trim() : null,
      balance: side[1] ? side[1].textContent.trim() : null,
    };
  })()`);
}

async function expectTotals(cdp, expected) {
  const totals = await readTotals(cdp);
  assert.deepEqual(totals, expected);
}

async function downloadJSON() {
  await waitFor(
    async () => {
      const files = await readdir(DOWNLOAD_DIR).catch(() => []);
      return files.find((name) => name.endsWith('.json'));
    },
    { label: '备份文件下载', timeout: 8000 }
  );
  await sleep(300);
  const files = await readdir(DOWNLOAD_DIR);
  const jsonFile = files.find((name) => name.endsWith('.json'));
  const content = await readFile(path.join(DOWNLOAD_DIR, jsonFile), 'utf8');
  return { name: jsonFile, path: path.join(DOWNLOAD_DIR, jsonFile), content };
}

/* ---------------- 主流程 ---------------- */

async function main() {
  await rm(PROFILE_DIR, { recursive: true, force: true });
  await rm(DOWNLOAD_DIR, { recursive: true, force: true });
  await mkdir(PROFILE_DIR, { recursive: true });
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      '--window-size=390,844',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let ws = null;
  try {
    await waitFor(
      async () => {
        const response = await fetch(`http://127.0.0.1:${PORT}/json/version`).catch(() => null);
        return response && response.ok;
      },
      { label: 'Chrome 调试端口' }
    );

    const target = await (
      await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, {
        method: 'PUT',
      })
    ).json();

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });

    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    try {
      await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: DOWNLOAD_DIR,
        eventsEnabled: true,
      });
    } catch {
      await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR });
    }

    console.log('1/9 打开应用，检查空状态');
    await cdp.send('Page.navigate', { url: `${BASE}/#/detail` });
    await waitApp(cdp);
    await waitSelector(cdp, '.empty');
    assert.ok(
      await cdp.evaluate(`document.body.textContent.includes('这个月还没有记账')`),
      '空状态文案缺失'
    );
    console.log('    通过：空状态正常');

    console.log('2/9 记一笔支出 12.34');
    await go(cdp, '#/entry');
    await waitSelector(cdp, '.keypad');
    await pressKeys(cdp, ['1', '2', '.', '3', '4']);
    await clickByText(cdp, '.entry-head button', '保存');
    await waitSelector(cdp, '.tx-item');
    await waitUntil(cdp, `document.body.textContent.includes('12.34')`, '支出出现在明细');
    await expectTotals(cdp, { expense: '¥12.34', income: '¥0.00', balance: '-¥12.34' });
    console.log('    通过：支出已保存并计入汇总');

    console.log('3/9 记一笔收入 5000');
    await go(cdp, '#/entry');
    await waitSelector(cdp, '.keypad');
    await clickByText(cdp, '.seg button', '收入');
    await pressKeys(cdp, ['5', '0', '0', '0']);
    await clickByText(cdp, '.entry-head button', '保存');
    await waitUntil(cdp, `document.body.textContent.includes('5,000.00')`, '收入出现在明细');
    await expectTotals(cdp, { expense: '¥12.34', income: '¥5,000.00', balance: '¥4,987.66' });
    console.log('    通过：收入已保存，结余计算正确');

    console.log('4/9 编辑支出：12.34 → 88.80');
    await clickByText(cdp, '.tx-item', '12.34', false);
    await waitSelector(cdp, '.keypad');
    await pressKeys(cdp, ['⌫', '⌫', '⌫', '⌫', '⌫', '8', '8', '.', '8']);
    await clickByText(cdp, '.entry-head button', '保存');
    await waitUntil(cdp, `document.body.textContent.includes('88.80')`, '修改后的金额');
    await expectTotals(cdp, { expense: '¥88.80', income: '¥5,000.00', balance: '¥4,911.20' });
    console.log('    通过：编辑生效');

    console.log('5/9 删除收入 5000');
    await clickByText(cdp, '.tx-item', '5,000.00', false);
    await waitSelector(cdp, '.keypad');
    await clickByText(cdp, '.chip', '删除', false);
    await waitSelector(cdp, '.dialog');
    await clickByText(cdp, '.dialog .btn', '删除');
    await waitUntil(cdp, `!document.body.textContent.includes('5,000.00')`, '收入被删除');
    await expectTotals(cdp, { expense: '¥88.80', income: '¥0.00', balance: '-¥88.80' });
    assert.equal(
      await cdp.evaluate(`document.querySelectorAll('.tx-item').length`),
      1,
      '应只剩 1 条记录'
    );
    console.log('    通过：删除生效');

    console.log('6/9 添加账户与分类');
    await go(cdp, '#/settings');
    await waitSelector(cdp, '.section');
    await clickByText(cdp, '.row', '添加账户', false);
    await waitSelector(cdp, '.sheet');
    await setSheetInputs(cdp, ['测试卡', '💳', '0']);
    await clickByText(cdp, '.sheet .btn', '保存');
    await waitSheetClosed(cdp);
    await waitUntil(cdp, `document.body.textContent.includes('测试卡')`, '新账户出现');

    await clickByText(cdp, '.row', '添加分类', false);
    await waitSelector(cdp, '.sheet');
    await setSheetInputs(cdp, ['宠物', '🐱']);
    await clickByText(cdp, '.sheet .btn', '保存');
    await waitSheetClosed(cdp);
    await waitUntil(cdp, `document.body.textContent.includes('宠物')`, '新分类出现');
    console.log('    通过：账户、分类创建成功');

    console.log('7/9 归档分类');
    await clickByText(cdp, '.row', '宠物', false);
    await waitSelector(cdp, '.sheet');
    await clickByText(cdp, '.sheet .btn', '归档分类');
    await waitSelector(cdp, '.dialog');
    await clickByText(cdp, '.dialog .btn', '归档');
    await waitSheetClosed(cdp);
    await waitUntil(
      cdp,
      `[...document.querySelectorAll('.row')].some((el) => el.textContent.includes('宠物') && el.textContent.includes('已归档'))`,
      '分类归档标记'
    );
    console.log('    通过：归档生效');

    console.log('8/9 导出备份并校验内容');
    await clickByText(cdp, '.row', '导出备份', false);
    const backup = await downloadJSON();
    const parsed = JSON.parse(backup.content);
    assert.equal(parsed.app, 'jianming-ledger');
    assert.equal(parsed.data.transactions.length, 1);
    assert.equal(parsed.data.transactions[0].amountCents, 8880);
    assert.ok(parsed.data.accounts.some((a) => a.name === '测试卡'), '备份缺少新账户');
    assert.ok(
      parsed.data.categories.some((c) => c.name === '宠物' && c.archived === true),
      '备份缺少归档分类'
    );
    console.log(`    通过：${backup.name}（${backup.content.length} 字节）`);

    console.log('9/9 导入备份覆盖数据');
    await go(cdp, '#/detail');
    await clickByText(cdp, '.fab', '');
    await waitSelector(cdp, '.keypad');
    await pressKeys(cdp, ['1']);
    await clickByText(cdp, '.entry-head button', '保存');
    await waitUntil(cdp, `document.querySelectorAll('.tx-item').length === 2`, '新增第二条记录');

    await go(cdp, '#/settings');
    await waitSelector(cdp, '.section');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'input[type="file"]',
    });
    assert.ok(nodeId, '找不到文件选择框');
    await cdp.send('DOM.setFileInputFiles', { files: [backup.path], nodeId });
    await waitSelector(cdp, '.dialog', '导入确认框');
    await clickByText(cdp, '.dialog .btn', '导入');
    await waitUntil(
      cdp,
      `(document.getElementById('toast') || {}).textContent.includes('导入成功')`,
      '导入成功提示',
      10000
    );
    await go(cdp, '#/detail');
    await waitUntil(cdp, `document.querySelectorAll('.tx-item').length === 1`, '导入后数据被覆盖');
    await expectTotals(cdp, { expense: '¥88.80', income: '¥0.00', balance: '-¥88.80' });
    console.log('    通过：导入成功且覆盖了当前数据');

    const errors = cdp.errors();
    if (errors.length) {
      console.log('\n控制台 / 网络错误：');
      for (const message of errors) console.log('  - ' + message);
      process.exitCode = 1;
    } else {
      console.log('\n全部 9 个场景通过，控制台无错误');
    }
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
    chrome.kill();
  }
}

main().catch((error) => {
  console.error('E2E 失败：', error.message);
  if (error.stack) console.error(error.stack.split('\n').slice(0, 4).join('\n'));
  process.exitCode = 1;
});
