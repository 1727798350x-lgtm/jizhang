/** 默认数据与校验规则 */

import { uid, nowISO, DATE_RE } from './util.js';

export const KIND_EXPENSE = 'expense';
export const KIND_INCOME = 'income';
export const KIND_LABEL = { expense: '支出', income: '收入' };

export const DEFAULT_SETTINGS = {
  theme: 'system',
  defaultAccountId: null,
  version: 1,
};

export const EXPENSE_COLORS = [
  '#ff7a59', '#4d96ff', '#f783ac', '#9b7bff', '#ff922b',
  '#20c997', '#fa5252', '#5c7cfa', '#be4bdb', '#868e96',
  '#f59f00', '#38d9a9',
];
export const INCOME_COLORS = ['#2f9e44', '#f59f00', '#1971c2', '#e03131', '#868e96', '#20c997'];

const EXPENSE_CATEGORIES = [
  ['餐饮', '🍜'], ['交通', '🚌'], ['购物', '🛍️'], ['日用', '🧴'], ['娱乐', '🎮'],
  ['住房', '🏠'], ['医疗', '💊'], ['学习', '📚'], ['人情', '🎁'], ['其他', '📦'],
];

const INCOME_CATEGORIES = [
  ['工资', '💰'], ['奖金', '🏆'], ['理财', '📈'], ['红包', '🧧'], ['其他', '✨'],
];

const DEFAULT_ACCOUNTS = [
  ['微信', '💬', 'wechat'],
  ['支付宝', '🔷', 'alipay'],
  ['银行卡', '💳', 'bank'],
];

export function makeDefaultData() {
  const now = nowISO();
  const accounts = DEFAULT_ACCOUNTS.map(([name, emoji, type], index) => ({
    id: uid(),
    name,
    emoji,
    type,
    initialBalanceCents: 0,
    sortOrder: index,
    archived: false,
    createdAt: now,
  }));

  const categories = [];
  EXPENSE_CATEGORIES.forEach(([name, emoji], index) => {
    categories.push({
      id: uid(),
      kind: KIND_EXPENSE,
      name,
      emoji,
      color: EXPENSE_COLORS[index % EXPENSE_COLORS.length],
      sortOrder: index,
      archived: false,
      createdAt: now,
    });
  });
  INCOME_CATEGORIES.forEach(([name, emoji], index) => {
    categories.push({
      id: uid(),
      kind: KIND_INCOME,
      name,
      emoji,
      color: INCOME_COLORS[index % INCOME_COLORS.length],
      sortOrder: index,
      archived: false,
      createdAt: now,
    });
  });

  return {
    accounts,
    categories,
    settings: { ...DEFAULT_SETTINGS, defaultAccountId: accounts[0].id },
  };
}

export function categoryColor(kind, existing) {
  const palette = kind === KIND_INCOME ? INCOME_COLORS : EXPENSE_COLORS;
  const used = new Set(existing.map((c) => c.color));
  return palette.find((c) => !used.has(c)) || palette[existing.length % palette.length];
}

/** 返回错误文案；合法返回 null */
export function validateTransaction(tx, { accounts = [], categories = [] } = {}) {
  if (!tx || typeof tx !== 'object') return '数据不完整';
  if (!Number.isInteger(tx.amountCents) || tx.amountCents <= 0) return '金额必须大于 0';
  if (tx.amountCents > 99_999_999_99) return '金额过大';
  if (tx.kind !== KIND_EXPENSE && tx.kind !== KIND_INCOME) return '收支类型错误';
  const category = categories.find((c) => c.id === tx.categoryId);
  if (!category) return '请选择分类';
  if (category.kind !== tx.kind) return '分类与收支类型不匹配';
  const account = accounts.find((a) => a.id === tx.accountId);
  if (!account) return '请选择账户';
  if (account.archived) return '该账户已归档，请选择其他账户';
  if (!DATE_RE.test(String(tx.date))) return '日期格式错误';
  if (tx.note && String(tx.note).length > 100) return '备注最多 100 字';
  if (tx.balanceAfterCents !== undefined && tx.balanceAfterCents !== null) {
    if (!Number.isInteger(tx.balanceAfterCents)) return '余额格式错误';
    if (Math.abs(tx.balanceAfterCents) > 99_999_999_99) return '余额超出范围';
  }
  return null;
}

export function validateAccountName(name, accounts, selfId = null) {
  const value = String(name || '').trim();
  if (!value) return '请输入账户名称';
  if (value.length > 12) return '账户名称最多 12 个字';
  const dup = accounts.some((a) => a.id !== selfId && !a.archived && a.name === value);
  if (dup) return '已有同名账户';
  return null;
}

export function validateCategoryName(name, kind, categories, selfId = null) {
  const value = String(name || '').trim();
  if (!value) return '请输入分类名称';
  if (value.length > 8) return '分类名称最多 8 个字';
  const dup = categories.some(
    (c) => c.id !== selfId && c.kind === kind && !c.archived && c.name === value
  );
  if (dup) return '该类型下已有同名分类';
  return null;
}

export function isValidEmoji(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return Array.from(s).length <= 3;
}
