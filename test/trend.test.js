const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = '/Users/lizhihua03/work/code/github/mstock';
const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const dom = new JSDOM('<div id="chart" style="width:600px;height:400px"></div>', { url: 'http://localhost/x.html', pretendToBeVisual: true, virtualConsole: vc, runScripts: 'outside-only' });
const w = dom.window; global.window = w; global.document = w.document;
w.fetch = async (url) => {
  const { execSync } = require('child_process');
  const gz = url.includes('qt.gtimg.cn') || url.includes('smartbox');
  const cmd = gz ? `curl -sS --max-time 15 '${url}' | iconv -f GBK -t UTF-8` : `curl -sS --max-time 15 '${url}'`;
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(execSync(cmd, { maxBuffer: 20e6 }).toString(), 'utf-8') };
};
// capture real echarts options
let lastOpt = null;
w.echarts = {
  init: () => ({ setOption: (o) => { lastOpt = o; }, clear() {}, dispose() {}, resize() {} }),
  graphic: { LinearGradient: function () {} },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fail(m) { console.error('FAIL:', m); process.exit(1); }
(async () => {
  w.eval(fs.readFileSync(path.join(ROOT, 'src/js/format.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'src/js/api.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'src/js/charts.js'), 'utf8'));
  // real intraday data for sh600519
  const data = await w.MSApi.trend('sh600519');
  console.log('trend rows:', data.rows.length, 'prevClose:', data.prevClose);
  if (data.rows.length < 10) fail('trend data too short');
  w.MSCharts.trendChart(w.document.querySelector('#chart'), data, { compact: true });
  await wait(200);
  if (!lastOpt) fail('no option set');
  // 1. graphic: 涨幅 text present with correct color
  const g = lastOpt.graphic;
  if (!g || !g.length || !/涨幅/.test(g[0].style.text)) fail('graphic 涨幅 missing, got: ' + JSON.stringify(g && g[0] && g[0].style && g[0].style.text));
  console.log('graphic text:', g[0].style.text, 'fill:', g[0].style.fill);
  // verify pct value correctness
  const last = data.rows[data.rows.length - 1].price;
  const expectPct = ((last - data.prevClose) / data.prevClose * 100).toFixed(2);
  if (!g[0].style.text.includes(expectPct)) fail('pct value wrong: want ' + expectPct + ' in ' + g[0].style.text);
  // 2. markPoint: max/min with 高/低 labels
  const mp = lastOpt.series[0].markPoint;
  if (!mp || mp.data.length !== 2) fail('markPoint missing');
  const maxD = mp.data[0], minD = mp.data[1];
  const test = (p, name) => {
    const label = p.label.formatter({ value: name === 'max' ? Math.max(...data.rows.map(r => r.price)) : Math.min(...data.rows.map(r => r.price)) });
    if (!new RegExp(name === 'max' ? '高' : '低').test(label)) fail('markPoint label wrong: ' + label);
    return label;
  };
  const hiLabel = test(maxD, 'max');
  const loLabel = test(minD, 'min');
  console.log('markPoint labels:', hiLabel, '/', loLabel);
  if (maxD.itemStyle.color !== '#e34d4d') fail('max color wrong');
  if (minD.itemStyle.color !== '#3fae6a') fail('min color wrong');
  // 3. markLine 昨收 still intact
  const ml = lastOpt.series[0].markLine;
  if (!ml || !/昨收/.test(ml.label.formatter)) fail('markLine 昨收 missing');
  console.log('markLine ok:', ml.label.formatter);
  console.log('\nTREND CHART TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
