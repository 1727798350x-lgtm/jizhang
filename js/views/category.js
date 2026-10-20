/** 分类明细页：查看某个分类在某月 / 全部时间的记录 */

import * as store from '../store.js';
import {
  h,
  fmtCents,
  fmtMoney,
  dayLabel,
  monthOf,
  todayStr,
  shortMonthLabel,
} from '../util.js';

export function mount(root, { navigate, query } = {}) {
  const categoryId = query && query.id ? query.id : '';
  const category = categoryId ? store.categoryById(categoryId) : null;
  const month =
    query && /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : monthOf(todayStr());
  let scope = 'month';

  function transactions() {
    return store.allTransactions().filter((tx) => {
      const matchesCategory = category
        ? tx.categoryId === categoryId
        : !store.categoryById(tx.categoryId);
      if (!matchesCategory) return false;
      if (scope === 'month') return tx.date && tx.date.slice(0, 7) === month;
      return true;
    });
  }

  function render() {
    const items = transactions();
    const totalCents = items.reduce((sum, tx) => sum + tx.amountCents, 0);
    const name = category ? category.name : '未分类';
    const emoji = category ? category.emoji : '❓';
    const kind = category ? category.kind : 'expense';

    const head = h(
      'header',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head-left' },
        h(
          'button',
          { class: 'back-btn', type: 'button', onclick: () => navigate('#/stats') },
          '‹ 返回'
        ),
        h('h1', { class: 'page-title' }, `${emoji} ${name}`)
      )
    );

    const scopeSeg = h(
      'div',
      { class: 'seg seg--full seg--track', style: { marginBottom: '14px' } },
      h(
        'button',
        {
          type: 'button',
          class: scope === 'month' ? 'active' : '',
          onclick: () => {
            scope = 'month';
            render();
          },
        },
        shortMonthLabel(month)
      ),
      h(
        'button',
        {
          type: 'button',
          class: scope === 'all' ? 'active' : '',
          onclick: () => {
            scope = 'all';
            render();
          },
        },
        '全部时间'
      )
    );

    const summary = h(
      'section',
      { class: 'card summary' },
      h(
        'div',
        { class: 'summary-main' },
        h('span', { class: 'label' }, kind === 'expense' ? '合计支出' : '合计收入'),
        h(
          'span',
          { class: 'value num ' + (kind === 'expense' ? 'money-expense' : 'money-income') },
          fmtMoney(totalCents)
        )
      ),
      h(
        'div',
        { class: 'summary-side' },
        h(
          'div',
          { class: 'summary-line' },
          h('span', { class: 'label' }, '笔数'),
          h('span', { class: 'value num' }, `${items.length} 笔`)
        ),
        h(
          'div',
          { class: 'summary-line' },
          h('span', { class: 'label' }, '范围'),
          h('span', { class: 'value' }, scope === 'all' ? '全部时间' : shortMonthLabel(month))
        )
      )
    );

    const list = h('div', { class: 'tx-groups' });

    if (items.length === 0) {
      list.appendChild(
        h(
          'div',
          { class: 'empty' },
          h('span', { class: 'empty-emoji' }, '📒'),
          h('p', { class: 'empty-title' }, '这个分类还没有记录')
        )
      );
    } else {
      for (const group of store.groupByDay(items)) {
        const dayTotalCents = group.items.reduce((sum, tx) => sum + tx.amountCents, 0);
        const card = h('div', { class: 'card' });
        for (const tx of group.items) {
          card.appendChild(
            h(
              'div',
              { class: 'tx-item category-tx' },
              h('span', { class: 'tx-icon' }, emoji),
              h(
                'span',
                { class: 'tx-main' },
                h(
                  'span',
                  { class: 'tx-name' },
                  tx.note && tx.note.trim() ? tx.note.trim() : '无备注'
                )
              ),
              h(
                'span',
                {
                  class:
                    'tx-amount num ' + (kind === 'expense' ? 'money-expense' : 'money-income'),
                },
                `${kind === 'expense' ? '-' : '+'}¥${fmtCents(tx.amountCents)}`
              )
            )
          );
        }

        list.appendChild(
          h(
            'section',
            { class: 'tx-group' },
            h(
              'div',
              { class: 'tx-group-head' },
              h('span', {}, dayLabel(group.date)),
              h(
                'span',
                { class: 'day-total' },
                `${kind === 'expense' ? '支出' : '收入'} ${fmtCents(dayTotalCents)}`
              )
            ),
            card
          )
        );
      }
    }

    root.replaceChildren(head, scopeSeg, summary, list);
  }

  render();
  return { unmount() {} };
}
