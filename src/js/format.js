(function (global) {
  'use strict';

  const F = {};

  F.num = function (v, d) {
    const n = Number(v);
    if (!isFinite(n)) return '--';
    d = d == null ? 2 : d;
    return n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  F.price = function (v) {
    const n = Number(v);
    if (!isFinite(n)) return '--';
    return F.num(n, n >= 1000 ? 2 : n >= 1 ? 2 : 4);
  };

  F.signed = function (v, d) {
    const n = Number(v);
    if (!isFinite(n)) return '--';
    return (n > 0 ? '+' : '') + F.num(n, d == null ? 2 : d);
  };

  F.pct = function (v, d) {
    const n = Number(v);
    if (!isFinite(n)) return '--';
    return (n > 0 ? '+' : '') + F.num(n, d == null ? 2 : d) + '%';
  };

  F.bigCN = function (v) {
    const n = Number(v);
    if (!isFinite(n)) return '--';
    const a = Math.abs(n);
    if (a >= 1e12) return F.num(n / 1e12, 2) + '万亿';
    if (a >= 1e8) return F.num(n / 1e8, 2) + '亿';
    if (a >= 1e4) return F.num(n / 1e4, 2) + '万';
    return F.num(n, 0);
  };

  F.vol = function (v, market) {
    const n = Number(v);
    if (!isFinite(n)) return '--';
    if (market === 'sh' || market === 'sz' || market === 'bj') return F.bigCN(n) + '手';
    return F.bigCN(n) + '股';
  };

  F.amount = function (v, market) {
    const n = Number(v);
    if (!isFinite(n)) return '--';
    const x = market === 'sh' || market === 'sz' || market === 'bj' ? n * 1e4 : n;
    return F.bigCN(x);
  };

  F.color = function (n) {
    const x = Number(n) || 0;
    return x > 0 ? '#e34d4d' : x < 0 ? '#3fae6a' : '#9aa3b2';
  };

  F.marketName = function (m) {
    return { sh: '沪A', sz: '深A', bj: '北交', hk: '港股', us: '美股' }[m] || m;
  };

  F.marketTagClass = function (m) {
    return { sh: 'tag-sh', sz: 'tag-sz', bj: 'tag-bj', hk: 'tag-hk', us: 'tag-us' }[m] || '';
  };

  F.hhmm = function (s) {
    if (!/^\d{4}$/.test(s)) return s;
    return s.slice(0, 2) + ':' + s.slice(2);
  };

  global.MSFormat = F;
})(typeof window !== 'undefined' ? window : globalThis);
