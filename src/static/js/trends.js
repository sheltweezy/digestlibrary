/* ============================================================
   Digest Library — Trends Page
   ============================================================ */

(function() {

const METRIC_COLORS = {
  calories: '#C9A84C',
  protein_g: '#3ECF8E',
  carbs_g: '#4D9FEC',
  fat_g: '#F5A623',
  fiber_g: '#6EE7B7',
  sodium_mg: '#F25B5B',
  sugar_g: '#A78BFA',
};

const METRIC_LABELS = {
  calories: 'Calories',
  protein_g: 'Protein',
  carbs_g: 'Carbs',
  fat_g: 'Fat',
  fiber_g: 'Fiber',
  sodium_mg: 'Sodium',
  sugar_g: 'Sugar',
};

const METRIC_UNITS = {
  calories: 'kcal',
  protein_g: 'g',
  carbs_g: 'g',
  fat_g: 'g',
  fiber_g: 'g',
  sodium_mg: 'mg',
  sugar_g: 'g',
};

let activeRange = '1M';
let customStart = null;
let customEnd = null;
let activeMetrics = new Set(['calories', 'protein_g', 'carbs_g', 'fat_g']);
let trendsChart = null;
let mealChart = null;

function getDateRange(range) {
  const end = API.today();
  let start;
  switch (range) {
    case '7D':  start = API.dateNDaysAgo(7);   break;
    case '1M':  start = API.dateNMonthsAgo(1); break;
    case '3M':  start = API.dateNMonthsAgo(3); break;
    case '1Y':  start = API.dateNYearsAgo(1);  break;
    case 'ALL': start = '2000-01-01';           break;
    case 'CUSTOM':
      start = customStart || API.dateNMonthsAgo(1);
      return { start, end: customEnd || end };
    default:    start = API.dateNMonthsAgo(1);
  }
  return { start, end };
}

async function loadAll() {
  const profile = getActiveProfile();
  const noProfile = document.getElementById('trends-no-profile');
  const content = document.getElementById('trends-content');

  if (!profile) {
    if (noProfile) noProfile.style.display = 'flex';
    if (content)  content.style.display = 'none';
    return;
  }
  if (noProfile) noProfile.style.display = 'none';
  if (content)  content.style.display = 'block';

  const { start, end } = getDateRange(activeRange);
  const metrics = Array.from(activeMetrics).join(',');

  try {
    const [trendsData, avgData, favData, mealData] = await Promise.all([
      API.getTrends(profile.id, start, end, metrics),
      API.getRollingAverages(profile.id, start, end, metrics),
      API.getFavorites(profile.id, start, end, 10),
      API.getMealPatterns(profile.id, start, end),
    ]);
    renderTrendsChart(trendsData);
    renderAvgCards(avgData);
    renderFavorites(favData, start, end);
    renderMealPatterns(mealData);
  } catch(e) {
    showToast('Error loading trends: ' + e.message, 'error');
  }
}

function renderTrendsChart(data) {
  const ctx = document.getElementById('trends-chart');
  if (!ctx) return;

  if (trendsChart) trendsChart.destroy();

  const datasets = Array.from(activeMetrics).map(metric => ({
    label: METRIC_LABELS[metric],
    data: data.series[metric] || [],
    borderColor: METRIC_COLORS[metric],
    backgroundColor: METRIC_COLORS[metric] + '18',
    borderWidth: 2,
    pointRadius: data.dates.length > 60 ? 0 : 3,
    pointHoverRadius: 5,
    tension: 0.3,
    spanGaps: true,
    fill: false,
  }));

  trendsChart = new Chart(ctx, {
    type: 'line',
    data: { labels: data.dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A1D27',
          borderColor: '#2E3248',
          borderWidth: 1,
          titleColor: '#8B8FA8',
          bodyColor: '#F0F0F5',
          padding: 10,
          callbacks: {
            label: ctx => {
              if (ctx.parsed.y === null) return null;
              const m = Array.from(activeMetrics)[ctx.datasetIndex];
              return ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} ${METRIC_UNITS[m] || ''}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#2E324840' },
          ticks: { color: '#5A5E78', maxTicksLimit: 12, font: { family: 'JetBrains Mono', size: 11 } },
        },
        y: {
          grid: { color: '#2E324840' },
          ticks: { color: '#5A5E78', font: { family: 'JetBrains Mono', size: 11 } },
        }
      }
    }
  });

  // Render custom legend
  const legend = document.getElementById('trends-legend');
  if (legend) {
    legend.innerHTML = Array.from(activeMetrics).map(m => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${METRIC_COLORS[m]}"></div>
        ${METRIC_LABELS[m]}
      </div>
    `).join('');
  }
}

function renderAvgCards(data) {
  const container = document.getElementById('avg-cards');
  if (!container) return;

  const displayed = Array.from(activeMetrics).slice(0, 4);
  container.innerHTML = displayed.map(m => {
    const avg = data.averages?.[m];
    const val = avg != null ? avg.toFixed(1) : '—';
    const logged = data.days_logged || 0;
    const total = data.total_days || 0;
    return `
      <div class="kpi-card">
        <div class="kpi-label">
          <span>${METRIC_LABELS[m]}</span>
          <span class="text-muted font-xs">(avg)</span>
        </div>
        <div class="kpi-value">${val}<span class="kpi-unit">${METRIC_UNITS[m] || ''}</span></div>
        <div class="kpi-sub">${logged}/${total} days logged</div>
      </div>
    `;
  }).join('');
}

function renderFavorites(data, start, end) {
  const body = document.getElementById('favorites-body');
  const period = document.getElementById('favorites-period');
  if (!body) return;

  if (period) period.textContent = `${start} → ${end}`;

  if (!data || !data.length) {
    body.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;padding:20px">No data</td></tr>`;
    return;
  }

  body.innerHTML = data.map(f => `
    <tr>
      <td>${f.food}</td>
      <td class="mono">${f.count}</td>
      <td class="mono">${f.avg_calories != null ? f.avg_calories.toFixed(0) : '—'}</td>
      <td class="mono">${f.avg_protein_g != null ? f.avg_protein_g.toFixed(1) + 'g' : '—'}</td>
    </tr>
  `).join('');
}

function renderMealPatterns(data) {
  const ctx = document.getElementById('meal-patterns-chart');
  if (!ctx || !data) return;
  if (mealChart) mealChart.destroy();

  const mealColors = {
    breakfast: '#F5A623',
    lunch: '#4D9FEC',
    dinner: '#3ECF8E',
    late_night: '#A78BFA',
    other: '#5A5E78',
  };

  const labels = data.map(d => d.meal_context.replace('_', ' '));
  const values = data.map(d => d.avg_calories || 0);
  const colors = data.map(d => mealColors[d.meal_context] || '#5A5E78');

  mealChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + 'BB'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A1D27',
          borderColor: '#2E3248',
          borderWidth: 1,
          bodyColor: '#F0F0F5',
          callbacks: {
            label: ctx => ` Avg ${ctx.parsed.y.toFixed(0)} kcal`,
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8B8FA8', font: { size: 11 } } },
        y: { grid: { color: '#2E324840' }, ticks: { color: '#5A5E78', font: { family: 'JetBrains Mono', size: 11 } } }
      }
    }
  });

  // Detail breakdown below chart
  const detail = document.getElementById('meal-patterns-detail');
  if (detail) {
    detail.innerHTML = data.map(d => `
      <div class="flex items-center gap-8 mb-8">
        <span class="badge meal-badge" data-meal="${d.meal_context}">${d.meal_context.replace('_', ' ')}</span>
        <span class="text-muted font-xs">${d.entry_count} entries</span>
        <span class="mono font-xs text-secondary" style="margin-left:auto">${(d.avg_calories||0).toFixed(0)} kcal avg</span>
      </div>
      ${d.top_foods && d.top_foods.length ? `<div class="text-muted font-xs mb-8" style="padding-left:4px">${d.top_foods.slice(0,3).join(', ')}</div>` : ''}
    `).join('');
  }
}

