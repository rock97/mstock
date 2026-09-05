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
  const data = await w.MSApi.trend('sh600519');
  w.MSCharts.trendChart(w.document.querySelector('#c'), data, { compact: true });
  await wait(200);
  // 模拟 tooltip 在盘中时刻 i=100（10:10 附近）
  const i = 100;
  const html = lastOpt.tooltip.formatter([
    { dataIndex: i, axisValue: data.rows[i].time, seriesName: '成交量', value: 1 },
    { dataIndex: i, seriesName: '成交额', value: 1 },
    { dataIndex: i, seriesName: '价格', value: 1 },
  ]);
  console.log('tooltip @', data.rows[i].time, ':', html);
  if (!/累计/.test(html)) fail('缺少累计行');
  if (!/较昨日同时刻/.test(html)) fail('缺少累计同比');
  // 数值正确性：累计 = cumVol[i]，昨日累计 = prevRows 同时刻 cumVol
  const cumNow = data.rows[i].cumVol;
  const prevRow = data.prevRows.find((r) => r.time === data.rows[i].time);
  const expect = ((cumNow - prevRow.cumVol) / prevRow.cumVol * 100).toFixed(1);
  console.log('expect cum growth:', expect + '% | cumNow:', (cumNow / 1e4).toFixed(0) + '万', '| prev:', (prevRow.cumVol / 1e4).toFixed(0) + '万');
  if (!html.includes(expect)) fail('累计增幅数值不匹配: want ' + expect);
  // 增长应为单调递增趋势检查：i=50 与 i=200 的累计值递增
  if (!(data.rows[200].cumVol > data.rows[50].cumVol)) fail('累计量非递增');
  console.log('\nCUM TOOLTIP TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
