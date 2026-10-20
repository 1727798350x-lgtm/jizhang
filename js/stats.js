/** 统计纯函数（可在 Node 中直接单元测试） */

import { MONTH_RE, DATE_RE } from './util.js';

export function filterByMonth(transactions, month) {
  if (!MONTH_RE.test(String(month))) return [];
  return transactions.filter((t) => t.date && t.date.slice(0, 7) === month);
}

export function monthTotals(transactions, month) {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const t of transactions) {
    if (!DATE_RE.test(String(t.date))) continue;
    if (month && t.date.slice(0, 7) !== month) continue;
    if (t.kind === 'income') incomeCents += t.amountCents;
    else if (t.kind === 'expense') expenseCents += t.amountCents;
  }
  return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents };
}

export function groupByDay(transactions) {
  const map = new Map();
  for (const t of transactions) {
    if (!map.has(t.date)) map.set(t.date, { date: t.date, items: [], incomeCents: 0, expenseCents: 0 });
    const group = map.get(t.date);
    group.items.push(t);
    if (t.kind === 'income') group.incomeCents += t.amountCents;
    else group.expenseCents += t.amountCents;
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * 分类占比
 * @returns {{ items: Array<{categoryId,name,emoji,color,amountCents,pct}>, totalCents: number, totalCount: number }}
 */
export function categoryBreakdown(transactions, categories, kind, month = null) {
  const map = new Map();
  let totalCents = 0;
  let totalCount = 0;
  const byId = new Map(categories.map((c) => [c.id, c]));

  for (const t of transactions) {
    if (t.kind !== kind) continue;
    if (month && (!t.date || t.date.slice(0, 7) !== month)) continue;
    if (!Number.isFinite(t.amountCents)) continue;
    const category = byId.get(t.categoryId);
    const key = category ? category.id : 'unknown';
    if (!map.has(key)) {
      map.set(key, {
        categoryId: key,
        name: category ? category.name : '未分类',
        emoji: category ? category.emoji : '❓',
        color: category ? category.color : '#adb5bd',
        amountCents: 0,
        count: 0,
      });
    }
    const row = map.get(key);
    row.amountCents += t.amountCents;
    row.count += 1;
    totalCents += t.amountCents;
    totalCount += 1;
  }

  const items = [...map.values()]
    .filter((row) => row.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents)
    .map((row) => ({
      ...row,
      pct: totalCents > 0 ? (row.amountCents / totalCents) * 100 : 0,
    }));

  return { items, totalCents, totalCount };
}

/**
 * 计算每笔记录之后该账户的余额（含手动填写的余额锚点）
 * 规则：按日期、创建时间升序；默认 = 上一笔余额 + 本笔收支；
 * 若本笔手动填写了余额，则以手填余额为准，后续继续从它推算。
 * @returns {Map<string, number>} transactionId -> 余额（分）
 */
export function computeRunningBalances(accounts, transactions) {
  const byAccount = new Map();
  for (const account of accounts) byAccount.set(account.id, []);
  for (const tx of transactions) {
    const list = byAccount.get(tx.accountId);
    if (list) list.push(tx);
  }

  const result = new Map();
  for (const [accountId, list] of byAccount) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) continue;
    const sorted = [...list].sort(
      (a, b) =>
        String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
        String(a.id).localeCompare(String(b.id))
    );
    let balance = account.initialBalanceCents || 0;
    for (const tx of sorted) {
      balance += tx.kind === 'income' ? tx.amountCents : -tx.amountCents;
      if (Number.isInteger(tx.balanceAfterCents)) balance = tx.balanceAfterCents;
      result.set(tx.id, balance);
    }
  }
  return result;
}

/**
 * 最近 N 个月趋势（含结束月份，按时间升序）
 * @returns {Array<{month, incomeCents, expenseCents}>}
 */
export function monthlyTrend(transactions, endMonth, count = 6) {
  const [year, month] = String(endMonth).split('-').map(Number);
  if (!year || !month) return [];

  const buckets = new Map();
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(year, month - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(key);
    buckets.set(key, { month: key, incomeCents: 0, expenseCents: 0 });
  }

  for (const t of transactions) {
    if (!t.date) continue;
    const bucket = buckets.get(t.date.slice(0, 7));
    if (!bucket) continue;
    if (t.kind === 'income') bucket.incomeCents += t.amountCents;
    else if (t.kind === 'expense') bucket.expenseCents += t.amountCents;
  }

  return months.map((m) => buckets.get(m));
}
