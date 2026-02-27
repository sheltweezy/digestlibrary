/* ============================================================
   Digest Library — Overview Page
   ============================================================ */

(function() {

function pct(a, b) {
  if (!b) return null;
  return ((a - b) / b * 100).toFixed(1);
}

function trendHtml(pctChange, lowerIsBetter = false) {
  if (pctChange === null) return '<span class="text-muted">—</span>';
  const n = parseFloat(pctChange);
  const positive = lowerIsBetter ? n < 0 : n > 0;
  const cls = positive ? 'up' : 'down';
  const icon = n > 0 ? 'ph-trend-up' : 'ph-trend-down';
  const sign = n > 0 ? '+' : '';
  return `<span class="kpi-trend ${cls}"><i class="ph ${icon}"></i>${sign}${n}%</span>`;
}

function progressFillClass(consumed, goal) {
  if (!goal) return '';
  const r = consumed / goal;
  if (r > 1.05) return 'danger';
  if (r > 0.9)  return 'warning';
  return '';
}

async function loadOverview() {
  const profile = getActiveProfile();
  const noProfile = document.getElementById('overview-no-profile');
  const content   = document.getElementById('overview-content');

  if (!profile) {
    if (noProfile) noProfile.style.display = 'flex';
    if (content)   content.style.display = 'none';
    return;
  }
  if (noProfile) noProfile.style.display = 'none';
  if (content)   content.style.display = 'block';

  try {
    const data = await API.getOverview(profile.id);
    renderKPIs(data);
    renderProgressBars(data);
    renderComparisons(data);
    renderHighlights(data);
    renderRecentEntries(data);
  } catch(e) {
    showToast('Error loading overview: ' + e.message, 'error');
  }
}

function renderKPIs(data) {
  const streak   = document.getElementById('ov-streak');
  const days     = document.getElementById('ov-days');
  const avgCal   = document.getElementById('ov-avg-cal');
  const avgProt  = document.getElementById('ov-avg-prot');
  const calTrend = document.getElementById('ov-cal-trend');
  const protTrend= document.getElementById('ov-prot-trend');

  if (streak)   streak.innerHTML = `${data.streak || 0}<span class="kpi-unit">days</span>`;
  if (days)     days.textContent  = data.days_logged || 0;

  const cal  = data.avg_calories;
  const prot = data.avg_protein_g;
  const pCal = data.prior?.avg_calories;
  const pProt= data.prior?.avg_protein_g;

  if (avgCal)   avgCal.innerHTML  = `${cal != null ? cal.toFixed(0) : '—'}<span class="kpi-unit">kcal</span>`;
  if (avgProt)  avgProt.innerHTML = `${prot != null ? prot.toFixed(1) : '—'}<span class="kpi-unit">g</span>`;

  if (calTrend && cal != null && pCal != null) {
    calTrend.innerHTML = trendHtml(pct(cal, pCal)) + ' vs prior 30 days';
  }
  if (protTrend && prot != null && pProt != null) {
    protTrend.innerHTML = trendHtml(pct(prot, pProt)) + ' vs prior 30 days';
  }
}

function renderProgressBars(data) {
  const container = document.getElementById('ov-progress-bars');
  if (!container) return;

  const goals = data.goals || {};
  const metrics = [
    { key: 'calories',   label: 'Calories', icon: 'ph-flame',      unit: 'kcal', avg: data.avg_calories },
    { key: 'protein_g',  label: 'Protein',  icon: 'ph-egg',        unit: 'g',    avg: data.avg_protein_g },
    { key: 'carbs_g',    label: 'Carbs',    icon: 'ph-bread',      unit: 'g',    avg: data.avg_carbs_g },
    { key: 'fat_g',      label: 'Fat',      icon: 'ph-drop-half',  unit: 'g',    avg: data.avg_fat_g },
    { key: 'fiber_g',    label: 'Fiber',    icon: 'ph-leaf',       unit: 'g',    avg: data.avg_fiber_g },
  ];

  container.innerHTML = metrics.map(m => {
    const val  = m.avg;
    const goal = goals[m.key];
    const pctVal = goal && val != null ? Math.min((val / goal) * 100, 110) : 0;
    const fillCls = progressFillClass(val || 0, goal);

    return `
      <div class="progress-group">
        <div class="progress-header">
          <div class="progress-label">
            <i class="ph ${m.icon}"></i> ${m.label}
          </div>
          <div class="progress-values">
            <span class="current">${val != null ? val.toFixed(0) : '—'}</span>
            ${goal ? ` / ${goal}` : ''} ${m.unit}
            ${!goal ? '<span class="text-muted font-xs"> (no goal)</span>' : ''}
          </div>
        </div>
        <div class="progress-track">
          ${goal ? `<div class="progress-fill ${fillCls}" style="width:${pctVal}%"></div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderComparisons(data) {
  const container = document.getElementById('ov-comparisons');
  if (!container) return;

  const prior = data.prior || {};
  const metrics = [
    { key: 'avg_calories',  label: 'Calories',  unit: 'kcal', lower: false },
    { key: 'avg_protein_g', label: 'Protein',   unit: 'g',    lower: false },
    { key: 'avg_carbs_g',   label: 'Carbs',     unit: 'g',    lower: false },
    { key: 'avg_fat_g',     label: 'Fat',       unit: 'g',    lower: false },
    { key: 'avg_fiber_g',   label: 'Fiber',     unit: 'g',    lower: false },
    { key: 'avg_sodium_mg', label: 'Sodium',    unit: 'mg',   lower: true },
  ];

  container.innerHTML = metrics.map(m => {
    const cur  = data[m.key];
    const prev = prior[m.key];
    const change = pct(cur, prev);

    return `
      <div class="flex items-center justify-between mb-12">
        <span class="text-secondary font-sm">${m.label}</span>
        <div class="flex items-center gap-8">
          <span class="mono font-sm">${cur != null ? cur.toFixed(1) : '—'} ${m.unit}</span>
          ${trendHtml(change, m.lower)}
        </div>
      </div>
    `;
  }).join('');
}

function renderHighlights(data) {
  const container = document.getElementById('ov-highlights');
  if (!container) return;

  const highlights = data.highlights || [];
  if (!highlights.length) {
    container.innerHTML = `<div class="text-muted font-sm">No highlights yet — log more data to see patterns.</div>`;
    return;
  }

  container.innerHTML = highlights.map(h => `
    <div class="stat-item" style="min-width:180px">
      <div class="stat-label">${h.label}</div>
      <div class="stat-value mono">${h.value}</div>
    </div>
  `).join('');
}

function renderRecentEntries(data) {
  const body = document.getElementById('ov-recent-body');
  if (!body) return;

  const entries = data.recent_entries || [];
  if (!entries.length) {
    body.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:20px">No entries yet.</td></tr>`;
    return;
  }

  body.innerHTML = entries.map(e => `
    <tr>
      <td class="mono" style="font-size:11.5px">${e.logged_at ? e.logged_at.slice(0, 10) : '—'}</td>
      <td>${e.item_name || '—'}</td>
      <td><span class="badge meal-badge" data-meal="${e.meal_context || 'other'}">${(e.meal_context || 'other').replace('_', ' ')}</span></td>
      <td class="mono">${e.calories != null ? e.calories.toFixed(0) : '—'}</td>
      <td class="mono">${e.protein_g != null ? e.protein_g.toFixed(1)+'g' : '—'}</td>
      <td class="mono">${e.carbs_g != null ? e.carbs_g.toFixed(1)+'g' : '—'}</td>
      <td class="mono">${e.fat_g != null ? e.fat_g.toFixed(1)+'g' : '—'}</td>
    </tr>
  `).join('');
}

window.init_overview = function() {
  loadOverview();
};

})();
