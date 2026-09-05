(function (global) {
  'use strict';

  const UP = '#e34d4d';
  const DOWN = '#3fae6a';
  const MUTED = '#9aa3b2';

  const baseAxis = {
    axisLine: { lineStyle: { color: '#3a4450' } },
    axisLabel: { color: MUTED, fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
  };

  function tooltipCSS() {
    return {
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: '#2a323c' } },
      backgroundColor: 'rgba(23,28,34,0.95)',
      borderColor: '#2a323c',
      textStyle: { color: '#e8ecf1', fontSize: 12 },
    };
  }

  function gridPos(withVol, compact) {
    if (compact) {
      return withVol
        ? [{ left: 52, right: 10, top: 22, height: '50%' }, { left: 52, right: 10, top: '76%', height: '14%' }]
        : { left: 52, right: 10, top: 18, bottom: 26 };
    }
    return withVol
      ? [{ left: 64, right: 20, top: 12, height: '52%' }, { left: 64, right: 20, top: '72%', height: '16%' }]
      : { left: 64, right: 20, top: 24, bottom: 44 };
  }

  function minMax(arr, pc) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of arr) {
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!isFinite(lo)) return { min: 0, max: 1 };
    if (pc != null && isFinite(pc)) {
      lo = Math.min(lo, pc);
      hi = Math.max(hi, pc);
    }
    const pad = (hi - lo) * 0.08 || hi * 0.002 || 0.01;
    return { min: +(lo - pad).toFixed(4), max: +(hi + pad).toFixed(4) };
  }

  function trendChart(el, data, meta) {
    meta = meta || {};
    const compact = !!meta.compact;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    const labels = data.rows.map((r) =>
      /^\d{4}$/.test(r.time) ? r.time.slice(0, 2) + ':' + r.time.slice(2) : r.time
    );
    const prices = data.rows.map((r) => r.price);
    const pc = data.prevClose;
    const avg = [];
    let lastAmt = 0;
    let lastVol = 0;
    const perMin = data.rows.map((r) => {
      const dv = Math.max(0, (r.cumVol || 0) - lastVol);
      const da = Math.max(0, (r.cumAmount || 0) - lastAmt);
      lastVol = r.cumVol || 0;
      lastAmt = r.cumAmount || 0;
      avg.push(dv > 0 ? +(da / dv).toFixed(4) : null);
      // 午休补位行（累计与前一分钟相同）量额记 0，避免虚假柱
      const flat = dv === 0 && da === 0 && avg.length > 1;
      return { vol: flat ? 0 : dv, amount: flat ? 0 : da };
    });
    // 昨日同时刻每分钟量/额
    let prevVols = null;
    let prevAmounts = null;
    let prevDate = data.prevDate || '';
    if (data.prevRows && data.prevRows.length) {
      const pv = [];
      const pa = [];
      let pvLast = 0;
      let paLast = 0;
      const byTime = {};
      for (const r of data.prevRows) byTime[r.time] = r;
      for (const r of data.rows) {
        const pr = byTime[r.time];
        const pcv = pr ? Math.max(0, (pr.cumVol || 0) - pvLast) : null;
        const pca = pr ? Math.max(0, (pr.cumAmount || 0) - paLast) : null;
        if (pr) {
          pvLast = pr.cumVol || 0;
          paLast = pr.cumAmount || 0;
        }
        pv.push(pcv);
        pa.push(pca);
      }
      prevVols = pv.some((v) => v != null && v > 0) ? pv : null;
      prevAmounts = pa.some((v) => v != null && v > 0) ? pa : null;
    }
    const range = minMax(prices, pc);
    const grid = gridPos(true, compact);
    const fmtBig = (v) => {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) return '--';
      if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿';
      if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + '万';
      return n.toFixed(0);
    };
    const growth = (cur, prev) => {
      if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev <= 0) return null;
      return ((cur - prev) / prev) * 100;
    };
    const gTxt = (g) =>
      g == null ? ' 昨日:--' : ' 较昨日 ' + (g > 0 ? '+' : '') + g.toFixed(0) + '%';
    // 开盘至今累计量/额（原始数据已是累计口径，直接取）
    const cumNow = data.rows.map((r) => r.cumVol || 0);
    const cumAmtNow = data.rows.map((r) => r.cumAmount || 0);
    let prevCumVols = null;
    let prevCumAmts = null;
    if (data.prevRows && data.prevRows.length) {
      const byTime = {};
      for (const r of data.prevRows) byTime[r.time] = r;
      const pc1 = [];
      const pa1 = [];
      for (const r of data.rows) {
        const pr = byTime[r.time];
        pc1.push(pr && pr.cumVol > 0 ? pr.cumVol : null);
        pa1.push(pr && pr.cumAmount > 0 ? pr.cumAmount : null);
      }
      if (pc1.some((v) => v != null)) prevCumVols = pc1;
      if (pa1.some((v) => v != null)) prevCumAmts = pa1;
    }
    const cgTxt = (g) =>
      g == null ? ' 昨日同时刻:--' : ' 较昨日同时刻 ' + (g > 0 ? '+' : '') + g.toFixed(1) + '%';
    const lastPrice = prices.length ? prices[prices.length - 1] : null;
    const curPct = pc != null && lastPrice != null ? ((lastPrice - pc) / pc) * 100 : null;

    // 截止当前时刻累计成交量/额 vs 昨日同一时刻累计
    const cumVolNow = data.rows.length ? (data.rows[data.rows.length - 1].cumVol || 0) : 0;
    const cumAmtLast = data.rows.length ? (data.rows[data.rows.length - 1].cumAmount || 0) : 0;
    let cumVolPrevSameTime = null;
    let cumAmtPrevSameTime = null;
    if (data.prevRows && data.prevRows.length) {
      const lastTime = data.rows[data.rows.length - 1].time;
      const byTime = {};
      for (const r of data.prevRows) byTime[r.time] = r;
      const pr = byTime[lastTime];
      if (pr && pr.cumVol > 0) cumVolPrevSameTime = pr.cumVol;
      if (pr && pr.cumAmount > 0) cumAmtPrevSameTime = pr.cumAmount;
    }
    const cumGrowth = growth(cumVolNow, cumVolPrevSameTime);
    const cumText = cumGrowth == null
      ? ''
      : '量较昨日 ' + (cumGrowth > 0 ? '+' : '') + cumGrowth.toFixed(1) + '%';
    // 成交额较昨日累计放量金额（绝对值）
    const amtDelta = cumAmtLast > 0 && cumAmtPrevSameTime > 0 ? cumAmtLast - cumAmtPrevSameTime : null;
    const amtDeltaText = amtDelta == null
      ? ''
      : '额较昨日' + (amtDelta > 0 ? '放量 ' : '缩量 ') + (amtDelta > 0 ? '+' : '-') + fmtBig(Math.abs(amtDelta));

    chart.setOption({
      animation: false,
      tooltip: Object.assign(tooltipCSS(), {
        formatter: (params) => {
          const list = Array.isArray(params) ? params : [params];
          if (!list.length) return '';
          const i = list[0].dataIndex;
          const pm = perMin[i] || {};
          // 开盘至当前时刻累计量/额 vs 昨日开盘至同一时刻累计
          const cumV = cumNow[i];
          const cumA = cumAmtNow[i];
          const cumVp = prevCumVols ? prevCumVols[i] : null;
          const cumAp = prevCumAmts ? prevCumAmts[i] : null;
          let html = list[0].axisValue;
          for (const p of list) {
            if (p.seriesName === '价格' || p.seriesName === '均价' || p.seriesName === '昨日量') continue;
            if (p.seriesName === '成交量') {
              const g = growth(pm.vol, prevVols ? prevVols[i] : null);
              const cg = growth(cumV, cumVp);
              html += '<br/>量 <b>' + fmtBig(pm.vol) + '</b>' + gTxt(g);
              html += '<br/>累计 ' + fmtBig(cumV) + cgTxt(cg);
            } else if (p.seriesName === '成交额') {
              const g = growth(pm.amount, prevAmounts ? prevAmounts[i] : null);
              const cg = growth(cumA, cumAp);
              html += '<br/>额 <b>' + fmtBig(pm.amount) + '</b>' + gTxt(g);
              html += '<br/>累计 ' + fmtBig(cumA) + cgTxt(cg);
            }
          }
          return html;
        },
      }),
      graphic: [
        ...(curPct == null ? [] : [{
          type: 'text', left: compact ? 56 : 68, top: compact ? 2 : 1,
          style: {
            text: '涨幅 ' + (curPct > 0 ? '+' : '') + curPct.toFixed(2) + '%',
            fill: curPct > 0 ? UP : curPct < 0 ? DOWN : MUTED,
            fontSize: compact ? 11 : 13,
            fontWeight: 'bold',
          },
        }]),
        ...(cumText ? [{
          type: 'text', left: 'center', top: compact ? 2 : 1,
          style: {
            text: cumText,
            fill: cumGrowth > 0 ? UP : cumGrowth < 0 ? DOWN : MUTED,
            fontSize: compact ? 10 : 12,
            fontWeight: 'bold',
          },
        }] : []),
        ...(amtDeltaText ? [{
          type: 'text', right: compact ? 8 : 20, top: compact ? 2 : 1,
          style: {
            text: amtDeltaText,
            fill: amtDelta > 0 ? UP : amtDelta < 0 ? DOWN : MUTED,
            fontSize: compact ? 10 : 12,
            fontWeight: 'bold',
          },
        }] : []),
      ],
      legend: {
        data: ['价格', '均价'],
        top: 0, right: compact ? 8 : 20,
        textStyle: { color: MUTED, fontSize: compact ? 10 : 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: grid,
      xAxis: [
        { type: 'category', data: labels, gridIndex: 0, boundaryGap: false, axisLabel: { show: false }, axisTick: { show: false }, axisLine: baseAxis.axisLine },
        { type: 'category', data: labels, gridIndex: 1, axisLabel: { ...baseAxis.axisLabel, interval: Math.max(0, Math.floor(labels.length / 6)) }, axisTick: { show: false }, axisLine: baseAxis.axisLine },
      ],
      yAxis: [
        {
          type: 'value', gridIndex: 0, scale: true,
          min: range.min, max: range.max,
          axisLabel: { ...baseAxis.axisLabel, formatter: (v) => v.toFixed(2) },
          splitLine: baseAxis.splitLine,
        },
        {
          type: 'value', gridIndex: 1,
          axisLabel: { ...baseAxis.axisLabel, formatter: (v) => Math.abs(v) >= 10000 ? (v / 10000).toFixed(1) + '万' : v },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '价格', type: 'line', data: prices, xAxisIndex: 0, yAxisIndex: 0,
          showSymbol: false, lineStyle: { color: '#4d9fff', width: 1.4 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(77,159,255,0.28)' },
              { offset: 1, color: 'rgba(77,159,255,0.02)' },
            ]),
          },
          markLine: pc == null ? undefined : {
            symbol: 'none', silent: true,
            lineStyle: { color: MUTED, type: 'dashed', width: 1 },
            label: { color: MUTED, formatter: '昨收 ' + pc.toFixed(2) },
            data: [{ yAxis: pc }],
          },
          markPoint: {
            symbol: 'circle', symbolSize: 5, silent: true,
            data: [
              {
                type: 'max', name: '最高',
                itemStyle: { color: UP },
                label: {
                  show: true, position: 'top', distance: compact ? 4 : 6,
                  color: UP, fontSize: compact ? 10 : 11, fontWeight: 'bold',
                  formatter: (p) => '高 ' + (+p.value).toFixed(2),
                },
              },
              {
                type: 'min', name: '最低',
                itemStyle: { color: DOWN },
                label: {
                  show: true, position: 'bottom', distance: compact ? 4 : 6,
                  color: DOWN, fontSize: compact ? 10 : 11, fontWeight: 'bold',
                  formatter: (p) => '低 ' + (+p.value).toFixed(2),
                },
              },
            ],
          },
        },
        {
          name: '均价', type: 'line', data: avg, xAxisIndex: 0, yAxisIndex: 0,
          showSymbol: false, lineStyle: { color: '#f5c542', width: 1.2 },
        },
        {
          name: '成交量', type: 'bar', data: perMin.map((x) => x.vol), xAxisIndex: 1, yAxisIndex: 1,
          barMaxWidth: 6,
          itemStyle: {
            color: (p) => {
              const i = p.dataIndex;
              const cur = prices[i];
              const pre = i > 0 ? prices[i - 1] : pc;
              return cur != null && pre != null ? (cur >= pre ? UP : DOWN) : MUTED;
            },
          },
        },
        prevVols ? {
          name: '昨日量', type: 'bar', data: prevVols, xAxisIndex: 1, yAxisIndex: 1,
          barMaxWidth: 6,
          itemStyle: { color: 'rgba(154,163,178,0.4)' },
          tooltip: { show: false },
        } : {
          name: '成交额', type: 'line', data: perMin.map((x) => x.amount), xAxisIndex: 1, yAxisIndex: 1,
          showSymbol: false, lineStyle: { color: '#f5a623', width: 1 },
          itemStyle: { color: '#f5a623' },
        },
      ],
    });
    return chart;
  }

  function klineChart(el, bars, meta) {
    meta = meta || {};
    const compact = !!meta.compact;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    const categories = bars.map((b, i) => (meta.isMinute ? b.label : b.date));
    const kdata = bars.map((b) => [b.open, b.close, b.low, b.high]);
    const vols = bars.map((b, i) => ({
      value: b.vol,
      itemStyle: { color: b.close >= (i > 0 ? bars[i - 1].close : b.open) ? UP : DOWN },
    }));
    const closes = bars.map((b) => b.close);
    const ma = (n) =>
      closes.map((_, i) => {
        if (i < n - 1) return null;
        let s = 0;
        for (let j = i - n + 1; j <= i; j++) s += closes[j];
        return +(s / n).toFixed(4);
      });

    const grid = gridPos(true, compact);
    const zoomStart = meta.zoomStart == null ? 0 : meta.zoomStart;
    const dataZoom = compact
      ? [{ type: 'inside', xAxisIndex: [0, 1], start: zoomStart, end: 100 }]
      : [
          { type: 'inside', xAxisIndex: [0, 1], start: zoomStart, end: 100 },
          { type: 'slider', xAxisIndex: [0, 1], start: zoomStart, end: 100, height: 18, bottom: 6, borderColor: '#2a323c', backgroundColor: '#141a20', fillerColor: 'rgba(77,159,255,0.15)', handleStyle: { color: '#4d9fff' }, textStyle: { color: MUTED, fontSize: 10 } },
        ];
    chart.setOption({
      animation: false,
      tooltip: tooltipCSS(),
      legend: {
        data: ['MA5', 'MA10', 'MA20', 'MA60'],
        top: 0, right: compact ? 8 : 20,
        textStyle: { color: MUTED, fontSize: compact ? 10 : 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: grid,
      xAxis: [
        { type: 'category', data: categories, gridIndex: 0, axisLabel: { show: false }, axisTick: { show: false }, axisLine: baseAxis.axisLine },
        { type: 'category', data: categories, gridIndex: 1, axisLabel: { ...baseAxis.axisLabel, interval: Math.max(0, Math.floor(categories.length / 8)) }, axisTick: { show: false }, axisLine: baseAxis.axisLine },
      ],
      yAxis: [
        {
          type: 'value', gridIndex: 0, scale: true,
          axisLabel: { ...baseAxis.axisLabel, formatter: (v) => v.toFixed(2) },
          splitLine: baseAxis.splitLine,
        },
        {
          type: 'value', gridIndex: 1,
          axisLabel: { ...baseAxis.axisLabel, formatter: (v) => Math.abs(v) >= 10000 ? (v / 10000).toFixed(1) + '万' : v },
          splitLine: { show: false },
        },
      ],
      dataZoom: dataZoom,
      series: [
        {
          name: 'K线', type: 'candlestick', data: kdata, xAxisIndex: 0, yAxisIndex: 0,
          itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
        },
        { name: 'MA5', type: 'line', data: ma(5), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, lineStyle: { width: 1, color: '#f5c542' }, itemStyle: { color: '#f5c542' } },
        { name: 'MA10', type: 'line', data: ma(10), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, lineStyle: { width: 1, color: '#4d9fff' }, itemStyle: { color: '#4d9fff' } },
        { name: 'MA20', type: 'line', data: ma(20), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, lineStyle: { width: 1, color: '#e34dd0' }, itemStyle: { color: '#e34dd0' } },
        { name: 'MA60', type: 'line', data: ma(60), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, lineStyle: { width: 1, color: '#8de3b0' }, itemStyle: { color: '#8de3b0' } },
        { name: '成交量', type: 'bar', data: vols, xAxisIndex: 1, yAxisIndex: 1 },
      ],
    });
    return chart;
  }

  global.MSCharts = { trendChart: trendChart, klineChart: klineChart };
})(typeof window !== 'undefined' ? window : globalThis);
