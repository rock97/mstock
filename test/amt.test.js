const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
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
  const data = await w.MSApi.trend('sh600519');
  w.MSCharts.trendChart(w.document.querySelector('#c'), data, { compact: true });
  await wait(200);
  const texts = (lastOpt.graphic || []).map((g) => g.style.text);
  console.log('graphics:', JSON.stringify(texts));
  const amtT = texts.find((t) => /额较昨日(放量|缩量)/.test(t));
  if (!amtT) fail('成交额放量文本缺失');
  // 数值验证
  const lastTime = data.rows[data.rows.length - 1].time;
  const prev = data.prevRows.find((r) => r.time === lastTime);
  const delta = data.rows[data.rows.length - 1].cumAmount - prev.cumAmount;
  const expectStr = (delta > 0 ? '放量' : '缩量');
  if (!amtT.includes(expectStr)) fail('放量/缩量方向错误: ' + amtT);
  const deltaYi = Math.abs(delta) / 1e8;
  const shown = amtT.match(/([0-9.]+)(亿|万)/);
  const shownVal = parseFloat(shown[1]) * (shown[2] === '亿' ? 1e8 : 1e4);
  if (Math.abs(shownVal - Math.abs(delta)) / Math.abs(delta) > 0.02) fail('数值偏差>2%: shown=' + shownVal + ' want=' + Math.abs(delta));
  console.log('delta:', (delta / 1e8).toFixed(2) + '亿', '| shown:', amtT);
  // 颜色方向
  const g = (lastOpt.graphic || []).find((x) => /额较昨日/.test(x.style.text));
  const expectColor = delta > 0 ? '#e34d4d' : '#3fae6a';
  if (g.style.fill !== expectColor) fail('颜色方向错误');
  console.log('color ok:', g.style.fill);
  console.log('\nAMT DELTA TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
