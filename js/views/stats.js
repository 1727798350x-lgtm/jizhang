/** 统计页：月度汇总、分类占比、近 6 月趋势 */

import * as store from '../store.js';
import * as charts from '../charts.js';
import { categoryBreakdown, monthlyTrend } from '../stats.js';
import { h, fmtMoney, fmtCents, monthLabel, addMonths, monthOf, todayStr } from '../util.js';

let currentMonth = null;
let currentKind = 'expense';

export function mount(root) {
  if (!currentMonth) currentMonth = monthOf(todayStr());

  function changeMonth(delta) {
    currentMonth = addMonths(currentMonth, delta);
    render();
  }

  function render() {
    const totals = store.totalsForMonth(currentMonth);
    const all = store.allTransactions();
    const breakdown = categoryBreakdown(all, store.allCategories(), currentKind, currentMonth);
    const trend = monthlyTrend(all, currentMonth, 6);
    const isCurrent = currentMonth === monthOf(todayStr());

    const head = h(
      'header',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head-left' },
        h('h1', { class: 'page-title' }, '统计'),
        isCurrent
          ? null
          : h(
              'button',
              {
                class: 'btn-now',
                type: 'button',
                onclick: () => {
                  currentMonth = monthOf(todayStr());
                  render();
                },
              },
              '回到本月'
            )
      ),
      h(
        'div',
        { class: 'month-switch' },
        h('button', { type: 'button', 'aria-label': '上个月', onclick: () => changeMonth(-1) }, '‹'),
        h('span', { class: 'month-label' }, monthLabel(currentMonth)),
        h('button', { type: 'button', 'aria-label': '下个月', onclick: () => changeMonth(1) }, '›')
      )
    );

    const kindSeg = h(
      'div',
      { class: 'seg seg--full seg--track stats-kind' },
      h(
        'button',
        {
          type: 'button',
          class: currentKind === 'expense' ? 'active' : '',
          onclick: () => {
            currentKind = 'expense';
            render();
          },
        },
        '支出'
      ),
      h(
        'button',
        {
          type: 'button',
          class: currentKind === 'income' ? 'active' : '',
          onclick: () => {
            currentKind = 'income';
            render();
          },
        },
        '收入'
      )
    );

    const summary = h(
      'section',
      { class: 'card summary stats-summary' },
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

    const donutCard = h(
      'section',
      { class: 'card stats-card' },
      h(
        'div',
        { class: 'stats-card-head' },
        h(
          'span',
          { class: 'stats-card-title' },
          currentKind === 'expense' ? '支出分类' : '收入分类'
        ),
        h('span', { class: 'faint' }, `${breakdown.totalCount} 笔`)
      )
    );

    if (breakdown.items.length === 0) {
      donutCard.appendChild(
        h(
          'p',
          { class: 'faint', style: { padding: '28px 0', textAlign: 'center' } },
          `本月还没有${currentKind === 'expense' ? '支出' : '收入'}记录`
        )
      );
    } else {
      donutCard.appendChild(
        h('div', { class: 'donut-wrap' }, charts.renderDonut(breakdown.items, breakdown.totalCents))
      );

      const legend = h('div', { class: 'legend' });
      for (const item of breakdown.items) {
        legend.appendChild(
          h(
            'div',
            { class: 'legend-row' },
            h('span', { class: 'legend-dot', style: { background: item.color } }),
            h('span', { class: 'legend-name' }, `${item.emoji} ${item.name}`),
            h(
              'span',
              { class: 'legend-bar' },
              h('i', {
                style: { width: `${Math.max(item.pct, 1.5)}%`, background: item.color },
              })
            ),
            h('span', { class: 'legend-amount num' }, fmtCents(item.amountCents)),
            h('span', { class: 'legend-pct' }, `${item.pct.toFixed(1)}%`)
          )
        );
      }
      donutCard.appendChild(legend);
    }

    const trendCard = h(
      'section',
      { class: 'card stats-card' },
      h(
        'div',
        { class: 'stats-card-head' },
        h('span', { class: 'stats-card-title' }, '近 6 个月趋势')
      ),
      charts.renderBars(trend)
    );

    root.replaceChildren(head, kindSeg, summary, donutCard, trendCard);
  }

  render();
  return { unmount() {} };
}
