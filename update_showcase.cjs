const fs = require('fs');

let code = fs.readFileSync('showcase.html', 'utf8');

// 1. Add CSS for tabs
const cssAdd = `
.gallery-tabs { display: flex; gap: 1rem; }
.gallery-tab { background: none; border: none; font-family: inherit; font-size: 1rem; color: #aaa; cursor: pointer; padding-bottom: 0.3rem; border-bottom: 2px solid transparent; transition: all 0.2s; font-weight: 600; }
.gallery-tab:hover { color: var(--dark); }
.gallery-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.zone-selector { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.zone-btn { background: #eee; border: 1px solid #ccc; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-weight: 600; color: #555; }
.zone-btn:hover { background: #e0e0e0; }
.zone-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
`;
code = code.replace('</style>', cssAdd + '\n</style>');

// 2. Replace the gallery HTML
const galleryRegex = /<div class="print-gallery">[\s\S]*?<div class="print-grid" id="printGrid">[\s\S]*?<\/div>[\s\S]*?<\/div>/;
const newGallery = `
    <div class="print-gallery">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding-bottom:0.5rem">
        <div class="zone-selector">
          <button class="zone-btn active" id="zoneFrontBtn" onclick="setActiveZone('front')">Devant</button>
          <button class="zone-btn" id="zoneBackBtn" onclick="setActiveZone('back')">Dos</button>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); margin-bottom:1rem; padding-bottom:0.5rem">
        <div class="gallery-tabs">
          <button class="gallery-tab active" id="tabPrints" onclick="setDesignTab('print')">🎨 Imprimés</button>
          <button class="gallery-tab" id="tabEmbroideries" onclick="setDesignTab('embroidery')">🧵 Broderies</button>
        </div>
        <span id="printCount" style="color:var(--gray);font-weight:400;font-size:0.85rem"></span>
      </div>
      <div class="print-grid" id="printGrid">
        <div class="print-thumb-none" style="grid-column:1/-1">Chargement…</div>
      </div>
    </div>
`;
code = code.replace(galleryRegex, newGallery);

