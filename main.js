// GenAI Finance course, starter scaffold.
// This file intentionally does very little. Build on it during class.
//
// No API keys are stored in this file. Both the Twelve Data key and the
// OpenRouter key are entered in the form fields at run time, so nothing secret
// is ever committed to your public repo or shipped in the source.

import Chart from 'chart.js/auto';

const form = document.getElementById('ticker-form');
const results = document.getElementById('results');

let stockChart = null;
let macdChart = null;
let activePrimaryData = [];
let activeCompareData = [];
let currentPrimaryTicker = '';
let currentCompareTicker = '';
let chartMode = 'pct'; // 'pct' or 'price'
let activeTab = 'price'; // 'price', 'macd', or 'roc'

// --- TECHNICAL INDICATORS MATH ---

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = new Array(prices.length);
  let sum = 0;
  for (let i = 0; i < period && i < prices.length; i++) {
    sum += prices[i];
    ema[i] = sum / (i + 1);
  }
  for (let i = period; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calculateMACD(data, fast = 12, slow = 26, signalPeriod = 9) {
  const closes = data.map(d => d.close);
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);

  const macdLine = emaFast.map((val, i) => val - emaSlow[i]);
  const signalLine = calculateEMA(macdLine, signalPeriod);
  const histogram = macdLine.map((val, i) => val - signalLine[i]);

  return { macdLine, signalLine, histogram };
}

function calculateROC(data, period = 14) {
  const closes = data.map(d => d.close);
  const roc = new Array(closes.length).fill(0);

  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      roc[i] = 0;
    } else {
      const prev = closes[i - period];
      roc[i] = prev !== 0 ? ((closes[i] - prev) / prev) * 100 : 0;
    }
  }
  return roc;
}

function analyzeTechnicalSignals(data) {
  if (!data || data.length < 30) return null;

  const closes = data.map(d => d.close);
  const macd = calculateMACD(data);
  const roc = calculateROC(data, 14);

  const len = data.length;
  const curMACD = macd.macdLine[len - 1];
  const prevMACD = macd.macdLine[len - 2];
  const curSignal = macd.signalLine[len - 1];
  const prevSignal = macd.signalLine[len - 2];
  const curHist = macd.histogram[len - 1];
  const curROC = roc[len - 1];
  const prevROC = roc[len - 2];

  // Crossover checks
  const isBullishCrossover = prevMACD <= prevSignal && curMACD > curSignal;
  const isBearishCrossover = prevMACD >= prevSignal && curMACD < curSignal;
  const isMACDBullish = curMACD > curSignal;

  // ROC trend
  const isROCUptrend = curROC > prevROC && curROC > 0;
  const isROCDowntrend = curROC < prevROC && curROC < 0;

  let overallSignal = 'NEUTRAL / HOLD';
  let signalClass = 'neutral';
  let macdDescription = '';
  let rocDescription = '';

  if (isBullishCrossover) {
    overallSignal = 'STRONG BUY';
    signalClass = 'strong-buy';
    macdDescription = 'Bullish MACD Crossover: MACD line crossed above Signal line.';
  } else if (isBearishCrossover) {
    overallSignal = 'STRONG SELL';
    signalClass = 'strong-sell';
    macdDescription = 'Bearish MACD Crossover: MACD line crossed below Signal line.';
  } else if (isMACDBullish && curROC > 0) {
    overallSignal = curROC > 5 ? 'STRONG BUY' : 'BUY';
    signalClass = curROC > 5 ? 'strong-buy' : 'buy';
    macdDescription = 'Bullish Momentum: MACD remains above Signal line.';
  } else if (!isMACDBullish && curROC < 0) {
    overallSignal = curROC < -5 ? 'STRONG SELL' : 'SELL';
    signalClass = curROC < -5 ? 'strong-sell' : 'sell';
    macdDescription = 'Bearish Momentum: MACD remains below Signal line.';
  } else {
    overallSignal = 'NEUTRAL / HOLD';
    signalClass = 'neutral';
    macdDescription = isMACDBullish ? 'Mild Bullish Bias' : 'Mild Bearish Bias';
  }

  if (curROC > 0) {
    rocDescription = `Positive Momentum (+${curROC.toFixed(2)}% over 14 periods)${isROCUptrend ? ' - Accelerating' : ' - Decelerating'}`;
  } else {
    rocDescription = `Negative Momentum (${curROC.toFixed(2)}% over 14 periods)${isROCDowntrend ? ' - Accelerating' : ' - Decelerating'}`;
  }

  return {
    overallSignal,
    signalClass,
    curMACD: curMACD.toFixed(2),
    curSignal: curSignal.toFixed(2),
    curHist: curHist.toFixed(2),
    curROC: curROC.toFixed(2),
    macdDescription,
    rocDescription,
    isMACDBullish,
    isBullishCrossover,
    isBearishCrossover
  };
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const primaryTicker = document.getElementById('ticker').value.trim().toUpperCase();
  const compareTicker = document.getElementById('compare-ticker').value.trim().toUpperCase();
  const twelveDataKey = document.getElementById('twelvedata-key').value.trim();
  const openRouterKey = document.getElementById('openrouter-key').value.trim();

  const statusText = compareTicker
    ? `Fetching 5-year price history for ${primaryTicker} & ${compareTicker} and generating comparative AI research note...`
    : `Fetching 5-year price history for ${primaryTicker} and generating AI research note...`;

  results.innerHTML = `<p class="placeholder">${statusText}</p>`;

  try {
    const primaryData = await fetchPriceData(primaryTicker, twelveDataKey);
    let compareData = null;

    if (compareTicker && compareTicker !== primaryTicker) {
      try {
        compareData = await fetchPriceData(compareTicker, twelveDataKey);
      } catch (compareErr) {
        console.warn('Could not fetch compare ticker data:', compareErr);
      }
    }

    activePrimaryData = primaryData;
    activeCompareData = compareData;
    currentPrimaryTicker = primaryTicker;
    currentCompareTicker = compareData ? compareTicker : '';

    const note = await getResearchNote(primaryTicker, primaryData, compareData ? compareTicker : null, compareData, openRouterKey);
    renderResults(primaryTicker, primaryData, compareData ? compareTicker : null, compareData, note);
    filterAndRenderChart('5Y');
  } catch (err) {
    results.innerHTML = `<p class="error">Something went wrong: ${err.message}</p>`;
  }
});

