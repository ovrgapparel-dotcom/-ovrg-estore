const fs = require('fs');

let code = fs.readFileSync('outerwear.html', 'utf8');

// 1. Add CSS for tabs and multi-zone status
const cssAdd = `
.gallery-tabs { display: flex; gap: 1rem; }
.gallery-tab { background: none; border: none; font-family: inherit; font-size: 1rem; color: #aaa; cursor: pointer; padding-bottom: 0.3rem; border-bottom: 2px solid transparent; transition: all 0.2s; font-weight: 600; }
.gallery-tab:hover { color: var(--dark); }
.gallery-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.zone-tag { display: inline-block; font-size: 0.65rem; background: #eee; padding: 2px 6px; border-radius: 10px; margin-right: 4px; font-weight: 700; color: #555; text-transform: uppercase; }
`;
code = code.replace('</style>', cssAdd + '\n</style>');


// 2. Replace the gallery HTML
const galleryRegex = /<div class="print-gallery">[\s\S]*?<div class="print-grid" id="printGrid">[\s\S]*?<\/div>[\s\S]*?<\/div>/;
const newGallery = `
    <div class="print-gallery">
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
window.zoneCustomizations = window.zoneCustomizations || {};

function setDesignTab(tab) {
  activeDesignTab = tab;
  document.getElementById('tabPrints').classList.toggle('active', tab === 'print');
  document.getElementById('tabEmbroideries').classList.toggle('active', tab === 'embroidery');
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
  
  if (!config.print && !config.labelText) {
    delete window.zoneCustomizations[activeZoneId];
  }
  
  if (window.setZoneCustomization) {
    if (window.zoneCustomizations[activeZoneId]) {
      window.setZoneCustomization(activeZoneId, window.zoneCustomizations[activeZoneId]);
    } else {
      window.clearZoneCustomization(activeZoneId);
    }
  }

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
  
  document.getElementById('printCustomize').style.display = '';
  renderZoneButtons();
}

// Override updatePrice for multi-zone
function updatePrice() {
  let total = globalSettings.headwearBasePrice || 9000;
  
  // Surcharges per zone
  for (const zoneId in window.zoneCustomizations) {
    const config = window.zoneCustomizations[zoneId];
    if (config.print) {
      if (config.type === 'embroidery') {
        total += 9000;
      } else {
        total += (config.print.price != null ? config.print.price : 10000);
      }
    }
    if (config.labelText) {
      const chars = config.labelText.replace(/\\s/g, '').length;
      total += chars * 150;
    }
  }
  
  document.getElementById('priceMain').textContent = fmt(total);
}

// Intercept scheduleRender to draw all active prints on the 2D canvas side
const originalScheduleRender = scheduleRender;
scheduleRender = function() {
  // Clear side images
  sides.front.img = null;
  sides['sleeve-left'].img = null;
  sides['sleeve-right'].img = null;
  sides.back.img = null;
  
  // Find prints for current side
  const side = getZoneSide(activeZoneId); // well, 2D view only shows one side at a time based on activeZoneId
  // The 2D viewer in outerwear is very basic (only maps one image per side).
  // We'll just map the print of the active zone if it belongs to the current side.
  const config = window.zoneCustomizations[activeZoneId];
  if (config && config.print && config.print.image_url) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = config.print.image_url;
    sides[side].img = img; // Temporary assignment for the render
  }
  originalScheduleRender();
};

`;
code = code.replace(/function renderPrintGrid\(\) \{[\s\S]*?function selectPrint\(p\) \{[\s\S]*?\n\}/, '/* replaced by update script */');
code = code.replace('// ── DECORATION MODE', jsAdd + '\n// ── DECORATION MODE');

fs.writeFileSync('outerwear.html', code);
console.log('outerwear.html updated for multi-zone.');
