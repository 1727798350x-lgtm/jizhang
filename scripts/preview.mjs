/** 基于 Chrome DevTools 协议的无头预览 + 冒烟测试
 *  用法：node scripts/preview.mjs（需要先运行 npm run dev）
 *  依赖：本机 Chrome/Edge（可用 CHROME_PATH 环境变量指定）
 *  产出：.preview/*.png 截图，并检查控制台错误、记账流程、深色主题、离线加载
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.CDP_PORT || 9333);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.preview');
const PROFILE_DIR = path.join(OUT_DIR, 'cdp-profile');
const VIEWPORT = {
  width: Number(process.env.VIEWPORT_WIDTH || 390),
  height: Number(process.env.VIEWPORT_HEIGHT || 844),
  deviceScaleFactor: 2,
  mobile: true,
};
const SCREENSHOT_PREFIX = process.env.SCREENSHOT_PREFIX || '';

const ROUTES = [
  ['detail', '#/detail'],
  ['entry', '#/entry'],
  ['stats', '#/stats'],
  ['settings', '#/settings'],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  sendWithTimeout(method, params = {}, timeout = 20000) {
    return Promise.race([
      this.send(method, params),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${method} 超时`)), timeout)
      ),
    ]);
  }

  async goto(hash) {
    await this.send('Page.navigate', { url: `${BASE}/${hash}` });
    await this.waitForApp();
    await sleep(200);
  }

  async waitForApp() {
    return this.evaluate(`(async () => {
      const started = Date.now();
      while (Date.now() - started < 15000) {
        if (window.__APP_ERROR__) throw new Error(window.__APP_ERROR__);
        if (window.__APP_READY__) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('应用启动超时，可能脚本加载失败');
    })()`);
  }

  async waitForSeed() {
    return this.evaluate(`(async () => {
      const started = Date.now();
      while (Date.now() - started < 15000) {
        if (window.__SEED_ERROR__) throw new Error(window.__SEED_ERROR__);
        if (window.__SEED_DONE__) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('演示数据写入超时');
    })()`);
  }

  async screenshot(fileName) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(OUT_DIR, SCREENSHOT_PREFIX + fileName), Buffer.from(data, 'base64'));
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
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

    const targetResponse = await fetch(
      `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`,
      { method: 'PUT' }
    );
    const target = await targetResponse.json();

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
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: VIEWPORT.deviceScaleFactor,
      mobile: VIEWPORT.mobile,
    });

    console.log('1/5 写入演示数据…');
    await cdp.send('Page.navigate', { url: `${BASE}/dev/seed-demo.html?force=1` });
    await cdp.waitForSeed();
    console.log('    演示数据就绪');

    console.log('2/5 四个主页面截图…');
    for (const [name, hash] of ROUTES) {
      await cdp.goto(hash);
      await cdp.screenshot(`${name}.png`);
      console.log(`    ${name}.png`);
    }

    await cdp.goto('#/detail');
    await cdp.evaluate(`document.querySelector('.range-switch').click()`);
    await sleep(300);
    await cdp.screenshot('range.png');
    await cdp.evaluate(`document.querySelector('.sheet-close').click()`);
    console.log('    range.png（时间段选择弹层）');

    console.log('3/5 交互冒烟：记一笔 → 明细出现');
    await cdp.goto('#/entry');
    const savedHash = await cdp.evaluate(`(async () => {
      const keypad = (t) => [...document.querySelectorAll('.keypad button')].find((b) => (b.textContent || '').trim() === t);
      for (const k of ['1', '2', '.', '3', '4']) keypad(k).click();
      const save = [...document.querySelectorAll('.entry-head button')].find((b) => (b.textContent || '').trim() === '保存');
      save.click();
      await new Promise((r) => setTimeout(r, 900));
      return location.hash;
    })()`);
    if (!String(savedHash).includes('/detail')) throw new Error(`保存后没有跳到明细页：${savedHash}`);
    const hasAmount = await cdp.evaluate(`document.body.textContent.includes('12.34')`);
    if (!hasAmount) throw new Error('新增的 12.34 没有出现在明细页');
    console.log('    通过：保存后回到明细，金额已显示');

    console.log('4/5 深色主题切换 + 截图');
    await cdp.goto('#/settings');
    await cdp.evaluate(`(async () => {
      const btn = [...document.querySelectorAll('.seg button')].find((b) => (b.textContent || '').trim() === '深色');
      btn.click();
      await new Promise((r) => setTimeout(r, 400));
    })()`);
    const theme = await cdp.evaluate(`document.documentElement.dataset.theme`);
    if (theme !== 'dark') throw new Error(`深色主题没有生效：${theme}`);
    await cdp.goto('#/detail');
    await cdp.screenshot('dark-detail.png');
    await cdp.goto('#/settings');
    await cdp.evaluate(`(async () => {
      const btn = [...document.querySelectorAll('.seg button')].find((b) => (b.textContent || '').trim() === '跟随系统');
      btn.click();
      await new Promise((r) => setTimeout(r, 300));
    })()`);
    console.log('    通过：深色主题生效并已恢复跟随系统');

    console.log('5/5 离线加载测试');
    await cdp.evaluate(`navigator.serviceWorker.ready.then(() => true)`);

    const manifestInfo = await cdp.sendWithTimeout('Page.getAppManifest', {}, 10000).catch(() => null);
    if (manifestInfo) {
      const manifestErrors = manifestInfo.errors || [];
      console.log(
        `    Manifest：${manifestInfo.url || '(无)'}，错误 ${manifestErrors.length} 个`
      );
      for (const error of manifestErrors) console.log('      - ' + (error.message || error));
    }
    const installability = await cdp
      .sendWithTimeout('Page.getInstallabilityErrors', {}, 10000)
      .catch(() => null);
    const installErrors = (installability && installability.installabilityErrors) || [];
    if (installErrors.length) {
      console.log('    安装性提示：');
      for (const error of installErrors) {
        const args = (error.errorArguments || []).map((a) => a.value).join(' ');
        console.log(`      - ${error.errorId} ${args}`);
      }
    } else {
      console.log('    安装性检查：可安装');
    }

    const swState = await cdp.evaluate(`(async () => {
      if (!('serviceWorker' in navigator)) return JSON.stringify({ supported: false });
      const reg = await navigator.serviceWorker.getRegistration();
      const cacheKeys = await caches.keys().catch(() => []);
      return JSON.stringify({
        supported: true,
        controller: !!navigator.serviceWorker.controller,
        scope: reg ? reg.scope : null,
        active: !!(reg && reg.active),
        installing: !!(reg && reg.installing),
        waiting: !!(reg && reg.waiting),
        caches: cacheKeys,
      });
    })()`);
    console.log('    SW 状态：' + swState);
    await cdp.evaluate(`navigator.serviceWorker.ready.then(() => true)`);
    await cdp.goto('#/detail');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await cdp.sendWithTimeout('Page.reload', { ignoreCache: false }, 10000);
    await cdp.waitForApp();
    const offlineTitle = await cdp.evaluate(
      `(document.querySelector('.page-title') || {}).textContent || ''`
    );
    if (!String(offlineTitle).includes('明细')) throw new Error(`离线加载失败：${offlineTitle}`);
    const offlineHasAmount = await cdp.evaluate(`document.body.textContent.includes('12.34')`);
    if (!offlineHasAmount) throw new Error('离线加载后数据丢失');
    await cdp.screenshot('offline-detail.png');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    console.log('    通过：断网后仍能打开并显示数据');

    console.log('\n控制台 / 网络错误检查：');
    const errors = cdp.errors();
    if (errors.length) {
      for (const message of errors) console.log('  - ' + message);
      process.exitCode = 1;
    } else {
      console.log('    没有发现错误');
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
  console.error('预览失败：', error.message);
  process.exitCode = 1;
});
