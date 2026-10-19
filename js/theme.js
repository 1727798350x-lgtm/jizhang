/** 主题：跟随设置 / 系统 */

import * as store from './store.js';

let media = null;
let listening = false;

export function initTheme() {
  if (!listening && typeof window !== 'undefined' && window.matchMedia) {
    media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme();
    if (media.addEventListener) media.addEventListener('change', handler);
    else if (media.addListener) media.addListener(handler);
    listening = true;
  }
  applyTheme();
}

export function resolvedTheme() {
  const setting = (store.getSettings() && store.getSettings().theme) || 'system';
  if (setting === 'dark') return 'dark';
  if (setting === 'light') return 'light';
  return media && media.matches ? 'dark' : 'light';
}

export function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e1117' : '#f4f6f9');
}
