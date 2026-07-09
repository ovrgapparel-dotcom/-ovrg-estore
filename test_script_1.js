
// ============================================================
//  STATE
// ============================================================
let globalSettings = {
  front_image_url: null,
  back_image_url: null,
  global_colors: ['#ffffff','#1a1a1a','#e63946','#457b9d','#2a9d8f','#f4a261'],
  color_mockups: [],
  capMockupUrl: null,
  bucketMockupUrl: null,
  capMockupFrontUrl: null,
  capMockupSideUrl: null,
  capMockupBackUrl: null,
  bucketMockupFrontUrl: null,
  bucketMockupSideUrl: null,
  bucketMockupBackUrl: null
};

globalSettings.headwearBasePrice = 9000;
try {
  const savedPrice = localStorage.getItem('ovrg_headwear_base_price');
  if (savedPrice) globalSettings.headwearBasePrice = parseInt(savedPrice, 10);
  globalSettings.capMockupUrl = localStorage.getItem('ovrg_cap_mockup_url');
  globalSettings.bucketMockupUrl = localStorage.getItem('ovrg_bucket_mockup_url');
} catch(e) {}

const HEADWEAR_MOCKUPS_BUCKET = 'product-images';
let sbClient = null;
if (typeof supabase !== 'undefined') {
  try {
    sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  } catch(e) { console.warn('Supabase early init failed, will retry in initSupabase():', e); }
} else {
  console.warn('Supabase not available in test environment');
}
let currentUser = null;
let prints = [];
let selectedPrint = null;
let selectedSize = 'TU';
let currentView = 'front';
let pendingPrintImage = '';

// Headwear specific states
let productType = 'cap';
let printPlacement = 'front-center'; window.printPlacement = 'front-center';
let printScale = 1.0;
let decorMode = 'embroidery'; // 'embroidery' | 'label' | 'both'

// ── EMBROIDERY ZONES ──────────────────────────────────────────────────────────
// Pixel coordinates on the 600×600 fallback canvas, calibrated to where each
// zone sits on the drawn hat silhouette. When a real mockup photo is loaded,
// these percentages are reused relative to the photo dimensions.
//
// Zone format: { id, label, cx, cy, w, h }  (canvas pixel coords, 600×600 base)
// cx/cy = centre of zone, w/h = zone dimensions.
const EMBROIDERY_ZONES = {
  cap: [
    { id: 'front',        label: 'Devant Complet',cx: 305, cy: 210, w: 180, h: 200 },
    { id: 'front-high',   label: 'Devant Haut',   cx: 305, cy: 155, w: 160, h:  90 },
    { id: 'front-center', label: 'Devant Milieu', cx: 305, cy: 210, w: 180, h: 110 },
    { id: 'front-low',    label: 'Devant Bas',    cx: 305, cy: 265, w: 170, h:  80 },
    { id: 'front-left',   label: 'Devant Gauche', cx: 195, cy: 225, w: 100, h:  90 },
    { id: 'front-right',  label: 'Devant Droite', cx: 415, cy: 225, w: 100, h:  90 },
    { id: 'back-center',  label: 'Dos Centre',    cx: 305, cy: 300, w: 130, h:  90 },
  ],
  bucket: [
    { id: 'front',        label: 'Devant Complet',cx: 300, cy: 230, w: 200, h: 200 },
    { id: 'front-high',   label: 'Devant Haut',   cx: 300, cy: 175, w: 180, h:  90 },
    { id: 'front-center', label: 'Devant Milieu', cx: 300, cy: 230, w: 200, h: 110 },
    { id: 'front-low',    label: 'Devant Bas',    cx: 300, cy: 285, w: 180, h:  80 },
    { id: 'front-left',   label: 'Devant Gauche', cx: 170, cy: 245, w: 110, h: 100 },
    { id: 'front-right',  label: 'Devant Droite', cx: 430, cy: 245, w: 110, h: 100 },
    { id: 'brim-front',   label: 'Bord Devant',   cx: 300, cy: 420, w: 240, h:  60 },
  ]
};

// Size multipliers (S / M / L)
const EMBROIDERY_SIZES = { S: 0.65, M: 1.0, L: 1.40 };

let activeZoneId    = 'front-center';
let embroiderySize  = 'M';
let scaleMultiplier = 1.0;


// sides is populated once the DOM is ready (see DOMContentLoaded)
let sides = { front: { wrap: null, canvas: null, img: null }, side: { wrap: null, canvas: null, img: null }, back: { wrap: null, canvas: null, img: null }, 'sleeve-left': { wrap: null, canvas: null, img: null }, 'sleeve-right': { wrap: null, canvas: null, img: null } };

// ============================================================
//  HEADWEAR MOCKUP IMAGES + RECOLORING ENGINE
// ============================================================
// We use plain solid-color fallback canvases — no external placeholder images needed
const GENERIC_MOCKUPS = {
  cap:    { front: null, side: null, back: null },
  bucket: { front: null, side: null, back: null }
};

let SHIRT_IMAGES = { front: null, side: null, back: null, 'sleeve-left': null, 'sleeve-right': null };
const shirtSource = { front: null, side: null, back: null };

// ── FABRIC ANALYSIS DATA ──
const fabricData = { front: null, side: null, back: null };

function analyzeFabric(side) {
  const img = shirtSource[side];
  if (!img) return;
  const w = img.naturalWidth, h = img.naturalHeight;
  const offscreen = document.createElement('canvas');
  offscreen.width = w; offscreen.height = h;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const LUM_THRESHOLD = 0.30;
  const lum = new Float32Array(w * h);
  const mask = new Uint8Array(w * h);
  let lumSum = 0, fabricCount = 0;

  for (let i = 0; i < w * h; i++) {
    const r = data[i*4] / 255, g = data[i*4+1] / 255, b = data[i*4+2] / 255;
    const l = 0.2126*r + 0.7152*g + 0.0722*b;
    lum[i] = l;
    if (l > LUM_THRESHOLD) {
      mask[i] = 1;
      lumSum += l;
      fabricCount++;
    }
  }
  const meanLum = fabricCount > 0 ? lumSum / fabricCount : 0.78;

  const dx = new Float32Array(w * h);
  const dy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      dx[idx] = (lum[idx + 1] - lum[idx - 1]) * 0.5;
      dy[idx] = (lum[idx + w] - lum[idx - w]) * 0.5;
    }
  }

  fabricData[side] = { lum, dx, dy, mask, meanLum, w, h };
}

