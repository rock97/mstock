const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');
const ROOT = '/Users/lizhihua03/work/code/github/mstock';
const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const dom = new JSDOM('<div id="c" style="width:600px;height:400px"></div>', { url: 'http://localhost/x.html', pretendToBeVisual: true, virtualConsole: vc, runScripts: 'outside-only' });
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
  const data = await w.MSApi.trend('sh600519');
  w.MSCharts.trendChart(w.document.querySelector('#c'), data, { compact: true });
  await wait(200);
  const gs = lastOpt.graphic || [];
  const texts = gs.map((g) => g.style.text);
  console.log('graphic texts:', JSON.stringify(texts));
  const cum = texts.find((t) => /量较昨日/.test(t));
  if (!cum) fail('累计量增幅文本缺失');
  // 数值正确性验证
  const lastTime = data.rows[data.rows.length - 1].time;
  const prev = data.prevRows.find((r) => r.time === lastTime);
  const expect = ((data.rows[data.rows.length - 1].cumVol - prev.cumVol) / prev.cumVol * 100).toFixed(1);
  console.log('lastTime:', lastTime, 'expect growth:', expect + '%', 'shown:', cum);
  if (!cum.includes(expect)) fail('增幅数值不匹配');
  const color = gs.find((g) => /量较昨日/.test(g.style.text)).style.fill;
  const gVal = parseFloat(expect);
  const expectColor = gVal > 0 ? '#e34d4d' : gVal < 0 ? '#3fae6a' : '#9aa3b2';
  if (color !== expectColor) fail('颜色错误: ' + color);
  // 涨幅文本仍在
  if (!texts.some((t) => /涨幅/.test(t))) fail('涨幅文本丢失');
  console.log('color ok:', color);
  console.log('\nCUM GROWTH TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