// Twelve Data daily price history.
// Requests outputsize=1260 to retrieve ~5 years of daily trading data.
async function fetchPriceData(ticker, apiKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=1260&apikey=${apiKey}`;
  const response = await fetch(url);

  const body = await response.text();
  let raw;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error(body.trim() || `Price fetch failed for ${ticker}`);
  }

  if (raw && raw.status === 'error') throw new Error(raw.message || `Price fetch failed for ${ticker}`);
  if (!response.ok) throw new Error(`Price fetch failed for ${ticker}`);

  const values = raw.values ?? [];
  if (!values.length) throw new Error(`No price data returned for ${ticker}`);

  return values
    .map((b) => ({
      date: b.datetime,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume)
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function getResearchNote(primaryTicker, primaryData, compareTicker, compareData, apiKey) {
  const pFirst = primaryData[0];
  const pLatest = primaryData[primaryData.length - 1];
  const pPct5Y = ((pLatest.close - pFirst.close) / pFirst.close) * 100;
  const pSignals = analyzeTechnicalSignals(primaryData);

  let summary =
    `${primaryTicker} 5-year trend (${pFirst.date} to ${pLatest.date}): ` +
    `Start $${pFirst.close.toFixed(2)}, Latest $${pLatest.close.toFixed(2)} (${pPct5Y >= 0 ? '+' : ''}${pPct5Y.toFixed(1)}%). ` +
    `Technical Indicators -> MACD(12,26,9): ${pSignals?.curMACD} (Signal: ${pSignals?.curSignal}, Hist: ${pSignals?.curHist}), ` +
    `ROC(14): ${pSignals?.curROC}%, Signal: ${pSignals?.overallSignal} (${pSignals?.macdDescription}).`;

  if (compareTicker && compareData && compareData.length) {
    const cFirst = compareData[0];
    const cLatest = compareData[compareData.length - 1];
    const cPct5Y = ((cLatest.close - cFirst.close) / cFirst.close) * 100;
    const cSignals = analyzeTechnicalSignals(compareData);
    summary += `\nComparison Stock (${compareTicker}) 5-year trend: ` +
      `Start $${cFirst.close.toFixed(2)}, Latest $${cLatest.close.toFixed(2)} (${cPct5Y >= 0 ? '+' : ''}${cPct5Y.toFixed(1)}%). ` +
      `Technical Indicators -> MACD: ${cSignals?.curMACD}, ROC(14): ${cSignals?.curROC}%, Signal: ${cSignals?.overallSignal}.`;
  }

  const promptMessage = (compareTicker && compareData)
    ? `${summary}\n\nWrite a concise one-paragraph comparative research note evaluating ${primaryTicker} vs ${compareTicker} incorporating both price action and technical indicators (MACD and Rate of Change ROC) to guide investors.`
    : `${summary}\n\nWrite a concise one-paragraph financial research note for ${primaryTicker} incorporating both 5-year price action and current technical indicators (MACD and ROC momentum) with clear buy/sell guidance.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-5',
      max_tokens: 2000,
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: 'You are a professional financial research analyst. Be concise, objective, and insightful.' },
        { role: 'user', content: promptMessage }
      ]
    })
  });

  if (!response.ok) throw new Error(`OpenRouter call failed. ${await readOpenRouterError(response)}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'No research note returned.';
}

async function readOpenRouterError(response) {
  let message = '';
  try {
    const body = await response.json();
    const err = body.error ?? body;
    message = err.message || '';
    const provider = err.metadata?.provider_name;
    const raw = err.metadata?.raw;
    if (provider) message += ` [provider: ${provider}]`;
    if (raw) message += ` ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`;
  } catch {}

  const hint = {
    401: 'Your API key looks invalid or missing',
    402: 'This model is paid and your OpenRouter account is out of credits',
    429: 'Rate limited, wait a moment and try again'
  }[response.status];
  return [`(HTTP ${response.status})`, hint, message].filter(Boolean).join(' ');
}

function renderResults(primaryTicker, primaryData, compareTicker, compareData, note) {
  const pLatest = primaryData[primaryData.length - 1];
  const pStart5Y = primaryData[0];
  const pChange5Y = pLatest.close - pStart5Y.close;
  const pPct5Y = (pChange5Y / pStart5Y.close) * 100;
  const pIsPos = pChange5Y >= 0;

  const pSignals = analyzeTechnicalSignals(primaryData);
  const cSignals = (compareTicker && compareData) ? analyzeTechnicalSignals(compareData) : null;

  let comparisonHeaderHTML = '';

  if (compareTicker && compareData && compareData.length) {
    const cLatest = compareData[compareData.length - 1];
    const cStart5Y = compareData[0];
    const cChange5Y = cLatest.close - cStart5Y.close;
    const cPct5Y = (cChange5Y / cStart5Y.close) * 100;
    const cIsPos = cChange5Y >= 0;

    comparisonHeaderHTML = `
      <div class="compare-cards-wrapper">
        <div class="ticker-card primary-card">
          <div class="card-badge">Primary</div>
          <h3>${primaryTicker}</h3>
          <p class="price-hero">
            $${pLatest.close.toFixed(2)}
            <span class="price-change ${pIsPos ? 'positive' : 'negative'}">
              ${pIsPos ? '+' : ''}${pPct5Y.toFixed(2)}% (5Y)
            </span>
          </p>
        </div>
        <div class="vs-divider">VS</div>
        <div class="ticker-card compare-card">
          <div class="card-badge compare-badge">Compare</div>
          <h3>${compareTicker}</h3>
          <p class="price-hero">
            $${cLatest.close.toFixed(2)}
            <span class="price-change ${cIsPos ? 'positive' : 'negative'}">
              ${cIsPos ? '+' : ''}${cPct5Y.toFixed(2)}% (5Y)
            </span>
          </p>
        </div>
      </div>
    `;
  } else {
    comparisonHeaderHTML = `
      <div class="ticker-header">
        <div>
          <h2>${primaryTicker}</h2>
          <p class="price-hero">
            $${pLatest.close.toFixed(2)}
            <span class="price-change ${pIsPos ? 'positive' : 'negative'}">
              ${pIsPos ? '+' : ''}$${pChange5Y.toFixed(2)} (${pIsPos ? '+' : ''}${pPct5Y.toFixed(2)}% 5Y)
            </span>
          </p>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">5Y High</span>
            <span class="stat-value">$${Math.max(...primaryData.map(d => d.high)).toFixed(2)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">5Y Low</span>
            <span class="stat-value">$${Math.min(...primaryData.map(d => d.low)).toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Technical Signals Grid HTML
  let signalsHTML = '';
  if (pSignals) {
    signalsHTML = `
      <div class="signals-section">
        <div class="signals-header">
          <h3>Technical Indicators & Buy/Sell Signals</h3>
        </div>
        <div class="signals-grid">
          <div class="signal-card">
            <div class="signal-card-header">
              <span class="signal-card-title">${primaryTicker} Technical Signal</span>
              <span class="signal-badge ${pSignals.signalClass}">${pSignals.overallSignal}</span>
            </div>
            <div class="signal-details">
              <div class="indicator-row">
                <span class="ind-label">MACD (12, 26, 9):</span>
                <span class="ind-val">${pSignals.curMACD} <span class="sub-val">(Signal: ${pSignals.curSignal}, Hist: ${pSignals.curHist})</span></span>
              </div>
              <p class="ind-desc">${pSignals.macdDescription}</p>

              <div class="indicator-row">
                <span class="ind-label">ROC (14 Momentum):</span>
                <span class="ind-val ${Number(pSignals.curROC) >= 0 ? 'pos' : 'neg'}">${Number(pSignals.curROC) >= 0 ? '+' : ''}${pSignals.curROC}%</span>
              </div>
              <p class="ind-desc">${pSignals.rocDescription}</p>
            </div>
          </div>

          ${cSignals ? `
            <div class="signal-card">
              <div class="signal-card-header">
                <span class="signal-card-title">${compareTicker} Technical Signal</span>
                <span class="signal-badge ${cSignals.signalClass}">${cSignals.overallSignal}</span>
              </div>
              <div class="signal-details">
                <div class="indicator-row">
                  <span class="ind-label">MACD (12, 26, 9):</span>
                  <span class="ind-val">${cSignals.curMACD} <span class="sub-val">(Signal: ${cSignals.curSignal}, Hist: ${cSignals.curHist})</span></span>
                </div>
                <p class="ind-desc">${cSignals.macdDescription}</p>

                <div class="indicator-row">
                  <span class="ind-label">ROC (14 Momentum):</span>
                  <span class="ind-val ${Number(cSignals.curROC) >= 0 ? 'pos' : 'neg'}">${Number(cSignals.curROC) >= 0 ? '+' : ''}${cSignals.curROC}%</span>
                </div>
                <p class="ind-desc">${cSignals.rocDescription}</p>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  results.innerHTML = `
    ${comparisonHeaderHTML}
    ${signalsHTML}

    <div class="chart-section">
      <div class="chart-tab-bar">
        <button class="tab-btn active" data-tab="price">Stock Price</button>
        <button class="tab-btn" data-tab="macd">MACD Indicator</button>
        <button class="tab-btn" data-tab="roc">Rate of Change (ROC)</button>
      </div>

      <div class="chart-header">
        <div class="chart-title-area">
          <h3 id="chart-dynamic-title">${compareTicker ? `${primaryTicker} vs ${compareTicker}` : 'Price Chart'}</h3>
          ${compareTicker ? `
            <div class="mode-selector" id="price-mode-selector">
              <button class="mode-btn ${chartMode === 'pct' ? 'active' : ''}" data-mode="pct">% Return</button>
              <button class="mode-btn ${chartMode === 'price' ? 'active' : ''}" data-mode="price">Price ($)</button>
            </div>
          ` : ''}
        </div>
        <div class="range-selector">
          <button class="range-btn" data-range="1Y">1Y</button>
          <button class="range-btn" data-range="2Y">2Y</button>
          <button class="range-btn" data-range="3Y">3Y</button>
          <button class="range-btn active" data-range="5Y">5Y</button>
        </div>
      </div>
      <div class="chart-wrapper">
        <canvas id="stock-chart"></canvas>
      </div>
    </div>

    <div class="research-note-section">
      <h3>${compareTicker ? 'AI Comparative Research Analysis' : 'AI Research Analysis'}</h3>
      <p class="note">${note}</p>
    </div>
  `;

  // Attach event listeners to chart tabs
  const tabButtons = results.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeTab = e.target.getAttribute('data-tab');

      // Update mode selector visibility
      const priceModeSel = results.querySelector('#price-mode-selector');
      if (priceModeSel) {
        priceModeSel.style.display = activeTab === 'price' ? 'flex' : 'none';
      }

      // Update title
      const titleElem = results.querySelector('#chart-dynamic-title');
      if (titleElem) {
        if (activeTab === 'macd') titleElem.textContent = `${primaryTicker} MACD (12, 26, 9) Oscillator`;
        else if (activeTab === 'roc') titleElem.textContent = `${primaryTicker} Rate of Change (ROC 14) Momentum`;
        else titleElem.textContent = compareTicker ? `${primaryTicker} vs ${compareTicker}` : 'Price Chart';
      }

      const activeRangeBtn = results.querySelector('.range-btn.active');
      const range = activeRangeBtn ? activeRangeBtn.getAttribute('data-range') : '5Y';
      filterAndRenderChart(range);
    });
  });

  // Attach event listeners to range selector buttons
  const rangeButtons = results.querySelectorAll('.range-btn');
  rangeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      rangeButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const range = e.target.getAttribute('data-range');
      filterAndRenderChart(range);
    });
  });

  // Attach event listeners to mode selector buttons if present
  const modeButtons = results.querySelectorAll('.mode-btn');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      modeButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      chartMode = e.target.getAttribute('data-mode');
      const activeRangeBtn = results.querySelector('.range-btn.active');
      const range = activeRangeBtn ? activeRangeBtn.getAttribute('data-range') : '5Y';
      filterAndRenderChart(range);
    });
  });
}

