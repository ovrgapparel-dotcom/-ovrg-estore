const fs = require('fs');
let html = fs.readFileSync('headwear.html', 'utf8');

// Update sides object
const sidesOld = `const sides = {
  front: { wrap: document.getElementById('canvas-front'), canvas: document.querySelector('#canvas-front canvas'), img: null },
  side:  { wrap: document.getElementById('canvas-side'),  canvas: document.querySelector('#canvas-side canvas'),  img: null }
};`;
const sidesNew = `const sides = {
  front: { wrap: document.getElementById('canvas-front'), canvas: document.querySelector('#canvas-front canvas'), img: null },
  side:  { wrap: document.getElementById('canvas-side'),  canvas: document.querySelector('#canvas-side canvas'),  img: null },
  back:  { wrap: document.getElementById('canvas-back'),  canvas: document.querySelector('#canvas-back canvas'),  img: null }
};`;
html = html.replace(sidesOld, sidesNew);

// Update loadSettings
const loadSettingsOld = `async function loadSettings() {
  try {
    const { data, error } = await sbClient.from('showcase_settings').select('*').eq('id', 1).single();`;
const loadSettingsNew = `async function loadSettings() {
  try {
    const { data, error } = await sbClient.from('showcase_settings').select('*').eq('id', 2).single();`;
html = html.replace(loadSettingsOld, loadSettingsNew);

// We need to inject the updateShirtImagesForColor function and the new Admin Settings functions.
// Let's replace the old loadAdminSettingsUI, uploadHeadwearMockup, saveHeadwearSettings block completely.

const oldAdminSettingsFuncs = `function loadAdminSettingsUI() {}

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
}`;

