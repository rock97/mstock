const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = '/Users/lizhihua03/work/code/github/mstock';
const vc = new VirtualConsole(); vc.on('jsdomError', () => {}); vc.on('log', (...a) => console.log('[page]', ...a));
const dom = new JSDOM('<div id="c" style="width:600px;height:400px"></div>', { url: 'http://localhost/x.html', pretendToBeVisual: true, virtualConsole: vc, runScripts: 'outside-only' });
const w = dom.window; global.window = w; global.document = w.document;
const calls = [];
w.fetch = async (url) => {
  calls.push(url);
  const { execSync } = require('child_process');
  const gz = url.includes('qt.gtimg.cn') || url.includes('smartbox');
  const cmd = gz ? `curl -sS --max-time 30 '${url}' | iconv -f GBK -t UTF-8` : `curl -sS --max-time 30 '${url}'`;
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(execSync(cmd, { maxBuffer: 50e6 }).toString(), 'utf-8') };
};
let lastOpt = null;
w.echarts = { init: () => ({ setOption: (o) => { lastOpt = o; }, clear(){}, dispose(){}, resize(){} }), graphic: { LinearGradient: function(){} } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fail(m) { console.error('FAIL:', m); process.exit(1); }
(async () => {
  w.eval(fs.readFileSync(path.join(ROOT, 'src/js/format.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'src/js/api.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'src/js/charts.js'), 'utf8'));
  const API = w.MSApi, C = w.MSCharts;

  // 1. trend returns prevRows with same time axis
  const data = await API.trend('sh600519');
  console.log('today rows:', data.rows.length, 'date:', data.date);
  if (!data.prevRows || !data.prevRows.length) fail('prevRows missing');
  console.log('prevRows:', data.prevRows.length, 'prevDate:', data.prevDate);
  if (data.prevDate === data.date) fail('prevDate same as today');
  if (data.rows[0].time !== data.prevRows[0].time) fail('time axis mismatch');

  // 2. chart has 昨日量 series + tooltip formatter
  C.trendChart(w.document.querySelector('#c'), data, { compact: true });
  await wait(200);
  if (!lastOpt) fail('no chart option');
  const names = lastOpt.series.map((s) => s.name);
  console.log('series:', names.join(','));
  if (!names.includes('昨日量')) fail('昨日量 series missing');
  if (typeof lastOpt.tooltip.formatter !== 'function') fail('tooltip formatter missing');
  // simulate tooltip at a mid index
  const i = 60;
  const html = lastOpt.tooltip.formatter([
    { dataIndex: i, axisValue: '10:30', seriesName: '成交量', value: 1 },
    { dataIndex: i, seriesName: '成交额', value: 1 },
    { dataIndex: i, seriesName: '价格', value: 1 },
    { dataIndex: i, seriesName: '昨日量', value: 1 },
  ]);
  console.log('tooltip html:', html);
  if (!/量 <b>/.test(html) || !/额 <b>/.test(html)) fail('tooltip missing 量/额');
  if (!/较昨日/.test(html)) fail('tooltip missing 同比增幅');

  // 3. indexAmountDelta for sh000001
  const d1 = await API.indexAmountDelta('sh000001');
  console.log('sh000001 amount delta:', JSON.stringify(d1 && { amount: F2(d1.amount), prev: F2(d1.prevAmount), delta: F2(d1.delta), pct: d1.pct && d1.pct.toFixed(2) + '%' }));
  if (!d1 || !isFinite(d1.delta)) fail('indexAmountDelta failed');
  function F2(v) { return (v / 1e8).toFixed(0) + '亿'; }

  // 4. usDJI should fail gracefully (no day/query for US)
  const d2 = await API.indexAmountDelta('usDJI');
  console.log('usDJI delta:', d2);
  if (d2 !== null) fail('usDJI should return null');

  console.log('\nCOMPARE TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
