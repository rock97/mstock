const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');

const ROOT = '/Users/lizhihua03/work/code/github/mstock';
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
vc.on('log', (...a) => console.log('[page]', ...a));

const html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8')
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');

// opaque origin breaks localStorage in jsdom; use a real http origin
const dom = new JSDOM(html, {
  url: 'http://localhost/popup.html',
  pretendToBeVisual: true,
  virtualConsole: vc,
  runScripts: 'outside-only',
});

const w = dom.window;
global.window = w;
global.document = w.document;

global.chrome = {
  runtime: { getURL: (p) => 'chrome-extension://abc/' + p },
  tabs: { create: (o) => { console.log('[tabs.create]', o.url); return {}; } },
};

w.fetch = async (url) => {
  const { execSync } = require('child_process');
  const gz = url.includes('qt.gtimg.cn') || url.includes('smartbox');
  const cmd = gz ? `curl -sS --max-time 15 '${url}' | iconv -f GBK -t UTF-8` : `curl -sS --max-time 15 '${url}'`;
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(execSync(cmd, { maxBuffer: 20e6 }).toString(), 'utf-8') };
};

w.echarts = {
  init: () => ({ setOption() {}, clear() {}, dispose() {}, resize() {} }),
  graphic: { LinearGradient: function () {} },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fail(msg) { console.error('FAIL:', msg); process.exit(1); }

(async () => {
  for (const f of ['format.js', 'api.js', 'storage.js', 'charts.js']) {
    w.eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'));
  }
  w.eval(fs.readFileSync(path.join(ROOT, 'src/js/popup.js'), 'utf8'));

  // jsdom fires native DCL after our eval in outside-only mode; bootstrap mirrors real Chrome:
  // init() runs exactly once via readyState check inside popup.js (no manual dispatch here).
  await wait(12000);

  const listEl = w.document.querySelector('#stockList');
  const rows0 = [...listEl.querySelectorAll('.row')].map((r) => r.dataset.full);
  console.log('initial rows:', rows0.join(','));
  if (rows0.length !== 3) fail('initial list should have 3, got ' + rows0.length);

  // --- S1: search 601318 + click -> add + dialog opens ---
  const input = w.document.querySelector('#searchInput');
  input.value = '601318';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  await wait(4000);
  const item = [...w.document.querySelectorAll('#searchResults .sr-item')].find((r) => r.dataset.full === 'sh601318');
  if (!item) fail('sh601318 not in search results');
  item.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(15000);

  const stored = JSON.parse(w.localStorage.getItem('ms_watchlist_v1') || '[]').map((s) => s.full);
  const rows1 = [...listEl.querySelectorAll('.row')].map((r) => r.dataset.full);
  console.log('stored:', stored.join(','));
  console.log('rows:', rows1.join(','));
  if (!stored.includes('sh601318')) fail('not saved to storage');
  if (!rows1.includes('sh601318')) fail('not rendered in list (race)');
  const overlay = w.document.querySelector('#detailOverlay');
  if (overlay.classList.contains('hidden')) fail('dialog did not open');
  const dlgName = w.document.querySelector('#dName').textContent;
  if (!dlgName || dlgName === '--') fail('dialog name empty');
  console.log('dialog:', dlgName, w.document.querySelector('#dCode').textContent);

  // close via ✕
  w.document.querySelector('#dClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(200);
  if (!overlay.classList.contains('hidden')) fail('dialog close failed');

  // --- S2: reopen from row, star toggles off/on ---
  listEl.querySelector('.row[data-full="sh601318"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(3000);
  if (overlay.classList.contains('hidden')) fail('dialog reopen failed');
  const star = w.document.querySelector('#dWatch');
  if (star.textContent !== '★') fail('star should be on');
  star.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(2000);
  let now = JSON.parse(w.localStorage.getItem('ms_watchlist_v1')).map((s) => s.full);
  if (now.includes('sh601318')) fail('unwatch failed');
  console.log('unwatched ok');
  star.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(2000);
  if (!JSON.parse(w.localStorage.getItem('ms_watchlist_v1')).some((s) => s.full === 'sh601318')) fail('re-watch failed');
  console.log('rewatched ok');

  // --- S3: switch to day K ---
  w.document.querySelector('.dtab[data-range="day"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(10000);
  if (!w.document.querySelector('#dErr').classList.contains('hidden')) fail('day K error: ' + w.document.querySelector('#dErr').textContent);
  console.log('day K ok');

  // --- S4: second add (002304 洋河股份) still renders ---
  input.value = '002304';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  await wait(4000);
  const item2 = [...w.document.querySelectorAll('#searchResults .sr-item')].find((r) => r.dataset.full === 'sz002304');
  if (!item2) fail('sz002304 not in results');
  item2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(12000);
  const rows2 = [...listEl.querySelectorAll('.row')].map((r) => r.dataset.full);
  console.log('final rows:', rows2.join(','));
  if (!rows2.includes('sz002304')) fail('second add not rendered');
  if (!rows2.includes('sh601318')) fail('first add disappeared (reset bug)');

  console.log('\nALL POPUP FLOW TESTS PASSED');
  process.exit(0);
})().catch((e) => { console.error('TEST ERROR:', e && (e.message || e)); process.exit(1); });
