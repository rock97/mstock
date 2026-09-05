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

  let editMode = false;
  let loadGen = 0;

  function badgeBg(pct) {
    const n = Number(pct) || 0;
    return n > 0 ? 'var(--up)' : n < 0 ? 'var(--down)' : '#5a6470';
  }

  function rowHTML(s, q) {
    const del = editMode ? '<span class="del" data-del="' + esc(s.full) + '">✕</span>' : '';
    if (!q) {
      return (
        '<div class="row" data-full="' + esc(s.full) + '">' +
        '<span class="mk ' + F.marketTagClass(s.market) + '">' + F.marketName(s.market) + '</span>' +
        '<span class="name">' + esc(s.name || s.code) + '</span>' +
        '<span class="price">--</span>' + del +
        '</div>'
      );
    }
    const pct = F.pct(q.pct);
    return (
      '<div class="row" data-full="' + esc(s.full) + '">' +
      '<span class="mk ' + F.marketTagClass(s.market) + '">' + F.marketName(s.market) + '</span>' +
      '<span class="name">' + esc(q.name) + '</span>' +
      '<span class="price" style="color:' + F.color(q.pct) + '">' + F.price(q.price) + '</span>' +
      '<span class="badge" style="background:' + badgeBg(q.pct) + '">' + pct + '</span>' +
      del +
      '</div>'
    );
  }

  async function loadTicker() {
    const el = $('#indexTicker');
    try {
      const mktCodes = ['sh000001', 'sz399001', 'hkHSI', 'usDJI'];
      const qs = await API.quotes(mktCodes);
      let deltaInfo = null;
      try {
        deltaInfo = await API.indexAmountDelta('sh000001');
      } catch (e) {}
      el.innerHTML = mktCodes
        .map((c) => {
          const q = qs[c];
          if (!q) return '';
          let extra = '';
          if (c === 'sh000001' && deltaInfo) {
            const cls = deltaInfo.delta > 0 ? 'd-up' : deltaInfo.delta < 0 ? 'd-down' : '';
            extra =
              ' <span class="idx-delta ' + cls + '" title="上证成交额较上一交易日同时点变化">' +
              (deltaInfo.delta > 0 ? '+' : '') + F.bigCN(deltaInfo.delta) +
              ' (' + (deltaInfo.pct > 0 ? '+' : '') + deltaInfo.pct.toFixed(1) + '%)</span>';
          }
          return (
            '<span class="idx" style="color:' + F.color(q.pct) + '">' +
            '<b>' + esc(q.name) + '</b>' + F.num(q.price, 2) + ' ' + F.pct(q.pct) + extra +
            '</span>'
          );
        })
        .join('');
    } catch (e) {
      el.textContent = '';
    }
  }

  async function loadList() {
    const gen = ++loadGen;
    const listEl = $('#stockList');
    try {
      const list = await Store.getWatchlist();
      if (gen !== loadGen) return;
      if (!list.length) {
        listEl.innerHTML = '<div class="empty">暂无自选股，快去搜索添加吧</div>';
        return;
      }
      const cached = await Store.getQuotesCache();
      if (gen !== loadGen) return;
      listEl.innerHTML = list.map((s) => rowHTML(s, cached[s.full])).join('');
      const qs = await API.quotes(list.map((s) => s.full));
      if (gen !== loadGen) return;
      await Store.setQuotesCache(qs);
      if (gen !== loadGen) return;
      listEl.innerHTML = list.map((s) => rowHTML(s, qs[s.full])).join('');
      $('#statusText').textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
    } catch (e) {
      if (gen === loadGen) $('#statusText').textContent = '行情加载失败：' + e.message;
    }
  }

  async function renderResults(items) {
    const box = $('#searchResults');
    if (!items.length) {
      box.innerHTML = '<div class="sr-item" style="cursor:default;color:var(--muted)">无匹配结果</div>';
      box.classList.remove('hidden');
      return;
    }
    const watched = await Store.getWatchlist();
    const watchedSet = new Set(watched.map((s) => s.full));
    box.innerHTML = items
      .map((it, i) => {
        const star = watchedSet.has(it.full) ? ' ✓' : '';
        return (
          '<div class="sr-item" data-full="' + esc(it.full) + '" data-code="' + esc(it.code) + '" data-name="' + esc(it.name) + '" data-market="' + esc(it.market) + '">' +
          '<span class="mk ' + F.marketTagClass(it.market) + '">' + F.marketName(it.market) + '</span>' +
          '<span class="name">' + esc(it.name) + star + '</span>' +
          '<span class="code">' + esc(it.code) + '</span>' +
          '</div>'
        );
      })
      .join('');
    box.classList.remove('hidden');
  }

  let searchTimer = null;
  function onSearchInput() {
    clearTimeout(searchTimer);
    const kw = $('#searchInput').value.trim();
    if (!kw) {
      $('#searchResults').classList.add('hidden');
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        renderResults(await API.search(kw));
      } catch (e) {
        renderResults([]);
      }
    }, 250);
  }

  async function onSearchResultClick(el) {
    const item = {
      full: el.dataset.full,
      code: el.dataset.code,
      name: el.dataset.name,
      market: el.dataset.market,
    };
    if (!item.full) return;
    $('#searchResults').classList.add('hidden');
    $('#searchInput').value = '';
    try {
      const before = await Store.getWatchlist();
      const existed = before.some((s) => s.full === item.full);
      if (!existed) {
        await Store.addStock(item);
        await loadList();
        $('#statusText').textContent = '已添加 ' + (item.name || item.code);
      }
      openDetail(item);
    } catch (e) {
      $('#statusText').textContent = '添加失败：' + e.message;
    }
  }

  function bindEvents() {
    $('#searchInput').addEventListener('input', onSearchInput);
    $('#searchBtn').addEventListener('click', onSearchInput);
    $('#searchResults').addEventListener('click', (e) => {
      const el = e.target.closest('.sr-item');
      if (el && el.dataset.full) onSearchResultClick(el);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.searchbox')) $('#searchResults').classList.add('hidden');
    });
    $('#stockList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        Store.removeStock(del.dataset.del).then(loadList);
        return;
      }
      const row = e.target.closest('.row');
      if (row) openDetailFromFull(row.dataset.full);
    });
    $('#editBtn').addEventListener('click', () => {
      editMode = !editMode;
      $('#editBtn').textContent = editMode ? '完成' : '管理';
      loadList();
    });
    $('#refreshBtn').addEventListener('click', () => {
      $('#statusText').textContent = '刷新中…';
      Promise.all([loadTicker(), loadList()]);
    });
    $('#openDash').addEventListener('click', openDashboard);

    $('#dClose').addEventListener('click', closeDetail);
    $('#detailOverlay').addEventListener('click', (e) => {
      if (e.target === $('#detailOverlay')) closeDetail();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDetail();
    });
    $('#dWatch').addEventListener('click', async () => {
      if (!detailStock) return;
      const on = await Store.isWatched(detailStock.full);
      if (on) await Store.removeStock(detailStock.full);
      else await Store.addStock(detailStock);
      await refreshDetailWatch();
      await loadList();
    });
    $('.dlg-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.dtab');
      if (tab) switchDetailRange(tab.dataset.range);
    });
  }

  function openDashboard() {
    const url = chrome.runtime.getURL('dashboard.html');
    chrome.tabs ? chrome.tabs.create({ url: url }) : window.open(url, '_blank');
  }

  let detailStock = null;
  let detailRange = 'trend';
  let detailChart = null;
  let detailGen = 0;
  let detailQuoteTimer = null;

  function chartEl() {
    return $('#dChart');
  }

  function showDetailError(msg) {
    const box = $('#dErr');
    box.textContent = msg || '加载失败';
    box.classList.remove('hidden');
    if (detailChart) {
      detailChart.clear();
      detailChart.setOption({
        title: {
          text: '暂无数据',
          subtext: msg || '',
          left: 'center', top: 'middle',
          textStyle: { color: '#9aa3b2', fontSize: 13, fontWeight: 'normal' },
          subtextStyle: { color: '#6b7480', fontSize: 11 },
        },
      });
    }
  }

  function hideDetailError() {
    $('#dErr').classList.add('hidden');
  }

  async function refreshDetailWatch() {
    if (!detailStock) return;
    const on = await Store.isWatched(detailStock.full);
    const btn = $('#dWatch');
    btn.textContent = on ? '★' : '☆';
    btn.classList.toggle('on', on);
    btn.title = on ? '移除自选' : '加入自选';
  }

  function renderDetailQuote(q) {
    if (!q) return;
    $('#dName').textContent = q.name;
    $('#dMarket').textContent = F.marketName(q.market);
    $('#dMarket').className = 'mk ' + F.marketTagClass(q.market);
    $('#dCode').textContent = q.code;
    $('#dPrice').textContent = F.price(q.price);
    $('#dPrice').style.color = F.color(q.pct);
    $('#dChange').textContent = F.signed(q.change) + '  ' + F.pct(q.pct);
    $('#dChange').style.color = F.color(q.pct);
    $('#dStats').innerHTML =
      '<span class="st">最高 <b style="color:' + F.color(q.high - q.prevClose) + '">' + F.price(q.high) + '</b></span>' +
      '<span class="st">最低 <b style="color:' + F.color(q.low - q.prevClose) + '">' + F.price(q.low) + '</b></span>' +
      '<span class="st">涨幅 <b style="color:' + F.color(q.pct) + '">' + F.pct(q.pct) + '</b></span>';
    $('#dStatus').textContent = F.marketStatus(q.full).label;
  }

  async function loadDetailChart() {
    if (!detailStock) return;
    const gen = ++detailGen;
    $('#dErr').classList.add('hidden');
    try {
      if (detailChart) {
        detailChart.dispose();
        detailChart = null;
      }
      const el = chartEl();
      const range = detailRange;
      if (range === 'trend') {
        const data = await API.trend(detailStock.full);
        if (gen !== detailGen) return;
        detailChart = Charts.trendChart(el, data, { compact: true });
      } else if (range === 'month' || range === 'week' || range === 'day') {
        const bars = await API.kline(detailStock.full, range, 320, 'qfq');
        if (gen !== detailGen) return;
        detailChart = Charts.klineChart(el, bars, { compact: true, zoomStart: Math.max(0, Math.round((1 - 90 / Math.max(bars.length, 1)) * 100)) });
      } else {
        const bars = await API.mkline(detailStock.full, range, 480);
        if (gen !== detailGen) return;
        detailChart = Charts.klineChart(el, bars, { isMinute: true, compact: true, zoomStart: 0 });
      }
      hideDetailError();
    } catch (e) {
      if (gen !== detailGen) return;
      showDetailError(e.message);
    }
  }

  function switchDetailRange(range) {
    detailRange = range;
    document.querySelectorAll('.dtab').forEach((t) => {
      t.classList.toggle('active', t.dataset.range === range);
    });
    loadDetailChart();
  }

  let detailQuoteStopped = true;

  function scheduleDetailQuote() {
    detailQuoteStopped = false;
    const tick = async () => {
      if (detailQuoteStopped) return;
      if (!detailStock || $('#detailOverlay').classList.contains('hidden')) {
        detailQuoteStopped = true;
        return;
      }
      try {
        const qs = await API.quotes([detailStock.full]);
        if (!detailQuoteStopped) renderDetailQuote(qs[detailStock.full]);
      } catch (e) {}
      if (!detailQuoteStopped) detailQuoteTimer = setTimeout(tick, 1000);
    };
    detailQuoteTimer = setTimeout(tick, 1000);
  }

  function syncMinuteTabs() {
    const isA = detailStock && ['sh', 'sz', 'bj'].indexOf(detailStock.market) >= 0;
    document.querySelectorAll('.dtab[data-range^="m"]').forEach((t) => {
      t.style.display = isA ? '' : 'none';
    });
    if (!isA && API.MINUTE_RANGES.indexOf(detailRange) >= 0) detailRange = 'trend';
  }

  async function openDetail(item) {
    detailStock = item;
    $('#dName').textContent = item.name || item.full;
    $('#dCode').textContent = item.code || '';
    $('#dMarket').textContent = F.marketName(item.market);
    $('#dMarket').className = 'mk ' + F.marketTagClass(item.market);
    $('#dPrice').textContent = '--';
    $('#dChange').textContent = '-- --';
    $('#dStatus').textContent = '';
    $('#detailOverlay').classList.remove('hidden');
    syncMinuteTabs();
    await refreshDetailWatch();
    try {
      const qs = await API.quotes([item.full]);
      renderDetailQuote(qs[item.full]);
    } catch (e) {}
    switchDetailRange(detailRange);
    scheduleDetailQuote();
  }

  async function openDetailFromFull(full) {
    const list = await Store.getWatchlist();
    const known = list.find((s) => s.full === full);
    const item = known || { full: full, code: full.slice(2), name: full, market: API.marketOf(full) };
    await openDetail(item);
  }

  function closeDetail() {
    detailQuoteStopped = true;
    clearTimeout(detailQuoteTimer);
    $('#detailOverlay').classList.add('hidden');
    detailStock = null;
    if (detailChart) {
      detailChart.dispose();
      detailChart = null;
    }
  }

  async function init() {
    bindEvents();
    await loadTicker();
    await loadList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