const newAdminSettingsFuncs = `let pendingColorMockups = [];

function loadAdminSettingsUI() {
  pendingColorMockups = JSON.parse(JSON.stringify(globalSettings.color_mockups || []));
  if (pendingColorMockups.length === 0 && globalSettings.global_colors && globalSettings.global_colors.length > 0) {
    pendingColorMockups = globalSettings.global_colors.map(c => ({
      hex: c,
      cap_front: null, cap_side: null, cap_back: null,
      bucket_front: null, bucket_side: null, bucket_back: null
    }));
  }
  renderSettingsColorMockups();
}

function renderSettingsColorMockups() {
  const container = document.getElementById('settingsColorMockupsList');
  if (!container) return;
  if (!pendingColorMockups || pendingColorMockups.length === 0) {
    container.innerHTML = '<p style="color:#666">Aucune couleur définie.</p>';
    return;
  }
  
  container.innerHTML = pendingColorMockups.map((m, i) => \`
    <div style="background:#111; border:1px solid #333; padding:1rem; border-radius:8px; margin-bottom:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <div style="width:30px; height:30px; background:\${m.hex}; border-radius:4px; border:1px solid #444;"></div>
          <strong style="color:#eee; font-family:monospace">\${m.hex}</strong>
        </div>
        <button class="btn-cancel-login" style="padding:0.3rem 0.6rem; font-size:0.8rem;" onclick="removeColorMockup(\${i})">Supprimer</button>
      </div>
      
      <h4 style="margin-bottom:0.5rem; color:#888; font-size:0.9rem;">Casquette</h4>
      <div class="admin-grid" style="grid-template-columns: 1fr 1fr 1fr; gap:1rem; margin-bottom:1.5rem">
        <div>
          <label style="font-size:0.8rem">Devant</label>
          <div class="upload-slot" id="slot_cap_front_\${i}" style="height:80px; min-height:80px;">
            \${m.cap_front ? '<img src="' + m.cap_front + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_cap_front_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'cap_front\\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_cap_front_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'cap_front\\')">'}
          </div>
        </div>
        <div>
          <label style="font-size:0.8rem">Côté</label>
          <div class="upload-slot" id="slot_cap_side_\${i}" style="height:80px; min-height:80px;">
            \${m.cap_side ? '<img src="' + m.cap_side + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_cap_side_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'cap_side\\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_cap_side_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'cap_side\\')">'}
          </div>
        </div>
        <div>
          <label style="font-size:0.8rem">Dos</label>
          <div class="upload-slot" id="slot_cap_back_\${i}" style="height:80px; min-height:80px;">
            \${m.cap_back ? '<img src="' + m.cap_back + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_cap_back_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'cap_back\\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_cap_back_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'cap_back\\')">'}
          </div>
        </div>
      </div>

      <h4 style="margin-bottom:0.5rem; color:#888; font-size:0.9rem;">Bob</h4>
      <div class="admin-grid" style="grid-template-columns: 1fr 1fr 1fr; gap:1rem;">
        <div>
          <label style="font-size:0.8rem">Devant</label>
          <div class="upload-slot" id="slot_bucket_front_\${i}" style="height:80px; min-height:80px;">
            \${m.bucket_front ? '<img src="' + m.bucket_front + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_bucket_front_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'bucket_front\\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_bucket_front_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'bucket_front\\')">'}
          </div>
        </div>
        <div>
          <label style="font-size:0.8rem">Côté</label>
          <div class="upload-slot" id="slot_bucket_side_\${i}" style="height:80px; min-height:80px;">
            \${m.bucket_side ? '<img src="' + m.bucket_side + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_bucket_side_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'bucket_side\\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_bucket_side_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'bucket_side\\')">'}
          </div>
        </div>
        <div>
          <label style="font-size:0.8rem">Dos</label>
          <div class="upload-slot" id="slot_bucket_back_\${i}" style="height:80px; min-height:80px;">
            \${m.bucket_back ? '<img src="' + m.bucket_back + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_bucket_back_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'bucket_back\\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_bucket_back_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \\'bucket_back\\')">'}
          </div>
        </div>
      </div>
    </div>
  \`).join('');
}

function addColorMockup() {
  const hex = document.getElementById('newGlobalColor').value;
  if (pendingColorMockups.find(m => m.hex.toLowerCase() === hex.toLowerCase())) {
    showToast('Erreur', 'Cette couleur existe déjà.', '#ef4444'); return;
  }
  pendingColorMockups.push({ hex: hex, cap_front: null, cap_side: null, cap_back: null, bucket_front: null, bucket_side: null, bucket_back: null });
  renderSettingsColorMockups();
}

function removeColorMockup(index) {
  if (pendingColorMockups.length <= 1) { showToast('Erreur', 'Il doit rester au moins une couleur.', '#ef4444'); return; }
  pendingColorMockups.splice(index, 1);
  renderSettingsColorMockups();
}

async function uploadHeadwearMockup(event, index, key) {
  const file = event.target.files[0];
  if (!file) return;
  const prog = document.getElementById(\`prog_\${key}_\${index}\`);
  if(prog) prog.classList.add('show');
  try {
    const ext = file.name.split('.').pop();
    const filename = 'mockup_' + key + '_' + Date.now() + '.' + ext;
    const path = 'mockups/' + filename;
    const { error } = await sbClient.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: urlData } = sbClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    pendingColorMockups[index][key] = urlData.publicUrl;
    renderSettingsColorMockups();
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

  const global_colors = pendingColorMockups.map(m => m.hex);
  const payload = {
    id: 2,
    global_colors: global_colors,
    color_mockups: pendingColorMockups
  };

  try {
    const { error } = await sbClient.from('showcase_settings').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    
    globalSettings.color_mockups = JSON.parse(JSON.stringify(pendingColorMockups));
    globalSettings.global_colors = global_colors;
    
    updateShirtImagesForColor(selectedColor);
    
    if (typeof renderColorOptions === 'function' && !selectedPrint) {
       renderColorOptions(globalSettings.global_colors);
    }
    
    showToast('Paramètres enregistrés', 'Les modifications ont été sauvegardées.');
  } catch(e) {
    console.error('Save settings error:', e);
    showToast('Erreur', e.message, '#ef4444');
  }
}

function updateShirtImagesForColor(hex) {
  if (!globalSettings.color_mockups) return;
  const match = globalSettings.color_mockups.find(m => m.hex.toLowerCase() === hex.toLowerCase()) || globalSettings.color_mockups[0];
  if (!match) return;
  
  if (productType === 'cap') {
    SHIRT_IMAGES.front = match.cap_front || GENERIC_MOCKUPS.cap.front;
    SHIRT_IMAGES.side = match.cap_side || GENERIC_MOCKUPS.cap.side;
    SHIRT_IMAGES.back = match.cap_back || GENERIC_MOCKUPS.cap.back;
  } else {
    SHIRT_IMAGES.front = match.bucket_front || GENERIC_MOCKUPS.bucket.front;
    SHIRT_IMAGES.side = match.bucket_side || GENERIC_MOCKUPS.bucket.side;
    SHIRT_IMAGES.back = match.bucket_back || GENERIC_MOCKUPS.bucket.back;
  }
  loadShirtImages();
}
`;

html = html.replace(oldAdminSettingsFuncs, newAdminSettingsFuncs);

// Update setProductType
const setProductTypeOld = `function setProductType(type) {
  // Update product type state
  productType = type;

  // Update UI button selection
  document.querySelectorAll('#productTypeRow .size-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === type);
  });

  // Swap mockup images based on the selected type
  if (GENERIC_MOCKUPS[type]) {
    SHIRT_IMAGES.front = GENERIC_MOCKUPS[type].front;
    SHIRT_IMAGES.side = GENERIC_MOCKUPS[type].side;
    loadShirtImages();
  }

  // Update 3D model
  if (window.load3DModel) {
    const modelUrl = type === 'cap' ? '/cap.glb' : '/bucket.glb';
    window.load3DModel(modelUrl);
  }
}`;

