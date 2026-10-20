/** 设置页：外观、账户、分类、数据备份、关于 */

import * as store from '../store.js';
import * as ui from '../ui.js';
import * as theme from '../theme.js';
import { h, fmtMoney, centsToInput, parseAmountToCents, todayStr } from '../util.js';

const APP_VERSION = '1.1.5';
const THEME_OPTIONS = [
  ['system', '跟随系统'],
  ['light', '浅色'],
  ['dark', '深色'],
];

export function mount(root) {
  let categoryKind = 'expense';
  let showArchived = false;
  let mounted = true;

  function render() {
    if (!mounted) return;
    const settings = store.getSettings();

    const head = h('header', { class: 'page-head' }, h('h1', { class: 'page-title' }, '设置'));

    /* ---------- 外观 ---------- */
    const themeButtons = THEME_OPTIONS.map(([value, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: settings.theme === value ? 'active' : '',
          onclick: async () => {
            try {
              await store.updateSettings({ theme: value });
              theme.applyTheme();
              render();
            } catch (error) {
              ui.toast(error.message);
            }
          },
        },
        label
      )
    );

    const themeSection = h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-title' }, '外观'),
      h(
        'div',
        { class: 'card settings-card' },
        h('div', { class: 'seg seg--full', style: { margin: '10px 0' } }, themeButtons)
      )
    );

    /* ---------- 账户 ---------- */
    const allAccounts = [...store.allAccounts()].sort(
      (a, b) => Number(a.archived) - Number(b.archived)
    );
    const activeAccounts = allAccounts.filter((a) => !a.archived);
    const archivedCount = allAccounts.length - activeAccounts.length;
    const totalBalanceCents = activeAccounts.reduce(
      (sum, account) => sum + store.accountBalanceCents(account.id),
      0
    );
    const visibleAccounts = showArchived ? allAccounts : activeAccounts;

    const accountRows = visibleAccounts.map((account) => {
      const balance = store.accountBalanceCents(account.id);
      return h(
        'button',
        {
          class: 'row' + (account.archived ? ' archived' : ''),
          type: 'button',
          onclick: () => openAccountSheet(account),
        },
        h('span', { class: 'row-icon' }, account.emoji),
        h(
          'span',
          { class: 'row-main' },
          h(
            'span',
            { class: 'row-title' },
            account.name,
            account.archived
              ? h('span', { class: 'badge' }, '已归档')
              : account.id === settings.defaultAccountId
                ? h('span', { class: 'badge' }, '默认')
                : null
          ),
          h('span', { class: 'row-sub' }, `余额 ${fmtMoney(balance)}`)
        ),
        h('span', { class: 'row-chev' }, '›')
      );
    });
    accountRows.push(addRow('添加账户', () => openAccountSheet(null)));

    if (archivedCount > 0) {
      accountRows.push(
        h(
          'button',
          {
            class: 'row row-toggle',
            type: 'button',
            onclick: () => {
              showArchived = !showArchived;
              render();
            },
          },
          h('span', { class: 'row-icon' }, showArchived ? '▾' : '▸'),
          h(
            'span',
            { class: 'row-main' },
            h(
              'span',
              { class: 'row-title' },
              showArchived ? '收起已归档账户' : `查看已归档账户（${archivedCount}）`
            )
          )
        )
      );
    }

    const accountTotal = h(
      'section',
      { class: 'card account-total' },
      h(
        'span',
        {},
        h('span', { class: 'label' }, '账户总余额'),
        h('strong', { class: 'value num' }, fmtMoney(totalBalanceCents))
      ),
      h('span', { class: 'faint', style: { fontSize: '12px' } }, `${activeAccounts.length} 个账户`)
    );

    const accountSection = h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-title' }, '账户'),
      accountTotal,
      h('div', { class: 'card card--list' }, accountRows)
    );

    /* ---------- 分类 ---------- */
    const categorySeg = h(
      'div',
      { class: 'seg seg--full', style: { marginBottom: '10px' } },
      h(
        'button',
        {
          type: 'button',
          class: categoryKind === 'expense' ? 'active' : '',
          onclick: () => {
            categoryKind = 'expense';
            render();
          },
        },
        '支出分类'
      ),
      h(
        'button',
        {
          type: 'button',
          class: categoryKind === 'income' ? 'active' : '',
          onclick: () => {
            categoryKind = 'income';
            render();
          },
        },
        '收入分类'
      )
    );

    const categoryList = store
      .categoriesByKind(categoryKind, { includeArchived: true })
      .sort((a, b) => Number(a.archived) - Number(b.archived));
    const categoryRows = categoryList.map((category) => {
        const count = store.countTransactionsByCategory(category.id);
        return h(
          'button',
          {
            class: 'row' + (category.archived ? ' archived' : ''),
            type: 'button',
            onclick: () => openCategorySheet(category),
          },
          h('span', { class: 'row-icon' }, category.emoji),
          h(
            'span',
            { class: 'row-main' },
            h(
              'span',
              { class: 'row-title' },
              category.name,
              category.archived ? h('span', { class: 'badge' }, '已归档') : null
            ),
            h('span', { class: 'row-sub' }, `${count} 条记录`)
          ),
          h('span', { class: 'row-chev' }, '›')
        );
      });
    categoryRows.push(addRow('添加分类', () => openCategorySheet(null)));

    const categorySection = h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-title' }, '分类'),
      categorySeg,
      h('div', { class: 'card card--list' }, categoryRows)
    );

    /* ---------- 数据 ---------- */
    const fileInput = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      style: { display: 'none' },
    });
    fileInput.addEventListener('change', () => handleImport(fileInput));

    const dataSection = h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-title' }, '数据'),
      h(
        'div',
        { class: 'card card--list' },
        h(
          'button',
          { class: 'row', type: 'button', onclick: exportBackup },
          h('span', { class: 'row-icon' }, '⬇️'),
          h(
            'span',
            { class: 'row-main' },
            h('span', { class: 'row-title' }, '导出备份'),
            h('span', { class: 'row-sub' }, '生成 JSON 文件，保存到手机')
          ),
          h('span', { class: 'row-chev' }, '›')
        ),
        h(
          'button',
          { class: 'row', type: 'button', onclick: () => fileInput.click() },
          h('span', { class: 'row-icon' }, '⬆️'),
          h(
            'span',
            { class: 'row-main' },
            h('span', { class: 'row-title' }, '导入备份'),
            h('span', { class: 'row-sub' }, '从备份文件恢复，会覆盖当前数据')
          ),
          h('span', { class: 'row-chev' }, '›')
        ),
        h(
          'button',
          { class: 'row row-danger', type: 'button', onclick: clearData },
          h('span', { class: 'row-icon' }, '🧹'),
          h(
            'span',
            { class: 'row-main' },
            h('span', { class: 'row-title' }, '清空数据'),
            h('span', { class: 'row-sub' }, '删除全部账单并恢复默认分类')
          )
        )
      )
    );

    /* ---------- 关于 ---------- */
    const aboutSection = h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-title' }, '关于'),
      h(
        'div',
        { class: 'card card--list' },
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'row-icon' }, '📒'),
          h(
            'span',
            { class: 'row-main' },
            h('span', { class: 'row-title' }, '简明记账'),
            h('span', { class: 'row-sub' }, `v${APP_VERSION} · 本地存储 · 离线可用`)
          )
        ),
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'row-icon' }, '🔒'),
          h(
            'span',
            { class: 'row-main' },
            h('span', { class: 'row-title' }, '数据只保存在本机'),
            h('span', { class: 'row-sub' }, '清除浏览器数据会丢失记录，请定期导出备份')
          )
        )
      )
    );

    root.replaceChildren(
      head,
      themeSection,
      accountSection,
      categorySection,
      dataSection,
      aboutSection,
      fileInput
    );
  }

  function addRow(label, onclick) {
    return h(
      'button',
      { class: 'row', type: 'button', onclick },
      h('span', { class: 'row-icon' }, '＋'),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, label))
    );
  }

  /* ---------- 导出 / 导入 / 清空 ---------- */
  function exportBackup() {
    try {
      const backup = store.buildBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `简明记账-备份-${todayStr()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      ui.toast('备份已导出');
    } catch (error) {
      ui.toast('导出失败：' + error.message);
    }
  }

  async function handleImport(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('不是有效的 JSON 备份文件');
      }
      const confirmed = await ui.confirmDialog({
        title: '导入备份',
        message: '导入会覆盖当前所有数据，确定继续吗？',
        confirmText: '导入',
        danger: true,
      });
      if (!confirmed) return;
      await store.importBackup(data);
      theme.applyTheme();
      ui.toast('导入成功');
      render();
    } catch (error) {
      ui.toast(error.message || '导入失败');
    }
  }

  async function clearData() {
    const confirmed = await ui.confirmDialog({
      title: '清空所有数据',
      message: '所有账单、账户和分类都会被重置为默认值，且无法恢复。建议先导出备份。',
      confirmText: '清空',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await store.resetData();
      ui.toast('已重置');
      render();
    } catch (error) {
      ui.toast(error.message);
    }
  }

  /* ---------- 账户弹层 ---------- */
  function openAccountSheet(account) {
    const nameInput = ui.textInput({
      value: account ? account.name : '',
      placeholder: '例如：现金',
      maxlength: 12,
    });
    const emojiInput = ui.textInput({
      value: account ? account.emoji : '💳',
      placeholder: '💳',
      maxlength: 4,
    });
    const balanceInput = ui.textInput({
      value: account ? centsToInput(store.accountBalanceCents(account.id)) : '0.00',
      placeholder: '0.00',
    });
    balanceInput.inputMode = 'decimal';

    const saveBtn = h(
      'button',
      {
        class: 'btn btn-primary btn-block',
        type: 'button',
        onclick: async () => {
          const cents = parseAmountToCents(balanceInput.value || '0');
          if (cents === null) {
            ui.toast('余额格式不正确');
            return;
          }
          const current = account ? store.accountBalanceCents(account.id) : 0;
          const base = account ? account.initialBalanceCents || 0 : 0;
          try {
            await store.saveAccount({
              id: account ? account.id : undefined,
              name: nameInput.value,
              emoji: emojiInput.value,
              initialBalanceCents: cents - (current - base),
            });
            sheet.close();
            ui.toast('已保存');
            render();
          } catch (error) {
            ui.toast(error.message);
          }
        },
      },
      '保存'
    );

    const content = [
      ui.field('账户名称', nameInput),
      ui.field('图标（一个 emoji）', emojiInput),
      ui.field('当前余额（元）', balanceInput),
      h(
        'p',
        { class: 'faint', style: { fontSize: '12px', marginTop: '-6px', marginBottom: '14px', lineHeight: 1.5 } },
        '填这个账户现在的实际余额，之后按收支自动增减；账户总余额会跟着更新。'
      ),
      saveBtn,
    ];

    if (account && !account.archived && account.id !== store.getSettings().defaultAccountId) {
      content.push(
        h(
          'button',
          {
            class: 'btn btn-ghost btn-block',
            type: 'button',
            style: { marginTop: '10px' },
            onclick: async () => {
              try {
                await store.updateSettings({ defaultAccountId: account.id });
                sheet.close();
                ui.toast('已设为默认账户');
                render();
              } catch (error) {
                ui.toast(error.message);
              }
            },
          },
          '设为默认账户'
        )
      );
    }

    if (account) {
      content.push(
        h(
          'button',
          {
            class: 'btn btn-ghost btn-block',
            type: 'button',
            style: { marginTop: '10px' },
            onclick: async () => {
              const archived = !account.archived;
              if (archived) {
                const count = store.countTransactionsByAccount(account.id);
                const confirmed = await ui.confirmDialog({
                  title: '归档账户',
                  message:
                    count > 0
                      ? `该账户下有 ${count} 条记录，归档后不能再记账，但历史记录会保留。`
                      : '归档后账户会从列表隐藏，可点「查看已归档账户」恢复。',
                  confirmText: '归档',
                });
                if (!confirmed) return;
              }
              try {
                await store.setAccountArchived(account.id, archived);
                sheet.close();
                ui.toast(archived ? '已归档' : '已恢复');
                render();
              } catch (error) {
                ui.toast(error.message);
              }
            },
          },
          account.archived ? '恢复账户' : '归档账户'
        )
      );

      content.push(
        h(
          'button',
          {
            class: 'btn btn-danger btn-block',
            type: 'button',
            style: { marginTop: '10px' },
            onclick: async () => {
              const count = store.countTransactionsByAccount(account.id);
              const confirmed = await ui.confirmDialog({
                title: '删除账户',
                message:
                  count > 0
                    ? `该账户有 ${count} 条记录，删除账户会同时删除这些记录，且无法恢复。若想保留记录，请改用「归档」。确定删除吗？`
                    : '删除后无法恢复，确定吗？',
                confirmText: '删除',
                danger: true,
              });
              if (!confirmed) return;
              try {
                await store.deleteAccount(account.id);
                sheet.close();
                ui.toast('已删除账户');
                render();
              } catch (error) {
                ui.toast(error.message);
              }
            },
          },
          '删除账户'
        )
      );
    }

    const sheet = ui.showSheet({ title: account ? '编辑账户' : '添加账户', content });
    setTimeout(() => nameInput.focus(), 60);
  }

  /* ---------- 分类弹层 ---------- */
  function openCategorySheet(category) {
    const kind = category ? category.kind : categoryKind;
    const nameInput = ui.textInput({
      value: category ? category.name : '',
      placeholder: kind === 'expense' ? '例如：宠物' : '例如：兼职',
      maxlength: 8,
    });
    const emojiInput = ui.textInput({
      value: category ? category.emoji : '🏷️',
      placeholder: '🏷️',
      maxlength: 4,
    });

    const saveBtn = h(
      'button',
      {
        class: 'btn btn-primary btn-block',
        type: 'button',
        onclick: async () => {
          try {
            await store.saveCategory({
              id: category ? category.id : undefined,
              kind,
              name: nameInput.value,
              emoji: emojiInput.value,
            });
            sheet.close();
            ui.toast('已保存');
            render();
          } catch (error) {
            ui.toast(error.message);
          }
        },
      },
      '保存'
    );

    const content = [ui.field('分类名称', nameInput), ui.field('图标（一个 emoji）', emojiInput), saveBtn];

    if (category) {
      content.push(
        h(
          'button',
          {
            class: 'btn btn-danger btn-block',
            type: 'button',
            style: { marginTop: '10px' },
            onclick: async () => {
              const archived = !category.archived;
              if (archived) {
                const count = store.countTransactionsByCategory(category.id);
                const confirmed = await ui.confirmDialog({
                  title: '归档分类',
                  message:
                    count > 0
                      ? `该分类下有 ${count} 条记录，归档后不能再选，但历史记录会保留。`
                      : '归档后该分类不再出现在记账页，可随时恢复。',
                  confirmText: '归档',
                });
                if (!confirmed) return;
              }
              try {
                await store.setCategoryArchived(category.id, archived);
                sheet.close();
                ui.toast(archived ? '已归档' : '已恢复');
                render();
              } catch (error) {
                ui.toast(error.message);
              }
            },
          },
          category.archived ? '恢复分类' : '归档分类'
        )
      );
    }

    const sheet = ui.showSheet({ title: category ? '编辑分类' : '添加分类', content });
    setTimeout(() => nameInput.focus(), 60);
  }

  render();
  return {
    unmount() {
      mounted = false;
    },
  };
}
