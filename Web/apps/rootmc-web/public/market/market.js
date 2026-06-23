(function () {
  var SERVER_ID = "rootmc";
  var PER_PAGE = 25;
  var CHART_LINE = "line";
  var CHART_CANDLE = "candle";
  var CHART_PERIOD_HOUR = "hour";
  var CHART_PERIOD_DAY = "day";
  var CHART_PERIOD_WEEK = "week";
  var HISTORY_LIMIT = 500;

  var state = {
    page: 1,
    total: 0,
    totalPages: 1,
    selected: "",
    items: [],
    debounce: null,
    q: "",
    historyPoints: [],
    chartMode: CHART_LINE,
    chartPeriod: CHART_PERIOD_DAY,
    priceChart: null,
  };

  var CHART_GREEN = "#5cb85c";
  var CHART_GREEN_FILL = "rgba(92, 184, 92, 0.12)";
  var CHART_GRID = "rgba(255, 255, 255, 0.06)";
  var CHART_TICK = "#9bb396";
  var CHART_UP = "#5cb85c";
  var CHART_DOWN = "#e57373";

  var PERIOD_LABELS = {
    hour: "Hourly",
    day: "Daily",
    week: "Weekly",
  };

  function el(id) { return document.getElementById(id); }

  function params() {
    var p = new URLSearchParams(window.location.search);
    var sid = (p.get("server") || p.get("server_id") || "").trim();
    if (sid) SERVER_ID = sid;
  }

  function fmtGold(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function itemLabel(key) {
    return String(key || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function filterValues() {
    return {
      q: el("f-q").value.trim(),
      sort: el("f-sort").value,
      minPrice: el("f-min-price").value,
      maxPrice: el("f-max-price").value,
      minQty: el("f-min-qty").value,
      maxQty: el("f-max-qty").value,
      minShops: el("f-min-shops").value,
      inStock: el("f-in-stock").checked,
    };
  }

  function buildItemsUrl() {
    var f = filterValues();
    var p = new URLSearchParams();
    p.set("server_id", SERVER_ID);
    p.set("page", String(state.page));
    p.set("per_page", String(PER_PAGE));
    p.set("sort", f.sort);
    if (f.q) p.set("q", f.q);
    if (f.minPrice) p.set("min_price", f.minPrice);
    if (f.maxPrice) p.set("max_price", f.maxPrice);
    if (f.minQty) p.set("min_qty", f.minQty);
    if (f.maxQty) p.set("max_qty", f.maxQty);
    if (f.minShops) p.set("min_shops", f.minShops);
    if (f.inStock) p.set("in_stock", "1");
    return "/api/rootmc/stock-market/items?" + p.toString();
  }

  function setError(msg) {
    var e = el("market-error");
    if (msg) { e.textContent = msg; e.hidden = false; }
    else { e.hidden = true; e.textContent = ""; }
  }

  function parseIso(iso) {
    var d = new Date(String(iso || ""));
    return isNaN(d.getTime()) ? null : d;
  }

  function weekStartKey(iso) {
    var d = parseIso(iso);
    if (!d) return String(iso || "").slice(0, 10);
    var day = d.getUTCDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function bucketKey(iso, period) {
    var s = String(iso || "");
    if (period === CHART_PERIOD_HOUR) return s.slice(0, 13);
    if (period === CHART_PERIOD_WEEK) return weekStartKey(s);
    return s.slice(0, 10);
  }

  function formatBucketLabel(key, period) {
    if (period === CHART_PERIOD_HOUR) {
      return key.length >= 13 ? key.slice(5, 13).replace("T", " ") : key;
    }
    if (period === CHART_PERIOD_WEEK) {
      return key.length >= 10 ? "Wk " + key.slice(5) : key;
    }
    return key.length >= 10 ? key.slice(5) : key;
  }

  function buildPeriodBuckets(points, period) {
    var byKey = {};
    points.forEach(function (p) {
      var k = bucketKey(p.recorded_at, period);
      if (!k) return;
      var price = Number(p.avg_price) || 0;
      if (!byKey[k]) {
        byKey[k] = { key: k, open: price, high: price, low: price, close: price };
      } else {
        byKey[k].high = Math.max(byKey[k].high, price);
        byKey[k].low = Math.min(byKey[k].low, price);
        byKey[k].close = price;
      }
    });
    return Object.keys(byKey).sort().map(function (k) { return byKey[k]; });
  }

  function destroyChart() {
    if (state.priceChart) {
      state.priceChart.destroy();
      state.priceChart = null;
    }
  }

  function chartTooltip() {
    return {
      backgroundColor: "#162816",
      titleColor: "#e8f0e4",
      bodyColor: "#9bb396",
      borderColor: "rgba(120, 180, 100, 0.22)",
      borderWidth: 1,
      callbacks: {
        label: function (ctx) {
          if (ctx.chart.config.type === "candlestick") {
            var raw = ctx.raw || {};
            return [
              "O " + fmtGold(raw.o) + " G",
              "H " + fmtGold(raw.h) + " G",
              "L " + fmtGold(raw.l) + " G",
              "C " + fmtGold(raw.c) + " G",
            ];
          }
          return fmtGold(ctx.parsed.y) + " G";
        },
      },
    };
  }

  function chartScales(yLabel) {
    return {
      x: {
        grid: { color: CHART_GRID },
        ticks: { color: CHART_TICK, maxRotation: 45, font: { size: 10 } },
      },
      y: {
        grid: { color: CHART_GRID },
        ticks: {
          color: CHART_TICK,
          font: { size: 10 },
          callback: function (v) { return fmtGold(v); },
        },
        title: {
          display: true,
          text: yLabel,
          color: CHART_GREEN,
          font: { size: 11, weight: "500" },
        },
      },
    };
  }

  function renderLineChart(canvas, buckets) {
    if (typeof Chart === "undefined") {
      return "<p class=\"rmc-muted\">Chart library failed to load.</p>";
    }
    var labels = buckets.map(function (b) { return formatBucketLabel(b.key, state.chartPeriod); });
    var data = buckets.map(function (b) { return b.close; });
    state.priceChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Avg price (G)",
          data: data,
          borderColor: CHART_GREEN,
          backgroundColor: CHART_GREEN_FILL,
          tension: 0.25,
          fill: true,
          pointRadius: buckets.length > 40 ? 0 : 2,
          pointHoverRadius: 4,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: chartTooltip(),
        },
        scales: chartScales("Gold (G)"),
      },
    });
    return "";
  }

  function renderCandleChart(canvas, buckets) {
    if (typeof Chart === "undefined") {
      return "<p class=\"rmc-muted\">Chart library failed to load.</p>";
    }
    if (buckets.length < 2) {
      return "<p class=\"rmc-muted\">Need at least 2 " + (PERIOD_LABELS[state.chartPeriod] || "period").toLowerCase() + " buckets for candles.</p>";
    }
    state.priceChart = new Chart(canvas, {
      type: "candlestick",
      data: {
        labels: buckets.map(function (b) { return formatBucketLabel(b.key, state.chartPeriod); }),
        datasets: [{
          label: PERIOD_LABELS[state.chartPeriod] + " OHLC (G)",
          data: buckets.map(function (b, i) {
            return { x: i, o: b.open, h: b.high, l: b.low, c: b.close };
          }),
          color: { up: CHART_UP, down: CHART_DOWN, unchanged: CHART_TICK },
          borderColor: { up: CHART_UP, down: CHART_DOWN, unchanged: CHART_TICK },
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: chartTooltip(),
        },
        scales: chartScales("Gold (G)"),
      },
    });
    return "";
  }

  function chartMetaText(points, buckets) {
    if (!buckets.length) return "";
    var period = PERIOD_LABELS[state.chartPeriod] || state.chartPeriod;
    var mode = state.chartMode === CHART_CANDLE ? "candles" : "line";
    var first = formatBucketLabel(buckets[0].key, state.chartPeriod);
    var last = formatBucketLabel(buckets[buckets.length - 1].key, state.chartPeriod);
    return points.length + " snapshots · " + buckets.length + " " + period.toLowerCase() + " · " + mode + " · " + first + " → " + last;
  }

  function bindChartControls() {
    var periodWrap = el("market-chart-period");
    if (periodWrap) {
      periodWrap.querySelectorAll("button[data-chart-period]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-chart-period") === state.chartPeriod);
        btn.onclick = function () {
          var period = btn.getAttribute("data-chart-period");
          if (period === state.chartPeriod) return;
          state.chartPeriod = period;
          bindChartControls();
          mountChart(state.historyPoints);
        };
      });
    }
    var modeWrap = el("market-chart-toggle");
    if (modeWrap) {
      modeWrap.querySelectorAll("button[data-chart-mode]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-chart-mode") === state.chartMode);
        btn.onclick = function () {
          var mode = btn.getAttribute("data-chart-mode");
          if (mode === state.chartMode) return;
          state.chartMode = mode;
          bindChartControls();
          mountChart(state.historyPoints);
        };
      });
    }
  }

  function mountChart(points) {
    destroyChart();
    var host = el("market-chart-host");
    var card = el("market-chart");
    if (!host || !card) return;
    card.hidden = false;
    if (!points || points.length < 1) {
      host.innerHTML = "<p class=\"rmc-muted\">No price history recorded yet.</p>";
      return;
    }
    var buckets = buildPeriodBuckets(points, state.chartPeriod);
    if (buckets.length < 1) {
      host.innerHTML = "<p class=\"rmc-muted\">No price history for this period yet.</p>";
      return;
    }
    if (state.chartMode === CHART_CANDLE && buckets.length < 2) {
      host.innerHTML = "<p class=\"rmc-muted\">Need at least 2 " + (PERIOD_LABELS[state.chartPeriod] || "period").toLowerCase() + " buckets for candles — try Line or a longer period.</p>";
      return;
    }
    host.innerHTML =
      "<div class=\"market-chart-canvas-wrap\"><canvas id=\"market-price-chart\" aria-label=\"Price history\"></canvas></div>" +
      "<p class=\"market-chart-meta\">" + chartMetaText(points, buckets) + "</p>";
    var canvas = el("market-price-chart");
    var err = state.chartMode === CHART_CANDLE
      ? renderCandleChart(canvas, buckets)
      : renderLineChart(canvas, buckets);
    if (err) host.innerHTML = err;
  }

  function renderChartBlock() {
    return (
      "<div class=\"market-chart-panel\">" +
      "<div class=\"market-chart-head\">" +
      "<span>Price history</span>" +
      "<div class=\"market-chart-controls\">" +
      "<div class=\"market-chart-toggle\" id=\"market-chart-period\">" +
      "<button type=\"button\" data-chart-period=\"hour\">Hourly</button>" +
      "<button type=\"button\" data-chart-period=\"day\">Daily</button>" +
      "<button type=\"button\" data-chart-period=\"week\">Weekly</button>" +
      "</div>" +
      "<div class=\"market-chart-toggle\" id=\"market-chart-toggle\">" +
      "<button type=\"button\" data-chart-mode=\"line\">Line</button>" +
      "<button type=\"button\" data-chart-mode=\"candle\">Candles</button>" +
      "</div></div></div>" +
      "<div id=\"market-chart-host\"></div>" +
      "</div>"
    );
  }

  function showChartCard(html) {
    var card = el("market-chart");
    if (!card) return;
    card.hidden = false;
    card.innerHTML = html;
  }

  function hideChartCard() {
    var card = el("market-chart");
    if (!card) return;
    card.hidden = true;
    card.innerHTML = "<p class=\"rmc-muted\">Select an item to view its price chart.</p>";
  }

  function renderTable() {
    var tbody = el("market-tbody");
    tbody.innerHTML = "";
    state.items.forEach(function (row) {
      var tr = document.createElement("tr");
      if (row.item_key === state.selected) tr.className = "active";
      tr.dataset.key = row.item_key;
      tr.innerHTML =
        "<td><strong>" + itemLabel(row.item_key) + "</strong><span class=\"market-item-id\">" + row.item_key + "</span></td>" +
        "<td>" + (row.total_quantity || 0).toLocaleString() + "</td>" +
        "<td>" + (row.shop_count || 0) + "</td>" +
        "<td class=\"market-price\">" + (row.min_price > 0 ? fmtGold(row.min_price) + " G" : "—") + "</td>" +
        "<td class=\"market-price\">" + (row.max_price > 0 ? fmtGold(row.max_price) + " G" : "—") + "</td>" +
        "<td>" + (row.buy_capacity || 0).toLocaleString() + "</td>" +
        "<td>" + (row.buy_shop_count || 0) + "</td>" +
        "<td class=\"market-price\">" + (row.max_buy_price > 0 ? fmtGold(row.max_buy_price) + " G" : "—") + "</td>" +
        "<td><span class=\"market-price\">" + (row.market_avg > 0 ? fmtGold(row.market_avg) + " G" : "—") + "</span>" +
        (row.market_samples > 0 ? "<span class=\"market-item-id\">" + row.market_samples + " samples</span>" : "") + "</td>";
      tr.addEventListener("click", function () {
        state.selected = row.item_key;
        renderTable();
        loadHistory();
      });
      tbody.appendChild(tr);
    });
    el("market-table-wrap").hidden = state.items.length === 0;
    el("market-empty").hidden = state.items.length > 0;
    el("market-loading").hidden = true;
  }

  function renderPagination() {
    var wrap = el("market-pagination");
    wrap.hidden = state.total === 0;
    var start = state.total === 0 ? 0 : (state.page - 1) * PER_PAGE + 1;
    var end = Math.min(state.page * PER_PAGE, state.total);
    el("page-label").textContent = start + "–" + end + " of " + state.total + " · page " + state.page + " / " + state.totalPages;
    el("page-prev").disabled = state.page <= 1;
    el("page-next").disabled = state.page >= state.totalPages;
  }

  function loadItems() {
    el("market-loading").hidden = false;
    setError(null);
    fetch(buildItemsUrl(), { cache: "no-store" })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.detail || "Could not load prices right now. Try again in a minute.");
        var rows = (res.d.items || []).filter(function (r) { return r.item_key; });
        state.items = rows;
        state.total = Number(res.d.total) || 0;
        state.totalPages = Math.max(1, Number(res.d.total_pages) || 1);
        state.page = Number(res.d.page) || state.page;
        el("market-total").textContent = state.total + " item" + (state.total === 1 ? "" : "s");
        if (rows.length && !rows.some(function (r) { return r.item_key === state.selected; })) {
          state.selected = rows[0].item_key;
        }
        if (!rows.length) state.selected = "";
        renderTable();
        renderPagination();
        if (state.selected) loadHistory();
        else renderDetailEmpty();
      })
      .catch(function (e) {
        el("market-loading").hidden = true;
        setError(e.message || String(e));
      });
  }

  function renderDetailEmpty() {
    destroyChart();
    state.historyPoints = [];
    hideChartCard();
    el("market-detail").innerHTML = "<p class=\"rmc-muted\">Select a row to view price history.</p>";
  }

  function loadHistory() {
    if (!state.selected) { renderDetailEmpty(); return; }
    var url = "/api/rootmc/stock-market/history?server_id=" + encodeURIComponent(SERVER_ID) +
      "&item=" + encodeURIComponent(state.selected) + "&limit=" + HISTORY_LIMIT;
    fetch(url, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (h) {
        var points = h.points || [];
        state.historyPoints = points;
        var avg = h.current_avg || (points.length ? points[points.length - 1].avg_price : 0);
        el("market-detail").innerHTML =
          "<h2 style=\"margin:0 0 0.25rem;font-family:var(--rmc-display)\">" + itemLabel(state.selected) + "</h2>" +
          "<p class=\"market-item-id\">" + state.selected + "</p>" +
          "<div class=\"market-stat-row\">" +
          "<div class=\"market-stat\"><span class=\"rmc-muted\">Market avg</span><strong>" + fmtGold(avg) + " G</strong></div>" +
          "<div class=\"market-stat\"><span class=\"rmc-muted\">Samples</span><strong>" + (h.sample_count || 0) + "</strong></div>" +
          "</div>";
        showChartCard(renderChartBlock());
        bindChartControls();
        mountChart(points);
      })
      .catch(function () {
        destroyChart();
        hideChartCard();
        el("market-detail").innerHTML = "<p class=\"rmc-muted\">Price history is not available for this item yet.</p>";
      });
  }

  function bindFilters() {
    var inputs = ["f-q", "f-sort", "f-min-price", "f-max-price", "f-min-qty", "f-max-qty", "f-min-shops", "f-in-stock"];
    inputs.forEach(function (id) {
      el(id).addEventListener(id === "f-q" ? "input" : "change", function () {
        if (id === "f-q") {
          clearTimeout(state.debounce);
          state.debounce = setTimeout(function () { state.page = 1; loadItems(); }, 300);
        } else {
          state.page = 1;
          loadItems();
        }
      });
    });
    el("f-clear").addEventListener("click", function () {
      el("f-q").value = "";
      el("f-sort").value = "quantity_desc";
      ["f-min-price", "f-max-price", "f-min-qty", "f-max-qty", "f-min-shops"].forEach(function (id) { el(id).value = ""; });
      el("f-in-stock").checked = false;
      state.page = 1;
      loadItems();
    });
    el("page-prev").addEventListener("click", function () {
      if (state.page > 1) { state.page--; loadItems(); }
    });
    el("page-next").addEventListener("click", function () {
      if (state.page < state.totalPages) { state.page++; loadItems(); }
    });
  }

  params();
  bindFilters();
  loadItems();
})();
