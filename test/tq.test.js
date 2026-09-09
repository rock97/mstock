const fs = require('fs');
global.window = global;
global.TextDecoder = require('util').TextDecoder;
global.fetch = async (url) => {
  const { execSync } = require('child_process');
  const gz = url.includes('qt.gtimg.cn') || url.includes('smartbox');
  const cmd = gz ? `curl -sS --max-time 30 '${url}' | iconv -f GBK -t UTF-8` : `curl -sS --max-time 30 '${url}'`;
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(execSync(cmd, { maxBuffer: 50e6 }).toString(), 'utf-8') };
};
eval(fs.readFileSync('/Users/lizhihua03/work/code/github/mstock/src/js/api.js', 'utf8'));
const API = global.MSApi;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
(async () => {
  for (const full of ['sh600519', 'hk00700']) {
    const sym = API.quoteSymbol(full);
    const text = await API.getText('https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=' + encodeURIComponent(sym));
    const json = JSON.parse(text);
    const q = API.quoteFromTrend(full, json && json.data && json.data[sym], sym);
    if (!q) fail(full + ' quoteFromTrend null');
    console.log(full, '=> price:', q.price, 'pct:', q.pct, 'high:', q.high, 'low:', q.low, 'name:', q.name, 'amount:', (q.amount / 1e8).toFixed(2) + '亿');
    if (!(q.price > 0 && q.high >= q.low && q.high >= q.price && q.low <= q.price)) fail(full + ' 高低校验失败');
    if (!(Math.abs(q.price - q.prevClose - q.change) < 1e-6)) fail(full + ' 涨跌计算错误');
    const t = await API.trend(full);
    if (!t.quote || t.quote.price !== q.price) fail(full + ' trend.quote 不一致');
    console.log(full, 'trend.quote ok, date:', t.date);
  }
  const sym = 'usAAPL';
  const text = await API.getText('https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=' + sym);
  const json = JSON.parse(text);
  const q = API.quoteFromTrend('usAAPL.OQ', json && json.data && json.data[sym], sym);
  console.log('usAAPL 非交易时段:', q ? 'price=' + q.price : 'null(回退qt)');
  console.log('TREND QUOTE TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
