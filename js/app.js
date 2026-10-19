/** 应用入口：路由、主题、Service Worker */

import * as store from './store.js';
import * as theme from './theme.js';
import { h } from './util.js';
import * as detail from './views/detail.js';
import * as entry from './views/entry.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';

const ROUTES = [
  { path: '/detail', view: detail, tab: 'detail' },
  { path: '/stats', view: stats, tab: 'stats' },
  { path: '/settings', view: settings, tab: 'settings', hideFab: true },
  { path: '/entry', view: entry, fullscreen: true },
];

let current = null;

export function navigate(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

function parseHash() {
  const raw = (location.hash || '').replace(/^#/, '') || '/detail';
  const [path, queryString = ''] = raw.split('?');
  return {
    path: path || '/detail',
    query: Object.fromEntries(new URLSearchParams(queryString)),
  };
}

function updateChrome(route) {
  const tabbar = document.getElementById('tabbar');
  const fab = document.getElementById('fab');
  const fullscreen = Boolean(route.fullscreen);
  tabbar.hidden = fullscreen;
  fab.hidden = fullscreen || Boolean(route.hideFab);
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', !fullscreen && tab.dataset.tab === route.tab);
  });
}

function renderFatal(message, detailText) {
  const view = document.getElementById('view');
  view.replaceChildren(
    h(
      'div',
      { class: 'empty' },
      h('span', { class: 'empty-emoji' }, '⚠️'),
      h('p', { class: 'empty-title' }, message),
      detailText ? h('p', { class: 'faint' }, detailText) : null
    )
  );
}

async function renderRoute() {
  const { path, query } = parseHash();
  const route = ROUTES.find((r) => r.path === path) || ROUTES[0];

  if (current && typeof current.unmount === 'function') {
    try {
      current.unmount();
    } catch (error) {
      console.error(error);
    }
  }

  const view = document.getElementById('view');
  view.replaceChildren();
  view.className = route.fullscreen ? 'view view--flush' : 'view';

  try {
    current = route.view.mount(view, { navigate, query, path }) || null;
  } catch (error) {
    console.error(error);
    current = null;
    renderFatal('页面出了点问题', error.message || String(error));
  }

  updateChrome(route);
  view.scrollTop = 0;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const secure =
    location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!secure) return;
  const start = () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service Worker 注册失败', error);
    });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

async function boot() {
  try {
    await store.init();
  } catch (error) {
    console.error(error);
    window.__APP_ERROR__ = error && error.message ? error.message : String(error);
    renderFatal(
      '本地数据库初始化失败',
      '请确认浏览器没有禁用网站数据（IndexedDB），然后刷新重试。'
    );
    return;
  }

  theme.initTheme();

  document.getElementById('fab').addEventListener('click', () => navigate('#/entry'));
  window.addEventListener('hashchange', () => {
    renderRoute();
  });

  if (!location.hash) history.replaceState(null, '', '#/detail');
  try {
    await renderRoute();
  } catch (error) {
    console.error(error);
    window.__APP_ERROR__ = error && error.message ? error.message : String(error);
  }
  window.__APP_READY__ = true;
  registerServiceWorker();
}

window.addEventListener('error', (event) => {
  window.__APP_ERROR__ = String((event && event.message) || 'unknown error');
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event && event.reason;
  window.__APP_ERROR__ = String((reason && reason.message) || reason || 'unhandled rejection');
});

boot();
