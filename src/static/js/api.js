/* ============================================================
   Digest Library — Centralized API Layer
   ============================================================ */

const BASE = window.location.origin;

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.detail || j.message || msg; } catch {}
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ---- Profiles ---- */
async function getProfiles() {
  return apiFetch('/consumption/profiles');
}

async function getProfile(id) {
  return apiFetch(`/consumption/profiles/${id}`);
}

async function createProfile(data) {
  return apiFetch('/consumption/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function updateProfile(id, data) {
  return apiFetch(`/consumption/profiles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function deleteProfile(id) {
  return apiFetch(`/consumption/profiles/${id}`, { method: 'DELETE' });
}

async function uploadProfilePhoto(id, file) {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/consumption/profiles/${id}/photo`, { method: 'POST', body: form });
}

/* ---- Goals ---- */
async function getGoals(profileId) {
  return apiFetch(`/consumption/profiles/${profileId}/goals`);
}

async function saveGoals(profileId, data) {
  return apiFetch(`/consumption/profiles/${profileId}/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/* ---- Analytics ---- */
async function getOverview(profileId, date) {
  const q = date ? `?date=${date}` : '';
  return apiFetch(`/consumption/profiles/${profileId}/overview${q}`);
}

async function getTrends(profileId, start, end, metrics) {
  const params = new URLSearchParams();
  if (start)   params.set('start', start);
  if (end)     params.set('end', end);
  if (metrics) params.set('metrics', metrics);
  return apiFetch(`/consumption/profiles/${profileId}/trends?${params}`);
}

async function getRollingAverages(profileId, start, end, metrics) {
  const params = new URLSearchParams();
  if (start)   params.set('start', start);
  if (end)     params.set('end', end);
  if (metrics) params.set('metrics', metrics);
  return apiFetch(`/consumption/profiles/${profileId}/averages?${params}`);
}

async function getFavorites(profileId, start, end, limit = 20) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end)   params.set('end', end);
  params.set('limit', limit);
  return apiFetch(`/consumption/profiles/${profileId}/favorites?${params}`);
}

async function getMealPatterns(profileId, start, end) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end)   params.set('end', end);
  return apiFetch(`/consumption/profiles/${profileId}/meal-patterns?${params}`);
}

async function getRecentEntries(profileId, limit = 20) {
  return apiFetch(`/consumption/profiles/${profileId}/recent?limit=${limit}`);
}

async function getDailySummary(profileId, date) {
  return apiFetch(`/consumption/profiles/${profileId}/summary/${date}`);
}

/* ---- Ingestion ---- */
async function uploadCSV(profileId, file) {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/consumption/profiles/${profileId}/ingest/snapcalorie`, {
    method: 'POST',
    body: form,
  });
}

/* ---- Entries ---- */
async function getEntries(profileId, date) {
  return apiFetch(`/consumption/profiles/${profileId}/entries/${date}`);
}

/* ---- Utils ---- */
function formatDate(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function today() {
  return formatDate(new Date());
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

function dateNMonthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return formatDate(d);
}

function dateNYearsAgo(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return formatDate(d);
}

window.API = {
  getProfiles, getProfile, createProfile, updateProfile, deleteProfile, uploadProfilePhoto,
  getGoals, saveGoals,
  getOverview, getTrends, getRollingAverages, getFavorites, getMealPatterns,
  getRecentEntries, getDailySummary, getEntries, uploadCSV,
  formatDate, today, dateNDaysAgo, dateNMonthsAgo, dateNYearsAgo,
};
