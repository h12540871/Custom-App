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
let activePriceData = [];
let currentTicker = '';

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const ticker = document.getElementById('ticker').value.trim().toUpperCase();
  const twelveDataKey = document.getElementById('twelvedata-key').value.trim();
  const openRouterKey = document.getElementById('openrouter-key').value.trim();

  results.innerHTML = '<p class="placeholder">Fetching 5-year price history and generating AI research note...</p>';

  try {
    const priceData = await fetchPriceData(ticker, twelveDataKey);
    activePriceData = priceData;
    currentTicker = ticker;

    const note = await getResearchNote(ticker, priceData, openRouterKey);
    renderResults(ticker, priceData, note);
    renderChart(priceData);
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
    throw new Error(body.trim() || 'Price fetch failed');
  }

  if (raw && raw.status === 'error') throw new Error(raw.message || 'Price fetch failed');
  if (!response.ok) throw new Error('Price fetch failed');

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

async function getResearchNote(ticker, priceData, apiKey) {
  const first = priceData[0];
  const latest = priceData[priceData.length - 1];
  const pctChange5Y = ((latest.close - first.close) / first.close) * 100;

  // Recent 1-year snippet if available
  const oneYearAgoIndex = Math.max(0, priceData.length - 252);
  const oneYearAgo = priceData[oneYearAgoIndex];
  const pctChange1Y = ((latest.close - oneYearAgo.close) / oneYearAgo.close) * 100;

  const summary =
    `${ticker} 5-year price history from ${first.date} to ${latest.date}: ` +
    `5-year start $${first.close.toFixed(2)}, current $${latest.close.toFixed(2)} (${pctChange5Y >= 0 ? '+' : ''}${pctChange5Y.toFixed(1)}%). ` +
    `1-year change: ${pctChange1Y >= 0 ? '+' : ''}${pctChange1Y.toFixed(1)}%. Total trading days analyzed: ${priceData.length}.`;

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
        { role: 'user', content: `${summary}\n\nWrite a concise one-paragraph financial analysis and key takeaway for ${ticker} based on this 5-year trend.` }
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

function renderResults(ticker, priceData, note) {
  const latest = priceData[priceData.length - 1];
  const start5Y = priceData[0];
  const change5Y = latest.close - start5Y.close;
  const pctChange5Y = (change5Y / start5Y.close) * 100;
  const isPositive = change5Y >= 0;

  const highest5Y = Math.max(...priceData.map(d => d.high));
  const lowest5Y = Math.min(...priceData.map(d => d.low));

  results.innerHTML = `
    <div class="ticker-header">
      <div>
        <h2>${ticker}</h2>
        <p class="price-hero">
          $${latest.close.toFixed(2)}
          <span class="price-change ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : ''}$${change5Y.toFixed(2)} (${isPositive ? '+' : ''}${pctChange5Y.toFixed(2)}% 5Y)
          </span>
        </p>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">5Y High</span>
          <span class="stat-value">$${highest5Y.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">5Y Low</span>
          <span class="stat-value">$${lowest5Y.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Data Range</span>
          <span class="stat-value">${start5Y.date.slice(0,7)} – ${latest.date.slice(0,7)}</span>
        </div>
      </div>
    </div>

    <div class="chart-section">
      <div class="chart-header">
        <h3>5-Year Stock Price Trend</h3>
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
      <h3>AI Research Analysis</h3>
      <p class="note">${note}</p>
    </div>
  `;

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
}

function filterAndRenderChart(range) {
  if (!activePriceData || !activePriceData.length) return;

  let days = activePriceData.length;
  if (range === '1Y') days = 252;
  else if (range === '2Y') days = 504;
  else if (range === '3Y') days = 756;
  else if (range === '5Y') days = activePriceData.length;

  const filteredData = activePriceData.slice(Math.max(0, activePriceData.length - days));
  renderChart(filteredData);
}

function renderChart(data) {
  const canvas = document.getElementById('stock-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (stockChart) {
    stockChart.destroy();
  }

  const startPrice = data[0].close;
  const endPrice = data[data.length - 1].close;
  const isGain = endPrice >= startPrice;

  const lineColor = isGain ? '#059669' : '#dc2626';
  const gradientTop = isGain ? 'rgba(5, 150, 105, 0.25)' : 'rgba(220, 38, 38, 0.25)';
  const gradientBottom = isGain ? 'rgba(5, 150, 105, 0.0)' : 'rgba(220, 38, 38, 0.0)';

  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, gradientTop);
  gradient.addColorStop(1, gradientBottom);

  const labels = data.map(d => d.date);
  const prices = data.map(d => d.close);

  stockChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: `${currentTicker} Price ($)`,
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
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#0d2818',
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 13, weight: 'bold' },
          padding: 10,
          displayColors: false,
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
              return `Close Price: $${Number(item.raw).toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxTicksLimit: 8,
            color: '#4b6b55',
            font: { size: 11 },
            callback: function(val, index) {
              const label = this.getLabelForValue(val);
              return label ? label.slice(0, 7) : '';
            }
          }
        },
        y: {
          grid: {
            color: '#e6f4ea'
          },
          ticks: {
            color: '#4b6b55',
            font: { size: 11 },
            callback: (val) => `$${Number(val).toFixed(0)}`
          }
        }
      }
    }
  });
}

