/** 通用工具函数（无 DOM 依赖的部分也可在 Node 测试中使用） */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-\d{2}$/;

export function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/* ---------------- 金额 ---------------- */

export function fmtCents(cents) {
  const value = Math.round(Number(cents) || 0);
  const neg = value < 0;
  const abs = Math.abs(value);
  const yuan = Math.floor(abs / 100).toLocaleString('en-US');
  return `${neg ? '-' : ''}${yuan}.${pad2(abs % 100)}`;
}

export function fmtMoney(cents) {
  const value = Math.round(Number(cents) || 0);
  return `${value < 0 ? '-' : ''}¥${fmtCents(Math.abs(value))}`;
}

/** 把输入框字符串转换成整数分；非法返回 null */
export function parseAmountToCents(input) {
  const s = String(input ?? '').trim();
  if (!/^\d*(\.\d{0,2})?$/.test(s)) return null;
  if (s === '' || s === '.') return null;
  const [intPart, decPart = ''] = s.split('.');
  const cents = Number(intPart || '0') * 100 + Number((decPart + '00').slice(0, 2));
  return Number.isFinite(cents) ? cents : null;
}

/** 余额输入：允许负数；空字符串返回 null（调用方用它表示“自动计算”） */
export function parseSignedAmountToCents(input) {
  const s = String(input ?? '').trim();
  if (s === '') return null;
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  if (!/^\d*(\.\d{0,2})?$/.test(body) || body === '' || body === '.') return null;
  const cents = parseAmountToCents(body);
  if (cents === null) return null;
  return neg ? -cents : cents;
}

/** 整数分 -> 编辑用字符串，如 1230 -> "12.30" */
export function centsToInput(cents) {
  return (Math.round(Number(cents) || 0) / 100).toFixed(2);
}

/* ---------------- 日期 ---------------- */

export function todayStr(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function nowISO() {
  return new Date().toISOString();
}

export function monthOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

export function isValidDate(dateStr) {
  if (!DATE_RE.test(String(dateStr))) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function addMonths(month, delta) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthLabel(month) {
  const [y, m] = String(month).split('-').map(Number);
  return `${y}年${m}月`;
}

export function shortMonthLabel(month) {
  const m = Number(String(month).slice(5, 7));
  return `${m}月`;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function dayLabel(dateStr) {
  const today = todayStr();
  if (dateStr === today) return '今天';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateStr === todayStr(y)) return '昨天';
  const [yy, mm, dd] = dateStr.split('-').map(Number);
  const wd = new Date(yy, mm - 1, dd).getDay();
  const base = `${mm}月${dd}日 周${WEEKDAYS[wd]}`;
  return yy === new Date().getFullYear() ? base : `${yy}年${base}`;
}

/* ---------------- DOM 辅助 ---------------- */

/**
 * 极简 hyperscript：
 * h('div', {class: 'x', onclick: fn, value: '...'}, '文本', childNode)
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs && typeof attrs === 'object') {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'value') el.value = value;
      else if (key === 'checked') el.checked = !!value;
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    }
  }
  appendChildren(el, children);
  return el;
}

export function appendChildren(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