function loadShirtImages() {
  ['front','side','back','sleeve-left','sleeve-right'].forEach(side => {
    const url = SHIRT_IMAGES[side];
    if (!url) {
      // No mockup uploaded yet for this side — just show the labelled placeholder
      paintFallbackCanvas(side);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      shirtSource[side] = img;
      analyzeFabric(side);
      recolorShirt(side);
      scheduleRender();   // redraws shirt + overlays design
    };
    img.onerror = () => {
      console.warn(`Could not load ${side} mockup, using fallback canvas`);
      shirtSource[side] = null;
      paintFallbackCanvas(side);
    };
    img.src = url;
  });
}

function recolorShirt(side) {
  const img = shirtSource[side];
  const ids = { front: 'tshirt-front', side: 'tshirt-side', back: 'tshirt-back', 'sleeve-left': 'tshirt-sleeve-left', 'sleeve-right': 'tshirt-sleeve-right' };
  const canvas = document.getElementById(ids[side]);
  if (!img || !canvas) return;

  const w = img.naturalWidth, h = img.naturalHeight;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  
  scheduleRender();
}

// Print customization state — variables already declared above; no redeclaration needed.

// ============================================================
//  SUPABASE INIT
// ============================================================
function initSupabase() {
  try {
    if (sbClient) {
      sbClient.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user ?? null;
        updateAdminUI();
      });
      return true;
    }
    const _sb = window['supabase'] || window['supabaseJs'];
    if (!_sb || typeof _sb.createClient !== 'function') throw new Error('Supabase library not loaded');
    sbClient = _sb.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, storage: window.localStorage }
    });
    sbClient.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user ?? null;
      updateAdminUI();
    });
    return true;
  } catch(e) {
    console.error('Supabase init error:', e);
    return false;
  }
}

// ============================================================
//  LOAD DATA
// ============================================================
async function loadSettings() {
  try {
    const { data, error } = await sbClient.from('showcase_settings').select('*').eq('id', 2).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (data) {
      if (data.global_colors && data.global_colors.length) {
        globalSettings.global_colors = data.global_colors;
      }
      // Restore color-specific mockups (the main source of truth)
      if (data.color_mockups && Array.isArray(data.color_mockups) && data.color_mockups.length) {
        globalSettings.color_mockups = data.color_mockups;
        // Also persist to localStorage for offline preview
        try { localStorage.setItem('ovrg_headwear_color_mockups', JSON.stringify(data.color_mockups)); } catch(e) {}
      } else {
        // Fallback to localStorage if Supabase returned nothing
        try {
          const cached = localStorage.getItem('ovrg_headwear_color_mockups');
          if (cached) globalSettings.color_mockups = JSON.parse(cached);
        } catch(e) {}
      }
    }
  } catch(e) {
    console.error('Load settings error:', e);
    // On network error, try localStorage
    try {
      const cached = localStorage.getItem('ovrg_headwear_color_mockups');
      if (cached) globalSettings.color_mockups = JSON.parse(cached);
    } catch(e2) {}
  }
}

async function loadPrints() {
  let tries = 0;
  while (!sbClient && tries < 10) { await new Promise(r => setTimeout(r, 300)); tries++; }
  if (!sbClient) { prints = []; renderPrintGrid(); return; }
  try {
    const { data, error } = await sbClient
      .from(PRINTS_TABLE)
      .select('*')
      .eq('active', true)
      .order('id', { ascending: true });
    if (error) throw error;
    prints = data || [];
    renderPrintGrid();
  } catch(e) {
    console.error('Load prints error:', e);
    prints = [];
    renderPrintGrid();
  }
}

function renderPrintGrid() {
  const grid = document.getElementById('printGrid');
  if (document.getElementById('printCount')) document.getElementById('printCount').textContent = `(${prints.length})`;
  if (!prints.length) {
    grid.innerHTML = `<div class="print-thumb-none" style="grid-column:1/-1">Aucun imprimé disponible pour le moment.</div>`;
    return;
  }
  grid.innerHTML = prints.map(p => `
    <div class="print-thumb${selectedPrint && selectedPrint.id===p.id ? ' selected':''}" onclick='selectPrint(${JSON.stringify(p).replace(/'/g,"&#39;")})'>
      ${p.image_url
        ? `<img src="${p.image_url}" alt="${p.name}">`
        : `<div class="print-thumb-none">${p.name}</div>`}
      <span class="pname">${p.name}</span>
    </div>`).join('');
}

function selectPrint(p) {
  selectedPrint = p;
  document.getElementById('printInfo').innerHTML = `<span>Broderie sélectionnée : <strong>${p.name}</strong>${p.category ? ' • ' + p.category : ''}</span>`;
  document.getElementById('printCustomize').style.display = '';
  renderZoneButtons();   // rebuild zone selector for current product type

  updatePrice();

  if (window.applyHeadwearPrint && (decorMode === 'embroidery' || decorMode === 'both')) {
    window.applyHeadwearPrint(p.image_url || null);
  }

  // Load print image into sides.img for 2D overlays
  if (p.image_url) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      sides.front.img = img;
      sides['sleeve-left'].img = img;
      sides['sleeve-right'].img = img;
      sides.side.img = img;
      sides.back.img = img;
      scheduleRender();
    };
    img.src = p.image_url;
  } else {
    sides.front.img = null;
    sides.side.img = null;
    sides.back.img = null;
    scheduleRender();
  }

  renderPrintGrid();
}


// ── DECORATION MODE ─────────────────────────────────────────────────────
function setDecorMode(mode) {
  decorMode = mode;
  document.querySelectorAll('#decorModeRow .size-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === mode);
  });
  const labelSection   = document.getElementById('labelSection');
  const printGallery   = document.querySelector('.print-gallery');
  const printInfo      = document.getElementById('printInfo');
  const printCustomize = document.getElementById('printCustomize');
  const showLabel = mode === 'label' || mode === 'both';
  const showPrint = mode === 'embroidery' || mode === 'both';
  if (labelSection)   labelSection.style.display   = showLabel ? '' : 'none';
  if (printGallery)   printGallery.style.display   = showPrint ? '' : 'none';
  if (printInfo)      printInfo.style.display      = showPrint ? '' : 'none';
  if (printCustomize) printCustomize.style.display = ((showPrint && selectedPrint) || showLabel) ? '' : 'none';
  if (window.applyHeadwearPrint)
    window.applyHeadwearPrint(showPrint && selectedPrint ? selectedPrint.image_url : null);
  onLabelChange();
  updatePrice();
  scheduleRender();
}

