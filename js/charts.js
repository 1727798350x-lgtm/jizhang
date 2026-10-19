/** 手写 SVG / DOM 图表，无第三方依赖 */

import { h, fmtMoney, fmtCents, shortMonthLabel } from './util.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) el.setAttribute(key, String(value));
  }
  return el;
}

/**
 * 环形图
 * @param {{categoryId,name,emoji,color,amountCents,pct}[]} items
 */
export function renderDonut(items, totalCents, { size = 178, thickness = 20 } = {}) {
  const wrap = h('div', { class: 'donut' });
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': '分类占比图' });
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = items.length > 1 ? 2 : 0;

  svg.appendChild(
    svgEl('circle', {
      cx: center,
      cy: center,
      r: radius,
      fill: 'none',
      stroke: 'var(--surface-2)',
      'stroke-width': thickness,
    })
  );

  let offset = 0;
  for (const item of items) {
    const length = totalCents > 0 ? (item.amountCents / totalCents) * circumference : 0;
    if (length <= 0.4) continue;
    const dash = Math.max(length - gap, 0.6);
    svg.appendChild(
      svgEl('circle', {
        cx: center,
        cy: center,
        r: radius,
        fill: 'none',
        stroke: item.color,
        'stroke-width': thickness,
        'stroke-dasharray': `${dash} ${circumference - dash}`,
        'stroke-dashoffset': circumference - offset,
        transform: `rotate(-90 ${center} ${center})`,
      })
    );
    offset += length;
  }

  wrap.appendChild(svg);
  wrap.appendChild(
    h(
      'div',
      { class: 'donut-center' },
      h('small', {}, '合计'),
      h('strong', {}, totalCents > 0 ? `¥${fmtCents(totalCents)}` : '¥0.00')
    )
  );
  return wrap;
}

/** 近 N 月收入/支出柱状图 */
export function renderBars(trend) {
  const max = Math.max(1, ...trend.flatMap((t) => [t.incomeCents, t.expenseCents]));

  const cols = trend.map((t) =>
    h(
      'div',
      { class: 'bars-col' },
      h(
        'div',
        { class: 'bars-pair' },
        h('div', {
          class: 'bar bar-income',
          style: { height: `${(t.incomeCents / max) * 100}%` },
          title: `收入 ${fmtMoney(t.incomeCents)}`,
        }),
        h('div', {
          class: 'bar bar-expense',
          style: { height: `${(t.expenseCents / max) * 100}%` },
          title: `支出 ${fmtMoney(t.expenseCents)}`,
        })
      )
    )
  );

  const grid = h('div', { class: 'bars-grid' }, [0, 1, 2, 3].map(() => h('i')));

  return h(
    'div',
    { class: 'bars' },
    h('div', { class: 'bars-plot' }, grid, h('div', { class: 'bars-cols' }, cols)),
    h(
      'div',
      { class: 'bars-labels' },
      trend.map((t) => h('span', { class: 'bars-label' }, shortMonthLabel(t.month)))
    ),
    h(
      'div',
      { class: 'chart-legend' },
      h('span', {}, h('i', { class: 'income' }), '收入'),
      h('span', {}, h('i', { class: 'expense' }), '支出')
    )
  );
}
