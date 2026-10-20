/** 记一笔 / 编辑记录 */

import * as store from '../store.js';
import {
  h,
  parseAmountToCents,
  centsToInput,
  todayStr,
  isValidDate,
  monthOf,
} from '../util.js';
import * as ui from '../ui.js';

export function mount(root, { navigate, query }) {
  const editing = query && query.id ? store.transactionById(query.id) : null;

  let kind = editing ? editing.kind : 'expense';
  let amountStr = editing ? centsToInput(editing.amountCents) : '';
  let categoryId = editing ? editing.categoryId : store.categoriesByKind(kind)[0]?.id || null;
  let accountId =
    editing && editing.accountId
      ? editing.accountId
      : store.getSettings().defaultAccountId || store.activeAccounts()[0]?.id || null;
  let date = editing ? editing.date : todayStr();
  let note = editing ? editing.note || '' : '';
  let saving = false;

  /* ---------- 顶部 ---------- */
  const expenseBtn = h('button', { type: 'button', onclick: () => switchKind('expense') }, '支出');
  const incomeBtn = h('button', { type: 'button', onclick: () => switchKind('income') }, '收入');
  const kindSeg = h('div', { class: 'seg' }, expenseBtn, incomeBtn);

  const head = h(
    'header',
    { class: 'entry-head' },
    h(
      'button',
      { class: 'text-btn', type: 'button', onclick: () => navigate('#/detail') },
      editing ? '返回' : '取消'
    ),
    kindSeg,
    h(
      'button',
      { class: 'text-btn right', type: 'button', onclick: save },
      editing ? '保存' : '保存'
    )
  );

  /* ---------- 金额 ---------- */
  const amountValue = h('span', { class: 'value placeholder' }, '0.00');
  const amountRow = h(
    'div',
    { class: 'entry-amount' },
    h('span', { class: 'currency' }, '¥'),
    amountValue
  );

  /* ---------- 日期 / 备注 ---------- */
  const dateText = h('span', { class: 'chip-text' }, '今天');
  const dateInput = h('input', { class: 'hidden-date', type: 'date', value: date, 'aria-label': '选择日期' });
  dateInput.addEventListener('change', () => {
    if (isValidDate(dateInput.value)) {
      date = dateInput.value;
      refreshDateChip();
    }
  });
  const dateChip = h('label', { class: 'chip' }, h('span', {}, '📅'), dateText, dateInput);

  const noteInput = h('input', {
    class: 'chip-input',
    type: 'text',
    placeholder: '备注（选填）',
    maxlength: '100',
    value: note,
    'aria-label': '备注',
    enterkeyhint: 'done',
  });

  const deleteChip = editing
    ? h(
        'button',
        { class: 'chip chip-danger', type: 'button', onclick: deleteEntry },
        h('span', {}, '🗑️'),
        h('span', { class: 'chip-text' }, '删除')
      )
    : null;

  const chipsRow = h('div', { class: 'entry-chips' }, dateChip, noteInput, deleteChip);

  /* ---------- 分类 ---------- */
  const catContainer = h('div');
  const entryBody = h('div', { class: 'entry-body' }, catContainer);

  /* ---------- 键盘 ---------- */
  const keypad = h('div', { class: 'keypad' });
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
  for (const key of keys) {
    keypad.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: key === 'del' ? 'key-del' : '',
          'aria-label': key === 'del' ? '删除' : key,
          onclick: () => press(key),
        },
        key === 'del' ? '⌫' : key
      )
    );
  }

  /* ---------- 渲染 ---------- */
  const entry = h('div', { class: 'entry' }, head, amountRow, chipsRow, entryBody, keypad);
  root.appendChild(entry);

  refreshAmount();
  refreshKind();
  refreshCategories();
  refreshDateChip();

  /* ---------- 交互函数 ---------- */
  function press(key) {
    if (key === 'del') {
      amountStr = amountStr.slice(0, -1);
    } else if (key === '.') {
      if (amountStr.includes('.')) return;
      amountStr = amountStr === '' ? '0.' : amountStr + '.';
    } else {
      if (amountStr.includes('.')) {
        const decimals = amountStr.split('.')[1];
        if (decimals.length >= 2) return;
        amountStr += key;
      } else {
        if (amountStr === '0') amountStr = key;
        else if (amountStr.length >= 9) return;
        else amountStr += key;
      }
    }
    refreshAmount();
  }

  function refreshAmount() {
    amountValue.textContent = amountStr === '' ? '0.00' : amountStr;
    amountValue.classList.toggle('placeholder', amountStr === '');
    amountValue.classList.toggle('money-expense', kind === 'expense');
    amountValue.classList.toggle('money-income', kind === 'income');
  }

  function switchKind(next) {
    if (next === kind) return;
    kind = next;
    const categories = store.categoriesByKind(kind);
    categoryId = categories[0]?.id || null;
    refreshKind();
    refreshCategories();
    refreshAmount();
  }

  function refreshKind() {
    expenseBtn.classList.toggle('active', kind === 'expense');
    incomeBtn.classList.toggle('active', kind === 'income');
    expenseBtn.setAttribute('aria-pressed', String(kind === 'expense'));
    incomeBtn.setAttribute('aria-pressed', String(kind === 'income'));
  }

  function currentCategories() {
    const categories = store.categoriesByKind(kind);
    if (categoryId && !categories.some((c) => c.id === categoryId)) {
      const selected = store.categoryById(categoryId);
      if (selected) categories.push(selected);
    }
    return categories;
  }

  function refreshCategories() {
    const categories = currentCategories();
    if (categories.length === 0) {
      catContainer.replaceChildren(
        h(
          'p',
          { class: 'faint', style: { padding: '24px 16px', textAlign: 'center' } },
          '还没有分类，去「设置 → 分类管理」添加一个吧'
        )
      );
      return;
    }
    const grid = h('div', { class: 'cat-grid' });
    for (const category of categories) {
      grid.appendChild(
        h(
          'button',
          {
            class: 'cat-item' + (category.id === categoryId ? ' active' : ''),
            type: 'button',
            onclick: () => {
              categoryId = category.id;
              refreshCategories();
            },
          },
          h('span', { class: 'cat-emoji' }, category.emoji),
          h('span', { class: 'cat-name' }, category.name)
        )
      );
    }
    catContainer.replaceChildren(grid);
  }

  function refreshDateChip() {
    const today = todayStr();
    if (date === today) dateText.textContent = '今天';
    else {
      const [y, m, d] = date.split('-').map(Number);
      const sameYear = y === new Date().getFullYear();
      dateText.textContent = sameYear ? `${m}月${d}日` : `${y}年${m}月${d}日`;
    }
    dateInput.value = date;
  }

  async function deleteEntry() {
    const confirmed = await ui.confirmDialog({
      title: '删除这笔记录',
      message: '删除后无法恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await store.removeTransaction(editing.id);
      ui.toast('已删除');
      navigate('#/detail');
    } catch (error) {
      ui.toast(error.message);
    }
  }

  async function save() {
    if (saving) return;
    const cents = parseAmountToCents(amountStr);
    if (!cents || cents <= 0) {
      ui.toast('请输入有效金额');
      return;
    }
    if (!categoryId) {
      ui.toast('请选择分类');
      return;
    }
    if (!accountId) {
      ui.toast('请先添加账户');
      return;
    }
    saving = true;
    try {
      await store.saveTransaction({
        id: editing ? editing.id : undefined,
        kind,
        amountCents: cents,
        categoryId,
        accountId,
        date,
        note: noteInput.value.trim().slice(0, 100),
        balanceAfterCents:
          editing && Number.isInteger(editing.balanceAfterCents) ? editing.balanceAfterCents : null,
      });
      ui.toast(editing ? '已保存' : '已记一笔');
      navigate('#/detail?m=' + monthOf(date));
    } catch (error) {
      ui.toast(error.message);
    } finally {
      saving = false;
    }
  }

  /* ---------- 桌面键盘支持 ---------- */
  function onKeyDown(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (/^\d$/.test(event.key)) {
      press(event.key);
      event.preventDefault();
    } else if (event.key === '.') {
      press('.');
    } else if (event.key === 'Backspace') {
      press('del');
      event.preventDefault();
    } else if (event.key === 'Enter') {
      save();
    }
  }
  document.addEventListener('keydown', onKeyDown);

  return {
    unmount() {
      document.removeEventListener('keydown', onKeyDown);
    },
  };
}