// ── LABEL HANDLER ─────────────────────────────────────────────────────
function onLabelChange() {
  const text  = (document.getElementById('customLabelInput')?.value || '').toUpperCase().trim();
  const color = document.getElementById('customLabelColor')?.value || '#ffffff';
  const previewRow  = document.getElementById('labelPreviewRow');
  const previewSpan = document.getElementById('labelPreviewText');
  if (previewRow && previewSpan) {
    if (text) {
      previewRow.style.display  = '';
      previewSpan.textContent   = text;
      previewSpan.style.color   = color;
      previewSpan.style.textShadow = color === '#ffffff'
        ? '0 0 6px rgba(0,0,0,0.8)' : '0 0 6px rgba(255,255,255,0.5)';
    } else {
      previewRow.style.display = 'none';
    }
  }
  const showLabel = decorMode === 'label' || decorMode === 'both';
  if (window.applyHeadwearLabel)
    window.applyHeadwearLabel(showLabel ? text : '', color);
  updatePrice();
  scheduleRender();
}


// ── PRICE CALCULATION ─────────────────────────────────────────────────────
function updatePrice() {
  const basePrice = selectedPrint && selectedPrint.price != null
    ? selectedPrint.price
    : globalSettings.headwearBasePrice || 9000;

  const showLabel = decorMode === 'label' || decorMode === 'both';
  let labelSurcharge = 0;
  if (showLabel) {
    const labelText = (document.getElementById('customLabelInput')?.value || '').trim();
    labelSurcharge = labelText.length * 150;
  }

  const total = basePrice + labelSurcharge;
  const priceEl = document.getElementById('priceMain');
  if (priceEl) priceEl.textContent = fmt(total);

  const noteEl = document.getElementById('priceNote');
  if (noteEl) {
    if (labelSurcharge > 0) {
      noteEl.textContent = `Broderie ${fmt(basePrice)} + Label ${fmt(labelSurcharge)} • livraison à Abidjan`;
    } else {
      noteEl.textContent = `${decorMode === 'label' ? 'Label' : 'Broderie'} sur mesure • livraison à Abidjan`;
    }
  }
}

function switchView(view) {
  currentView = view;

  // Update button active states
  document.querySelectorAll('.view-btn').forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.includes(`'${view}'`));
  });

  // Show / hide the appropriate mockup containers, now including sleeve views
  const viewList = ['front','side','back','3d','sleeve-left','sleeve-right'];
  viewList.forEach(v => {
    const el = document.getElementById(v === '3d' ? '3d-view' : `${v}-view`);
    if (el) el.style.display = v === view ? 'block' : 'none';
  });

  // Rebuild zone buttons so they filter to the current view
  renderZoneButtons();

  if (view !== '3d') {
    if (shirtSource[view]) {
      recolorShirt(view);
    } else {
      paintFallbackCanvas(view);
    }
    scheduleRender();
  }

  // Trigger 3D viewer resize when switching to 3D, then rebuild overlay
  if (view === '3d' && window.trigger3DResize) {
    setTimeout(() => {
      window.trigger3DResize();
      // Rebuild decal after resize so it has correct dimensions
      if (window.applyHeadwearPrint || window.applyHeadwearLabel) {
        const decorMode_ = typeof decorMode !== 'undefined' ? decorMode : 'embroidery';
        const print_ = typeof selectedPrint !== 'undefined' ? selectedPrint : null;
        const showPrint = decorMode_ === 'embroidery' || decorMode_ === 'both';
        const showLabel = decorMode_ === 'label' || decorMode_ === 'both';
        if (showPrint && print_ && window.applyHeadwearPrint) window.applyHeadwearPrint(print_.image_url || null);
        if (showLabel && window.applyHeadwearLabel) {
          const text = document.getElementById('customLabelInput')?.value || '';
          const color = document.getElementById('customLabelColor')?.value || '#ffffff';
          window.applyHeadwearLabel(text, color);
        }
      }
    }, 100);
  }
}
window.switchView = switchView;
globalThis.switchView = switchView;
function handleAdminClick() {
  // If a user is authenticated, open the admin panel; otherwise, show the login overlay.
  if (currentUser) {
    document.getElementById('adminOverlay').classList.add('open');
  } else {
    document.getElementById('loginOverlay').classList.add('open');
  }
}


function setProductType(type) {
  // Map UI type identifiers to internal product types
  const mappedType = (type === 'hoodie') ? 'bucket' : type; // hoodie uses bucket mockups
  productType = mappedType;
  activeZoneId = 'front-center';   // reset to front zone on type change

  document.querySelectorAll('#productTypeRow .size-btn').forEach(btn => {
    // The button's data-type may be 'hoodie' or 'jacket'; map accordingly for visual selection
    const btnType = (btn.dataset.type === 'hoodie') ? 'bucket' : btn.dataset.type;
    btn.classList.toggle('selected', btnType === mappedType);
  });

  // Rebuild zone buttons for the new product type
  renderZoneButtons();

  updateShirtImagesForColor(selectedColor);

  if (window.load3DModel) {
    const modelUrl = mappedType === 'cap' ? '/cap.glb' : '/bucket.glb';
    window.load3DModel(modelUrl);
  }
}



// ============================================================
//  PLACEMENT & SCALE CONTROLS
// ============================================================
// ── ZONE SYSTEM ───────────────────────────────────────────────────────────────

function getActiveZone() {
  const zones = EMBROIDERY_ZONES[productType] || EMBROIDERY_ZONES.cap;
  return zones.find(z => z.id === activeZoneId) || zones[0];
}

// Build the zone selector buttons dynamically for the current product type
function renderZoneButtons() {
  const grid = document.getElementById('zoneGrid');
  if (!grid) return;
  let zones = EMBROIDERY_ZONES[productType] || EMBROIDERY_ZONES.cap;
  if (currentView && currentView !== '3d') {
    zones = zones.filter(z => z.id.startsWith(currentView));
  }
  grid.innerHTML = zones.map(z => `
    <button class="size-btn${z.id === activeZoneId ? ' selected' : ''}"
            data-zone="${z.id}"
            onclick="setZone('${z.id}')"
            style="font-size:0.78rem;padding:0.5rem 0.6rem">
      ${z.label}
    </button>`).join('');
}

function setZone(zoneId) {
  activeZoneId  = zoneId;
  printPlacement = zoneId;
  window.printPlacement = zoneId;
  // Highlight selected button
  document.querySelectorAll('#zoneGrid .size-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.zone === zoneId);
  });
  scheduleRender();
  _sync3DOverlay();
}

function updateSliderBg(slider) {
  if (!slider) return;
  const min = slider.min ? parseFloat(slider.min) : 40;
  const max = slider.max ? parseFloat(slider.max) : 160;
  const val = slider.value ? parseFloat(slider.value) : 100;
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--val', pct + '%');
}

