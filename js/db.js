/** IndexedDB 极简封装：单库、四个 store */

const DB_NAME = 'bookkeeping';
const DB_VERSION = 1;
export const STORES = ['accounts', 'categories', 'transactions', 'meta'];

let dbPromise = null;

export function isSupported() {
  return typeof indexedDB !== 'undefined';
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('transactions')) {
        const tx = db.createObjectStore('transactions', { keyPath: 'id' });
        tx.createIndex('byDate', 'date');
        tx.createIndex('byAccount', 'accountId');
        tx.createIndex('byCategory', 'categoryId');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('无法打开本地数据库'));
    req.onblocked = () => reject(new Error('数据库被其他页面占用，请关闭其他标签页后重试'));
  });
  return dbPromise;
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await openDB();
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function get(store, key) {
  const db = await openDB();
  return wrap(db.transaction(store, 'readonly').objectStore(store).get(key));
}

export async function put(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(value);
    t.oncomplete = () => resolve(value);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('写入失败'));
  });
}

export async function putMany(store, values) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const value of values) os.put(value);
    t.oncomplete = () => resolve(values);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('写入失败'));
  });
}

export async function del(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('删除失败'));
  });
}

export async function clear(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('清空失败'));
  });
}

/** 事务外清理所有数据（用于恢复备份/重置） */
export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORES, 'readwrite');
    for (const s of STORES) t.objectStore(s).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('清空失败'));
  });
}
