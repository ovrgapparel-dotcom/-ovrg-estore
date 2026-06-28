const fs = require('fs');
let html = fs.readFileSync('headwear.html', 'utf8');

// 1. Update Placement Buttons
const oldPlacement = `<div class="size-row" id="placementRow">
          <button class="size-btn selected" data-placement="front" onclick="setPlacement('front')">Devant</button>
          <button class="size-btn" data-placement="side" onclick="setPlacement('side')">Sur le côté</button>
        </div>`;
const newPlacement = `<div class="size-row" id="placementRow">
          <button class="size-btn" data-placement="left" onclick="setPlacement('left')">Gauche</button>
          <button class="size-btn selected" data-placement="center" onclick="setPlacement('center')">Centre</button>
          <button class="size-btn" data-placement="right" onclick="setPlacement('right')">Droite</button>
          <button class="size-btn" data-placement="top-center" onclick="setPlacement('top-center')">Haut Centre</button>
        </div>`;
html = html.replace(oldPlacement, newPlacement);

// 2. We need to inject PRESET_CONFIGS and renderDesign.
// In headwear.html, the global variables are defined at the top of the <script> block.
const globalVarsSearch = `let productType = 'cap';`;
const globalVarsReplace = `let productType = 'cap';
const PRESET_CONFIGS = {
  'left': { w: 15, h: 15, top: 45, left: 25 },
  'center': { w: 20, h: 20, top: 40, left: 40 },
  'right': { w: 15, h: 15, top: 45, left: 60 },
  'top-center': { w: 10, h: 10, top: 25, left: 45 }
};
`;
if (!html.includes('PRESET_CONFIGS = {')) {
  html = html.replace(globalVarsSearch, globalVarsReplace);
}

// Ensure printPreset defaults to 'center'
html = html.replace(/let printPlacement\s*=\s*'front';/, "let printPlacement = 'center';");

// Check if renderDesign is already there
if (!html.includes('function renderDesign')) {
  // Let's inject renderDesign right before scheduleRender
  const scheduleRenderSearch = `function scheduleRender() {`;
  const renderDesignStr = `
// ============================================================
//  CANVAS RENDER — placement preset + scale + fabric blend
// ============================================================
function renderDesign(side) {
  const s = sides[side];
  const wrapper = document.getElementById(side + '-view');
  if (!s || !s.img) { s?.wrap && (s.wrap.style.display = 'none'); return; }

  const rect = wrapper.getBoundingClientRect();
  const wW = rect.width, wH = rect.height;
  if (wW < 10 || wH < 10) { requestAnimationFrame(() => renderDesign(side)); return; }

  const cfg = PRESET_CONFIGS[printPlacement] || PRESET_CONFIGS.center;

  // Apply user scale around the preset's box center
  const w = cfg.w * printScale;
  const h = cfg.h * printScale;
  const top = cfg.top + (cfg.h - h) / 2;
  const left = cfg.left + (cfg.w - w) / 2;

  s.wrap.style.top = top + '%';
  s.wrap.style.left = left + '%';
  s.wrap.style.width = w + '%';
  s.wrap.style.height = h + '%';
  s.wrap.style.display = '';

  const cW = Math.max(10, Math.round(wW * w / 100 * 2));
  const cH = Math.max(10, Math.round(wH * h / 100 * 2));
  const canvas = s.canvas;
  canvas.width = cW; canvas.height = cH;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.clearRect(0,0,cW,cH);

  const padding = 0.06;
  const dw = cW * (1 - padding*2);
  const dh = cH * (1 - padding*2);
  const imgRatio = s.img.naturalWidth / s.img.naturalHeight;
  const boxRatio = dw / dh;
  let drawW, drawH;
  if (imgRatio > boxRatio) { drawW = dw; drawH = dw / imgRatio; }
  else { drawH = dh; drawW = dh * imgRatio; }

  // ── STEP 1: Draw the print to a temporary buffer ──
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = cW; tmpCanvas.height = cH;
  const tmpCtx = tmpCanvas.getContext('2d', { alpha: true });
  tmpCtx.drawImage(s.img, (cW-drawW)/2, (cH-drawH)/2, drawW, drawH);
  const printData = tmpCtx.getImageData(0, 0, cW, cH);
  const pd = printData.data;

  // ── STEP 2: Fabric-aware rendering ──
  const fd = fabricData[side];
  if (fd) {
    const fxStart = (left / 100) * fd.w;
    const fyStart = (top / 100) * fd.h;
    const fxScale = (w / 100) * fd.w / cW;
    const fyScale = (h / 100) * fd.h / cH;

    const DISP_STRENGTH = 3.5;
    const SHADE_INTENSITY = 0.35;
    const TEXTURE_STRENGTH = 0.15;

    const outData = ctx.createImageData(cW, cH);
    const od = outData.data;

    for (let cy = 0; cy < cH; cy++) {
      for (let cx = 0; cx < cW; cx++) {
        const fx = Math.round(fxStart + cx * fxScale);
        const fy = Math.round(fyStart + cy * fyScale);

        const canvasIdx = (cy * cW + cx) * 4;

        if (fx < 1 || fx >= fd.w - 1 || fy < 1 || fy >= fd.h - 1) {
          od[canvasIdx + 3] = 0;
          continue;
        }

        const fabricIdx = fy * fd.w + fx;

        if (fd.mask[fabricIdx] === 0) {
          od[canvasIdx + 3] = 0;
          continue;
        }

        const dispX = fd.dx[fabricIdx] * DISP_STRENGTH / fxScale;
        const dispY = fd.dy[fabricIdx] * DISP_STRENGTH / fyScale;

        const srcX = Math.round(cx - dispX);
        const srcY = Math.round(cy - dispY);

        if (srcX >= 0 && srcX < cW && srcY >= 0 && srcY < cH) {
          const srcIdx = (srcY * cW + srcX) * 4;
          const alpha = pd[srcIdx + 3];

          if (alpha > 5) {
            const lum = fd.lum[fabricIdx];
            const L = lum / 255;
            const shadeMult = 1 + (L - 0.5) * SHADE_INTENSITY * 2;
            const detailMod = (L - 0.5) * TEXTURE_STRENGTH * 255;

            let r = pd[srcIdx] * shadeMult + detailMod;
            let g = pd[srcIdx+1] * shadeMult + detailMod;
            let b = pd[srcIdx+2] * shadeMult + detailMod;

            od[canvasIdx]   = Math.max(0, Math.min(255, r));
            od[canvasIdx+1] = Math.max(0, Math.min(255, g));
            od[canvasIdx+2] = Math.max(0, Math.min(255, b));
            od[canvasIdx+3] = alpha;
          } else {
            od[canvasIdx+3] = 0;
          }
        }
      }
    }
    ctx.putImageData(outData, 0, 0);
  } else {
    // Fallback if no fabric data
    ctx.drawImage(tmpCanvas, 0, 0);
  }
}

function renderAllDesigns() {
  ['front','side','back'].forEach(s => renderDesign(s));
}

`;
  html = html.replace(scheduleRenderSearch, renderDesignStr + scheduleRenderSearch);
}