function onScaleSliderInput(val) {
  scaleMultiplier = parseFloat(val) / 100;
  const el = document.getElementById('scaleDisplay');
  if (el) el.textContent = val + '%';
  
  // Sync S/M/L buttons selection state based on value
  document.querySelectorAll('[data-scale]').forEach(btn => {
    const scale = btn.dataset.scale;
    const targetVal = scale === 'S' ? 65 : scale === 'L' ? 140 : 100;
    btn.classList.toggle('selected', Math.abs(val - targetVal) < 15);
  });

  scheduleRender();
  _sync3DOverlay();
}

function setEmbroiderySize(sz) {
  embroiderySize = sz;
  const mults = { S: 0.65, M: 1.0, L: 1.40 };
  scaleMultiplier = mults[sz];
  
  const el = document.getElementById('scaleDisplay');
  if (el) el.textContent = sz;
  
  const slider = document.getElementById('scaleSlider');
  if (slider) {
    slider.value = Math.round(scaleMultiplier * 100);
    updateSliderBg(slider);
  }

  document.querySelectorAll('[data-scale]').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.scale === sz);
  });
  scheduleRender();
  _sync3DOverlay();
}

// Push zone + size to the 3D overlay
function _sync3DOverlay() {
  const z    = getActiveZone();
  const mult = scaleMultiplier;
  // Convert canvas px (600×600 base) to fraction of canvas size
  const scaleFrac = (z.w * mult) / 600;   // fraction of model bounding box
  if (window.setHeadwearDecalScale) window.setHeadwearDecalScale(scaleFrac * 100);
}

// ── CANVAS RENDER — showcase pipeline, adapted for zone-based headwear ─────────
// Uses the FLOATING OVERLAY canvas (s.wrap / s.canvas) identical to showcase.html.
// The zone converts to % position over the shirt wrapper, then the full
// fabric-distortion pipeline (fold displacement + highlight/shadow + edge feathering)
// is applied via per-pixel processing — exactly as in the working T-shirt renderer.

const EMBROIDERY_BLEND = 0.55;   // fixed blend for embroidery (slightly absorbed look)

function renderDesign(side) {
  const s = sides[side];
  if (!s || !s.wrap || !s.canvas) return;

  const hasPrint = !!(s.img);
  const hasLabel = !!(typeof decorMode !== 'undefined' &&
    (decorMode === 'label' || decorMode === 'both') &&
    document.getElementById('customLabelInput')?.value?.trim());

  if (!hasPrint && !hasLabel) { s.wrap.style.display = 'none'; return; }

  // ── Get wrapper dimensions ────────────────────────────────────────────────
  const wrapId = { front: 'front-view', "sleeve-left": 'sleeve-left-view', "sleeve-right": 'sleeve-right-view', back: 'back-view' };
  const wrapper = document.getElementById(wrapId[side]);
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();
  const wW = rect.width, wH = rect.height;
  if (wW < 10 || wH < 10) { requestAnimationFrame(() => renderDesign(side)); return; }

  // ── Map active zone (600×600 base coords) → % of wrapper ─────────────────
  const zone = getActiveZone();
  const mult = scaleMultiplier;
  // Zone is defined in 600×600 px space; wrapper height is ~600px rendered size.
  // Convert to % of displayed wrapper.
  const zWpx = zone.w * mult;
  const zHpx = zone.h * mult;
  const leftPct = (zone.cx - zWpx / 2) / 600 * 100;
  const topPct  = (zone.cy - zHpx / 2) / 600 * 100;
  const wPct    = zWpx / 600 * 100;
  const hPct    = zHpx / 600 * 100;

  // Position the overlay wrapper
  s.wrap.style.left    = leftPct + '%';
  s.wrap.style.top     = topPct  + '%';
  s.wrap.style.width   = wPct    + '%';
  s.wrap.style.height  = hPct    + '%';
  s.wrap.style.display = '';

  // ── Size the overlay canvas at 2× for crisp rendering ────────────────────
  const cW = Math.max(10, Math.round(wW * wPct / 100 * 2));
  const cH = Math.max(10, Math.round(wH * hPct / 100 * 2));
  const canvas = s.canvas;
  canvas.width  = cW;
  canvas.height = cH;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.clearRect(0, 0, cW, cH);

  // ── Build source image into a temp canvas ─────────────────────────────────
  // For prints: draw the image. For labels: draw the text. For both: stack them.
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width  = cW;
  tmpCanvas.height = cH;
  const tmpCtx = tmpCanvas.getContext('2d', { alpha: true });

  const padding = 0.05;

  if (hasPrint && hasLabel) {
    // Print in top 62%, label in bottom 33%
    const imgAreaH = cH * 0.60;
    const lblAreaY = cH * 0.65;
    const lblAreaH = cH * 0.30;
    _renderImageToCtx(tmpCtx, s.img, 0, 0, cW, imgAreaH, padding);
    _renderLabelToCtx(tmpCtx, 0, lblAreaY, cW, lblAreaH);
  } else if (hasPrint) {
    _renderImageToCtx(tmpCtx, s.img, 0, 0, cW, cH, padding);
  } else {
    _renderLabelToCtx(tmpCtx, 0, cH * 0.15, cW, cH * 0.70);
  }

  const printData = tmpCtx.getImageData(0, 0, cW, cH);
  const pd = printData.data;

  // ── Fabric-distortion pipeline (ported from showcase.html) ────────────────
  const fd = fabricData[side];
  if (fd) {
    // Map overlay canvas pixel coords → fabric image pixel coords
    const fxStart = (leftPct / 100) * fd.w;
    const fyStart = (topPct  / 100) * fd.h;
    const fxScale = (wPct / 100) * fd.w / cW;
    const fyScale = (hPct / 100) * fd.h / cH;

    const DISP_STRENGTH   = 3.5 * EMBROIDERY_BLEND;
    const SHADE_INTENSITY = 0.35 * EMBROIDERY_BLEND;
    const TEXTURE_STRENGTH = 0.15 * EMBROIDERY_BLEND;

    const outData = ctx.createImageData(cW, cH);
    const od = outData.data;

    for (let cy = 0; cy < cH; cy++) {
      for (let cx = 0; cx < cW; cx++) {
        const fx = Math.round(fxStart + cx * fxScale);
        const fy = Math.round(fyStart + cy * fyScale);
        const canvasIdx = (cy * cW + cx) * 4;

        if (fx < 1 || fx >= fd.w - 1 || fy < 1 || fy >= fd.h - 1) {
          od[canvasIdx + 3] = 0; continue;
        }
        const fabricIdx = fy * fd.w + fx;
        if (fd.mask[fabricIdx] === 0) { od[canvasIdx + 3] = 0; continue; }

        // Fold displacement
        const dispX = fd.dx[fabricIdx] * DISP_STRENGTH / fxScale;
        const dispY = fd.dy[fabricIdx] * DISP_STRENGTH / fyScale;
        let srcX = Math.max(0, Math.min(cW - 1, cx - dispX));
        let srcY = Math.max(0, Math.min(cH - 1, cy - dispY));

        // Bilinear sample
        const sx0 = Math.floor(srcX), sy0 = Math.floor(srcY);
        const sx1 = Math.min(sx0+1, cW-1), sy1 = Math.min(sy0+1, cH-1);
        const fx1 = srcX-sx0, fy1 = srcY-sy0;
        const fx0 = 1-fx1,    fy0 = 1-fy1;
        const i00=(sy0*cW+sx0)*4, i10=(sy0*cW+sx1)*4;
        const i01=(sy1*cW+sx0)*4, i11=(sy1*cW+sx1)*4;

        let pr = pd[i00]*fx0*fy0 + pd[i10]*fx1*fy0 + pd[i01]*fx0*fy1 + pd[i11]*fx1*fy1;
        let pg = pd[i00+1]*fx0*fy0 + pd[i10+1]*fx1*fy0 + pd[i01+1]*fx0*fy1 + pd[i11+1]*fx1*fy1;
        let pb = pd[i00+2]*fx0*fy0 + pd[i10+2]*fx1*fy0 + pd[i01+2]*fx0*fy1 + pd[i11+2]*fx1*fy1;
        let pa = pd[i00+3]*fx0*fy0 + pd[i10+3]*fx1*fy0 + pd[i01+3]*fx0*fy1 + pd[i11+3]*fx1*fy1;

        if (pa < 1) { od[canvasIdx+3] = 0; continue; }

        // Highlight & shadow
        const fabLum = fd.lum[fabricIdx];
        const lumDev = fabLum - fd.meanLum;
        let shadeMultiplier = lumDev > 0
          ? 1.0 + lumDev * SHADE_INTENSITY * 2.5
          : 1.0 + lumDev * SHADE_INTENSITY * 3.0;
        shadeMultiplier = Math.max(0.5, Math.min(1.5, shadeMultiplier));

        const textureMod = 1.0 + (fabLum - fd.meanLum) * TEXTURE_STRENGTH * 2.0;
        const combined   = shadeMultiplier * textureMod;

        pr = Math.max(0, Math.min(255, pr * combined));
        pg = Math.max(0, Math.min(255, pg * combined));
        pb = Math.max(0, Math.min(255, pb * combined));
        pa = pa * (1.0 - EMBROIDERY_BLEND * 0.12);

        // Edge feathering
        let edgeFade = 1.0;
        for (let ey = -2; ey <= 2; ey++) {
          for (let ex = -2; ex <= 2; ex++) {
            const nfy = fy+ey, nfx = fx+ex;
            if (nfy >= 0 && nfy < fd.h && nfx >= 0 && nfx < fd.w) {
              if (fd.mask[nfy * fd.w + nfx] === 0) {
                edgeFade = Math.min(edgeFade, Math.sqrt(ex*ex+ey*ey) / 2.5);
              }
            }
          }
        }
        pa *= Math.max(0, edgeFade);

        od[canvasIdx]   = pr; od[canvasIdx+1] = pg;
        od[canvasIdx+2] = pb; od[canvasIdx+3] = pa;
      }
    }
    ctx.putImageData(outData, 0, 0);

  } else {
    // Fallback: simple draw when fabric data not yet ready
    ctx.drawImage(tmpCanvas, 0, 0);
    const imageData = ctx.getImageData(0, 0, cW, cH);
    const data = imageData.data;
    const brightness = 0.98 - EMBROIDERY_BLEND * 0.28;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] > 0) {
        data[i]   *= brightness;
        data[i+1] *= brightness;
        data[i+2] *= brightness;
        data[i+3]  = data[i+3] * (1 - EMBROIDERY_BLEND * 0.18);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  canvas.style.opacity = String(0.97 - EMBROIDERY_BLEND * 0.08);
}

