/** 应用状态与业务操作：内存缓存 + IndexedDB 持久化 */

import * as db from './db.js';
import * as model from './model.js';
import * as stats from './stats.js';
import * as util from './util.js';

const state = {
  ready: false,
  accounts: [],
  categories: [],
  transactions: [],
  settings: { ...model.DEFAULT_SETTINGS },
};

let runningBalanceCache = null;
let totalRunningBalanceCache = null;

function invalidateRunningBalances() {
  runningBalanceCache = null;
  totalRunningBalanceCache = null;
}

export function runningBalanceCents(transactionId) {
  if (!runningBalanceCache) {
    runningBalanceCache = stats.computeRunningBalances(state.accounts, state.transactions);
  }
  const value = runningBalanceCache.get(transactionId);
  return Number.isInteger(value) ? value : null;
}

/** 全部可用账户的当前总余额 */
export function totalBalanceCents() {
  return state.accounts
    .filter((account) => !account.archived)
    .reduce((sum, account) => sum + accountBalanceCents(account.id), 0);
}

/** 某笔记录之后全部可用账户的合计余额 */
export function totalRunningBalanceCents(transactionId) {
  if (!totalRunningBalanceCache) {
    totalRunningBalanceCache = stats.computeTotalRunningBalances(
      state.accounts,
      state.transactions
    );
  }
  const value = totalRunningBalanceCache.get(transactionId);
  return Number.isInteger(value) ? value : null;
}

export function getState() {
  return state;
}

export function getSettings() {
  return state.settings;
}

function sortByOrder(list) {
  return [...list].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name))
  );
}

