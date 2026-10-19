/** 全局 UI 组件：Toast、底部弹层、确认框、表单字段 */

import { h } from './util.js';

let toastTimer = null;

export function toast(message, duration = 2000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/**
 * 底部弹层
 * @param {{title?: string, content?: Node|Node[], onClose?: Function}} options
 */
export function showSheet({ title = '', content, onClose } = {}) {
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    if (onClose) onClose();
  };

  const head = h(
    'div',
    { class: 'sheet-head' },
    h('h2', { class: 'sheet-title' }, title),
    h('button', { class: 'sheet-close', type: 'button', 'aria-label': '关闭', onclick: close }, '✕')
  );

  sheet.appendChild(head);
  const items = Array.isArray(content) ? content : content ? [content] : [];
  for (const item of items) {
    if (item instanceof Node) sheet.appendChild(item);
  }

  backdrop.appendChild(sheet);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.body.appendChild(backdrop);
  return { close, sheet };
}

/**
 * 确认对话框，返回 Promise<boolean>
 */
export function confirmDialog({
  title = '提示',
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const backdrop = h('div', { class: 'dialog-backdrop' });

    const finish = (result) => {
      backdrop.remove();
      resolve(result);
    };

    const dialog = h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
      h('h3', {}, title),
      message ? h('p', {}, message) : null,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => finish(false) }, cancelText),
        h(
          'button',
          {
            class: danger ? 'btn btn-danger' : 'btn btn-primary',
            type: 'button',
            onclick: () => finish(true),
          },
          confirmText
        )
      )
    );

    backdrop.appendChild(dialog);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finish(false);
    });
    document.body.appendChild(backdrop);
  });
}

/** 表单字段包装 */
export function field(label, input) {
  return h('label', { class: 'field' }, h('span', {}, label), input);
}

/** 文本输入 */
export function textInput({ value = '', placeholder = '', type = 'text', maxlength } = {}) {
  return h('input', {
    class: 'input',
    type,
    value,
    placeholder,
    ...(maxlength ? { maxlength } : {}),
  });
}

/** 按钮行 */
export function buttonRow(buttons) {
  return h('div', { class: 'btn-row' }, buttons);
}