// Draw a print image into a region of tmpCtx, respecting aspect ratio + padding
function _renderImageToCtx(tmpCtx, img, x, y, w, h, padding = 0.05) {
  if (!img) return;
  const pw = w * (1 - padding * 2);
  const ph = h * (1 - padding * 2);
  const ir = img.naturalWidth / img.naturalHeight;
  const br = pw / ph;
  let dw, dh;
  if (ir > br) { dw = pw; dh = pw / ir; }
  else         { dh = ph; dw = ph * ir; }
  tmpCtx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Draw a label text into a region of tmpCtx
function _renderLabelToCtx(tmpCtx, x, y, w, h) {
  const text  = (document.getElementById('customLabelInput')?.value || '').trim().toUpperCase();
  if (!text) return;
  const color = document.getElementById('customLabelColor')?.value || '#ffffff';
  const maxWidth = w * 0.9; // leave 10% margin
  const sz = Math.min(h * 0.80, maxWidth / Math.max(text.length, 1) * 1.5);
  tmpCtx.save();
  tmpCtx.font          = `900 ${sz}px "Arial Black", Arial, sans-serif`;
  tmpCtx.textAlign     = 'center';
  tmpCtx.textBaseline  = 'middle';
  tmpCtx.strokeStyle   = color === '#ffffff' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.5)';
  tmpCtx.lineWidth     = sz * 0.09;
  tmpCtx.lineJoin      = 'round';
  tmpCtx.strokeText(text, x + w / 2, y + h / 2);
  tmpCtx.fillStyle = color;
  tmpCtx.fillText(text, x + w / 2, y + h / 2);
  tmpCtx.restore();
}


