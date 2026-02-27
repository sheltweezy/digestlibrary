/* ============================================================
   Digest Library — History Page
   ============================================================ */

(function() {

let currentYear, currentMonth;
let monthSummaries = {};  // date string → {total_calories, entry_count}
let selectedDate = null;

function today() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
}

async function loadMonthData() {
  const profile = getActiveProfile();
  if (!profile) return;

  // Build start/end for the entire month
  const start = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const end   = new Date(currentYear, currentMonth + 1, 0);
  const endStr = API.formatDate(end);

  try {
    const data = await API.getTrends(profile.id, start, endStr, 'calories');
    monthSummaries = {};
    data.dates.forEach((d, i) => {
      const v = data.series.calories?.[i];
      if (v != null) monthSummaries[d] = { total_calories: v };
    });
  } catch(e) {
    monthSummaries = {};
  }

  renderCalendar();
}

function renderCalendar() {
  const label = document.getElementById('cal-month-label');
  const grid  = document.getElementById('cal-grid');
  if (!label || !grid) return;

  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  label.textContent = `${monthNames[currentMonth]} ${currentYear}`;

  // First day of month (0=Sun)
  const firstDow = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const todayStr = API.today();

  let html = '';

  // Empty cells before first day
  for (let i = 0; i < firstDow; i++) {
    html += `<div></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const summary = monthSummaries[dateStr];
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedDate;
    const hasCal = summary?.total_calories != null;

    const borderStyle = isToday ? 'border:1px solid var(--accent-gold)' : isSelected ? 'border:1px solid var(--accent-gold-muted)' : '';
    const bg = hasCal
      ? `background:rgba(201,168,76,${Math.min(0.1 + (summary.total_calories / 3000) * 0.5, 0.7)});`
      : 'background:var(--bg-elevated);';
    const calText = hasCal ? `<div style="font-size:9px;color:var(--text-muted);margin-top:1px;font-family:'JetBrains Mono',monospace">${Math.round(summary.total_calories)}</div>` : '';

    html += `
      <div onclick="selectDay('${dateStr}')" style="
        cursor:pointer;padding:4px;border-radius:4px;text-align:center;
        min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;
        ${bg}${borderStyle};transition:background 0.1s;
      " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
        <div style="font-size:12px;color:${isToday ? 'var(--accent-gold)' : 'var(--text-secondary)'};">${d}</div>
        ${calText}
      </div>
    `;
  }

  grid.innerHTML = html;
}

window.selectDay = async function(dateStr) {
  selectedDate = dateStr;
  renderCalendar();

  const panel = document.getElementById('history-day-content');
  if (!panel) return;

  panel.innerHTML = `<div class="page-loading"><div class="loading-spinner"></div> Loading...</div>`;

  const profile = getActiveProfile();
  if (!profile) return;

  try {
    // Try to get entries for that day
    const entries = await API.getEntries(profile.id, dateStr);
    renderDayDetail(dateStr, entries);
  } catch(e) {
    panel.innerHTML = `<div class="empty-state"><i class="ph ph-warning"></i><p>${e.message}</p></div>`;
  }
};

function renderDayDetail(dateStr, entries) {
  const panel = document.getElementById('history-day-content');
  if (!panel) return;

  if (!entries || !entries.length) {
    panel.innerHTML = `
      <div class="font-lg mb-16">${dateStr}</div>
      <div class="empty-state">
        <i class="ph ph-fork-knife"></i>
        <p>No entries logged for this day.</p>
      </div>
    `;
    return;
  }

  // Group by meal context
  const groups = {};
  entries.forEach(e => {
    const m = e.meal_context || 'other';
    if (!groups[m]) groups[m] = [];
    groups[m].push(e);
  });

  const mealOrder = ['breakfast', 'lunch', 'dinner', 'late_night', 'other'];
  const totCal  = entries.reduce((s, e) => s + (e.calories || 0), 0);
  const totProt = entries.reduce((s, e) => s + (e.protein_g || 0), 0);

  let html = `
    <div class="flex items-center justify-between mb-16">
      <div class="font-lg">${dateStr}</div>
      <div class="flex gap-12">
        <div class="mono text-secondary font-sm">${totCal.toFixed(0)} kcal</div>
        <div class="mono text-secondary font-sm">${totProt.toFixed(1)}g protein</div>
      </div>
    </div>
  `;

  for (const meal of mealOrder) {
    if (!groups[meal]) continue;
    html += `
      <div class="mb-12">
        <div class="flex items-center gap-8 mb-8">
          <span class="badge meal-badge" data-meal="${meal}">${meal.replace('_', ' ')}</span>
          <span class="mono font-xs text-muted">${groups[meal].reduce((s,e) => s+(e.calories||0),0).toFixed(0)} kcal</span>
        </div>
        ${groups[meal].map(e => `
          <div class="flex items-center justify-between" style="padding:6px 0;border-bottom:1px solid var(--border);">
            <div>
              <div class="font-sm text-primary">${e.item_name || '—'}</div>
              <div class="font-xs text-muted">${e.serving_qty || ''} ${e.serving_size || ''}</div>
            </div>
            <div class="flex gap-12 mono font-xs text-secondary">
              <span>${e.calories != null ? e.calories.toFixed(0) : '—'} kcal</span>
              <span>${e.protein_g != null ? e.protein_g.toFixed(1)+'g' : '—'}</span>
              <span>${e.carbs_g != null ? e.carbs_g.toFixed(1)+'g' : '—'}</span>
              <span>${e.fat_g != null ? e.fat_g.toFixed(1)+'g' : '—'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  panel.innerHTML = html;
}

window.init_history = function() {
  const profile = getActiveProfile();
  const noProfile = document.getElementById('history-no-profile');
  const content   = document.getElementById('history-content');

  if (!profile) {
    if (noProfile) noProfile.style.display = 'flex';
    if (content)   content.style.display = 'none';
    return;
  }
  if (noProfile) noProfile.style.display = 'none';
  if (content)   content.style.display = 'block';

  const t = today();
  currentYear  = t.y;
  currentMonth = t.m;

  document.getElementById('cal-prev')?.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    loadMonthData();
  });

  document.getElementById('cal-next')?.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    loadMonthData();
  });

  loadMonthData();
};

})();
