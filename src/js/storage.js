(function (global) {
  'use strict';

  const KEY_LIST = 'ms_watchlist_v1';
  const KEY_CACHE = 'ms_quotes_cache_v1';

  const DEFAULT_LIST = [
    { full: 'sh600519', code: '600519', name: '贵州茅台', market: 'sh' },
    { full: 'hk00700', code: '00700', name: '腾讯控股', market: 'hk' },
    { full: 'usAAPL.OQ', code: 'AAPL.OQ', name: '苹果', market: 'us' },
  ];

  const memStore = {};

  const LS = (() => {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {}
    try {
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
    } catch (e) {}
    return null;
  })();

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (e) {
      return fallback;
    }
  }

  const chromeBackend =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
      ? {
          async get(key) {
            return new Promise((resolve) => {
              try {
                chrome.storage.local.get(key, (o) => {
                  if (chrome.runtime.lastError) return resolve(memStore[key]);
                  resolve(o ? o[key] : memStore[key]);
                });
              } catch (e) {
                resolve(memStore[key]);
              }
            });
          },
          async set(key, val) {
            memStore[key] = val;
            return new Promise((resolve) => {
              try {
                const o = {};
                o[key] = val;
                chrome.storage.local.set(o, () => resolve());
              } catch (e) {
                resolve();
              }
            });
          },
        }
      : null;

  const lsBackend = LS
    ? {
        async get(key) {
          return safe(() => {
            const v = LS.getItem(key);
            return v ? JSON.parse(v) : null;
          }, null);
        },
        async set(key, val) {
          safe(() => LS.setItem(key, JSON.stringify(val)));
        },
      }
    : null;

  const memBackend = {
    async get(key) {
      return memStore[key];
    },
    async set(key, val) {
      memStore[key] = val;
    },
  };

  const backend = chromeBackend || lsBackend || memBackend;

  async function getWatchlist() {
    const v = await backend.get(KEY_LIST);
    if (Array.isArray(v)) return v;
    await backend.set(KEY_LIST, DEFAULT_LIST);
    return DEFAULT_LIST.slice();
  }

  async function saveWatchlist(list) {
    await backend.set(KEY_LIST, list);
    return list;
  }

  async function addStock(item) {
    if (!item || !item.full) return getWatchlist();
    const list = await getWatchlist();
    if (list.some((s) => s.full === item.full)) return list;
    list.push({
      full: item.full,
      code: item.code,
      name: item.name,
      market: item.market,
      addedAt: Date.now(),
    });
    return saveWatchlist(list);
  }

  async function removeStock(full) {
    const list = await getWatchlist();
    return saveWatchlist(list.filter((s) => s.full !== full));
  }

  async function isWatched(full) {
    const list = await getWatchlist();
    return list.some((s) => s.full === full);
  }

  async function getQuotesCache() {
    const v = await backend.get(KEY_CACHE);
    return v && typeof v === 'object' ? v : {};
  }

  async function setQuotesCache(obj) {
    await backend.set(KEY_CACHE, obj || {});
    return obj;
  }

  global.MSStore = {
    getWatchlist: getWatchlist,
    saveWatchlist: saveWatchlist,
    addStock: addStock,
    removeStock: removeStock,
    isWatched: isWatched,
    getQuotesCache: getQuotesCache,
    setQuotesCache: setQuotesCache,
  };
})(typeof window !== 'undefined' ? window : globalThis);