function filterAndRenderChart(range) {
  if (!activePrimaryData || !activePrimaryData.length) return;

  let days = activePrimaryData.length;
  if (range === '1Y') days = 252;
  else if (range === '2Y') days = 504;
  else if (range === '3Y') days = 756;
  else if (range === '5Y') days = activePrimaryData.length;

  const filteredPrimary = activePrimaryData.slice(Math.max(0, activePrimaryData.length - days));
  let filteredCompare = null;
  if (activeCompareData && activeCompareData.length) {
    filteredCompare = activeCompareData.slice(Math.max(0, activeCompareData.length - days));
  }

  renderChart(filteredPrimary, filteredCompare);
}

function renderChart(primaryData, compareData) {
  const canvas = document.getElementById('stock-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (stockChart) {
    stockChart.destroy();
  }

  const isComparing = compareData && compareData.length > 0;

  if (activeTab === 'macd') {
    // RENDER MACD CHART
    const macdP = calculateMACD(primaryData);
    const labels = primaryData.map(d => d.date);

    const datasets = [
      {
        label: `${currentPrimaryTicker} MACD`,
        data: macdP.macdLine,
        borderColor: '#2563eb',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        type: 'line'
      },
      {
        label: 'Signal Line',
        data: macdP.signalLine,
        borderColor: '#ea580c',
        borderWidth: 1.5,
        borderDash: [4, 4],
        fill: false,
        pointRadius: 0,
        type: 'line'
      },
      {
        label: 'Histogram',
        data: macdP.histogram,
        backgroundColor: macdP.histogram.map(v => v >= 0 ? 'rgba(5, 150, 105, 0.6)' : 'rgba(220, 38, 38, 0.6)'),
        type: 'bar',
        barThickness: 'flex'
      }
    ];

    if (isComparing) {
      const macdC = calculateMACD(compareData);
      datasets.push({
        label: `${currentCompareTicker} MACD`,
        data: macdC.macdLine,
        borderColor: '#9333ea',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        type: 'line'
      });
    }

    stockChart = new Chart(ctx, {
      data: { labels, datasets },
      options: getChartOptions(true, '')
    });

  } else if (activeTab === 'roc') {
    // RENDER ROC (Rate of Change 14) CHART
    const rocP = calculateROC(primaryData, 14);
    const labels = primaryData.map(d => d.date);

    const datasets = [
      {
        label: `${currentPrimaryTicker} ROC(14) %`,
        data: rocP,
        borderColor: '#059669',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        tension: 0.1
      }
    ];

    if (isComparing) {
      const rocC = calculateROC(compareData, 14);
      datasets.push({
        label: `${currentCompareTicker} ROC(14) %`,
        data: rocC,
        borderColor: '#2563eb',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        tension: 0.1
      });
    }

    stockChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: getChartOptions(true, '%')
    });

  } else {
    // RENDER PRICE CHART
    const primaryDateMap = new Map(primaryData.map(d => [d.date, d.close]));
    let datasets = [];

    if (isComparing && chartMode === 'pct') {
      const pStart = primaryData[0].close;
      const cStart = compareData[0].close;
      const compareDateMap = new Map(compareData.map(d => [d.date, d.close]));
      const allDates = Array.from(new Set([...primaryData.map(d => d.date), ...compareData.map(d => d.date)])).sort();

      let lastP = pStart;
      let lastC = cStart;

      const pPctData = [];
      const cPctData = [];

      allDates.forEach(date => {
        if (primaryDateMap.has(date)) lastP = primaryDateMap.get(date);
        if (compareDateMap.has(date)) lastC = compareDateMap.get(date);

        pPctData.push(((lastP - pStart) / pStart) * 100);
        cPctData.push(((lastC - cStart) / cStart) * 100);
      });

      datasets = [
        {
          label: `${currentPrimaryTicker} (% Return)`,
          data: pPctData,
          borderColor: '#059669',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#059669'
        },
        {
          label: `${currentCompareTicker} (% Return)`,
          data: cPctData,
          borderColor: '#2563eb',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#2563eb'
        }
      ];

      stockChart = new Chart(ctx, {
        type: 'line',
        data: { labels: allDates, datasets },
        options: getChartOptions(true, '%')
      });

    } else if (isComparing && chartMode === 'price') {
      const compareDateMap = new Map(compareData.map(d => [d.date, d.close]));
      const allDates = Array.from(new Set([...primaryData.map(d => d.date), ...compareData.map(d => d.date)])).sort();

      let lastP = primaryData[0].close;
      let lastC = compareData[0].close;

      const pPriceData = [];
      const cPriceData = [];

      allDates.forEach(date => {
        if (primaryDateMap.has(date)) lastP = primaryDateMap.get(date);
        if (compareDateMap.has(date)) lastC = compareDateMap.get(date);

        pPriceData.push(lastP);
        cPriceData.push(lastC);
      });

      datasets = [
        {
          label: `${currentPrimaryTicker} ($)`,
          data: pPriceData,
          borderColor: '#059669',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 5
        },
        {
          label: `${currentCompareTicker} ($)`,
          data: cPriceData,
          borderColor: '#2563eb',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 5
        }
      ];

      stockChart = new Chart(ctx, {
        type: 'line',
        data: { labels: allDates, datasets },
        options: getChartOptions(true, '$')
      });

    } else {
      // Single ticker price chart
      const labels = primaryData.map(d => d.date);
      const prices = primaryData.map(d => d.close);
      const startPrice = prices[0];
      const endPrice = prices[prices.length - 1];
      const isGain = endPrice >= startPrice;

      const lineColor = isGain ? '#059669' : '#dc2626';
      const gradientTop = isGain ? 'rgba(5, 150, 105, 0.25)' : 'rgba(220, 38, 38, 0.25)';
      const gradientBottom = isGain ? 'rgba(5, 150, 105, 0.0)' : 'rgba(220, 38, 38, 0.0)';

      const gradient = ctx.createLinearGradient(0, 0, 0, 300);
      gradient.addColorStop(0, gradientTop);
      gradient.addColorStop(1, gradientBottom);

      datasets = [
        {
          label: `${currentPrimaryTicker} Price ($)`,
          data: prices,
          borderColor: lineColor,
          borderWidth: 2,
          fill: true,
          backgroundColor: gradient,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: lineColor,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2
        }
      ];

      stockChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: getChartOptions(false, '$')
      });
    }
  }
}

function getChartOptions(showLegend, unit = '$') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        display: showLegend,
        position: 'top',
        labels: {
          usePointStyle: true,
          font: { size: 12, weight: '600' }
        }
      },
      tooltip: {
        backgroundColor: '#0d2818',
        titleFont: { size: 12, weight: 'bold' },
        bodyFont: { size: 13, weight: 'bold' },
        padding: 10,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const dateStr = items[0].label;
            return new Date(dateStr).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });
          },
          label: (item) => {
            const val = Number(item.raw);
            if (unit === '%') {
              return `${item.dataset.label}: ${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
            }
            return `${item.dataset.label}: $${val.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxTicksLimit: 8,
          color: '#4b6b55',
          font: { size: 11 },
          callback: function(val) {
            const label = this.getLabelForValue(val);
            return label ? label.slice(0, 7) : '';
          }
        }
      },
      y: {
        grid: { color: '#e6f4ea' },
        ticks: {
          color: '#4b6b55',
          font: { size: 11 },
          callback: (val) => unit === '%' ? `${Number(val).toFixed(0)}%` : `$${Number(val).toFixed(0)}`
        }
      }
    }
  };
}