function sortTransactions(list) {
  return [...list].sort(
    (a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

export async function init() {
  const [accounts, categories, transactions, meta] = await Promise.all([
    db.getAll('accounts'),
    db.getAll('categories'),
    db.getAll('transactions'),
    db.getAll('meta'),
  ]);

  const isEmpty = accounts.length === 0 && categories.length === 0 && transactions.length === 0;

  if (isEmpty) {
    const seed = model.makeDefaultData();
    await db.putMany('accounts', seed.accounts);
    await db.putMany('categories', seed.categories);
    await db.put('meta', { key: 'settings', value: seed.settings });
    state.accounts = sortByOrder(seed.accounts);
    state.categories = sortByOrder(seed.categories);
    state.transactions = [];
    state.settings = { ...seed.settings };
  } else {
    const savedSettings = meta.find((m) => m.key === 'settings');
    state.accounts = sortByOrder(accounts);
    state.categories = sortByOrder(categories);
    state.transactions = sortTransactions(transactions);
    state.settings = { ...model.DEFAULT_SETTINGS, ...(savedSettings ? savedSettings.value : {}) };
    if (!state.accounts.some((a) => a.id === state.settings.defaultAccountId)) {
      const first = state.accounts.find((a) => !a.archived) || state.accounts[0];
      state.settings.defaultAccountId = first ? first.id : null;
    }
  }

  state.ready = true;
  return state;
}

/* ---------------- 查询 ---------------- */

export function accountById(id) {
  return state.accounts.find((a) => a.id === id) || null;
}

export function categoryById(id) {
  return state.categories.find((c) => c.id === id) || null;
}

export function allAccounts() {
  return state.accounts;
}

export function activeAccounts() {
  return state.accounts.filter((a) => !a.archived);
}

export function allCategories() {
  return state.categories;
}

export function categoriesByKind(kind, { includeArchived = false } = {}) {
  return state.categories.filter((c) => c.kind === kind && (includeArchived || !c.archived));
}

export function allTransactions() {
  return state.transactions;
}

export function transactionById(id) {
  return state.transactions.find((t) => t.id === id) || null;
}

export function transactionsOfMonth(month) {
  return state.transactions.filter((t) => t.date && t.date.slice(0, 7) === month);
}

export function transactionsInRange(from, to) {
  return stats.transactionsInRange(state.transactions, from, to);
}

export function totalsForRange(from, to) {
  return stats.rangeTotals(state.transactions, from, to);
}

export function totalsForMonth(month) {
  return stats.monthTotals(state.transactions, month);
}

export function groupByDay(transactions) {
  return stats.groupByDay(transactions);
}

export function accountBalanceCents(accountId) {
  const account = accountById(accountId);
  if (!account) return 0;
  let balance = account.initialBalanceCents || 0;
  for (const t of state.transactions) {
    if (t.accountId !== accountId) continue;
    if (t.kind === 'income') balance += t.amountCents;
    else if (t.kind === 'expense') balance -= t.amountCents;
  }
  return balance;
}

export function countTransactionsByAccount(accountId) {
  return state.transactions.filter((t) => t.accountId === accountId).length;
}

export function countTransactionsByCategory(categoryId) {
  return state.transactions.filter((t) => t.categoryId === categoryId).length;
}

/* ---------------- 记账 ---------------- */

export async function saveTransaction(input) {
  const existing = input.id ? transactionById(input.id) : null;
  const now = util.nowISO();
  const tx = {
    id: existing ? existing.id : util.uid(),
    kind: input.kind,
    amountCents: input.amountCents,
    accountId: input.accountId,
    categoryId: input.categoryId,
    date: input.date,
    note: (input.note || '').trim().slice(0, 100),
    balanceAfterCents: Number.isInteger(input.balanceAfterCents) ? input.balanceAfterCents : null,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  const error = model.validateTransaction(tx, state);
  if (error) throw new Error(error);

  await db.put('transactions', tx);
  const index = state.transactions.findIndex((t) => t.id === tx.id);
  if (index >= 0) state.transactions[index] = tx;
  else state.transactions.push(tx);
  state.transactions = sortTransactions(state.transactions);
  invalidateRunningBalances();
  return tx;
}

export async function removeTransaction(id) {
  const existing = transactionById(id);
  if (!existing) throw new Error('这笔记录不存在或已被删除');
  await db.del('transactions', id);
  state.transactions = state.transactions.filter((t) => t.id !== id);
  invalidateRunningBalances();
}

/* ---------------- 账户 ---------------- */

export async function saveAccount(input) {
  const existing = input.id ? accountById(input.id) : null;
  const now = util.nowISO();
  const account = {
    id: existing ? existing.id : util.uid(),
    name: String(input.name || '').trim(),
    emoji: String(input.emoji || '💳').trim().slice(0, 8),
    type: input.type || (existing && existing.type) || 'other',
    initialBalanceCents: Number.isInteger(input.initialBalanceCents)
      ? input.initialBalanceCents
      : existing
        ? existing.initialBalanceCents
        : 0,
    sortOrder: existing ? existing.sortOrder : state.accounts.length,
    archived: existing ? existing.archived : false,
    createdAt: existing ? existing.createdAt : now,
  };

  const error = model.validateAccountName(account.name, state.accounts, existing ? existing.id : null);
  if (error) throw new Error(error);

  await db.put('accounts', account);
  const index = state.accounts.findIndex((a) => a.id === account.id);
  if (index >= 0) state.accounts[index] = account;
  else state.accounts.push(account);
  state.accounts = sortByOrder(state.accounts);
  invalidateRunningBalances();

  if (!state.settings.defaultAccountId && !account.archived) {
    await updateSettings({ defaultAccountId: account.id });
  }
  return account;
}

export async function setAccountArchived(id, archived) {
  const account = accountById(id);
  if (!account) throw new Error('账户不存在');
  if (archived) {
    const others = state.accounts.filter((a) => !a.archived && a.id !== id);
    if (others.length === 0) throw new Error('至少保留一个可用账户');
    if (state.settings.defaultAccountId === id) {
      await updateSettings({ defaultAccountId: others[0].id });
    }
  }
  const next = { ...account, archived: Boolean(archived) };
  await db.put('accounts', next);
  state.accounts = sortByOrder(state.accounts.map((a) => (a.id === id ? next : a)));
  invalidateRunningBalances();
  return next;
}

/** 删除账户（连同该账户下的记录）；至少保留一个可用账户 */
export async function deleteAccount(id) {
  const account = accountById(id);
  if (!account) throw new Error('账户不存在');
  if (!account.archived) {
    const others = state.accounts.filter((a) => !a.archived && a.id !== id);
    if (others.length === 0) throw new Error('至少保留一个账户');
  }
  const transactionIds = state.transactions
    .filter((t) => t.accountId === id)
    .map((t) => t.id);
  for (const transactionId of transactionIds) {
    await db.del('transactions', transactionId);
  }
  await db.del('accounts', id);
  state.transactions = state.transactions.filter((t) => t.accountId !== id);
  state.accounts = state.accounts.filter((a) => a.id !== id);
  invalidateRunningBalances();
  if (state.settings.defaultAccountId === id) {
    const next = state.accounts.find((a) => !a.archived) || state.accounts[0];
    await updateSettings({ defaultAccountId: next ? next.id : null });
  }
  return { removedTransactions: transactionIds.length };
}

/* ---------------- 分类 ---------------- */

export async function saveCategory(input) {
  const existing = input.id ? categoryById(input.id) : null;
  const now = util.nowISO();
  const category = {
    id: existing ? existing.id : util.uid(),
    kind: existing ? existing.kind : input.kind,
    name: String(input.name || '').trim(),
    emoji: String(input.emoji || '🏷️').trim().slice(0, 8),
    color: existing ? existing.color : model.categoryColor(input.kind, state.categories),
    sortOrder: existing ? existing.sortOrder : state.categories.filter((c) => c.kind === input.kind).length,
    archived: existing ? existing.archived : false,
    createdAt: existing ? existing.createdAt : now,
  };

  const error = model.validateCategoryName(
    category.name,
    category.kind,
    state.categories,
    existing ? existing.id : null
  );
  if (error) throw new Error(error);

  await db.put('categories', category);
  const index = state.categories.findIndex((c) => c.id === category.id);
  if (index >= 0) state.categories[index] = category;
  else state.categories.push(category);
  state.categories = sortByOrder(state.categories);
  return category;
}

export async function setCategoryArchived(id, archived) {
  const category = categoryById(id);
  if (!category) throw new Error('分类不存在');
  if (archived) {
    const others = state.categories.filter((c) => c.kind === category.kind && !c.archived && c.id !== id);
    if (others.length === 0) throw new Error('该类型下至少保留一个分类');
  }
  const next = { ...category, archived: Boolean(archived) };
  await db.put('categories', next);
  state.categories = sortByOrder(state.categories.map((c) => (c.id === id ? next : c)));
  return next;
}

/* ---------------- 设置 ---------------- */

export async function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.put('meta', { key: 'settings', value: state.settings });
  return state.settings;
}

/* ---------------- 备份 / 恢复 / 重置 ---------------- */

export function buildBackup() {
  return {
    app: 'jianming-ledger',
    format: 1,
    exportedAt: util.nowISO(),
    data: {
      accounts: state.accounts,
      categories: state.categories,
      transactions: state.transactions,
      settings: state.settings,
    },
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

export async function importBackup(backup) {
  if (!isObject(backup) || !isObject(backup.data)) throw new Error('备份文件格式不正确');
  const { accounts, categories, transactions, settings } = backup.data;
  if (!Array.isArray(accounts) || !Array.isArray(categories) || !Array.isArray(transactions)) {
    throw new Error('备份文件缺少数据');
  }

  const validAccounts = accounts.every(
    (a) => isObject(a) && typeof a.id === 'string' && typeof a.name === 'string'
  );
  const validCategories = categories.every(
    (c) => isObject(c) && typeof c.id === 'string' && typeof c.name === 'string'
  );
  const validTransactions = transactions.every(
    (t) =>
      isObject(t) &&
      typeof t.id === 'string' &&
      Number.isInteger(t.amountCents) &&
      t.amountCents > 0 &&
      typeof t.date === 'string' &&
      util.DATE_RE.test(t.date) &&
      (t.kind === 'expense' || t.kind === 'income') &&
      (t.balanceAfterCents === undefined ||
        t.balanceAfterCents === null ||
        (Number.isInteger(t.balanceAfterCents) && Math.abs(t.balanceAfterCents) <= 99_999_999_99))
  );
  if (!validAccounts || !validCategories || !validTransactions) {
    throw new Error('备份文件内容不合法，已取消导入');
  }

  await db.clearAll();
  if (accounts.length) await db.putMany('accounts', accounts);
  if (categories.length) await db.putMany('categories', categories);
  if (transactions.length) await db.putMany('transactions', transactions);
  const mergedSettings = { ...model.DEFAULT_SETTINGS, ...(isObject(settings) ? settings : {}) };
  await db.put('meta', { key: 'settings', value: mergedSettings });

  state.accounts = sortByOrder(accounts);
  state.categories = sortByOrder(categories);
  state.transactions = sortTransactions(transactions);
  invalidateRunningBalances();
  state.settings = mergedSettings;
  if (!state.accounts.some((a) => a.id === state.settings.defaultAccountId)) {
    const first = state.accounts.find((a) => !a.archived) || state.accounts[0];
    state.settings.defaultAccountId = first ? first.id : null;
  }
  await db.put('meta', { key: 'settings', value: state.settings });
  return state;
}

export async function resetData() {
  const seed = model.makeDefaultData();
  await db.clearAll();
  await db.putMany('accounts', seed.accounts);
  await db.putMany('categories', seed.categories);
  await db.put('meta', { key: 'settings', value: seed.settings });
  state.accounts = sortByOrder(seed.accounts);
  state.categories = sortByOrder(seed.categories);
  state.transactions = [];
  invalidateRunningBalances();
  state.settings = { ...seed.settings };
  return state;
}
