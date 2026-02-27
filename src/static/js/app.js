/* ============================================================
   Digest Library — App Shell: Routing, Profile, Toast
   ============================================================ */

/* ---- Avatar color pool (matches design spec) ---- */
const AVATAR_COLORS = ['#C9A84C','#4D9FEC','#3ECF8E','#F5A623','#A78BFA','#F472B6'];

function avatarColor(name = '') {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function renderAvatar(profile, size = 40, extraClass = '') {
  const color = avatarColor(profile.name);
  const init  = initials(profile.name);
  if (profile.photo_path) {
    return `<img class="avatar ${extraClass}" src="${profile.photo_path}" style="width:${size}px;height:${size}px;" alt="${profile.name}" onerror="this.replaceWith(textAvatar('${init}','${color}',${size},'${extraClass}'))">`;
  }
  return `<div class="avatar ${extraClass}" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.round(size*0.35)}px;color:#0F1117;">${init}</div>`;
}

// Called by onerror fallback
window.textAvatar = function(init, color, size, extraClass) {
  const d = document.createElement('div');
  d.className = `avatar ${extraClass}`;
  d.style.cssText = `width:${size}px;height:${size}px;background:${color};font-size:${Math.round(size*0.35)}px;color:#0F1117;`;
  d.textContent = init;
  return d;
};

/* ---- Toast ---- */
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: 'check-circle', error: 'x-circle', info: 'info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="ph ph-${icons[type] || 'info'}"></i> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

window.showToast = showToast;

/* ---- Profile State ---- */
let _profiles = [];
let _activeProfileId = null;

function getActiveProfile() {
  return _profiles.find(p => p.id === _activeProfileId) || null;
}

async function loadProfiles() {
  try {
    _profiles = await API.getProfiles();
  } catch(e) {
    _profiles = [];
  }
}

function setActiveProfile(id) {
  _activeProfileId = id;
  localStorage.setItem('activeProfileId', id);
  renderProfileSelector();
  // Re-render current page so it reacts to new profile
  navigateTo(currentPage());
}

function currentPage() {
  return window.location.hash.replace('#', '') || 'trends';
}

/* ---- Sidebar: profile selector ---- */
function renderProfileSelector() {
  const btn = document.getElementById('profile-selector-btn');
  if (!btn) return;
  const p = getActiveProfile();
  if (p) {
    const col = avatarColor(p.name);
    const init = initials(p.name);
    btn.innerHTML = `
      <div class="avatar avatar-sm" style="width:28px;height:28px;background:${col};font-size:10px;color:#0F1117;">${init}</div>
      <span class="truncate">${p.name}</span>
      <i class="ph ph-caret-down chevron"></i>
    `;
  } else {
    btn.innerHTML = `<i class="ph ph-user-circle"></i><span>Select Profile</span><i class="ph ph-caret-down chevron"></i>`;
  }
}

/* ---- Nav active state ---- */
function setActiveNav(page) {
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

/* ---- Page Loader ---- */
const pageModules = {};

async function navigateTo(page) {
  page = page || 'trends';
  window.location.hash = page;
  setActiveNav(page);

  // Update topbar title
  const titles = {
    trends:   ['Trends',   'ph-chart-line'],
    overview: ['Overview', 'ph-squares-four'],
    history:  ['History',  'ph-calendar-blank'],
    profiles: ['Profiles', 'ph-users'],
    upload:   ['Upload',   'ph-upload-simple'],
  };
  const [title] = titles[page] || ['Digest Library', 'ph-house'];
  const tb = document.getElementById('topbar-title');
  if (tb) tb.textContent = title;

  // Load page HTML
  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="page-loading"><div class="loading-spinner"></div> Loading...</div>`;

  try {
    const res = await fetch(`/static/pages/${page}.html`);
    if (!res.ok) throw new Error('Page not found');
    const html = await res.text();
    content.innerHTML = html;

    // Dynamically load page JS if not already loaded
    const jsPath = `/static/js/${page}.js`;
    if (!pageModules[page]) {
      await loadScript(jsPath);
      pageModules[page] = true;
    }

    // Call page init if defined
    const initFn = window[`init_${page}`];
    if (typeof initFn === 'function') initFn();

  } catch(e) {
    content.innerHTML = `<div class="empty-state"><i class="ph ph-warning"></i><p>Failed to load page: ${e.message}</p></div>`;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Re-run scripts that already exist by removing and re-adding
    const existing = document.querySelector(`script[data-page-script="${src}"]`);
    if (existing) existing.remove();
    const s = document.createElement('script');
    s.src = src;
    s.dataset.pageScript = src;
    s.onload = resolve;
    s.onerror = () => resolve(); // non-fatal if js file missing
    document.body.appendChild(s);
  });
}

/* ---- Profile Dropdown ---- */
let dropdownOpen = false;

function toggleProfileDropdown() {
  const dd = document.getElementById('profile-dropdown');
  if (!dd) return;
  dropdownOpen = !dropdownOpen;
  dd.style.display = dropdownOpen ? 'block' : 'none';
  if (dropdownOpen) renderProfileDropdown();
}

function renderProfileDropdown() {
  const dd = document.getElementById('profile-dropdown');
  if (!dd) return;
  const items = _profiles.map(p => {
    const col = avatarColor(p.name);
    const init = initials(p.name);
    const active = p.id === _activeProfileId ? 'style="color:var(--accent-gold)"' : '';
    return `
      <div class="dropdown-item" ${active} onclick="selectProfileFromDropdown(${p.id})">
        <div class="avatar" style="width:24px;height:24px;background:${col};font-size:9px;color:#0F1117;flex-shrink:0;">${init}</div>
        <span>${p.name}</span>
        ${p.id === _activeProfileId ? '<i class="ph ph-check" style="margin-left:auto;color:var(--accent-gold)"></i>' : ''}
      </div>
    `;
  }).join('');
  dd.innerHTML = `
    ${items}
    <div class="divider" style="margin:8px 0;"></div>
    <div class="dropdown-item" onclick="navigateTo('profiles');closeProfileDropdown()">
      <i class="ph ph-user-plus"></i><span>Manage Profiles</span>
    </div>
  `;
}

window.selectProfileFromDropdown = function(id) {
  setActiveProfile(id);
  closeProfileDropdown();
};

window.closeProfileDropdown = function() {
  const dd = document.getElementById('profile-dropdown');
  if (dd) dd.style.display = 'none';
  dropdownOpen = false;
};

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#profile-selector-area')) {
    closeProfileDropdown();
  }
});

/* ---- Expose globals ---- */
window.navigateTo   = navigateTo;
window.setActiveProfile = setActiveProfile;
window.getActiveProfile = getActiveProfile;
window.renderAvatar = renderAvatar;
window.avatarColor  = avatarColor;
window.initials     = initials;

/* ---- Boot ---- */
async function boot() {
  await loadProfiles();

  // Restore saved profile
  const saved = parseInt(localStorage.getItem('activeProfileId'));
  if (saved && _profiles.find(p => p.id === saved)) {
    _activeProfileId = saved;
  } else if (_profiles.length) {
    _activeProfileId = _profiles[0].id;
    localStorage.setItem('activeProfileId', _activeProfileId);
  }

  renderProfileSelector();

  // Wire up nav links
  document.querySelectorAll('.nav-link').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page));
  });

  // Wire up profile selector button
  const btn = document.getElementById('profile-selector-btn');
  if (btn) btn.addEventListener('click', toggleProfileDropdown);

  // Hash routing
  window.addEventListener('hashchange', () => {
    navigateTo(currentPage());
  });

  // Load initial page
  navigateTo(currentPage());
}

document.addEventListener('DOMContentLoaded', boot);
