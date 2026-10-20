import test from 'node:test';
import assert from 'node:assert/strict';

import {
  monthTotals,
  groupByDay,
  categoryBreakdown,
  monthlyTrend,
  computeRunningBalances,
  transactionsInRange,
  rangeTotals,
} from '../js/stats.js';

const categories = [
  { id: 'c-food', kind: 'expense', name: '餐饮', emoji: '🍜', color: '#ff7a59' },
  { id: 'c-bus', kind: 'expense', name: '交通', emoji: '🚌', color: '#4d96ff' },
  { id: 'c-salary', kind: 'income', name: '工资', emoji: '💰', color: '#2f9e44' },
];

const transactions = [
  { id: 't1', kind: 'expense', amountCents: 3000, categoryId: 'c-food', date: '2026-10-01' },
  { id: 't2', kind: 'expense', amountCents: 1000, categoryId: 'c-food', date: '2026-10-02' },
  { id: 't3', kind: 'expense', amountCents: 2000, categoryId: 'c-bus', date: '2026-10-02' },
  { id: 't4', kind: 'income', amountCents: 100000, categoryId: 'c-salary', date: '2026-10-05' },
  { id: 't5', kind: 'expense', amountCents: 500, categoryId: 'c-gone', date: '2026-09-30' },
];

test('monthTotals 只统计指定月份', () => {
  assert.deepEqual(monthTotals(transactions, '2026-10'), {
    incomeCents: 100000,
    expenseCents: 6000,
    balanceCents: 94000,
  });
  assert.deepEqual(monthTotals(transactions, '2026-09'), {
    incomeCents: 0,
    expenseCents: 500,
    balanceCents: -500,
  });
});

test('monthTotals 空月份返回 0', () => {
  assert.deepEqual(monthTotals(transactions, '2026-01'), {
    incomeCents: 0,
    expenseCents: 0,
    balanceCents: 0,
  });
});

test('groupByDay 按日期倒序分组并计算小计', () => {
  const groups = groupByDay(transactions.filter((t) => t.date.startsWith('2026-10')));
  assert.deepEqual(
    groups.map((g) => g.date),
    ['2026-10-05', '2026-10-02', '2026-10-01']
  );
  const oct2 = groups.find((g) => g.date === '2026-10-02');
  assert.equal(oct2.expenseCents, 3000);
  assert.equal(oct2.incomeCents, 0);
  assert.equal(oct2.items.length, 2);
});

test('categoryBreakdown 排序、占比、合计', () => {
  const { items, totalCents, totalCount } = categoryBreakdown(transactions, categories, 'expense', '2026-10');
  assert.equal(totalCents, 6000);
  assert.equal(totalCount, 3);
  assert.deepEqual(
    items.map((i) => i.categoryId),
    ['c-food', 'c-bus']
  );
  assert.equal(items[0].amountCents, 4000);
  assert.equal(items[1].amountCents, 2000);
  const pctSum = items.reduce((sum, i) => sum + i.pct, 0);
  assert.ok(Math.abs(pctSum - 100) < 0.001, `占比合计应约等于 100，实际 ${pctSum}`);
});

test('categoryBreakdown 对已删除分类回退为“未分类”', () => {
  const { items } = categoryBreakdown(transactions, categories, 'expense', '2026-09');
  assert.equal(items.length, 1);
  assert.equal(items[0].name, '未分类');
  assert.equal(items[0].amountCents, 500);
});

test('categoryBreakdown 收入分类', () => {
  const { items, totalCents } = categoryBreakdown(transactions, categories, 'income', '2026-10');
  assert.equal(totalCents, 100000);
  assert.equal(items[0].name, '工资');
  assert.equal(items[0].pct, 100);
});

test('monthlyTrend 返回连续 6 个月（升序）', () => {
  const trend = monthlyTrend(transactions, '2026-10', 6);
  assert.deepEqual(
    trend.map((t) => t.month),
    ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
  );
  assert.equal(trend[5].incomeCents, 100000);
  assert.equal(trend[5].expenseCents, 6000);
  assert.equal(trend[4].expenseCents, 500);
  assert.equal(trend[0].expenseCents, 0);
});