// 3. Inject new multi-zone logic
const jsAdd = `
// ── MULTI-ZONE ENGINE ──
let activeDesignTab = 'print'; // 'print' or 'embroidery'
let activeZoneId = 'front';
window.zoneCustomizations = window.zoneCustomizations || {};

function setDesignTab(tab) {
  activeDesignTab = tab;
  document.getElementById('tabPrints').classList.toggle('active', tab === 'print');
  document.getElementById('tabEmbroideries').classList.toggle('active', tab === 'embroidery');
  renderPrintGrid();
}

function setActiveZone(zone) {
  activeZoneId = zone;
  document.getElementById('zoneFrontBtn').classList.toggle('active', zone === 'front');
  document.getElementById('zoneBackBtn').classList.toggle('active', zone === 'back');
  
  // Sync the 3D model view
  if (zone === 'front') {
    switchView('front');
    printPreset = 'center'; // reset preset for 3d viewer
  } else {
    switchView('back');
    printPreset = 'back-center';
  }
  
  updateZoneUI();
  renderPrintGrid();
}

function getDesignType(p) {
  if (p.design_type) return p.design_type;
  if (p.category && p.category.startsWith('Broderie')) return 'embroidery';
  return 'print';
}

function getFilteredPrints() {
  return prints.filter(p => getDesignType(p) === activeDesignTab);
}

// Override renderPrintGrid
function renderPrintGrid() {
  const grid = document.getElementById('printGrid');
  const filtered = getFilteredPrints();
  if (document.getElementById('printCount')) document.getElementById('printCount').textContent = \`(\${filtered.length})\`;
  if (!filtered.length) {
    grid.innerHTML = \`<div class="print-thumb-none" style="grid-column:1/-1">Aucun design disponible dans cette catégorie.</div>\`;
    return;
  }
  
  const currentConfig = window.zoneCustomizations[activeZoneId] || {};
  const activePrintId = currentConfig.print && currentConfig.print.id;

  grid.innerHTML = filtered.map(p => \`
    <div class="print-thumb\${activePrintId === p.id ? ' selected':''}" onclick='selectPrint(\${JSON.stringify(p).replace(/'/g,"&#39;")})'>
      \${p.image_url
        ? \`<img src="\${p.image_url}" alt="\${p.name}">\`
        : \`<div class="print-thumb-none">\${p.name}</div>\`}
      <span class="pname">\${p.name}</span>
    </div>\`).join('');
}

// Override selectPrint
function selectPrint(p) {
  if (!window.zoneCustomizations[activeZoneId]) {
    window.zoneCustomizations[activeZoneId] = {};
  }
  const config = window.zoneCustomizations[activeZoneId];
  
  if (config.print && config.print.id === p.id) {
    // Toggle off
    config.print = null;
    config.printUrl = null;
  } else {
    // Select
    config.print = p;
    config.printUrl = p.image_url || null;
    config.type = getDesignType(p);
  }
  
  if (!config.print) {
    delete window.zoneCustomizations[activeZoneId];
  }
  
  if (window.setZoneCustomization) {
    if (window.zoneCustomizations[activeZoneId]) {
      // Sync preset
      window.zoneCustomizations[activeZoneId].preset = printPreset;
      window.setZoneCustomization(activeZoneId, window.zoneCustomizations[activeZoneId]);
    } else {
      window.clearZoneCustomization(activeZoneId);
    }
  }

  // Set colors/sizes based on latest selection
  if (p && p.colors) renderColorOptions(p.colors.length ? p.colors : globalSettings.global_colors);
  if (p && p.sizes) renderSizeOptions(p.sizes.length ? p.sizes : ['S','M','L','XL','XXL']);

  updateZoneUI();
  updatePrice();
  renderPrintGrid();
  scheduleRender();
}

function updateZoneUI() {
  const config = window.zoneCustomizations[activeZoneId] || {};
  const hasPrint = !!config.print;
  const p = config.print;
  
  if (hasPrint) {
    const icon = config.type === 'embroidery' ? '🧵' : '🎨';
    const typeName = config.type === 'embroidery' ? 'Broderie' : 'Imprimé';
    document.getElementById('printInfo').innerHTML = \`<span>\${icon}</span> <span>\${typeName} (\${activeZoneId}) : <strong>\${p.name}</strong></span>\`;
  } else {
    document.getElementById('printInfo').innerHTML = \`<span>✨</span> <span>Aucun design sur cette zone</span>\`;
  }
  
  document.getElementById('noPrintMsg').style.display = hasPrint && !p.image_url ? 'block' : 'none';
  if (hasPrint && !p.image_url) document.getElementById('noPrintMsg').textContent = "Aperçu indisponible pour ce design.";
  
  document.getElementById('printCustomize').style.display = '';
  // hide old embroidery toggle
  const embSec = document.getElementById('embroiderySection');
  if (embSec) embSec.style.display = 'none'; 
}

// Override updatePrice for multi-zone
function updatePrice() {
  let total = SHOWCASE_PRICE; // base T-shirt price
  
  for (const zoneId in window.zoneCustomizations) {
    const config = window.zoneCustomizations[zoneId];
    if (config.print) {
      if (config.type === 'embroidery') {
        total += 9000;
      } else {
        // Only charge for print if price is different from 18000? 
        // Wait, standard T-shirt includes 1 print in the 18000 FCFA. 
        // If they have multiple zones, maybe charge extra?
        // Let's just add the print's price, and subtract base if it's the first one?
        // Actually, user said: jacket and hoodie share the same prints library.
        // T-shirt price logic: 18000 base.
        total += (config.print.price != null ? config.print.price : 10000) - 18000; 
        if (total < SHOWCASE_PRICE) total = SHOWCASE_PRICE; // ensure at least base
      }
    }
  }
  
  document.getElementById('priceMain').textContent = fmt(total);
}

// Intercept placement grid
document.getElementById('placementGrid').addEventListener('click', e => {
  const btn = e.target.closest('.placement-btn');
  if (!btn) return;
  printPreset = btn.dataset.preset;
  if (activeZoneId === 'back' && !printPreset.includes('back')) {
    printPreset = 'back-' + printPreset;
  }
  
  if (window.zoneCustomizations[activeZoneId]) {
    window.zoneCustomizations[activeZoneId].preset = printPreset;
    if (window.setZoneCustomization) {
      window.setZoneCustomization(activeZoneId, window.zoneCustomizations[activeZoneId]);
    }
  }
});

// Intercept scale
document.getElementById('printScale').addEventListener('input', e => {
  printScale = parseInt(e.target.value) / 100;
  if (window.zoneCustomizations[activeZoneId]) {
    window.zoneCustomizations[activeZoneId].scale = printScale;
    if (window.setZoneCustomization) {
      window.setZoneCustomization(activeZoneId, window.zoneCustomizations[activeZoneId]);
    }
  }
});

// Intercept scheduleRender for 2D canvas
let _scheduleRenderTimeout;
function scheduleRender() {
  cancelAnimationFrame(_scheduleRenderTimeout);
  _scheduleRenderTimeout = requestAnimationFrame(() => {
    sides.front.img = null;
    sides.back.img = null;
    
    const configFront = window.zoneCustomizations['front'];
    if (configFront && configFront.print && configFront.print.image_url) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = configFront.print.image_url;
      sides.front.img = img;
    }
    
    const configBack = window.zoneCustomizations['back'];
    if (configBack && configBack.print && configBack.print.image_url) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = configBack.print.image_url;
      sides.back.img = img;
    }
    
    renderDesign('front');
    renderDesign('back');
  });
}
`;

code = code.replace(/function renderPrintGrid\(\) \{[\s\S]*?function selectPrint\(p\) \{[\s\S]*?\n\}/, '/* replaced by update script */');

// Add the JS before the end of the script
code = code.replace('// ============================================================', jsAdd + '\n// ============================================================');


// Find the applyPrintTexture calls and remove them from old load paths
code = code.replace(/if \(window\.applyPrintTexture\) \{[\s\S]*?\}/g, '');

fs.writeFileSync('showcase.html', code);
console.log('showcase.html updated for multi-zone.');