const setProductTypeNew = `function setProductType(type) {
  // Update product type state
  productType = type;

  // Update UI button selection
  document.querySelectorAll('#productTypeRow .size-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === type);
  });

  // Swap mockup images based on the selected type and color
  updateShirtImagesForColor(selectedColor);

  // Update 3D model
  if (window.load3DModel) {
    const modelUrl = type === 'cap' ? '/cap.glb' : '/bucket.glb';
    window.load3DModel(modelUrl);
  }
}`;

html = html.replace(setProductTypeOld, setProductTypeNew);

// Add missing back fallback to GENERIC_MOCKUPS
const genericMockupsOld = `const GENERIC_MOCKUPS = {
  cap: {
    front: 'https://via.placeholder.com/600x750/cccccc/888888?text=Cap+Front',
    side: 'https://via.placeholder.com/600x750/cccccc/888888?text=Cap+Side'
  },
  bucket: {
    front: 'https://via.placeholder.com/600x750/cccccc/888888?text=Bucket+Front',
    side: 'https://via.placeholder.com/600x750/cccccc/888888?text=Bucket+Side'
  }
};`;
const genericMockupsNew = `const GENERIC_MOCKUPS = {
  cap: {
    front: 'https://via.placeholder.com/600x750/cccccc/888888?text=Cap+Front',
    side: 'https://via.placeholder.com/600x750/cccccc/888888?text=Cap+Side',
    back: 'https://via.placeholder.com/600x750/cccccc/888888?text=Cap+Back'
  },
  bucket: {
    front: 'https://via.placeholder.com/600x750/cccccc/888888?text=Bucket+Front',
    side: 'https://via.placeholder.com/600x750/cccccc/888888?text=Bucket+Side',
    back: 'https://via.placeholder.com/600x750/cccccc/888888?text=Bucket+Back'
  }
};`;
html = html.replace(genericMockupsOld, genericMockupsNew);

// Update renderColorOptions and click listener to also call updateShirtImagesForColor
const oldColorRowListener = `document.getElementById('colorRow')?.addEventListener('click', e => {
  const btn = e.target.closest('.color-swatch');
  if (!btn) return;
  selectedColor = btn.dataset.color;
  document.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('selected', b===btn));
  if (window.setShirtColor) window.setShirtColor(selectedColor);
});`;
const newColorRowListener = `document.getElementById('colorRow')?.addEventListener('click', e => {
  const btn = e.target.closest('.color-swatch');
  if (!btn) return;
  selectedColor = btn.dataset.color;
  document.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('selected', b===btn));
  if (window.setShirtColor) window.setShirtColor(selectedColor);
  updateShirtImagesForColor(selectedColor);
});`;
html = html.replace(oldColorRowListener, newColorRowListener);

// Same for renderColorOptions
const oldRenderColorOptions = `function renderColorOptions(colors) {
  const row = document.getElementById('colorRow');
  if (!row) return;
  row.innerHTML = colors.map((c,i) => \`<button class="color-swatch\${i===0?' selected':''}" style="background:\${c}" data-color="\${c}" title="\${COLOR_NAMES[c]||c}"></button>\`).join('');
  selectedColor = colors[0];
  if (window.setShirtColor) window.setShirtColor(selectedColor);
}`;
const newRenderColorOptions = `function renderColorOptions(colors) {
  const row = document.getElementById('colorRow');
  if (!row) return;
  row.innerHTML = colors.map((c,i) => \`<button class="color-swatch\${i===0?' selected':''}" style="background:\${c}" data-color="\${c}" title="\${COLOR_NAMES[c]||c}"></button>\`).join('');
  selectedColor = colors[0];
  if (window.setShirtColor) window.setShirtColor(selectedColor);
  updateShirtImagesForColor(selectedColor);
}`;
html = html.replace(oldRenderColorOptions, newRenderColorOptions);

// Add missing back to SHIRT_IMAGES init
html = html.replace(`const SHIRT_IMAGES = { front: GENERIC_MOCKUPS.cap.front, side: GENERIC_MOCKUPS.cap.side };`, `const SHIRT_IMAGES = { front: GENERIC_MOCKUPS.cap.front, side: GENERIC_MOCKUPS.cap.side, back: GENERIC_MOCKUPS.cap.back };`);

// Fix paintFallbackCanvas
html = html.replace(`const canvas = document.getElementById(side==='front' ? 'tshirt-front' : 'tshirt-side');`, `const canvas = document.getElementById(side==='front' ? 'tshirt-front' : side==='side' ? 'tshirt-side' : 'tshirt-back');`);

fs.writeFileSync('headwear.html', html);
console.log('Done refactoring JS logic.');