/* ---- Event wiring ---- */
function wireEvents() {
  // Range buttons
  document.querySelectorAll('#range-bar .range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#range-bar .range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRange = btn.dataset.range;

      const customRow = document.getElementById('custom-date-row');
      if (customRow) customRow.style.display = activeRange === 'CUSTOM' ? 'flex' : 'none';

      if (activeRange !== 'CUSTOM') loadAll();
    });
  });

  // Custom date apply
  const applyBtn = document.getElementById('apply-custom');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      customStart = document.getElementById('custom-start').value;
      customEnd   = document.getElementById('custom-end').value;
      loadAll();
    });
  }

  // Metric toggles
  document.querySelectorAll('#metric-toggles .metric-pill').forEach(pill => {
    const m = pill.dataset.metric;
    if (activeMetrics.has(m)) pill.classList.add(`active-${m}`);
    pill.addEventListener('click', () => {
      if (activeMetrics.has(m)) {
        if (activeMetrics.size === 1) return; // keep at least one
        activeMetrics.delete(m);
        pill.classList.remove(`active-${m}`);
      } else {
        activeMetrics.add(m);
        pill.classList.add(`active-${m}`);
      }
      loadAll();
    });
  });
}

window.init_trends = function() {
  wireEvents();
  loadAll();
};

})();
