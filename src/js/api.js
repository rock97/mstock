(function (global) {
  'use strict';

  const QT_URL = 'https://qt.gtimg.cn/q=';
  const SEARCH_URL = 'https://smartbox.gtimg.cn/s3/?v=2&q=';
  const KLINE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=';
  const MKLINE_URL = 'https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=';
  const MINUTE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=';

  const INDEXES = ['sh000001', 'sz399001', 'hkHSI', 'usDJI'];

  const TZ = {
    sh: 'Asia/Shanghai',
    sz: 'Asia/Shanghai',
    bj: 'Asia/Shanghai',
    hk: 'Asia/Hong_Kong',
    us: 'America/New_York',
  };

  const SESSIONS = {
    sh: [['09:30', '11:30'], ['13:00', '15:00']],
    sz: [['09:30', '11:30'], ['13:00', '15:00']],
    bj: [['09:30', '11:30'], ['13:00', '15:00']],
    hk: [['09:30', '12:00'], ['13:00', '16:00']],
    us: [['09:30', '16:00']],
  };

  let gbkDecoder = null;
  try {
    gbkDecoder = new TextDecoder('gbk');
  } catch (e) {
    gbkDecoder = null;
  }

  async function getText(url, charset) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    if (charset === 'gbk' && gbkDecoder) return gbkDecoder.decode(buf);
    return new TextDecoder('utf-8').decode(buf);
  }

  function marketOf(full) {
    return String(full || '').slice(0, 2).toLowerCase();
  }

  function toFull(input) {
    const s = String(input || '').trim().toLowerCase();
    if (!s) return null;
    if (/^(sh|sz|bj|hk|us)[a-z0-9.]+$/.test(s)) return s;
    if (/^\d{6}$/.test(s)) {
      if (/^[695]/.test(s)) return 'sh' + s;
      if (/^[023]/.test(s)) return 'sz' + s;
      if (/^[48]/.test(s)) return 'bj' + s;
      return null;
    }
    if (/^\d{3,5}$/.test(s)) return 'hk' + s;
    if (/^[a-z][a-z0-9.]{0,9}$/.test(s)) return 'us' + s;
    return null;
  }

  function parseTimeStr(s) {
    if (!s) return '';
    s = String(s).replace(/\//g, '-');
    const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6];
    return s;
  }

  function parseQuote(full, f) {
    if (!f || f.length < 40) return null;
    let timeRaw = '';
    let timeIdx = -1;
    for (let i = 28; i <= 32 && i < f.length; i++) {
      if (/^\d{8}\d{6}$|^\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}/.test(f[i])) {
        timeRaw = f[i];
        timeIdx = i;
        break;
      }
    }
    if (timeIdx < 0) timeIdx = 29;
    const num = (v) => {
      const n = parseFloat(v);
      return isFinite(n) ? n : null;
    };
    const q = {
      full: full,
      market: marketOf(full),
      code: f[2] || String(full).slice(2),
      name: f[1] || '',
      price: num(f[3]),
      prevClose: num(f[4]),
      open: num(f[5]),
      vol: num(f[6]),
      time: parseTimeStr(timeRaw),
      change: num(f[timeIdx + 1]),
      pct: num(f[timeIdx + 2]),
      high: num(f[timeIdx + 3]),
      low: num(f[timeIdx + 4]),
      amount: num(f[timeIdx + 7]),
    };
    if (q.price == null) return null;
    if (q.change == null && q.prevClose != null) q.change = +(q.price - q.prevClose).toFixed(4);
    if (q.pct == null && q.prevClose) q.pct = +(((q.price - q.prevClose) / q.prevClose) * 100).toFixed(2);
    return q;
  }

  function quoteSymbol(full) {
    if (marketOf(full) !== 'us') return full;
    const sym = String(full).slice(2).replace(/\.[A-Za-z]{1,4}$/, '');
    return 'us' + sym.toUpperCase();
  }

  async function quotes(codes) {
    const list = (codes || []).filter(Boolean);
    if (!list.length) return {};
    const groups = {};
    for (const c of list) {
      const mkt = marketOf(c);
      (groups[mkt] = groups[mkt] || []).push(c);
    }
    const results = await Promise.all(
      Object.keys(groups).map(async (mkt) => {
        const groupCodes = groups[mkt];
        try {
          const syms = groupCodes.map(quoteSymbol);
          const text = await getText(QT_URL + syms.join(','), 'gbk');
          const map = {};
          const re = /v_([A-Za-z]{2}[A-Za-z0-9.]+)="([^"]*)"/g;
          let m;
          while ((m = re.exec(text)) !== null) {
            const q = parseQuote(m[1], m[2].split('~'));
            if (q) map[m[1].toLowerCase()] = q;
          }
          const out = {};
          for (const code of groupCodes) {
            const q = map[quoteSymbol(code).toLowerCase()] || map[String(code).toLowerCase()];
            if (q) out[code] = Object.assign({}, q, { full: code });
          }
          return out;
        } catch (e) {
          return {};
        }
      })
    );
    return Object.assign.apply(null, [{}].concat(results));
  }

  const SEARCHABLE_MARKETS = { sh: 1, sz: 1, bj: 1, hk: 1, us: 1 };

  function decodeUnicodeEscapes(s) {
    return String(s).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
  }

  async function search(keyword) {
    const q = String(keyword || '').trim();
    if (!q) return [];
    const text = await getText(SEARCH_URL + encodeURIComponent(q) + '&t=all');
    const m = text.match(/v_hint="([^"]*)"/);
    if (!m || !m[1]) return [];
    const hint = decodeUnicodeEscapes(m[1]);
    return hint
      .split('^')
      .map((row) => {
        const p = row.split('~');
        if (p.length < 3) return null;
        return { full: p[0] + p[1], market: p[0], code: p[1], name: p[2] };
      })
      .filter((x) => x && SEARCHABLE_MARKETS[x.market]);
  }

  async function withRetry(fn, tries) {
    let lastErr;
    for (let i = 0; i < (tries || 2); i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  const MINUTE_RANGES = ['m5', 'm30', 'm60'];

  async function kline(full, period, count, fq) {
    return withRetry(async () => {
      const param = [full, period, '', '', count || 320, fq || 'qfq'].join(',');
      const json = JSON.parse(await getText(KLINE_URL + encodeURIComponent(param)));
      const d = json && json.data && json.data[full];
      if (!d) throw new Error('K线数据为空');
      const rows = d[(fq || 'qfq') + period] || d[period];
      if (!rows || !rows.length) throw new Error('K线数据为空');
      const bars = [];
      for (const r of rows) {
        const open = parseFloat(r[1]);
        const close = parseFloat(r[2]);
        const high = parseFloat(r[3]);
        const low = parseFloat(r[4]);
        if (!isFinite(close) || close <= 0 || open <= 0 || high <= 0 || low <= 0) continue;
        bars.push({ date: r[0], open: open, close: close, high: high, low: low, vol: parseFloat(r[5]) || 0 });
      }
      if (!bars.length) throw new Error('K线数据为空');
      return bars;
    });
  }

  async function mkline(full, m, count) {
    const param = [full, m, '', count || 240].join(',');
    const json = JSON.parse(await getText(MKLINE_URL + encodeURIComponent(param)));
    const d = json && json.data && json.data[full];
    const rows = d && d[m];
    if (!rows || !rows.length) throw new Error('分钟K线暂仅支持A股');
    return rows
      .map((r) => {
        const t = String(r[0]);
        return {
          time: t,
          label: t.length >= 12 ? t.slice(4, 6) + '-' + t.slice(6, 8) + ' ' + t.slice(8, 10) + ':' + t.slice(10, 12) : t,
          open: parseFloat(r[1]),
          close: parseFloat(r[2]),
          high: parseFloat(r[3]),
          low: parseFloat(r[4]),
          vol: parseFloat(r[5]) || 0,
        };
      })
      .filter((b) => isFinite(b.close));
  }

  const DAY_QUERY_URL = 'https://web.ifzq.gtimg.cn/appstock/app/day/query?code=';

  function parseTrendRows(arr) {
    const rows = [];
    for (const line of arr) {
      const p = String(line).trim().split(/\s+/);
      if (p.length < 3) continue;
      const price = parseFloat(p[1]);
      if (!isFinite(price)) continue;
      rows.push({ time: p[0], price: price, cumVol: parseFloat(p[2]) || 0, cumAmount: parseFloat(p[3]) || 0 });
    }
    return rows;
  }

  async function fetchDayQuery(sym) {
    try {
      const json = JSON.parse(await getText(DAY_QUERY_URL + encodeURIComponent(sym)));
      const days = json && json.data && json.data[sym] && json.data[sym].data;
      if (!Array.isArray(days) || !days.length) return [];
      return days
        .map((day) => ({
          date: (day && day.date) || '',
          rows: parseTrendRows((day && day.data) || []),
        }))
        .filter((d) => d.rows.length);
    } catch (e) {
      return [];
    }
  }

  async function trend(full) {
    const sym = quoteSymbol(full);
    const json = JSON.parse(await getText(MINUTE_URL + encodeURIComponent(sym)));
    const d = json && json.data && json.data[sym];
    const arr = d && d.data && d.data.data;
    if (!arr || !arr.length || !/\d/.test(String(arr[0]))) throw new Error('分时数据暂不可用（可能非交易时段）');
    const rows = parseTrendRows(arr);
    if (!rows.length) throw new Error('分时数据暂不可用（可能非交易时段）');
    let prevClose = null;
    const qtArr = d.qt && d.qt[sym];
    if (qtArr) prevClose = parseFloat(qtArr[4]);
    let prevDay = null;
    const hist = await fetchDayQuery(sym);
    if (hist.length >= 2) {
      const curDate = (d.data && d.data.date) || (hist[0] && hist[0].date);
      for (const h of hist) {
        if (h.date && h.date !== curDate) {
          prevDay = h;
          break;
        }
      }
    }
    return {
      date: (d.data && d.data.date) || '',
      rows: rows,
      prevClose: isFinite(prevClose) ? prevClose : null,
      prevRows: prevDay ? prevDay.rows : null,
      prevDate: prevDay ? prevDay.date : '',
    };
  }

  async function indexAmountDelta(full) {
    const hist = await fetchDayQuery(full);
    if (hist.length < 2) return null;
    const today = hist[0];
    let prev = null;
    for (const h of hist) {
      if (h.date && h.date !== today.date) {
        prev = h;
        break;
      }
    }
    if (!prev) return null;
    const tLast = today.rows[today.rows.length - 1];
    const pLast = prev.rows[prev.rows.length - 1];
    if (!tLast || !pLast || !tLast.cumAmount || !pLast.cumAmount) return null;
    return {
      date: today.date,
      amount: tLast.cumAmount,
      prevAmount: pLast.cumAmount,
      delta: tLast.cumAmount - pLast.cumAmount,
      pct: ((tLast.cumAmount - pLast.cumAmount) / pLast.cumAmount) * 100,
    };
  }

  function marketStatus(full, now) {
    const market = marketOf(full);
    const tz = TZ[market];
    const sessions = SESSIONS[market];
    if (!tz || !sessions) return { open: false, label: '休市' };
    now = now || new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (t) => {
      const p = parts.find((x) => x.type === t);
      return p ? p.value : '';
    };
    const wd = get('weekday');
    const hhmm = get('hour') + ':' + get('minute');
    if (wd === 'Sat' || wd === 'Sun') return { open: false, label: '休市' };
    for (const s of sessions) {
      if (hhmm >= s[0] && hhmm < s[1]) return { open: true, label: '交易中' };
    }
    if (hhmm < sessions[0][0]) return { open: false, label: '盘前' };
    if (hhmm >= sessions[sessions.length - 1][1]) return { open: false, label: '已收盘' };
    return { open: false, label: '午间休市' };
  }

  const MSApi = {
    getText: getText,
    marketOf: marketOf,
    toFull: toFull,
    quoteSymbol: quoteSymbol,
    quotes: quotes,
    search: search,
    kline: kline,
    mkline: mkline,
    trend: trend,
    marketStatus: marketStatus,
    INDEXES: INDEXES,
    MINUTE_RANGES: MINUTE_RANGES,
    indexAmountDelta: indexAmountDelta,
  };

  global.MSApi = MSApi;
})(typeof window !== 'undefined' ? window : globalThis);
