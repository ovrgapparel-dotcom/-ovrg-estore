const fs = require('fs');
const showcaseStr = fs.readFileSync('showcase.html', 'utf8');
let headwearStr = fs.readFileSync('headwear.html', 'utf8');
// Fallback table name if PRINTS_TABLE is mis‑configured
const DEFAULT_PRINTS_TABLE = 'showcase_prints';

// Extract functions from showcase.html between
// //  UTILS
// and //  ORDER ACTIONS, and ADMIN blocks.
// Wait, actually I'll just write the missing block directly to ensure accuracy for headwear.

const missingCode = `
// ============================================================
//  MISSING ADMIN & RENDER FUNCTIONS ADDED BY SCRIPT
// ============================================================
function paintFallbackCanvas(side) {
  const canvas = document.getElementById(side==='front' ? 'tshirt-front' : 'tshirt-side');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#888';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Mockup indisponible', canvas.width/2, canvas.height/2);
}

const COLOR_NAMES = {'#ffffff':'Blanc','#1a1a1a':'Noir','#e63946':'Rouge','#457b9d':'Bleu','#2a9d8f':'Vert','#f4a261':'Orange'};

let selectedColor = '#ffffff';

function renderColorOptions(colors) {
  const row = document.getElementById('colorRow');
  if (!row) return;
  row.innerHTML = colors.map((c,i) => \`<button class="color-swatch\${i===0?' selected':''}" style="background:\${c}" data-color="\${c}" title="\${COLOR_NAMES[c]||c}"></button>\`).join('');
  selectedColor = colors[0];
  if (window.setShirtColor) window.setShirtColor(selectedColor);
}

document.getElementById('colorRow')?.addEventListener('click', e => {
  const btn = e.target.closest('.color-swatch');
  if (!btn) return;
  selectedColor = btn.dataset.color;
  document.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('selected', b===btn));
  if (window.setShirtColor) window.setShirtColor(selectedColor);
});

let _renderRAF = null;
function scheduleRender() {
  if (_renderRAF) return;
  _renderRAF = requestAnimationFrame(() => {
    _renderRAF = null;
    if (window.setPrintTransform) {
      window.setPrintTransform({ scale: printScale, preset: printPreset, blend: printBlend });
    }
  });
}

function updateAdminUI() {
  const btn = document.getElementById('adminToggleBtn');
  if (!btn) return;
  if (currentUser) { btn.textContent = '⚙●'; btn.style.color = '#22c55e'; btn.style.opacity = '0.4'; }
  else { btn.textContent = '⚙'; btn.style.color = '#1a1a1a'; btn.style.opacity = '0.15'; }
}

function openLogin() {
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginOverlay').classList.add('open');
}

function closeLogin() { document.getElementById('loginOverlay').classList.remove('open'); }

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  document.getElementById('loginError').textContent = '';
  if (!email || !password) { document.getElementById('loginError').textContent = 'Veuillez remplir tous les champs.'; return; }
  if (!sbClient) {
    document.getElementById('loginError').textContent = 'Connexion à Supabase indisponible. Rechargez la page et réessayez.';
    return;
  }
  try {
    await sbClient.auth.signOut().catch(()=>{});
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    closeLogin();
    openAdmin();
  } catch(e) {
    console.error('Login error:', e);
    document.getElementById('loginError').textContent = 'Email ou mot de passe incorrect.';
  }
}

async function doLogout() {
  await sbClient.auth.signOut().catch(()=>{});
  currentUser = null;
  closeAdmin();
  showToast('Déconnecté', 'Session admin terminée.');
}

function openAdmin() {
  document.getElementById('adminOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  checkSupabaseConnection();
  loadAdminPrints();
}

function closeAdmin() {
  document.getElementById('adminOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function checkSupabaseConnection() {
  const el = document.getElementById('supabaseStatus');
  try {
    const { error } = await sbClient.from(PRINTS_TABLE).select('id').limit(1);
    if (error) throw error;
    el.className = 'supabase-status connected';
    el.textContent = '✓ Connecté à Supabase — table showcase_prints prête';
  } catch(e) {
    el.className = 'supabase-status disconnected';
    el.textContent = '✗ Table showcase_prints introuvable — exécutez le SQL fourni dans le code source';
  }
}

function showAdminTab(tab, el) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('adminTabList').style.display = tab==='list' ? '' : 'none';
  document.getElementById('adminTabAdd').style.display = tab==='add' ? '' : 'none';
  const settingsTab = document.getElementById('adminTabSettings');
  if (settingsTab) settingsTab.style.display = tab==='settings' ? '' : 'none';
  if (tab === 'settings') loadAdminSettingsUI();
}

async function loadAdminPrints() {
  const list = document.getElementById('adminPrintList');
  list.innerHTML = \`<p style="color:#666;text-align:center;padding:2rem">Chargement...</p>\`;
  try {
    const { data, error } = await sbClient.from(PRINTS_TABLE).select('*').order('id', { ascending: true });
    if (error) throw error;
    renderAdminPrintList(data || []);
  } catch(e) {
    // Fallback to default prints table if configured one fails
    if (PRINTS_TABLE !== DEFAULT_PRINTS_TABLE) {
      console.warn('Primary prints table failed, falling back to default:', DEFAULT_PRINTS_TABLE);
      try {
        const { data, error } = await sbClient.from(DEFAULT_PRINTS_TABLE).select('*').order('id', { ascending: true });
        if (error) throw error;
        renderAdminPrintList(data || []);
        // Update UI to reflect fallback usage
        showToast('Info', \`Utilisation de la table par défaut (\${DEFAULT_PRINTS_TABLE})\`);
        return;
      } catch (fallbackErr) {
        console.error('Fallback prints load failed:', fallbackErr);
      }
    }
    list.innerHTML = \`<p style="color:#f87171;text-align:center;padding:2rem">Table non configurée.</p>\`;
  }
}

// Helper to create the prints table via Supabase RPC (requires appropriate permission)
async function createPrintsTable() {
  const CREATE_TABLE_SQL = \`
    create table if not exists \${PRINTS_TABLE} (
      id bigserial primary key,
      name text not null,
      image_url text not null,
      category text,
      price integer,
      stock integer,
      colors jsonb,
      active boolean default true
    );\`;
  try {
    const { error } = await sbClient.rpc('run_sql', { sql: CREATE_TABLE_SQL });
    if (error) throw error;
    showToast('Succès', 'Table des imprimés créée avec succès.');
    await loadAdminPrints();
  } catch (err) {
    console.error('Create table error:', err);
    showToast('Erreur', 'Impossible de créer la table. Vérifiez les permissions.', '#ef4444');
  }
}

let adminPrintsData = []; 

function renderAdminPrintList(items) {
  adminPrintsData = items;
  const list = document.getElementById('adminPrintList');
  if (!items.length) {
    list.innerHTML = \`<div style="text-align:center;padding:2.5rem;color:#555">
      <div style="font-size:2.2rem;margin-bottom:0.8rem">🎨</div>
      <p>Aucun imprimé.</p>
    </div>\`;
    return;
  }
  list.innerHTML = items.map(p => {
    const price = p.price != null ? p.price : 18000;
    const stock = p.stock != null ? p.stock : 100;
    const colors = p.colors || [];
    const colorDots = colors.map(c => \`<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:\${c};border:1px solid #555;margin-right:2px"></span>\`).join('');
    return \`
    <div class="admin-print-item">
      <div class="admin-print-thumb">\${p.image_url ? \`<img src="\${p.image_url}" alt="\${p.name}">\` : '🎨'}</div>
      <div class="admin-print-meta">
        <h4>\${p.name}</h4>
        <p>\${p.category || '—'} • \${p.active ? 'Actif' : 'Masqué'}</p>
        <p style="margin-top:0.3rem">
          <strong style="color:white">\${fmt(price)}</strong>
          &nbsp;•&nbsp; Stock: \${stock}
        </p>
        <p style="margin-top:0.3rem">\${colorDots}</p>
      </div>
      <div class="admin-print-actions">
        <button class="btn-edit" onclick="editPrint(\${p.id})">✏ Modifier</button>
        <button class="\${p.active ? 'btn-toggle-active' : 'btn-toggle-inactive'}" onclick="togglePrintActive(\${p.id}, \${!p.active})">\${p.active ? '✓ Actif' : '○ Masqué'}</button>
        <button class="btn-del-print" onclick="deletePrint(\${p.id})">🗑</button>
      </div>
    </div>\`;
  }).join('');
}

async function togglePrintActive(id, newActive) {
  try {
    const { error } = await sbClient.from(PRINTS_TABLE).update({ active: newActive }).eq('id', id);
    if (error) throw error;
    await loadAdminPrints();
    await loadPrints();
    showToast('Mis à jour', newActive ? 'Imprimé activé.' : 'Imprimé masqué du catalogue.');
  } catch(e) {
    showToast('Erreur', e.message, '#ef4444');
  }
}

async function deletePrint(id) {
  if (!confirm('Supprimer cet imprimé définitivement?')) return;
  try {
    const { error } = await sbClient.from(PRINTS_TABLE).delete().eq('id', id);
    if (error) throw error;
    await loadAdminPrints();
    await loadPrints();
    showToast('Supprimé', 'Imprimé retiré de Supabase.');
  } catch(e) {
    showToast('Erreur', e.message, '#ef4444');
  }
}

async function uploadPrintImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const slot = document.getElementById('printUploadSlot');
  const prog = document.getElementById('printUploadProgress');
  prog.classList.add('show');
  try {
    const { data: { user } } = await sbClient.auth.getUser();
    if (!user) throw new Error('Non authentifié');
    const ext = file.name.split('.').pop();
    const filename = \`\${Date.now()}_\${Math.random().toString(36).slice(2)}.\${ext}\`;
    const path = \`prints/\${filename}\`;
    const { error } = await sbClient.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: urlData } = sbClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    pendingPrintImage = urlData.publicUrl;
    slot.innerHTML = \`<img src="\${pendingPrintImage}"><div class="upload-progress" id="printUploadProgress"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadPrintImage(event)">\`;
    showToast('Image uploadée ✓', "L'imprimé est prêt.");
  } catch(e) {
    prog.classList.remove('show');
    showToast('Erreur upload', e.message, '#ef4444');
  }
}

async function savePrint() {
  const name = document.getElementById('printName').value.trim();
  const category = document.getElementById('printCategory').value.trim();
  const price = parseInt(document.getElementById('printPrice').value, 10);
  const stock = parseInt(document.getElementById('printStock').value, 10);
  const colors = Array.from(document.querySelectorAll('#adminColorRow input:checked')).map(i => i.value);
  const editId = document.getElementById('editPrintId').value;
  if (!name || !pendingPrintImage) return;
  const payload = { name, category: category || 'Édition Limitée', image_url: pendingPrintImage, price, stock, colors, sizes: ['TU'] };
  try {
    if (editId) {
      await sbClient.from(PRINTS_TABLE).update(payload).eq('id', parseInt(editId, 10));
    } else {
      payload.active = true;
      await sbClient.from(PRINTS_TABLE).insert(payload);
    }
    await loadAdminPrints();
    await loadPrints();
    showAdminTab('list', document.querySelectorAll('.admin-tab')[0]);
    showToast('Enregistré! ✓', \`"\${name}" \${editId ? 'mis à jour' : 'ajouté'}.\`);
  } catch(e) {
    showToast('Erreur Supabase', e.message, '#ef4444');
  }
}

function editPrint(id) {
  const p = adminPrintsData.find(x => x.id === id);
  if (!p) return;
  document.getElementById('editPrintId').value = id;
  document.getElementById('printName').value = p.name || '';
  document.getElementById('printCategory').value = p.category || '';
  document.getElementById('printPrice').value = p.price != null ? p.price : 9000;
  document.getElementById('printStock').value = p.stock != null ? p.stock : 100;
  const colors = p.colors || [];
  renderAdminColorCheckboxes(colors);
  pendingPrintImage = p.image_url || '';
  const slot = document.getElementById('printUploadSlot');
  slot.innerHTML = pendingPrintImage ? \`<img src="\${pendingPrintImage}"><div class="upload-progress" id="printUploadProgress"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadPrintImage(event)">\` : '';
  showAdminTab('add', document.querySelectorAll('.admin-tab')[1]);
}

function renderAdminColorCheckboxes(selected = []) {
  const row = document.getElementById('adminColorRow');
  if(!row) return;
  row.innerHTML = globalSettings.global_colors.map(c => \`
    <label class="admin-check-swatch" data-color="\${c}" style="background:\${c}">
      <input type="checkbox" value="\${c}" \${selected.includes(c) ? 'checked' : ''}><span class="check-mark">✓</span>
    </label>
  \`).join('');
}

function resetPrintForm() {
  document.getElementById('editPrintId').value = '';
  document.getElementById('printName').value = '';
  document.getElementById('printCategory').value = 'Édition Limitée';
  document.getElementById('printPrice').value = '9000';
  document.getElementById('printStock').value = '100';
  renderAdminColorCheckboxes(globalSettings.global_colors);
  pendingPrintImage = '';
}

function cancelAddPrint() {
  resetPrintForm();
  showAdminTab('list', document.querySelectorAll('.admin-tab')[0]);
}

function loadAdminSettingsUI() {}

async function uploadHeadwearMockup(event, type) {
  const file = event.target.files[0];
  if (!file) return;
  const prog = document.getElementById(type + 'MockupProgress');
  if(prog) prog.classList.add('show');
  try {
    const ext = file.name.split('.').pop();
    const filename = 'mockup_' + type + '_' + Date.now() + '.' + ext;
    const path = 'mockups/' + filename;
    const { error } = await sbClient.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: urlData } = sbClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    globalSettings[type + 'MockupUrl'] = urlData.publicUrl;
    localStorage.setItem('ovrg_' + type + '_mockup_url', urlData.publicUrl);
    const slot = document.getElementById(type + 'MockupSlot');
    if(slot) {
      slot.innerHTML = \`<img src="\${urlData.publicUrl}" style="width:100%;height:100%;object-fit:cover"><div class="upload-progress" id="\${type}MockupProgress"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, '\${type}')">\`;
    }
    showToast('Mockup uploadé ✓', "Sauvegardez les paramètres pour appliquer.");
  } catch(e) {
    if(prog) prog.classList.remove('show');
    showToast('Erreur upload', e.message, '#ef4444');
  }
}

async function saveHeadwearSettings() {
  const basePrice = parseInt(document.getElementById('headwearBasePrice').value, 10);
  if (!isNaN(basePrice)) {
    globalSettings.headwearBasePrice = basePrice;
    localStorage.setItem('ovrg_headwear_base_price', basePrice);
  }
  showToast('Paramètres enregistrés', 'Les modifications ont été sauvegardées.');
}

function buildOrderItem() {
  if (!selectedPrint) return null;
  const price = selectedPrint.price != null ? selectedPrint.price : globalSettings.headwearBasePrice;
  return {
    key: \`showcase-headwear-\${selectedPrint.id}-\${selectedColor}-\${selectedSize}-\${printPlacement}-\${printSize}\`,
    id: \`showcase-\${selectedPrint.id}\`,
    name: \`\${productType === 'cap' ? 'Casquette' : 'Bob'} OVRG — \${selectedPrint.name}\`,
    price: price,
    qty: 1,
    size: selectedSize,
    color: selectedColor,
    img: selectedPrint.image_url || '',
    type: 'showcase',
    customization: {
      placement: printPlacement,
      placementLabel: printPlacement === 'front' ? 'Devant' : 'Côté',
      scale: printSize === 'small' ? 'Petit' : 'Grand',
      blend: 100
    }
  };
}

function addToCartShowcase() {
  const item = buildOrderItem();
  if (!item) { showToast('Choisissez un imprimé', "Sélectionnez d'abord un imprimé.", '#f59e0b'); return; }
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem('ovrg_cart') || '[]'); } catch(e) {}
  const existing = cart.find(c => c.key === item.key);
  if (existing) existing.qty += 1;
  else cart.push(item);
  localStorage.setItem('ovrg_cart', JSON.stringify(cart));
  showToast('Ajouté au panier! 🛍', \`\${item.name} ajouté.\`);
}

function orderViaWhatsApp() {
  const item = buildOrderItem();
  if (!item) { showToast('Choisissez un imprimé', "Sélectionnez d'abord un imprimé.", '#f59e0b'); return; }
  const c = item.customization;
  const msg = \`Bonjour OVRG! Je voudrais commander une \${productType === 'cap' ? 'casquette' : 'bob'}:%0A%0A\`+
              \`🎨 Imprimé: \${selectedPrint.name}%0A\`+
              \`👕 Couleur: \${COLOR_NAMES[selectedColor] || selectedColor}%0A\`+
              \`📏 Taille: \${item.size}%0A\`+
              \`📍 Position: \${c.placementLabel}%0A\`+
              \`💰 Prix: \${fmt(item.price)}\`;
  window.open(\`https://wa.me/2250799108108?text=\${msg}\`, '_blank');
}

function goToCheckout() {
  const item = buildOrderItem();
  if (!item) { showToast('Choisissez un imprimé', "Sélectionnez d'abord un imprimé.", '#f59e0b'); return; }
  addToCartShowcase();
  setTimeout(() => { window.location.href = '/#catalogue'; }, 150);
}

`;

headwearStr = headwearStr.replace('// ============================================================\n//  UTILS', missingCode + '\n// ============================================================\n//  UTILS');
fs.writeFileSync('headwear.html', headwearStr);
console.log('Fixed headwear.html');
