/** 明细页：月份切换、收支汇总、按日分组流水 */

import * as store from '../store.js';
import { h, fmtCents, fmtMoney, monthLabel, addMonths, monthOf, todayStr, dayLabel } from '../util.js';

let currentMonth = null;

export function mount(root, { navigate, query }) {
  if (query && query.m && /^\d{4}-\d{2}$/.test(query.m)) currentMonth = query.m;
  if (!currentMonth) currentMonth = monthOf(todayStr());

  function changeMonth(delta) {
    currentMonth = addMonths(currentMonth, delta);
    render();
  }

  function goCurrentMonth() {
    currentMonth = monthOf(todayStr());
    render();
  }

  function render() {
    const totals = store.totalsForMonth(currentMonth);
    const transactions = store.transactionsOfMonth(currentMonth);
    const isCurrent = currentMonth === monthOf(todayStr());

    const head = h(
      'header',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head-left' },
        h('h1', { class: 'page-title' }, '明细'),
        isCurrent
          ? null
          : h('button', { class: 'btn-now', type: 'button', onclick: goCurrentMonth }, '回到本月')
      ),
      h(
        'div',
        { class: 'month-switch' },
        h('button', { type: 'button', 'aria-label': '上个月', onclick: () => changeMonth(-1) }, '‹'),
        h('span', { class: 'month-label' }, monthLabel(currentMonth)),
        h('button', { type: 'button', 'aria-label': '下个月', onclick: () => changeMonth(1) }, '›')
      )
    );

    const summary = h(
      'section',
      { class: 'card summary' },
      h(
        'div',
        { class: 'summary-main' },
        h('span', { class: 'label' }, '本月支出'),
        h('span', { class: 'value money-expense num' }, fmtMoney(totals.expenseCents))
      ),
      h(
        'div',
        { class: 'summary-side' },
        h(
          'div',
          { class: 'summary-line' },
          h('span', { class: 'label' }, '收入'),
          h('span', { class: 'value money-income num' }, fmtMoney(totals.incomeCents))
        ),
        h(
          'div',
          { class: 'summary-line' },
          h('span', { class: 'label' }, '结余'),
          h('span', { class: 'value num' }, fmtMoney(totals.balanceCents))
        )
      )
    );

    const list = h('div', { class: 'tx-groups' });

    if (transactions.length === 0) {
      list.appendChild(
        h(
          'div',
          { class: 'empty' },
          h('span', { class: 'empty-emoji' }, '📒'),
          h('p', { class: 'empty-title' }, '这个月还没有记账'),
          h(
            'button',
            { class: 'btn btn-primary', type: 'button', onclick: () => navigate('#/entry') },
            '记一笔'
          )
        )
      );
    } else {
      for (const group of store.groupByDay(transactions)) {
        const card = h('div', { class: 'card' });
        for (const tx of group.items) card.appendChild(txItem(tx, navigate));

        const parts = [];
        if (group.expenseCents > 0) parts.push(`支出 ${fmtCents(group.expenseCents)}`);
        if (group.incomeCents > 0) parts.push(`收入 ${fmtCents(group.incomeCents)}`);

        list.appendChild(
          h(
            'section',
            { class: 'tx-group' },
            h(
              'div',
              { class: 'tx-group-head' },
              h('span', {}, dayLabel(group.date)),
              h('span', { class: 'day-total' }, parts.join(' · '))
            ),
            card
          )
        );
      }
    }

    root.replaceChildren(head, summary, list);
  }

  render();

  return {
    unmount() {},
  };
}

function txItem(tx, navigate) {
  const category = store.categoryById(tx.categoryId);
  const sign = tx.kind === 'expense' ? '-' : '+';
  const sub = tx.note && tx.note.trim() ? tx.note.trim() : null;
  const balance = store.runningBalanceCents(tx.id);
  const manual = Number.isInteger(tx.balanceAfterCents);

  return h(
    'button',
    {
      class: 'tx-item',
      type: 'button',
      onclick: () => navigate(`#/entry?id=${encodeURIComponent(tx.id)}`),
    },
    h('span', { class: 'tx-icon' }, category ? category.emoji : '❓'),
    h(
      'span',
      { class: 'tx-main' },
      h('span', { class: 'tx-name' }, category ? category.name : '未分类'),
      sub ? h('span', { class: 'tx-sub' }, sub) : null
    ),
    h(
      'span',
      { class: 'tx-right' },
      h(
        'span',
        {
          class: 'tx-amount num ' + (tx.kind === 'expense' ? 'money-expense' : 'money-income'),
        },
        `${sign}¥${fmtCents(tx.amountCents)}`
      ),
      balance === null
        ? null
        : h(
            'span',
            {
              class: 'tx-balance num' + (manual ? ' manual' : ''),
              title: manual ? '手动填写的余额' : '自动计算的余额',
            },
            `余 ${fmtMoney(balance)}`
          )
    )
  );
}
