(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const F = window.MSFormat;
  const API = window.MSApi;
  const Store = window.MSStore;
  const Charts = window.MSCharts;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  let current = null;
  let currentRange = 'trend';
  let chart = null;
  let quoteTimer = null;

  const RANGE_TITLE = {
    trend: '分时', m5: '5分钟K线', m30: '30分钟K线', m60: '60分钟K线',
    day: '日K线', week: '周K线', month: '月K线',
  };

  function showError(msg) {
    const box = $('#errBox');
    box.textContent = msg || '加载失败';
    box.classList.remove('hidden');
    if (chart) {
      chart.clear();
      chart.setOption({
        title: {
          text: '暂无数据',
          subtext: msg || '',
          left: 'center', top: 'middle',
          textStyle: { color: '#9aa3b2', fontSize: 14, fontWeight: 'normal' },
          subtextStyle: { color: '#6b7480', fontSize: 12 },
        },
      });
    }
  }

  function hideError() {
    $('#errBox').classList.add('hidden');
  }

  function renderQuoteHead(q) {
    if (!q) return;
    $('#qName').textContent = q.name;
    $('#qMarket').textContent = F.marketName(q.market);
    $('#qMarket').className = 'mk ' + F.marketTagClass(q.market);
    $('#qCode').textContent = q.code;
    const st = API.marketStatus(q.full);
    $('#qStatus').textContent = st.label + ' · ' + (q.time || '');
    $('#qPrice').textContent = F.price(q.price);
    $('#qPrice').style.color = F.color(q.pct);
    $('#qChange').textContent = F.signed(q.change) + '  ' + F.pct(q.pct);
    $('#qChange').style.color = F.color(q.pct);
    const rows = [
      ['今开', F.price(q.open)], ['昨收', F.price(q.prevClose)],
      ['最高', F.price(q.high)], ['最低', F.price(q.low)],
      ['成交量', F.vol(q.vol, q.market)], ['成交额', F.amount(q.amount, q.market)],
      ['涨幅', F.pct(q.pct)], ['涨跌', F.signed(q.change)],
    ];
    $('#qGrid').innerHTML = rows
      .map(([k, v]) => '<div><span class="k">' + k + '</span><span>' + v + '</span></div>')
      .join('');
  }

  async function refreshQuote(silent) {
    if (!current) return;
    try {
      const qs = await API.quotes([current.full]);
      const q = qs[current.full];
      if (q) {
        renderQuoteHead(q);
        hideError();
      }
    } catch (e) {
      if (!silent) showError('行情加载失败：' + e.message);
    }
  }

  function zoomStartFor(count) {
    if (count <= 90) return 0;
    return Math.round((1 - 90 / count) * 100);
  }

  async function loadChart() {
    if (!current) return;
    const el = $('#chart');
    $('#chartMeta').textContent = '加载中…';
    const range = currentRange;
    try {
      let meta = { isMinute: false };
      if (range === 'trend') {
        const data = await API.trend(current.full);
        chart = Charts.trendChart(el, data, meta);
        $('#chartMeta').textContent = RANGE_TITLE[range] + ' · ' + (data.date || '') + ' · 共 ' + data.rows.length + ' 点';
      } else if (range === 'day' || range === 'week' || range === 'month') {
        const bars = await API.kline(current.full, range, 320, 'qfq');
        meta.zoomStart = zoomStartFor(bars.length);
        chart = Charts.klineChart(el, bars, meta);
        $('#chartMeta').textContent = RANGE_TITLE[range] + '（前复权） · 共 ' + bars.length + ' 根';
      } else {
        const bars = await API.mkline(current.full, range, 480);
        meta.isMinute = true;
        meta.zoomStart = zoomStartFor(bars.length);
        chart = Charts.klineChart(el, bars, meta);
        $('#chartMeta').textContent = RANGE_TITLE[range] + ' · 共 ' + bars.length + ' 根';
      }
      hideError();
    } catch (e) {
      chart = Charts.klineChart(el, [], meta);
      chart.clear();
      showError(e.message);
      $('#chartMeta').textContent = '';
    }
  }

  async function switchRange(range) {
    currentRange = range;
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.range === range);
    });
    if (chart) {
      chart.dispose();
      chart = null;
    }
    await loadChart();
  }

  async function refreshWatchBtn() {
    const on = await Store.isWatched(current.full);
    const btn = $('#watchBtn');
    btn.textContent = on ? '★ 已加自选' : '☆ 加自选';
    btn.classList.toggle('on', on);
  }

  function bindTabs() {
    $('#rangeTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) switchRange(tab.dataset.range);
    });
    $('#refreshBtn').addEventListener('click', () => {
      Promise.all([refreshQuote(false), loadChart()]);
    });
  }

  let searchTimer = null;
  function bindSearch() {
    const input = $('#searchInput');
    const box = $('#searchResults');
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const kw = input.value.trim();
      if (!kw) {
        box.classList.add('hidden');
        return;
      }
      searchTimer = setTimeout(async () => {
        try {
          const items = await API.search(kw);
          if (!items.length) {
            box.innerHTML = '<div class="sr-item" style="cursor:default;color:var(--muted)">无匹配结果</div>';
          } else {
            box.innerHTML = items
              .map((it, i) =>
                '<div class="sr-item" data-i="' + i + '">' +
                '<span class="mk ' + F.marketTagClass(it.market) + '">' + F.marketName(it.market) + '</span>' +
                '<span>' + esc(it.name) + '</span>' +
                '<span class="code">' + esc(it.code) + '</span></div>'
              )
              .join('');
            box.querySelectorAll('.sr-item').forEach((el) => {
              el.addEventListener('click', () => {
                selectStock(items[Number(el.dataset.i)]);
                box.classList.add('hidden');
                input.value = '';
              });
            });
          }
          box.classList.remove('hidden');
        } catch (e) {
          box.classList.add('hidden');
        }
      }, 250);
    });
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const full = API.toFull(input.value.trim());
      if (full) {
        const qs = await API.quotes([full]);
        const q = qs[full];
        selectStock({
          full: full,
          code: q ? q.code : full.slice(2),
          name: q ? q.name : full,
          market: API.marketOf(full),
        });
        box.classList.add('hidden');
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.searchbox')) box.classList.add('hidden');
    });
  }

  $('#watchBtn').addEventListener('click', async () => {
    if (!current) return;
    const on = await Store.isWatched(current.full);
    if (on) await Store.removeStock(current.full);
    else await Store.addStock(current);
    await refreshWatchBtn();
  });

  async function selectStock(item) {
    current = item;
    history.replaceState(null, '', '?code=' + encodeURIComponent(item.full));
    $('#qName').textContent = item.name || '--';
    $('#qCode').textContent = item.code || '';
    $('#qMarket').textContent = F.marketName(item.market);
    $('#qMarket').className = 'mk ' + F.marketTagClass(item.market);
    $('#qPrice').textContent = '--';
    $('#qChange').textContent = '-- --';
    const isA = ['sh', 'sz', 'bj'].indexOf(item.market) >= 0;
    document.querySelectorAll('.tab[data-range^="m"]').forEach((t) => {
      t.style.display = isA ? '' : 'none';
    });
    if (!isA && API.MINUTE_RANGES.indexOf(currentRange) >= 0) currentRange = 'trend';
    await refreshWatchBtn();
    await refreshQuote(false);
    await switchRange(currentRange);
    scheduleQuoteTimer();
  }

  function scheduleQuoteTimer() {
    clearTimeout(quoteTimer);
    const myStock = current.full;
    const tick = async () => {
      if (!current || current.full !== myStock) return;
      await refreshQuote(true);
      if (current && current.full === myStock) quoteTimer = setTimeout(tick, 1000);
    };
    quoteTimer = setTimeout(tick, 1000);
  }

  async function init() {
    bindTabs();
    bindSearch();
    let code = new URLSearchParams(location.search).get('code');
    if (!code) {
      const list = await Store.getWatchlist();
      code = list.length ? list[0].full : 'sh000001';
    }
    let item = null;
    try {
      const qs = await API.quotes([code]);
      const q = qs[code];
      if (q) item = { full: code, code: q.code, name: q.name, market: q.market };
    } catch (e) {}
    if (!item) item = { full: code, code: code.slice(2), name: code, market: API.marketOf(code) };
    await selectStock(item);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