// Modify scheduleRender to call renderAllDesigns
const oldSchedule = `function scheduleRender() {
  if (_renderRAF) return;
  _renderRAF = requestAnimationFrame(() => {
    _renderRAF = null;
    if (window.setPrintTransform) {
      window.setPrintTransform({ scale: printScale, preset: printPlacement, blend: 1.0 });
    }
  });
}`;
const newSchedule = `function scheduleRender() {
  if (_renderRAF) return;
  _renderRAF = requestAnimationFrame(() => {
    _renderRAF = null;
    renderAllDesigns();
    if (window.setPrintTransform) {
      window.setPrintTransform({ scale: printScale, preset: printPlacement, blend: 1.0 });
    }
  });
}`;
if (html.includes(oldSchedule)) {
  html = html.replace(oldSchedule, newSchedule);
} else {
  // Try fallback string replace if exact indentation doesn't match
  html = html.replace(/function scheduleRender\(\) \{[\s\S]*?\}\s*\}\);\s*\}/, newSchedule);
}

// Ensure selectPrint calls scheduleRender to update the image when selected
const selectPrintOld = `if (window.applyPrintTexture) {
    window.applyPrintTexture(p.image_url || null);
  }

  renderPrintGrid();`;
const selectPrintNew = `if (window.applyPrintTexture) {
    window.applyPrintTexture(p.image_url || null);
  }

  // Load print image into sides.img for 2D overlays
  if (p.image_url) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = p.image_url;
    img.onload = () => {
      sides.front.img = img;
      sides.side.img = img;
      sides.back.img = img;
      scheduleRender();
    };
  } else {
    sides.front.img = null;
    sides.side.img = null;
    sides.back.img = null;
    scheduleRender();
  }

  renderPrintGrid();`;
html = html.replace(selectPrintOld, selectPrintNew);

// Make setPlacement accept the 4 values
html = html.replace(/function setPlacement\(p\) \{[\s\S]*?scheduleRender\(\);\s*\}/, `function setPlacement(p) {
  printPlacement = p;
  document.querySelectorAll('#placementRow .size-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.placement === p);
  });
  scheduleRender();
}`);

fs.writeFileSync('headwear.html', html);
console.log('headwear.html updated');