test('monthlyTrend 跨年连续', () => {
  const trend = monthlyTrend([], '2026-02', 6);
  assert.deepEqual(
    trend.map((t) => t.month),
    ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  );
});

const accountA = { id: 'acc-a', name: '现金', initialBalanceCents: 10000, archived: false };
const accountB = { id: 'acc-b', name: '微信', initialBalanceCents: 0, archived: false };

test('computeRunningBalances 按账户累计余额', () => {
  const txs = [
    { id: 'x1', kind: 'expense', amountCents: 1234, accountId: 'acc-a', date: '2026-10-01', createdAt: '2026-10-01T01:00:00.000Z' },
    { id: 'x2', kind: 'income', amountCents: 50000, accountId: 'acc-a', date: '2026-10-02', createdAt: '2026-10-02T01:00:00.000Z' },
    { id: 'y1', kind: 'income', amountCents: 2000, accountId: 'acc-b', date: '2026-10-01', createdAt: '2026-10-01T02:00:00.000Z' },
  ];
  const map = computeRunningBalances([accountA, accountB], txs);
  assert.equal(map.get('x1'), 10000 - 1234);
  assert.equal(map.get('x2'), 10000 - 1234 + 50000);
  assert.equal(map.get('y1'), 2000);
});

test('computeRunningBalances 手填余额作为锚点', () => {
  const txs = [
    { id: 'a', kind: 'expense', amountCents: 100, accountId: 'acc-a', date: '2026-10-01', createdAt: '1' },
    { id: 'b', kind: 'expense', amountCents: 200, accountId: 'acc-a', date: '2026-10-02', createdAt: '2', balanceAfterCents: 5000 },
    { id: 'c', kind: 'expense', amountCents: 300, accountId: 'acc-a', date: '2026-10-03', createdAt: '3' },
  ];
  const map = computeRunningBalances([accountA], txs);
  assert.equal(map.get('a'), 9900);
  assert.equal(map.get('b'), 5000);
  assert.equal(map.get('c'), 4700);
});

test('computeRunningBalances 同日按创建时间排序且支持负余额', () => {
  const txs = [
    { id: 'late', kind: 'expense', amountCents: 200, accountId: 'acc-b', date: '2026-10-01', createdAt: '2026-10-01T10:00:00.000Z' },
    { id: 'early', kind: 'expense', amountCents: 100, accountId: 'acc-b', date: '2026-10-01', createdAt: '2026-10-01T01:00:00.000Z' },
  ];
  const map = computeRunningBalances([accountB], txs);
  assert.equal(map.get('early'), -100);
  assert.equal(map.get('late'), -300);
});

test('computeRunningBalances 忽略未知账户的记录', () => {
  const map = computeRunningBalances([accountA], [
    { id: 'z', kind: 'expense', amountCents: 100, accountId: 'ghost', date: '2026-10-01' },
  ]);
  assert.equal(map.has('z'), false);
});

test('transactionsInRange / rangeTotals 按闭区间筛选', () => {
  const txs = [
    { id: 'r1', kind: 'expense', amountCents: 100, categoryId: 'c-food', date: '2026-10-01' },
    { id: 'r2', kind: 'income', amountCents: 500, categoryId: 'c-salary', date: '2026-10-10' },
    { id: 'r3', kind: 'expense', amountCents: 200, categoryId: 'c-food', date: '2026-10-20' },
  ];
  assert.deepEqual(
    transactionsInRange(txs, '2026-10-01', '2026-10-10').map((t) => t.id),
    ['r1', 'r2']
  );
  assert.deepEqual(rangeTotals(txs, '2026-10-01', '2026-10-10'), {
    incomeCents: 500,
    expenseCents: 100,
    balanceCents: 400,
  });
  assert.deepEqual(rangeTotals(txs, '2026-10-11', '2026-10-19'), {
    incomeCents: 0,
    expenseCents: 0,
    balanceCents: 0,
  });
});
