/** 明细页：时间段筛选、收支汇总、按日分组流水 */

import * as store from '../store.js';
import * as ui from '../ui.js';
import {
  h,
  fmtCents,
  fmtMoney,
  todayStr,
  dayLabel,
  isValidDate,
  monthRange,
  formatRangeLabel,
  addMonths,
  addDays,
} from '../util.js';

let currentRange = null;

function defaultRange() {
  const today = todayStr();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

function sameRange(a, b) {
  return Boolean(a && b && a.from === b.from && a.to === b.to);
}

export function mount(root, { navigate, query }) {
  if (query && query.d && isValidDate(query.d)) {
    const alreadyVisible =
      currentRange && query.d >= currentRange.from && query.d <= currentRange.to;
    if (!alreadyVisible) currentRange = monthRange(query.d);
  }
  if (!currentRange) currentRange = defaultRange();

  function render() {
    const from = currentRange.from;
    const to = currentRange.to;
    const totals = store.totalsForRange(from, to);
    const transactions = store.transactionsInRange(from, to);
    const isDefault = sameRange(currentRange, defaultRange());

    const head = h(
      'header',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head-left' },
        h('h1', { class: 'page-title' }, '明细'),
        isDefault
          ? null
          : h(
              'button',
              {
                class: 'btn-now',
                type: 'button',
                onclick: () => {
                  currentRange = defaultRange();
                  render();
                },
              },
              '本月'
            )
      ),
      h(
        'button',
        {
          class: 'range-switch',
          type: 'button',
          'aria-label': '选择时间段',
          onclick: openRangeSheet,
        },
        h('span', {}, '📅'),
        h('span', { class: 'range-label' }, formatRangeLabel(from, to)),
        h('span', { class: 'row-chev' }, '›')
      )
    );

    const summary = h(
      'section',
      { class: 'card summary' },
      h(
        'div',
        { class: 'summary-main' },
        h('span', { class: 'label' }, '支出'),
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
          h('p', { class: 'empty-title' }, isDefault ? '这个月还没有记账' : '这个时间段还没有记账'),
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

  function openRangeSheet() {
    const fromInput = h('input', {
      class: 'input',
      type: 'date',
      value: currentRange.from,
      'aria-label': '开始日期',
    });
    const toInput = h('input', {
      class: 'input',
      type: 'date',
      value: currentRange.to,
      'aria-label': '结束日期',
    });

    const today = todayStr();
    const prevMonth = addMonths(today.slice(0, 7), -1);
    const quickOptions = [
      ['今天', () => ({ from: today, to: today })],
      ['近 7 天', () => ({ from: addDays(today, -6), to: today })],
      ['近 30 天', () => ({ from: addDays(today, -29), to: today })],
      ['本月', () => defaultRange()],
      ['上月', () => monthRange(`${prevMonth}-01`)],
    ];

    const quick = h(
      'div',
      { class: 'range-quick' },
      quickOptions.map(([label, makeRange]) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            onclick: () => {
              const range = makeRange();
              fromInput.value = range.from;
              toInput.value = range.to;
            },
          },
          label
        )
      )
    );

    const fields = h(
      'div',
      { class: 'range-fields' },
      h('label', { class: 'field range-field' }, h('span', {}, '开始日期'), fromInput),
      h('label', { class: 'field range-field' }, h('span', {}, '结束日期'), toInput)
    );

    const done = h(
      'button',
      {
        class: 'btn btn-primary btn-block',
        type: 'button',
        onclick: () => {
          const from = fromInput.value;
          const to = toInput.value;
          if (!isValidDate(from) || !isValidDate(to)) {
            ui.toast('请选择开始和结束日期');
            return;
          }
          if (from > to) {
            ui.toast('开始日期不能晚于结束日期');
            return;
          }
          currentRange = { from, to };
          sheet.close();
          render();
        },
      },
      '完成'
    );

    const sheet = ui.showSheet({ title: '选择时间段', content: [fields, quick, done] });
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
