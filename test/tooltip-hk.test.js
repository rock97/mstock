const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');
const ROOT = '/Users/lizhihua03/work/code/github/mstock';
const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const dom = new JSDOM('<div id="c"></div>', { url: 'http://localhost/x.html', pretendToBeVisual: true, virtualConsole: vc, runScripts: 'outside-only' });
const w = dom.window; global.window = w; global.document = w.document;
w.fetch = async (url) => {
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
  const data = await w.MSApi.trend('hk00700');
  w.MSCharts.trendChart(w.document.querySelector('#c'), data, { compact: true });
  await wait(200);
  const i = 120;
  const html = lastOpt.tooltip.formatter([
    { dataIndex: i, axisValue: '10:30', seriesName: '成交量', value: 1 },
  ]);
  console.log('HK tooltip:', html.slice(0, 150));
  const a = (lastOpt.series.find((s) => s.name === '均价') || {}).data || [];
  const avg120 = a[120];
  console.log('HK 均价@120:', avg120, '(应在股价附近 433~445)');
  if (!(avg120 > 400 && avg120 < 500)) fail('HK 均价单位错误: ' + avg120);
  const p = data.rows[120].price;
  if (!html.includes(p.toFixed(2))) fail('HK 价格未显示');
  console.log('HK AVG TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
