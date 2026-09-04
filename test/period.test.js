const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = '/Users/lizhihua03/work/code/github/mstock';
const vc = new VirtualConsole(); vc.on('jsdomError', () => {}); vc.on('log', (...a) => console.log('[page]', ...a));
const html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/popup.html', pretendToBeVisual: true, virtualConsole: vc, runScripts: 'outside-only' });
const w = dom.window; global.window = w; global.document = w.document;
global.chrome = { runtime: { getURL: (p) => p }, tabs: { create: () => {} } };
const calls = [];
w.fetch = async (url) => {
  calls.push(url);
  const { execSync } = require('child_process');
  const gz = url.includes('qt.gtimg.cn') || url.includes('smartbox');
  const cmd = gz ? `curl -sS --max-time 30 '${url}' | iconv -f GBK -t UTF-8` : `curl -sS --max-time 30 '${url}'`;
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(execSync(cmd, { maxBuffer: 50e6 }).toString(), 'utf-8') };
};
w.echarts = { init: () => ({ setOption(){}, clear(){}, dispose(){}, resize(){} }), graphic: { LinearGradient: function(){} } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fail(m) { console.error('FAIL:', m); process.exit(1); }
(async () => {
  for (const f of ['format.js','api.js','storage.js','charts.js']) w.eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'src/js/popup.js'), 'utf8'));
  await wait(15000);
  if (w.document.querySelectorAll('#stockList .row').length !== 3) fail('initial list');

  // open dialog for 茅台 (A股) via list row
  w.document.querySelector('#stockList .row[data-full="sh600519"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(12000);

  // A股: minute tabs visible
  const m5 = w.document.querySelector('.dtab[data-range="m5"]');
  if (m5.style.display === 'none') fail('A股 minute tab should be visible');

  // click each tab, check the right endpoint was hit and error box hidden
  const checks = [
    ['m5',   /kline\/mkline.*m5/],
    ['m30',  /kline\/mkline.*m30/],
    ['m60',  /kline\/mkline.*m60/],
    ['month',/fqkline\/get.*month/],
    ['week', /fqkline\/get.*week/],
    ['day',  /fqkline\/get.*day/],
  ];
  for (const [range, urlRe] of checks) {
    const before = calls.length;
    w.document.querySelector(`.dtab[data-range="${range}"]`).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(12000);
    const hit = calls.slice(before).some((u) => urlRe.test(u));
    if (!hit) fail(`${range} tab did not hit expected endpoint. calls: ${calls.slice(before).join(' | ').slice(0, 200)}`);
    if (!w.document.querySelector('#dErr').classList.contains('hidden')) fail(`${range} error box: ${w.document.querySelector('#dErr').textContent}`);
    console.log(`tab ${range}: endpoint OK, no error`);
  }

  // close, open HK stock -> minute tabs hidden
  w.document.querySelector('#dClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(300);
  w.document.querySelector('#stockList .row[data-full="hk00700"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(12000);
  const hkM5 = w.document.querySelector('.dtab[data-range="m5"]');
  if (hkM5.style.display !== 'none') fail('HK minute tab should be hidden');
  if (!w.document.querySelector('#dErr').classList.contains('hidden')) fail('HK trend error: ' + w.document.querySelector('#dErr').textContent);
  console.log('HK: minute tabs hidden, trend renders OK');

  // active tab after HK open should not be a minute tab
  const active = w.document.querySelector('.dtab.active');
  if (active && /^m\d/.test(active.dataset.range)) fail('active tab is minute for HK');
  console.log('HK active tab:', active ? active.dataset.range : 'none');

  console.log('\nPERIOD TAB TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
