/* ============================================================
   Digest Library — Profiles Page
   ============================================================ */

(function() {

let editingProfileId = null;
let goalsProfileId   = null;
let deleteProfileId  = null;
let pendingPhotoFile = null;

/* ---- Helpers ---- */
function computeAge(dob) {
  if (!dob) return null;
  const b = new Date(dob);
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
}

function computeBMI(weightLbs, heightInches) {
  if (!weightLbs || !heightInches) return null;
  return ((weightLbs / (heightInches * heightInches)) * 703).toFixed(1);
}

function formatHeight(inches) {
  if (!inches) return null;
  const ft = Math.floor(inches / 12);
  const in_ = Math.round(inches % 12);
  return `${ft}'${in_}"`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/* ---- Render grid ---- */
async function loadProfiles() {
  const grid = document.getElementById('profiles-grid');
  if (!grid) return;

  try {
    const profiles = await API.getProfiles();
    if (!profiles.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-user-plus"></i>
          <p>No profiles yet. Create one to start tracking.</p>
        </div>
      `;
      return;
    }
    renderProfileGrid(profiles);
  } catch(e) {
    grid.innerHTML = `<div class="empty-state"><i class="ph ph-warning"></i><p>${e.message}</p></div>`;
  }
}

function renderProfileGrid(profiles) {
  const grid = document.getElementById('profiles-grid');
  if (!grid) return;

  const activeId = getActiveProfile()?.id;

  grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">
    ${profiles.map(p => renderProfileCard(p, activeId)).join('')}
  </div>`;
}

function renderProfileCard(p, activeId) {
  const age   = computeAge(p.date_of_birth);
  const bmi   = computeBMI(p.weight_lbs, p.height_inches);
  const ht    = formatHeight(p.height_inches);
  const color = avatarColor(p.name);
  const init  = initials(p.name);
  const isActive = p.id === activeId;

  const metaLine = [
    age != null ? `Age ${age}` : null,
    p.biological_sex ? capitalize(p.biological_sex) : null,
  ].filter(Boolean).join(' · ');

  const physLine = [
    ht ? ht : null,
    p.weight_lbs ? `${p.weight_lbs} lbs` : null,
  ].filter(Boolean).join(' · ');

  let avatarHtml;
  if (p.photo_path) {
    avatarHtml = `<img src="${p.photo_path}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 12px;" alt="${p.name}" onerror="this.style.display='none'">`;
  } else {
    avatarHtml = `<div style="width:72px;height:72px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#0F1117;margin:0 auto 12px;">${init}</div>`;
  }

  return `
    <div class="card" style="text-align:center;${isActive ? 'border-color:var(--accent-gold-muted);' : ''}">
      ${isActive ? '<div class="badge badge-gold" style="margin-bottom:10px;font-size:10px">Active</div>' : ''}
      ${avatarHtml}
      <div class="font-lg mb-4">${p.name}</div>
      ${metaLine ? `<div class="text-muted font-xs mb-2">${metaLine}</div>` : ''}
      ${physLine ? `<div class="text-muted font-xs mb-2">${physLine}</div>` : ''}
      ${bmi != null ? `<div class="text-muted font-xs mb-12">BMI ${bmi}</div>` : '<div class="mb-12"></div>'}

      <div class="flex gap-8" style="justify-content:center;flex-wrap:wrap">
        ${!isActive ? `<button class="btn btn-primary btn-sm" onclick="activateProfile(${p.id})"><i class="ph ph-check"></i> Select</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openEditModal(${p.id})"><i class="ph ph-pencil-simple"></i> Edit</button>
        <button class="btn btn-secondary btn-sm" onclick="openGoalsModal(${p.id})"><i class="ph ph-target"></i> Goals</button>
        <button class="btn btn-ghost btn-sm text-red" onclick="openDeleteModal(${p.id},'${p.name.replace(/'/g,"\\'")}')"><i class="ph ph-trash"></i></button>
      </div>
    </div>
  `;
}

/* ---- Activate Profile ---- */
window.activateProfile = function(id) {
  setActiveProfile(id);
  loadProfiles();
  showToast('Profile switched', 'success');
};

/* ---- Create / Edit Modal ---- */
window.openEditModal = async function(profileId) {
  editingProfileId = profileId || null;
  pendingPhotoFile = null;

  document.getElementById('modal-title').textContent = profileId ? 'Edit Profile' : 'New Profile';
  document.getElementById('f-name').value    = '';
  document.getElementById('f-dob').value     = '';
  document.getElementById('f-sex').value     = '';
  document.getElementById('f-feet').value    = '';
  document.getElementById('f-inches').value  = '';
  document.getElementById('f-weight').value  = '';
  document.getElementById('modal-err').style.display = 'none';
  updateAvatarPreview('', null);

  if (profileId) {
    try {
      const p = await API.getProfile(profileId);
      document.getElementById('f-name').value   = p.name || '';
      document.getElementById('f-dob').value    = p.date_of_birth || '';
      document.getElementById('f-sex').value    = p.biological_sex || '';
      document.getElementById('f-weight').value = p.weight_lbs || '';
      if (p.height_inches) {
        document.getElementById('f-feet').value   = Math.floor(p.height_inches / 12);
        document.getElementById('f-inches').value = p.height_inches % 12;
      }
      updateAvatarPreview(p.name, p.photo_path);
    } catch(e) {
      showToast('Could not load profile: ' + e.message, 'error');
    }
  }

  document.getElementById('profile-modal').style.display = 'flex';

  // Live avatar update
  document.getElementById('f-name').addEventListener('input', function() {
    updateAvatarPreview(this.value, null);
  });
};

function updateAvatarPreview(name, photoPath) {
  const el = document.getElementById('modal-avatar-preview');
  if (!el) return;
  const color = avatarColor(name || 'New');
  const init  = initials(name || 'N');
  if (photoPath) {
    el.innerHTML = `<img src="${photoPath}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;" onerror="this.replaceWith(document.querySelector('#modal-avatar-preview div'))">
      <div style="position:absolute;bottom:0;right:0;background:var(--accent-gold);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center"><i class="ph ph-camera" style="font-size:12px;color:#0F1117"></i></div>`;
  } else {
    el.innerHTML = `<div style="width:72px;height:72px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#0F1117;">${init}</div>
      <div style="position:absolute;bottom:0;right:0;background:var(--accent-gold);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center"><i class="ph ph-camera" style="font-size:12px;color:#0F1117"></i></div>`;
  }
  el.style.position = 'relative';
  el.style.display  = 'inline-block';
}

document.getElementById('photo-input')?.addEventListener('change', function() {
  pendingPhotoFile = this.files?.[0];
  if (pendingPhotoFile) {
    const reader = new FileReader();
    reader.onload = e => {
      const el = document.getElementById('modal-avatar-preview');
      if (el) el.querySelector('img, div:first-child')?.setAttribute('src', e.target.result);
    };
    reader.readAsDataURL(pendingPhotoFile);
  }
});

window.closeProfileModal = function() {
  document.getElementById('profile-modal').style.display = 'none';
  editingProfileId = null;
  pendingPhotoFile = null;
};

window.saveProfileFromModal = async function() {
  const errEl = document.getElementById('modal-err');
  errEl.style.display = 'none';

  const name    = document.getElementById('f-name').value.trim();
  const dob     = document.getElementById('f-dob').value  || null;
  const sex     = document.getElementById('f-sex').value  || null;
  const feet    = parseFloat(document.getElementById('f-feet').value)   || 0;
  const inches_ = parseFloat(document.getElementById('f-inches').value) || 0;
  const weight  = parseFloat(document.getElementById('f-weight').value) || null;
  const heightIn = (feet * 12 + inches_) || null;

  if (!name) {
    errEl.textContent = 'Name is required.';
    errEl.style.display = 'block';
    return;
  }

  const data = {
    name,
    date_of_birth: dob,
    biological_sex: sex,
    height_inches: heightIn,
    weight_lbs: weight,
  };

  try {
    let profile;
    if (editingProfileId) {
      profile = await API.updateProfile(editingProfileId, data);
    } else {
      profile = await API.createProfile(data);
    }

    // Upload photo if pending
    if (pendingPhotoFile && profile?.id) {
      try { await API.uploadProfilePhoto(profile.id, pendingPhotoFile); } catch {}
    }

    closeProfileModal();
    showToast('Profile saved', 'success');
    await loadProfiles();

    // If first profile, auto-select
    if (!editingProfileId) setActiveProfile(profile.id);

  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
};

/* ---- Goals Modal ---- */
window.openGoalsModal = async function(profileId) {
  goalsProfileId = profileId;
  document.getElementById('goals-err').style.display = 'none';

  // Clear
  ['g-calories','g-protein','g-carbs','g-fat','g-fiber','g-water'].forEach(id => {
    document.getElementById(id).value = '';
  });

  try {
    const goals = await API.getGoals(profileId);
    if (goals && goals.set !== false) {
      document.getElementById('g-calories').value = goals.calories || '';
      document.getElementById('g-protein').value  = goals.protein_g || '';
      document.getElementById('g-carbs').value    = goals.carbs_g || '';
      document.getElementById('g-fat').value      = goals.fat_g || '';
      document.getElementById('g-fiber').value    = goals.fiber_g || '';
      document.getElementById('g-water').value    = goals.water_ml || '';
    }
  } catch {}

  document.getElementById('goals-modal').style.display = 'flex';
};

window.closeGoalsModal = function() {
  document.getElementById('goals-modal').style.display = 'none';
  goalsProfileId = null;
};

window.saveGoalsFromModal = async function() {
  const errEl = document.getElementById('goals-err');
  errEl.style.display = 'none';

  const data = {
    calories:   parseFloat(document.getElementById('g-calories').value) || null,
    protein_g:  parseFloat(document.getElementById('g-protein').value)  || null,
    carbs_g:    parseFloat(document.getElementById('g-carbs').value)    || null,
    fat_g:      parseFloat(document.getElementById('g-fat').value)      || null,
    fiber_g:    parseFloat(document.getElementById('g-fiber').value)    || null,
    water_ml:   parseFloat(document.getElementById('g-water').value)    || null,
  };

  try {
    await API.saveGoals(goalsProfileId, data);
    closeGoalsModal();
    showToast('Goals saved', 'success');
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
};

/* ---- Delete Modal ---- */
window.openDeleteModal = function(profileId, name) {
  deleteProfileId = profileId;
  document.getElementById('delete-modal-msg').textContent =
    `Delete "${name}"? This will permanently remove all associated entries and summaries. This cannot be undone.`;
  document.getElementById('delete-modal').style.display = 'flex';
};

window.closeDeleteModal = function() {
  document.getElementById('delete-modal').style.display = 'none';
  deleteProfileId = null;
};

window.init_profiles = function() {
  document.getElementById('btn-new-profile')?.addEventListener('click', () => openEditModal(null));

  document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
    if (!deleteProfileId) return;
    try {
      await API.deleteProfile(deleteProfileId);
      closeDeleteModal();
      showToast('Profile deleted', 'info');
      // If deleted profile was active, clear
      if (getActiveProfile()?.id === deleteProfileId) {
        localStorage.removeItem('activeProfileId');
        location.reload();
      } else {
        await loadProfiles();
      }
    } catch(e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  });

  loadProfiles();
};

// Wire up photo input after DOM is available
setTimeout(() => {
  const photoInput = document.getElementById('photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', function() {
      pendingPhotoFile = this.files?.[0] || null;
      if (pendingPhotoFile) {
        const url = URL.createObjectURL(pendingPhotoFile);
        updateAvatarPreview('', url);
      }
    });
  }
}, 100);

})();