function paintFallbackCanvas(side) {
  const ids = { front: 'tshirt-front', side: 'tshirt-side', back: 'tshirt-back', 'sleeve-left': 'tshirt-sleeve-left', 'sleeve-right': 'tshirt-sleeve-right' };
  const canvas = document.getElementById(ids[side] || 'tshirt-front');
  if (!canvas) return;

  const W = 600, H = 600;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background — transparent so the dark stage shows through
  ctx.clearRect(0, 0, W, H);

  const col = (typeof selectedColor !== 'undefined' && selectedColor) ? selectedColor : '#ffffff';

  if (typeof productType !== 'undefined' && productType === 'bucket') {
    // ── Bob / Bucket hat silhouette ─────────────────────────────────
    ctx.save();
    // Brim (flat circle)
    ctx.beginPath();
    ctx.ellipse(300, 440, 230, 55, 0, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Crown (rounded dome)
    ctx.beginPath();
    ctx.moveTo(100, 410);
    ctx.bezierCurveTo(80, 250, 130, 100, 300, 90);
    ctx.bezierCurveTo(470, 100, 520, 250, 500, 410);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  } else {
    // ── Cap silhouette ───────────────────────────────────────────────
    ctx.save();
    // Crown
    ctx.beginPath();
    ctx.moveTo(100, 360);
    ctx.bezierCurveTo(80, 180, 160, 80, 300, 70);
    ctx.bezierCurveTo(440, 80, 500, 180, 510, 360);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Visor / brim
    ctx.beginPath();
    ctx.moveTo(100, 360);
    ctx.bezierCurveTo(80, 375, 60, 390, 50, 410);
    ctx.bezierCurveTo(80, 430, 200, 445, 305, 440);
    ctx.bezierCurveTo(200, 435, 110, 410, 110, 390);
    ctx.bezierCurveTo(115, 375, 120, 368, 130, 365);
    ctx.fillStyle = _shadedColor(col, -0.10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Sweatband line
    ctx.beginPath();
    ctx.moveTo(100, 360);
    ctx.bezierCurveTo(200, 375, 400, 378, 510, 360);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Front panel stitching lines (subtle)
    ctx.beginPath();
    ctx.moveTo(300, 70); ctx.lineTo(300, 355);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  // Side label if no mockup
  const label = side === 'front' ? 'Devant' : side === 'side' ? 'Côté' : 'Dos';
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.font = 'bold 18px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 300, 540);
  ctx.font = '13px DM Sans, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillText('Uploadez un mockup dans les Paramètres', 300, 565);
  scheduleRender();
}

function _shadedColor(hex, factor) {
  try {
    let r = parseInt(hex.slice(1,3), 16);
    let g = parseInt(hex.slice(3,5), 16);
    let b = parseInt(hex.slice(5,7), 16);
    r = Math.max(0, Math.min(255, Math.round(r * (1 + factor))));
    g = Math.max(0, Math.min(255, Math.round(g * (1 + factor))));
    b = Math.max(0, Math.min(255, Math.round(b * (1 + factor))));
    return `rgb(${r},${g},${b})`;
  } catch(e) { return hex; }
}


const COLOR_NAMES = {'#ffffff':'Blanc','#1a1a1a':'Noir','#e63946':'Rouge','#457b9d':'Bleu','#2a9d8f':'Vert','#f4a261':'Orange'};

let selectedColor = '#ffffff';

function renderColorOptions(colors) {
  const row = document.getElementById('colorRow');
  if (!row) return;
  row.innerHTML = colors.map((c,i) => `<button class="color-swatch${i===0?' selected':''}" style="background:${c}" data-color="${c}" title="${COLOR_NAMES[c]||c}"></button>`).join('');
  selectedColor = colors[0];
  if (window.setShirtColor) window.setShirtColor(selectedColor);
  updateShirtImagesForColor(selectedColor);
}

document.getElementById('colorRow')?.addEventListener('click', e => {
  const btn = e.target.closest('.color-swatch');
  if (!btn) return;
  selectedColor = btn.dataset.color;
  document.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('selected', b===btn));
  if (window.setShirtColor) window.setShirtColor(selectedColor);
  updateShirtImagesForColor(selectedColor);
});

let _renderRAF = null;

// ============================================================
//  DRAG & RESIZE  — per-side interactive positioning
// ============================================================
function initDraggable(side) {
  const s = sides[side];
  if (!s || !s.wrap) return;

  // Resize handle
  const handle = document.createElement('div');
  handle.className = 'design-resize-handle';
  handle.textContent = '↘';
  handle.title = 'Redimensionner';
  s.wrap.appendChild(handle);

  let mode = null;   // 'drag' | 'resize'
  let startX, startY, snapXPct, snapYPct, snapWPct, snapHPct;

  function getParentRect() {
    return (s.wrap.parentElement || document.body).getBoundingClientRect();
  }

  function onStart(e, isResize) {
    e.stopPropagation();
    const pt = e.touches ? e.touches[0] : e;
    mode = isResize ? 'resize' : 'drag';
    startX = pt.clientX; startY = pt.clientY;
    snapXPct = designState[side].xPct;
    snapYPct = designState[side].yPct;
    snapWPct = designState[side].wPct;
    snapHPct = designState[side].hPct;
    if (!isResize) s.wrap.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onMove(e) {
    if (!mode) return;
    const pt = e.touches ? e.touches[0] : e;
    const pr = getParentRect();
    const dx = (pt.clientX - startX) / pr.width  * 100;
    const dy = (pt.clientY - startY) / pr.height * 100;
    const ds = designState[side];
    if (mode === 'drag') {
      ds.xPct = Math.max(0, Math.min(95 - ds.wPct, snapXPct + dx));
      ds.yPct = Math.max(0, Math.min(95 - ds.hPct, snapYPct + dy));
    } else {
      ds.wPct = Math.max(5, Math.min(90, snapWPct + dx));
      ds.hPct = Math.max(5, Math.min(90, snapHPct + dy));
      // Keep centre-aligned as user resizes
      ds.xPct = Math.max(0, snapXPct - (ds.wPct - snapWPct)/2);
      ds.yPct = Math.max(0, snapYPct - (ds.hPct - snapHPct)/2);
      // Sync slider
      const slider = document.getElementById('scaleSlider');
      if (slider) {
        slider.value = Math.round(ds.wPct);
        document.getElementById('scaleDisplay').textContent = Math.round(ds.wPct) + '%';
        updateSliderBg(slider);
      }
    }
    renderDesign(side);
    e.preventDefault();
  }

  function onEnd() {
    if (mode === 'drag') s.wrap.style.cursor = 'grab';
    mode = null;
  }

  // Mouse
  s.wrap.addEventListener('mousedown',   e => onStart(e, false));
  handle.addEventListener('mousedown',   e => onStart(e, true));
  document.addEventListener('mousemove', e => { if (mode) onMove(e); });
  document.addEventListener('mouseup',   onEnd);

  // Touch
  s.wrap.addEventListener('touchstart',  e => onStart(e, false), { passive: false });
  handle.addEventListener('touchstart',  e => onStart(e, true),  { passive: false });
  document.addEventListener('touchmove', e => { if (mode) onMove(e); }, { passive: false });
  document.addEventListener('touchend',  onEnd);
}

function renderAllDesigns() {
  ['front', 'side', 'back'].forEach(s => renderDesign(s));
}

function scheduleRender() {
  if (_renderRAF) return;   // deduplicate within the same frame
  _renderRAF = requestAnimationFrame(() => {
    _renderRAF = null;
    // Overlay designs on each side (the shirt base is drawn by recolorShirt / paintFallbackCanvas
    // which are called separately when mockup images load — no need to call here)
    renderAllDesigns();
    // Sync 3D overlay
    if (window.setPrintTransform) {
      window.setPrintTransform({ scale: 1.0, preset: activeZoneId, blend: EMBROIDERY_BLEND });
    }
  });
}

function updateAdminUI() {
  const btn = document.getElementById('adminToggleBtn');
  if (!btn) return;
  if (currentUser) {
    btn.textContent = '⚙●';
    btn.style.color = '#22c55e';
    btn.style.opacity = '0.5';
  } else {
    btn.textContent = '⚙';
    btn.style.color = '#1a1a1a';
    btn.style.opacity = '0.15';
  }
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
  list.innerHTML = `<p style="color:#666;text-align:center;padding:2rem">Chargement...</p>`;
  try {
    const { data, error } = await sbClient.from(PRINTS_TABLE).select('*').order('id', { ascending: true });
    if (error) throw error;
    renderAdminPrintList(data || []);
  } catch(e) {
    list.innerHTML = `<p style="color:#f87171;text-align:center;padding:2rem">Table non configurée.</p>`;
  }
}

let adminPrintsData = []; 

function renderAdminPrintList(items) {
  adminPrintsData = items;
  const list = document.getElementById('adminPrintList');
  if (!items.length) {
    list.innerHTML = `<div style="text-align:center;padding:2.5rem;color:#555">
      <div style="font-size:2.2rem;margin-bottom:0.8rem">🎨</div>
      <p>Aucun imprimé.</p>
    </div>`;
    return;
  }
  list.innerHTML = items.map(p => {
    const price = p.price != null ? p.price : 18000;
    const stock = p.stock != null ? p.stock : 100;
    const colors = p.colors || [];
    const colorDots = colors.map(c => `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${c};border:1px solid #555;margin-right:2px"></span>`).join('');
    return `
    <div class="admin-print-item">
      <div class="admin-print-thumb">${p.image_url ? `<img src="${p.image_url}" alt="${p.name}">` : '🎨'}</div>
      <div class="admin-print-meta">
        <h4>${p.name}</h4>
        <p>${p.category || '—'} • ${p.active ? 'Actif' : 'Masqué'}</p>
        <p style="margin-top:0.3rem">
          <strong style="color:white">${fmt(price)}</strong>
          &nbsp;•&nbsp; Stock: ${stock}
        </p>
        <p style="margin-top:0.3rem">${colorDots}</p>
      </div>
      <div class="admin-print-actions">
        <button class="btn-edit" onclick="editPrint(${p.id})">✏ Modifier</button>
        <button class="${p.active ? 'btn-toggle-active' : 'btn-toggle-inactive'}" onclick="togglePrintActive(${p.id}, ${!p.active})">${p.active ? '✓ Actif' : '○ Masqué'}</button>
        <button class="btn-del-print" onclick="deletePrint(${p.id})">🗑</button>
      </div>
    </div>`;
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
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `prints/${filename}`;
    const { error } = await sbClient.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: urlData } = sbClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    pendingPrintImage = urlData.publicUrl;
    slot.innerHTML = `<img src="${pendingPrintImage}"><div class="upload-progress" id="printUploadProgress"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadPrintImage(event)">`;
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
  if (!name) { showToast('Champ requis', 'Veuillez saisir un nom pour la broderie.', '#f59e0b'); return; }
  if (!pendingPrintImage) { showToast('Image requise', 'Veuillez uploader une image pour la broderie.', '#f59e0b'); return; }
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
    showToast('Enregistré! ✓', `"${name}" ${editId ? 'mis à jour' : 'ajouté'}.`);
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
  slot.innerHTML = pendingPrintImage ? `<img src="${pendingPrintImage}"><div class="upload-progress" id="printUploadProgress"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadPrintImage(event)">` : '';
  showAdminTab('add', document.querySelectorAll('.admin-tab')[1]);
}

function renderAdminColorCheckboxes(selected = []) {
  const row = document.getElementById('adminColorRow');
  if(!row) return;
  row.innerHTML = globalSettings.global_colors.map(c => `
    <label class="admin-check-swatch" data-color="${c}" style="background:${c}">
      <input type="checkbox" value="${c}" ${selected.includes(c) ? 'checked' : ''}><span class="check-mark">✓</span>
    </label>
  `).join('');
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

let pendingColorMockups = [];

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
  
  container.innerHTML = pendingColorMockups.map((m, i) => `
    <div style="background:#111; border:1px solid #333; padding:1rem; border-radius:8px; margin-bottom:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <div style="width:30px; height:30px; background:${m.hex}; border-radius:4px; border:1px solid #444;"></div>
          <strong style="color:#eee; font-family:monospace">${m.hex}</strong>
        </div>
        <button class="btn-cancel-login" style="padding:0.3rem 0.6rem; font-size:0.8rem;" onclick="removeColorMockup(${i})">Supprimer</button>
      </div>
      
      <h4 style="margin-bottom:0.5rem; color:#888; font-size:0.9rem;">Casquette</h4>
      <div class="admin-grid" style="grid-template-columns: 1fr 1fr 1fr; gap:1rem; margin-bottom:1.5rem">
        <div>
          <label style="font-size:0.8rem">Devant</label>
          <div class="upload-slot" id="slot_cap_front_${i}" style="height:80px; min-height:80px;">
            ${m.cap_front ? '<img src="' + m.cap_front + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_cap_front_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'cap_front\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_cap_front_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'cap_front\')">'}
          </div>
        </div>
        <div>
          <label style="font-size:0.8rem">Côté</label>
          <div class="upload-slot" id="slot_cap_side_${i}" style="height:80px; min-height:80px;">
            ${m.cap_side ? '<img src="' + m.cap_side + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_cap_side_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'cap_side\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_cap_side_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'cap_side\')">'}
          </div>
        </div>
        <div>
          <label style="font-size:0.8rem">Dos</label>
          <div class="upload-slot" id="slot_cap_back_${i}" style="height:80px; min-height:80px;">
            ${m.cap_back ? '<img src="' + m.cap_back + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_cap_back_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'cap_back\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_cap_back_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'cap_back\')">'}
          </div>
        </div>
      </div>

      <h4 style="margin-bottom:0.5rem; color:#888; font-size:0.9rem;">Bob</h4>
      <div class="admin-grid" style="grid-template-columns: 1fr 1fr 1fr; gap:1rem;">
        <div>
          <label style="font-size:0.8rem">Devant</label>
          <div class="upload-slot" id="slot_bucket_front_${i}" style="height:80px; min-height:80px;">
            ${m.bucket_front ? '<img src="' + m.bucket_front + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_bucket_front_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'bucket_front\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_bucket_front_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'bucket_front\')">'}
          </div>
        </div>
        <div>
          <label style="font-size:0.8rem">Côté</label>
          <div class="upload-slot" id="slot_bucket_side_${i}" style="height:80px; min-height:80px;">
            ${m.bucket_side ? '<img src="' + m.bucket_side + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_bucket_side_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'bucket_side\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_bucket_side_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'bucket_side\')">'}
          </div>
        </div>
        <div>
          <label style="font-size:0.8rem">Dos</label>
          <div class="upload-slot" id="slot_bucket_back_${i}" style="height:80px; min-height:80px;">
            ${m.bucket_back ? '<img src="' + m.bucket_back + '" style="height:100%; width:100%; object-fit:contain"><div class="upload-progress" id="prog_bucket_back_' + i + '"></div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'bucket_back\')">' : '<div class="upload-slot-icon" style="font-size:1.2rem">📷</div><div class="upload-progress" id="prog_bucket_back_' + i + '">⟳ Upload...</div><input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="uploadHeadwearMockup(event, ' + i + ', \'bucket_back\')">'}
          </div>
        </div>
      </div>
    </div>
  `).join('');
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
  const prog = document.getElementById(`prog_${key}_${index}`);
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
  // If no color mockups loaded yet, just paint fallback canvases
  if (!globalSettings.color_mockups || !globalSettings.color_mockups.length) {
    paintFallbackCanvas('front');
    paintFallbackCanvas('side');
    paintFallbackCanvas('back');
    return;
  }
  const match = globalSettings.color_mockups.find(m => m.hex && m.hex.toLowerCase() === hex.toLowerCase())
              || globalSettings.color_mockups[0];
  if (!match) { paintFallbackCanvas('front'); paintFallbackCanvas('side'); paintFallbackCanvas('back'); return; }

  if (productType === 'cap') {
    SHIRT_IMAGES.front = match.cap_front    || null;
    SHIRT_IMAGES.side  = match.cap_side     || null;
    SHIRT_IMAGES.back  = match.cap_back     || null;
  } else {
    SHIRT_IMAGES.front = match.bucket_front || null;
    SHIRT_IMAGES.side  = match.bucket_side  || null;
    SHIRT_IMAGES.back  = match.bucket_back  || null;
  }
  loadShirtImages();
}


function buildOrderItem() {
  if (!selectedPrint) return null;
  const price = selectedPrint.price != null ? selectedPrint.price : globalSettings.headwearBasePrice;
  return {
    key: `showcase-headwear-${selectedPrint.id}-${selectedColor}-${selectedSize}-${printPlacement}-${printSize}`,
    id: `showcase-${selectedPrint.id}`,
    name: `${productType === 'cap' ? 'Casquette' : 'Bob'} OVRG — ${selectedPrint.name}`,
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
  showToast('Ajouté au panier! 🛍', `${item.name} ajouté.`);
}

function orderViaWhatsApp() {
  const item = buildOrderItem();
  if (!item) { showToast('Choisissez un imprimé', "Sélectionnez d'abord un imprimé.", '#f59e0b'); return; }
  const c = item.customization;
  const msg = `Bonjour OVRG! Je voudrais commander une ${productType === 'cap' ? 'casquette' : 'bob'}:\n\n`+
              `🎨 Imprimé: ${selectedPrint.name}\n`+
              `👕 Couleur: ${COLOR_NAMES[selectedColor] || selectedColor}\n`+
              `📏 Taille: ${item.size}\n`+
              `📍 Position: ${c.placementLabel}\n`+
              `💰 Prix: ${fmt(item.price)}`;
  window.open(`https://wa.me/2250799108108?text=${encodeURIComponent(msg)}`, '_blank');
}

function goToCheckout() {
  const item = buildOrderItem();
  if (!item) { showToast('Choisissez un imprimé', "Sélectionnez d'abord un imprimé.", '#f59e0b'); return; }
  addToCartShowcase();
  setTimeout(() => { window.location.href = '/#catalogue'; }, 150);
}


// ============================================================
//  UTILS
// ============================================================
function fmt(n) { return Number(n).toLocaleString('fr-FR') + ' FCFA'; }

function showToast(title, body, borderColor='#22c55e') {
  const t = document.getElementById('toast');
  t.style.borderLeftColor = borderColor;
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastBody').textContent = body;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 4500);
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Wire up the sides overlay canvases now that the DOM is ready
  sides.front.wrap   = document.getElementById('canvas-front');
  sides.front.canvas = document.querySelector('#canvas-front canvas');
  sides.side.wrap    = document.getElementById('canvas-side');
  sides.side.canvas  = document.querySelector('#canvas-side canvas');
  sides.back.wrap    = document.getElementById('canvas-back');
  sides.back.canvas  = document.querySelector('#canvas-back canvas');

  // Init zone buttons
  renderZoneButtons();

  // Init scale slider background
  const slider = document.getElementById('scaleSlider');
  if (slider) updateSliderBg(slider);

  // Retry initSupabase a few times in case the CDN script is still loading
  let ok = initSupabase();
  let tries = 0;
  while (!ok && tries < 10) {
    await new Promise(r => setTimeout(r, 300));
    ok = initSupabase();
    tries++;
  }
  if (!ok) console.error('Supabase indisponible après plusieurs tentatives.');

  if (sbClient) await loadSettings();

  // After settings load, apply mockups for the default color
  updateShirtImagesForColor(selectedColor);
  await loadPrints();

  // If no print is selected, initialize the color selector with global colors
  if (!selectedPrint) renderColorOptions(globalSettings.global_colors);

  if (sbClient) {
    try {
      const { data: { session }, error } = await sbClient.auth.getSession();
      if (error && (error.message||'').includes('Refresh Token')) {
        await sbClient.auth.signOut();
        currentUser = null;
      } else {
        currentUser = session?.user ?? null;
      }
      updateAdminUI();
    } catch(e) {
      console.warn('Session check failed:', e);
    }
  }
});
