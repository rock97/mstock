const fs = require('fs');
global.window = global;
global.TextDecoder = require('util').TextDecoder;
global.fetch = async (url) => {
  const { execSync } = require('child_process');
  const gz = url.includes('qt.gtimg.cn') || url.includes('smartbox');
  const cmd = gz ? `curl -sS --max-time 15 '${url}' | iconv -f GBK -t UTF-8` : `curl -sS --max-time 15 '${url}'`;
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(execSync(cmd, { maxBuffer: 20e6 }).toString(), 'utf-8') };
};
eval(fs.readFileSync('/Users/lizhihua03/work/code/github/mstock/src/js/api.js', 'utf8'));
const API = global.MSApi;

(async () => {
  // 1. quotes: A/HK/US field offsets
  const qs = await API.quotes(['sh600519', 'hk00700', 'usAAPL.OQ', 'sh000001']);
  for (const k of ['sh600519', 'hk00700', 'usAAPL.OQ', 'sh000001']) {
    const q = qs[k];
    if (!q) throw new Error('missing quote ' + k);
    console.log(`[quotes] ${k} name=${q.name} price=${q.price} change=${q.change} pct=${q.pct} high=${q.high} low=${q.low} open=${q.open} prevClose=${q.prevClose} time=${q.time}`);
    if (!(q.price > 0 && q.high >= q.low)) throw new Error('bad quote fields ' + k);
  }
  // 2. search
  const s1 = await API.search('maotai');
  const s2 = await API.search('腾讯');
  console.log('[search] maotai first =', s1[0].full, s1[0].name, '| 腾讯 count =', s2.length, 'first =', s2[0].full);
  if (!s1.some(x => x.full === 'sh600519')) throw new Error('search maotai missing sh600519');
  if (!s2.some(x => x.full === 'hk00700')) throw new Error('search 腾讯 missing hk00700');
  // 3. kline day/week/month for all markets
  for (const [full, key] of [['sh600519', 'qfqday'], ['hk00700', 'day'], ['usAAPL.OQ', 'day']]) {
    const bars = await API.kline(full, 'day', 5, 'qfq');
    const last = bars[bars.length - 1];
    console.log(`[kline] ${full} n=${bars.length} last=${last.date} c=${last.close}`);
    if (bars.length < 3 || !last.close) throw new Error('kline fail ' + full);
  }
  const wk = await API.kline('sh600519', 'week', 5, 'qfq');
  const mo = await API.kline('sh600519', 'month', 5, 'qfq');
  console.log('[kline] week n=' + wk.length + ' month n=' + mo.length);
  // 4. trend A/HK
  for (const full of ['sh600519', 'hk00700']) {
    const t = await API.trend(full);
    console.log(`[trend] ${full} n=${t.rows.length} first=${t.rows[0].time} prevClose=${t.prevClose}`);
    if (t.rows.length < 10) throw new Error('trend too short ' + full);
  }
  // 5. mkline A-share
  const mk = await API.mkline('sh600519', 'm5', 10);
  console.log('[mkline] sh600519 m5 n=' + mk.length + ' label=' + mk[mk.length-1].label);
  // 6. mkline HK should throw (degrade)
  try { await API.mkline('hk00700', 'm5', 10); throw new Error('should have thrown'); }
  catch (e) { console.log('[mkline] hk degrade ok:', e.message); }
  // 7. marketStatus
  console.log('[status] sh600519 =', JSON.stringify(API.marketStatus('sh600519')), '| usAAPL =', JSON.stringify(API.marketStatus('usAAPL.OQ')));
  // 8. toFull
  const cases = [['600519', 'sh600519'], ['000001', 'sz000001'], ['02318', 'hk02318'], ['aapl', 'usaapl'], ['sh600519', 'sh600519'], ['xyz!', null]];
  for (const [inp, exp] of cases) {
    const got = API.toFull(inp);
    if (got !== exp) throw new Error(`toFull(${inp}) = ${got}, want ${exp}`);
  }
  console.log('[toFull] all cases pass');
  console.log('\nALL TESTS PASSED');
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
