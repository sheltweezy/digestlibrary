/* ============================================================
   Digest Library — Upload Page
   ============================================================ */

(function() {

let selectedFile = null;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024*1024)).toFixed(1)} MB`;
}

function getSelectedProfileId() {
  return parseInt(document.getElementById('upload-profile-select')?.value) || null;
}

function updateUploadBtn() {
  const btn = document.getElementById('upload-btn');
  if (!btn) return;
  btn.disabled = !(selectedFile && getSelectedProfileId());
}

function setFile(file) {
  if (!file || !file.name.endsWith('.csv')) {
    showToast('Please select a .csv file', 'error');
    return;
  }
  selectedFile = file;

  const info = document.getElementById('file-info');
  const name = document.getElementById('file-name');
  const size = document.getElementById('file-size');
  const dz   = document.getElementById('drop-zone');

  if (info) info.style.display = 'flex';
  if (name) name.textContent = file.name;
  if (size) size.textContent = formatBytes(file.size);
  if (dz)   dz.style.borderColor = 'var(--accent-gold-muted)';

  updateUploadBtn();
}

window.clearFile = function() {
  selectedFile = null;
  const input = document.getElementById('csv-input');
  if (input) input.value = '';
  const info = document.getElementById('file-info');
  if (info) info.style.display = 'none';
  const dz = document.getElementById('drop-zone');
  if (dz) dz.style.borderColor = 'var(--border)';
  updateUploadBtn();
  const result = document.getElementById('upload-result');
  if (result) result.style.display = 'none';
};

async function populateProfileSelect() {
  const sel = document.getElementById('upload-profile-select');
  if (!sel) return;

  try {
    const profiles = await API.getProfiles();
    sel.innerHTML = `<option value="">— select a profile —</option>` +
      profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    // Pre-select active profile
    const active = getActiveProfile();
    if (active) sel.value = active.id;
  } catch {}
}

async function doUpload() {
  const profileId = getSelectedProfileId();
  if (!profileId || !selectedFile) return;

  const btn = document.getElementById('upload-btn');
  btn.disabled = true;
  btn.innerHTML = `<div class="loading-spinner" style="width:14px;height:14px;border-width:2px"></div> Uploading...`;

  const result = document.getElementById('upload-result');
  if (result) result.style.display = 'none';

  try {
    const data = await API.uploadCSV(profileId, selectedFile);
    renderResult(data);
    clearFile();
  } catch(e) {
    showToast('Upload failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="ph ph-upload-simple"></i> Upload and Ingest`;
    updateUploadBtn();
  }
}

function renderResult(data) {
  const panel   = document.getElementById('upload-result');
  const content = document.getElementById('result-content');
  if (!panel || !content) return;

  panel.style.display = 'block';

  let html = `
    <div class="grid-3 mb-16" style="gap:12px">
      <div class="stat-item">
        <div class="stat-label"><i class="ph ph-check-circle" style="color:var(--status-green)"></i> Inserted</div>
        <div class="stat-value">${data.inserted ?? 0}</div>
        <div class="stat-unit">entries</div>
      </div>
      <div class="stat-item">
        <div class="stat-label"><i class="ph ph-skip-forward"></i> Skipped</div>
        <div class="stat-value">${data.skipped ?? 0}</div>
        <div class="stat-unit">rows</div>
      </div>
      <div class="stat-item">
        <div class="stat-label"><i class="ph ph-calendar-blank"></i> Days</div>
        <div class="stat-value">${data.dates?.length ?? 0}</div>
        <div class="stat-unit">affected</div>
      </div>
    </div>
  `;

  if (data.dates?.length) {
    html += `
      <div class="font-xs text-muted mb-8">Date range: <span class="mono text-secondary">${data.dates[0]} → ${data.dates[data.dates.length - 1]}</span></div>
    `;
  }

  if (data.errors?.length) {
    html += `
      <details class="mt-8">
        <summary class="font-xs text-amber" style="cursor:pointer">
          <i class="ph ph-warning"></i> ${data.errors.length} warning(s) — click to expand
        </summary>
        <div style="margin-top:8px;padding:10px;background:var(--bg-elevated);border-radius:var(--radius-sm);max-height:160px;overflow-y:auto">
          ${data.errors.map(e => `<div class="font-xs text-muted mono" style="margin-bottom:4px">${e}</div>`).join('')}
        </div>
      </details>
    `;
  }

  content.innerHTML = html;

  if (data.inserted > 0) {
    showToast(`Ingested ${data.inserted} entries across ${data.dates?.length || 0} days`, 'success');
  } else {
    showToast(`No new entries inserted (${data.skipped} skipped)`, 'info');
  }
}

window.init_upload = function() {
  populateProfileSelect();

  const input = document.getElementById('csv-input');
  if (input) {
    input.addEventListener('change', () => {
      if (input.files?.[0]) setFile(input.files[0]);
    });
  }

  const sel = document.getElementById('upload-profile-select');
  if (sel) sel.addEventListener('change', updateUploadBtn);

  const btn = document.getElementById('upload-btn');
  if (btn) btn.addEventListener('click', doUpload);

  // Drag & drop
  const dz = document.getElementById('drop-zone');
  if (dz) {
    dz.addEventListener('dragover', e => {
      e.preventDefault();
      dz.style.borderColor = 'var(--accent-gold)';
      dz.style.background  = 'var(--accent-gold-bg)';
    });
    dz.addEventListener('dragleave', () => {
      dz.style.borderColor = 'var(--border)';
      dz.style.background  = '';
    });
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.style.borderColor = 'var(--border)';
      dz.style.background  = '';
      const f = e.dataTransfer.files?.[0];
      if (f) setFile(f);
    });
    dz.addEventListener('click', e => {
      if (e.target.tagName !== 'BUTTON') {
        document.getElementById('csv-input')?.click();
      }
    });
  }
};

})();
