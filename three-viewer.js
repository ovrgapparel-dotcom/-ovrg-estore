import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

// ─── GLOBALS ────────────────────────────────────────────────────────────────
let scene, camera, renderer, controls;
let shirtMeshes = [];
let currentModelGroup = null;
let currentModelUrl   = null;

// T-shirt decal state
let printTexture   = null;
let decalMaterial  = null;
let targetDecalMeshes = [];
let decalMeshes = [];
let currentTransform = { scale: 0.5, preset: 'center', blend: 0 };

// Headwear overlay state (conformal decals)
let hwDecalMeshes  = [];
let hwOverlayMat   = null;   // THREE.MeshStandardMaterial
let _hwCanvas      = null;
let _hwPrintImg    = null;
let _hwLabelText   = '';
let _hwLabelColor  = '#ffffff';
let _hwScale       = 0.42;   // 0–1 fraction of model height
let _hwRotation    = 0;

const IS_HEADWEAR = window.location.pathname.toLowerCase().includes('headwear');
const IS_JEANS = window.location.pathname.toLowerCase().includes('jeans');
const IS_HOODIES = window.location.pathname.toLowerCase().includes('hoodies');
const IS_OUTERWEAR = IS_JEANS || IS_HOODIES;
const IS_MUG = window.location.pathname.toLowerCase().includes('mug');

// Dummy extension to satisfy GLTFLoader for KHR_materials_pbrSpecularGlossiness
class DummySpecularGlossinessExtension {
  constructor(parser) { this.name = 'KHR_materials_pbrSpecularGlossiness'; }
}

// ─── MODEL LOADER ────────────────────────────────────────────────────────────
window.load3DModel = function (modelUrl) {
  currentModelUrl = modelUrl;

  if (currentModelGroup) {
    currentModelGroup.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        [].concat(obj.material).forEach(m => m?.dispose());
      }
    });
    scene.remove(currentModelGroup);
    currentModelGroup = null;
    shirtMeshes = [];
    targetDecalMeshes = [];
    _clearDecals();
    window.clearAllZones();
  }

  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  gltfLoader.register(parser => new DummySpecularGlossinessExtension(parser));

  gltfLoader.load(modelUrl, (gltf) => {
    if (currentModelUrl !== modelUrl) return;   // stale load

    const model = gltf.scene || gltf.scenes[0];

    // Fix model orientation:
    // - Hoodie loads sideways with anatomical front at +X. Rotate -90° so +X → +Z (toward camera).
    // - Jacket (modern_denim_jacket.glb) already faces +Z correctly; no rotation needed.
    if (IS_HOODIES) {
      model.rotation.y = -Math.PI / 2;
    }
    model.updateMatrixWorld(true);

    // Normalise: centre and scale to height 2
    const rawBox  = new THREE.Box3().setFromObject(model);
    const centre  = rawBox.getCenter(new THREE.Vector3());
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const modelScore = rawSize.x + rawSize.y + rawSize.z;
    const s       = 2.0 / rawSize.y;
    model.scale.set(s, s, s);
    model.position.set(-centre.x * s, -centre.y * s - 0.3, -centre.z * s);
    scene.add(model);
    currentModelGroup = model;

    // Clone materials and force WHITE base colour
    // Find all large meshes (e.g., sleeves, panels) to apply decals to
    targetDecalMeshes = [];
    console.log("=== TRAVERSING MODEL MESHES ===");
    model.traverse((child) => {
      if (!child.isMesh) return;
      
      // Calculate physical scale/score to ignore stitches/buttons
      const childBox = new THREE.Box3().setFromObject(child);
      const childSize = childBox.getSize(new THREE.Vector3());
      const childScore = childSize.x + childSize.y + childSize.z;
      const isIncluded = childScore > modelScore * 0.01;
      
      console.log(`Mesh: name="${child.name}" | score=${childScore.toFixed(4)} (threshold=${(modelScore * 0.01).toFixed(4)}) | included=${isIncluded}`);

      if (isIncluded) {
        targetDecalMeshes.push(child);
      }

      child.material = [].concat(child.material).map(m => {
        const mc = m.clone();
        mc.color.set(0xffffff);
        mc.needsUpdate = true;
        return mc;
      });
      // unwrap single-element arrays back to plain material
      if (child.material.length === 1) child.material = child.material[0];
      shirtMeshes.push(child);
    });

    if (targetDecalMeshes.length === 0) {
      targetDecalMeshes = [...shirtMeshes];
    }

    // Apply pending colour
    const col = window._pendingColorHex || '#ffffff';
    window._pendingColorHex = col;
    window.setShirtColor(col);

    model.updateMatrixWorld(true);

    _rebuildAllDecals();
  }, undefined, (err) => {
    console.warn('3D model load error:', err);
  });
};

// ─── INIT ────────────────────────────────────────────────────────────────────
export function initThreeViewer() {
  const container = document.getElementById('threeContainer');
  if (!container) return;
  container.innerHTML = '';

  const W = container.clientWidth  || 400;
  const H = container.clientHeight || 500;

  scene    = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f2f2);

  camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0.1, 3.5);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping   = true;
  controls.dampingFactor   = 0.06;
  controls.minDistance     = 1.5;
  controls.maxDistance     = 6;
  controls.target.set(0, 0.05, 0);
  controls.autoRotate      = true;
  controls.autoRotateSpeed = 1.0;
  controls.addEventListener('start', () => { controls.autoRotate = false; });



  scene.add(new THREE.AmbientLight(0xffffff, 2.0));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.0);
  d1.position.set(1, 2, 3); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.4);
  d2.position.set(-2, 0, -2); scene.add(d2);

  const SUPABASE_MODEL_URL = 'https://mihpdlhbijlvbdcqvzdw.supabase.co/storage/v1/object/public/product-images/models';
  const startUrl = IS_HEADWEAR 
    ? `${SUPABASE_MODEL_URL}/cap.glb` 
    : (IS_HOODIES 
        ? `${SUPABASE_MODEL_URL}/hoodie.glb` 
        : (IS_JEANS 
            ? `${SUPABASE_MODEL_URL}/jacket.glb` 
            : '/scene.gltf'));
  window.load3DModel(startUrl);

  new ResizeObserver(_onResize).observe(container);

  (function loop() {
    requestAnimationFrame(loop);
    controls?.update();
    renderer?.render(scene, camera);
  })();

  // ── Drag-resize handle ──────────────────────────────────────────────────────
  // Added to document.body with fixed positioning so it sits above the 3D canvas
  // without fighting the OrbitControls pointer capture on renderer.domElement.
  const _existingHandle = document.getElementById('decalResizeHandle');
  if (_existingHandle) _existingHandle.remove();

  const handle = document.createElement('div');
  handle.id = 'decalResizeHandle';
  handle.title = 'Glisser ←→ pour redimensionner le décal';
  handle.textContent = '⇔ Taille';
  Object.assign(handle.style, {
    position: 'fixed',
    background: 'rgba(255,107,53,0.90)',
    color: '#fff',
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '0.72rem',
    fontWeight: '700',
    letterSpacing: '0.04em',
    cursor: 'ew-resize',
    userSelect: 'none',
    zIndex: '99999',
    boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
    pointerEvents: 'auto',
    display: 'none',   // hidden until container is visible
  });
  document.body.appendChild(handle);

  // Position handle over top-right corner of the 3D container
  function _positionHandle() {
    const rect = container.getBoundingClientRect();
    if (rect.width < 10) { handle.style.display = 'none'; return; }
    handle.style.display = '';
    handle.style.top  = (rect.top  + 8) + 'px';
    handle.style.left = (rect.right - 90) + 'px';
  }
  _positionHandle();
  new ResizeObserver(_positionHandle).observe(container);
  window.addEventListener('scroll', _positionHandle, { passive: true });

  // Drag logic
  let _dragStartX = 0, _dragStartScale = 1.0;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    _dragStartX     = e.clientX;
    _dragStartScale = currentTransform.scale ?? 1.0;
  });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    const dx       = e.clientX - _dragStartX;
    const newScale = Math.max(0.15, Math.min(2.5, _dragStartScale + dx / 160));
    currentTransform.scale = newScale;
    // Multi-zone pages (T-shirt, Outerwear, Headwear): update the active zone's scale.
    // The active zone key in window.zoneCustomizations is always the base zone id
    // ('front', 'back', 'sleeve-left', 'sleeve-right', or 'front-center' for headwear).
    const activeZone = window.activeZoneId || window.printPlacement || 'front';
    const zc = (window.zoneCustomizations || {})[activeZone];
    if (zc !== undefined && window.setZoneCustomization) {
      let updatedScale;
      if (IS_HEADWEAR) {
        // Map newScale (0.15–2.5) → headwear decal fraction (0.10–0.65)
        updatedScale = 0.10 + (Math.min(newScale, 2.0) / 2.0) * 0.55;
      } else {
        // Outerwear/T-shirt: store the multiplier directly (scaleSlider already synced below)
        updatedScale = Math.max(0.4, Math.min(2.5, newScale));
      }
      const merged = Object.assign({}, zc, { scale: updatedScale });
      window.zoneCustomizations[activeZone] = merged;
      _rebuildAllDecals();
    }
    // Sync page scale slider (fires page's input handler to update printScale etc.)
    const slider = document.getElementById('scaleSlider') || document.getElementById('printScale');
    if (slider) {
      const pct = Math.round(newScale * 100);
      const boundedPct = Math.max(+slider.min || 40, Math.min(+slider.max || 250, pct));
      slider.value = boundedPct;
      slider.dispatchEvent(new Event('input'));
      if (typeof window.onScaleSliderInput === 'function') {
        window.onScaleSliderInput(boundedPct);
      }
    }
  });
  handle.addEventListener('pointerup', (e) => { handle.releasePointerCapture(e.pointerId); });
}

function _onResize() {
  const c = document.getElementById('threeContainer');
  if (!c || !c.clientWidth || !c.clientHeight) return;
  const w = c.clientWidth;
  const h = c.clientHeight || Math.round(w * 1.25);  // fallback 4:5 aspect
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.trigger3DResize = _onResize;

// ── Visibility-based resize: fires when the 3D container is revealed ──────────
// Uses IntersectionObserver so the renderer fills the container exactly once it
// becomes visible (e.g. after switchView('3d') sets display:'' on the parent).
(function _watchVisibility() {
  const c = document.getElementById('threeContainer');
  if (!c || !window.IntersectionObserver) return;
  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) {
      // Small delay lets the browser finish layout for aspect-ratio containers
      setTimeout(_onResize, 30);
    }
  }, { threshold: 0.01 });
  io.observe(c);
})();

// ─── COLOUR ──────────────────────────────────────────────────────────────────
window.setShirtColor = function (hex) {
  window._pendingColorHex = hex;
  const targetColor = hex;
  shirtMeshes.forEach(mesh => {
    [].concat(mesh.material).forEach(mat => {
      mat.color.set(targetColor);
      mat.needsUpdate = true;
    });
  });
};

// ─── T-SHIRT: DecalGeometry path ────────────────────────────────────────────
window.applyPrintTexture = function (imageUrl) {
  const activeZone = window.activeZoneId || 'front';
  if (!imageUrl) {
    if (window.zoneCustomizations[activeZone]) {
      window.zoneCustomizations[activeZone].printImg = null;
      window.zoneCustomizations[activeZone].printUrl = null;
    }
    _rebuildAllDecals();
    return;
  }
  new THREE.TextureLoader().load(imageUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    
    // Load as Image for zoneCustomizations
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!window.zoneCustomizations[activeZone]) {
        window.zoneCustomizations[activeZone] = {};
      }
      window.zoneCustomizations[activeZone].printImg = img;
      window.zoneCustomizations[activeZone].printUrl = imageUrl;
      _rebuildAllDecals();
    };
    img.src = imageUrl;
  });
};

window.setPrintTransform = function ({ scale, preset, blend }) {
  currentTransform = { scale, preset, blend };
  const activeZone = window.activeZoneId || 'front';
  if (!window.zoneCustomizations[activeZone]) {
    window.zoneCustomizations[activeZone] = {};
  }
  const zc = window.zoneCustomizations[activeZone];
  if (scale !== undefined) zc.scale = scale;
  if (preset !== undefined) zc.preset = preset;
  if (blend !== undefined) zc.blend = blend;
  _rebuildAllDecals();
};

function _clearDecals() {
  // Compatibility stub
}

function _updateTshirtDecals() {
  _rebuildAllDecals();
}

// ─── HEADWEAR: flat overlay plane (most reliable approach) ──────────────────
// A PlaneGeometry is parented to the model's pivot and positioned on the
// front face of its bounding box. This plane always stays on the cap no
// matter how the user rotates it, which is exactly what the user sees.
//
// Design is composited on a canvas (print + label) and mapped as a texture
// on the plane with full transparency support. MeshBasicMaterial is used so
// the design colour is always faithful regardless of scene lighting.

const HW_SIZE = 768;

function _getOrCreateCanvas() {
  if (!_hwCanvas) {
    _hwCanvas = document.createElement('canvas');
    _hwCanvas.width  = HW_SIZE;
    _hwCanvas.height = HW_SIZE;
  }
  return _hwCanvas;
}

function _buildHwCanvas() {
  const cv  = _getOrCreateCanvas();
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, HW_SIZE, HW_SIZE);

  const hasPrint = !!_hwPrintImg;
  const hasLabel = !!(_hwLabelText && _hwLabelText.trim());
  if (!hasPrint && !hasLabel) return null;

  const S   = HW_SIZE;
  const PAD = 30;

  if (hasPrint && hasLabel) {
    // Top 60% = image, bottom 35% = label
    _drawImageFit(ctx, _hwPrintImg, PAD, PAD, S - PAD * 2, Math.round(S * 0.58) - PAD);
    _drawLabelText(ctx, _hwLabelText, _hwLabelColor, S / 2, S * 0.80, S * 0.88, S * 0.30);
  } else if (hasPrint) {
    _drawImageFit(ctx, _hwPrintImg, PAD, PAD, S - PAD * 2, S - PAD * 2);
  } else {
    _drawLabelText(ctx, _hwLabelText, _hwLabelColor, S / 2, S / 2, S * 0.90, S * 0.42);
  }
  return cv;
}

function _drawImageFit(ctx, img, x, y, w, h) {
  if (!img) return;
  const ir = img.naturalWidth / img.naturalHeight;
  const br = w / h;
  let dw, dh;
  if (ir > br) { dw = w * 0.92; dh = dw / ir; }
  else         { dh = h * 0.92; dw = dh * ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Draw a label text into a region of tmpCtx
function _renderLabelToCtx(tmpCtx, x, y, w, h) {
  const text  = (document.getElementById('customLabelInput')?.value || '').trim().toUpperCase();
  if (!text) return;
  const color = document.getElementById('customLabelColor')?.value || '#ffffff';
  tmpCtx.save();
  // Start with a font size based on available height
  let sz = h * 0.72;
  tmpCtx.font = `900 ${sz}px "Arial Black", Arial, sans-serif`;
  // Shrink until text fits within 92% of available width
  const maxW = w * 0.92;
  let measured = tmpCtx.measureText(text).width;
  if (measured > maxW) {
    sz = sz * (maxW / measured);
    tmpCtx.font = `900 ${sz}px "Arial Black", Arial, sans-serif`;
  }
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

function _drawLabelText(ctx, text, color, cx, cy, maxW, maxH) {
  if (!text) return;
  ctx.save(); // Save state before drawing
  // Start with a size based on height, then shrink to fit width.
  let sz = Math.min(maxH * 0.85, maxW * 0.9);
  ctx.font = `900 ${sz}px "Arial Black", Arial, sans-serif`;
  // Measure and adjust if exceeding max width.
  let metrics = ctx.measureText(text);
  if (metrics.width > maxW) {
    sz = sz * (maxW / metrics.width);
    ctx.font = `900 ${sz}px "Arial Black", Arial, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = color === '#ffffff' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)';
  ctx.lineWidth = sz * 0.09;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
  ctx.restore(); // Restore state after drawing
}

function _clearHwOverlay() {
  hwDecalMeshes.forEach(d => {
    scene?.remove(d);
    d.geometry?.dispose();
  });
  hwDecalMeshes = [];
  if (hwOverlayMat) {
    hwOverlayMat.map?.dispose();
    hwOverlayMat.dispose();
    hwOverlayMat = null;
  }
}


// ─── MULTI-ZONE CUSTOMIZATION ────────────────────────────────────────────────
window.zoneCustomizations = window.zoneCustomizations || {};
// structure: { 'front-center': { type: 'print'|'embroidery'|'label'|'both', printImg: <Image>, labelText: '', labelColor: '', scale: 0.42, blend: 0.55 }, ... }

const hwMaterials = {}; // map of zoneId -> Material

window.setZoneCustomization = function(zoneId, config) {
  if (!window.zoneCustomizations[zoneId]) {
    window.zoneCustomizations[zoneId] = { scale: 0.42, blend: 0.55 };
  }
  const current = window.zoneCustomizations[zoneId];
  const urlChanged = config.printUrl !== undefined && config.printUrl !== current.printUrl;
  Object.assign(current, config);
  
  if (config.printUrl && (urlChanged || !current.printImg)) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { 
      if (window.zoneCustomizations[zoneId]) {
        window.zoneCustomizations[zoneId].printImg = img; 
        _rebuildAllDecals(); 
      }
    };
    img.onerror = () => {
      if (window.zoneCustomizations[zoneId]) {
        window.zoneCustomizations[zoneId].printImg = null;
        _rebuildAllDecals();
      }
    };
    img.src = config.printUrl;
  } else if (config.printUrl === null) {
    window.zoneCustomizations[zoneId].printImg = null;
    _rebuildAllDecals();
  } else if (config.scale !== undefined || config.placement !== undefined || config.labelText !== undefined) {
    _rebuildAllDecals();
  }
};

window.clearZoneCustomization = function(zoneId) {
  delete window.zoneCustomizations[zoneId];
  _rebuildAllDecals();
};

window.clearAllZones = function() {
  window.zoneCustomizations = {};
  _rebuildAllDecals();
};

function _buildZoneCanvas(config) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  const hasPrint = !!config.printImg;
  const hasLabel = !!(config.labelText && config.labelText.trim());
  if (!hasPrint && !hasLabel) return null;

  const PAD = 20;
  if (hasPrint && hasLabel) {
    _drawImageFit(ctx, config.printImg, PAD, PAD, S - PAD * 2, Math.round(S * 0.58) - PAD);
    _drawLabelText(ctx, config.labelText, config.labelColor || '#ffffff', S / 2, S * 0.80, S * 0.88, S * 0.30);
  } else if (hasPrint) {
    _drawImageFit(ctx, config.printImg, PAD, PAD, S - PAD * 2, S - PAD * 2);
  } else {
    _drawLabelText(ctx, config.labelText, config.labelColor || '#ffffff', S / 2, S / 2, S * 0.90, S * 0.42);
  }
  return cv;
}

// Draws only the print or only the label — used for split/independent decal projection
function _buildZoneCanvasForType(config, type) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  const PAD = 20;
  if (type === 'print') {
    if (!config.printImg) return null;
    _drawImageFit(ctx, config.printImg, PAD, PAD, S - PAD * 2, S - PAD * 2);
  } else if (type === 'label') {
    if (!(config.labelText && config.labelText.trim())) return null;
    _drawLabelText(ctx, config.labelText, config.labelColor || '#ffffff', S / 2, S / 2, S * 0.90, S * 0.42);
  } else {
    return null;
  }
  return cv;
}

let _rebuildRAF = null;
function _rebuildAllDecals() {
  if (_rebuildRAF) return;
  _rebuildRAF = requestAnimationFrame(() => {
    _rebuildRAF = null;
    _doRebuildAllDecals();
  });
}

function _doRebuildAllDecals() {
  // Clear existing decals
  hwDecalMeshes.forEach(d => {
    scene?.remove(d);
    d.geometry?.dispose();
  });
  hwDecalMeshes = [];
  
  // Dispose old materials
  Object.values(hwMaterials).forEach(mat => {
    mat.map?.dispose();
    mat.dispose();
  });
  for (let key in hwMaterials) delete hwMaterials[key];

  if (!currentModelGroup) return;
  currentModelGroup.updateMatrixWorld(true);
  const box     = new THREE.Box3().setFromObject(currentModelGroup);
  const boxSize = box.getSize(new THREE.Vector3());
  const cx      = (box.min.x + box.max.x) / 2;
  // cy at 45% from bottom = true mid-torso reference for outerwear/headwear
  const cy      = box.min.y + boxSize.y * 0.45;
  const cz      = box.max.z;

  console.log("DEBUG_MODEL_BOUNDS:", JSON.stringify({
    filename: currentModelUrl.split('/').pop(),
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
    size: [boxSize.x, boxSize.y, boxSize.z],
    cx, cy, cz
  }));

  // Render each zone — now emitting separate decals for print and label
  for (const zoneId of Object.keys(window.zoneCustomizations)) {
    const config = window.zoneCustomizations[zoneId];
    const hasPrint = !!config.printImg;
    const hasLabel = !!(config.labelText && config.labelText.trim());
    
    if (!hasPrint && !hasLabel) continue;

    const types = [];
    if (hasPrint) types.push('print');
    if (hasLabel) types.push('label');

    for (const decalType of types) {
      _renderDecalForZoneAndType(zoneId, config, decalType, box, boxSize, cx, cy, cz);
    }
  }
}

// Renders a single decal for a specific type ('print' or 'label') within a zone
function _renderDecalForZoneAndType(zoneId, config, decalType, box, boxSize, cx, cy, cz) {
  const cv = _buildZoneCanvasForType(config, decalType);
  if (!cv) return;
  // Choose position overrides based on type
  const posNormX = decalType === 'print' ? (config.printPosNormX !== undefined ? config.printPosNormX : config.posNormX) : (config.labelPosNormX !== undefined ? config.labelPosNormX : config.posNormX);
  const posNormY = decalType === 'print' ? (config.printPosNormY !== undefined ? config.printPosNormY : config.posNormY) : (config.labelPosNormY !== undefined ? config.labelPosNormY : config.posNormY);
  const scale    = decalType === 'print' ? (config.printScale !== undefined ? config.printScale : config.scale) : (config.labelScale !== undefined ? config.labelScale : config.scale);
  _renderDecalCanvas(zoneId + '_' + decalType, config, cv, posNormX, posNormY, scale, box, boxSize, cx, cy, cz);
}

// Renders a canvas texture as a decal at the computed 3D position for zoneId
function _renderDecalCanvas(effectiveZoneId, config, cv, posNormX, posNormY, scaleOverride, box, boxSize, cx, cy, cz) {
  // Strip _print/_label suffix for zone identity lookups
  const zoneId = effectiveZoneId.replace(/_print$|_label$/, '');

  if (posNormX === undefined) posNormX = config.posNormX;
  if (posNormY === undefined) posNormY = config.posNormY;

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const blend = config.blend !== undefined ? config.blend : 0.55;
  const isLabelDecal = effectiveZoneId.endsWith('_label');
  const polyOffset = isLabelDecal ? -9 : -6;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, depthTest: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: polyOffset, polygonOffsetUnits: polyOffset,
    roughness: 0.85, opacity: 1.0 - blend * 0.3,
  });
  hwMaterials[effectiveZoneId] = mat;

  let subZoneId = zoneId;
  if (IS_OUTERWEAR) {
    const preset = config.placement || config.preset || 'center';
    if (zoneId === 'front') {
      if (preset === 'top-left') subZoneId = 'front-left';
      else if (preset === 'top-right') subZoneId = 'front-right';
      else if (preset === 'top-center') subZoneId = 'front-center-high';
      else if (preset === 'bottom-center') subZoneId = 'front-center-low';
      else subZoneId = 'front-center';
    } else if (zoneId === 'back') {
      if (preset === 'top-left') subZoneId = 'back-left';
      else if (preset === 'top-right') subZoneId = 'back-right';
      else if (preset === 'top-center') subZoneId = 'back-center-high';
      else if (preset === 'bottom-center') subZoneId = 'back-center-low';
      else subZoneId = 'back-center';
    } else if (zoneId === 'sleeve-left') {
      subZoneId = 'sleeve-left';
    } else if (zoneId === 'sleeve-right') {
      subZoneId = 'sleeve-right';
    }
  }

  let scale;
  if (IS_OUTERWEAR) {
    const preset = config.placement || config.preset || 'center';
    let baseScale;
    if (zoneId === 'back' && !preset.endsWith('left') && !preset.endsWith('right')) {
      baseScale = 0.58;
    } else if (preset.endsWith('left') || preset.endsWith('right')) {
      baseScale = 0.30;
    } else if (zoneId === 'sleeve-left' || zoneId === 'sleeve-right') {
      baseScale = 0.22;
    } else {
      baseScale = 0.44;
    }
    const outerScale = scaleOverride !== undefined ? scaleOverride : (config.scale !== undefined ? config.scale : 1.0);
    scale = baseScale * outerScale;
  } else if (!IS_HEADWEAR) {
    const configScale = scaleOverride !== undefined ? scaleOverride : (config.scale !== undefined ? config.scale : 0.65);
    scale = 0.50 * configScale;
  } else {
    const baseHwScale = 0.28;
    const configScale = scaleOverride !== undefined ? scaleOverride : (config.scale !== undefined ? config.scale : 1.0);
    scale = baseHwScale * configScale;
  }
  const planeW = boxSize.x * scale;

  let px = cx, py = cy, pz = cz;
  const ori = new THREE.Euler(0, 0, 0);

  // ── Position logic ──────────────────────────────────────────────────────────
  if (IS_JEANS) {
    const preset = config.placement || config.preset || 'center';
    const jFrontZ = box.max.z - boxSize.z * 0.05;
    const jBackZ  = box.min.z + boxSize.z * 0.05;
    const dx = boxSize.x * 0.12;
    const jFrontTopY = box.min.y + boxSize.y * 0.73;
    const jFrontMidY = box.min.y + boxSize.y * 0.63;
    const jFrontBotY = box.min.y + boxSize.y * 0.53;
    const jBackTopY  = box.min.y + boxSize.y * 0.73;
    const jBackMidY  = box.min.y + boxSize.y * 0.58;
    const jBackBotY  = box.min.y + boxSize.y * 0.43;
    if (zoneId === 'front') {
      pz = jFrontZ;
      if (preset.startsWith('top')) py = jFrontTopY;
      else if (preset.startsWith('mid') || preset === 'center') py = jFrontMidY;
      else if (preset.startsWith('bottom')) py = jFrontBotY;
      if (preset.endsWith('left')) { px = cx - dx; ori.y = -Math.PI / 12; }
      else if (preset.endsWith('right')) { px = cx + dx; ori.y = Math.PI / 12; }
      if (posNormX !== undefined) px = cx + (0.5 - posNormX) * boxSize.x * 0.7;
      if (posNormY !== undefined) py = box.min.y + boxSize.y * (0.53 + (1 - posNormY) * 0.20);
    } else if (zoneId === 'back') {
      pz = jBackZ; ori.y = Math.PI;
      if (preset.startsWith('top')) py = jBackTopY;
      else if (preset.startsWith('mid') || preset === 'center') py = jBackMidY;
      else if (preset.startsWith('bottom')) py = jBackBotY;
      if (preset.endsWith('left')) { px = cx + dx; ori.y = Math.PI * 11/12; }
      else if (preset.endsWith('right')) { px = cx - dx; ori.y = -Math.PI * 11/12; }
      if (posNormX !== undefined) px = cx + (0.5 - posNormX) * boxSize.x * 0.7;
      if (posNormY !== undefined) py = box.min.y + boxSize.y * (0.43 + (1 - posNormY) * 0.30);
    } else if (zoneId === 'sleeve-left') {
      px = cx - boxSize.x * 0.45; py = jFrontMidY; pz = jFrontZ; ori.y = Math.PI / 2;
    } else if (zoneId === 'sleeve-right') {
      px = cx + boxSize.x * 0.45; py = jFrontMidY; pz = jFrontZ; ori.y = -Math.PI / 2;
    }

  } else if (IS_HOODIES) {
    const preset = config.placement || config.preset || 'center';
    const hFrontZ = box.max.z - boxSize.z * 0.08;
    const dx = boxSize.x * 0.15;
    const hFrontTopY = box.min.y + boxSize.y * 0.55;
    const hFrontMidY = box.min.y + boxSize.y * 0.47;
    const hFrontBotY = box.min.y + boxSize.y * 0.39;
    const hBackTopY  = box.min.y + boxSize.y * 0.58;
    const hBackMidY  = box.min.y + boxSize.y * 0.47;
    const hBackBotY  = box.min.y + boxSize.y * 0.34;
    if (zoneId === 'front') {
      pz = hFrontZ;
      if (preset.startsWith('top')) py = hFrontTopY;
      else if (preset.startsWith('mid') || preset === 'center') py = hFrontMidY;
      else if (preset.startsWith('bottom')) py = hFrontBotY;
      if (preset.endsWith('left')) { px = cx - dx; ori.y = -Math.PI / 12; }
      else if (preset.endsWith('right')) { px = cx + dx; ori.y = Math.PI / 12; }
      ori.x = Math.PI / 24;
      if (posNormX !== undefined) px = cx + (0.5 - posNormX) * boxSize.x * 0.7;
      if (posNormY !== undefined) py = box.min.y + boxSize.y * (0.39 + (1 - posNormY) * 0.16);
    } else if (zoneId === 'back') {
      pz = box.max.z - boxSize.z * 0.88; ori.y = Math.PI;
      if (preset.startsWith('top')) py = hBackTopY;
      else if (preset.startsWith('mid') || preset === 'center') py = hBackMidY;
      else if (preset.startsWith('bottom')) py = hBackBotY;
      if (preset.endsWith('left')) { px = cx - dx; ori.y = Math.PI * 11/12; }
      else if (preset.endsWith('right')) { px = cx + dx; ori.y = -Math.PI * 11/12; }
      if (posNormX !== undefined) px = cx + (posNormX - 0.5) * boxSize.x * 0.7;
      if (posNormY !== undefined) py = box.min.y + boxSize.y * (0.34 + (1 - posNormY) * 0.24);
    } else if (zoneId === 'sleeve-left') {
      px = cx - boxSize.x * 0.45; py = hFrontMidY; pz = hFrontZ; ori.y = Math.PI / 2;
    } else if (zoneId === 'sleeve-right') {
      px = cx + boxSize.x * 0.45; py = hFrontMidY; pz = hFrontZ; ori.y = -Math.PI / 2;
    }

  } else if (IS_HEADWEAR) {
    const isFront = zoneId.startsWith('front');
    const isBack  = zoneId.startsWith('back');
    const isSide  = zoneId.startsWith('side') || zoneId.startsWith('sleeve');

    let normX = posNormX;
    let normY = posNormY;

    if (normX === undefined) {
      if (zoneId === 'front-left') normX = 0.30;
      else if (zoneId === 'front-right') normX = 0.70;
      else normX = 0.50;
    }
    if (normY === undefined) {
      if (zoneId === 'front-high') normY = 0.25;
      else if (zoneId === 'front-low') normY = 0.75;
      else normY = 0.50;
    }

    if (isFront) {
      // Surface of cap crown
      px = cx + (normX - 0.5) * boxSize.x * 0.55;
      py = box.min.y + boxSize.y * (0.82 - normY * 0.24);
      pz = box.min.z + boxSize.z * 0.68 - Math.abs(normX - 0.5) * boxSize.z * 0.22;
      ori.y = -(normX - 0.5) * (Math.PI / 2.2);
      ori.x = -(normY - 0.5) * (Math.PI / 6);
    } else if (isSide) {
      const isLeft = zoneId.includes('left');
      px = cx + (isLeft ? -1 : 1) * boxSize.x * 0.40;
      py = box.min.y + boxSize.y * (0.75 - normY * 0.25);
      pz = box.min.z + boxSize.z * 0.45;
      ori.y = (isLeft ? 1 : -1) * (Math.PI / 2);
    } else if (isBack) {
      px = cx - (normX - 0.5) * boxSize.x * 0.50;
      py = box.min.y + boxSize.y * (0.75 - normY * 0.25);
      pz = box.min.z + boxSize.z * 0.25;
      ori.y = Math.PI + (normX - 0.5) * (Math.PI / 3);
    } else if (zoneId === 'brim-front') {
      py = box.min.y + boxSize.y * 0.22;
      pz = box.min.z + boxSize.z * 0.88;
      ori.x = -Math.PI / 6;
    }
  } else {
    // T-shirt
    let tx = cx;
    let ty = box.min.y + boxSize.y * 0.58;
    const inset = boxSize.z * 0.06;
    let tz = box.max.z - inset;
    const preset = config.preset || zoneId;
    if (zoneId === 'sleeve-left' || zoneId === 'left-sleeve' || preset === 'sleeve-left') {
      tx = box.min.x + boxSize.x * 0.12; ty = box.min.y + boxSize.y * 0.60;
      tz = (box.min.z + box.max.z) / 2; ori.y = Math.PI / 2;
    } else if (zoneId === 'sleeve-right' || zoneId === 'right-sleeve' || preset === 'sleeve-right') {
      tx = box.max.x - boxSize.x * 0.12; ty = box.min.y + boxSize.y * 0.60;
      tz = (box.min.z + box.max.z) / 2; ori.y = -Math.PI / 2;
    } else if (zoneId === 'back') {
      tz = box.min.z + inset; ori.y = Math.PI;
      if (preset.includes('left')) tx = cx + boxSize.x * 0.16;
      else if (preset.includes('right')) tx = cx - boxSize.x * 0.16;
      if (preset.includes('top')) ty = box.min.y + boxSize.y * 0.72;
      else if (preset.includes('bottom')) ty = box.min.y + boxSize.y * 0.30;
      else ty = box.min.y + boxSize.y * 0.58;
    } else {
      if (preset.includes('left')) tx = cx - boxSize.x * 0.16;
      else if (preset.includes('right')) tx = cx + boxSize.x * 0.16;
      if (preset.includes('top')) ty = box.min.y + boxSize.y * 0.72;
      else if (preset.includes('mid')) ty = box.min.y + boxSize.y * 0.58;
      else if (preset.includes('bottom')) ty = box.min.y + boxSize.y * 0.30;
    }
    px = tx; py = ty; pz = tz;
  }

  const pos = new THREE.Vector3(px, py, pz);
  let depth;
  if (IS_OUTERWEAR) {
    if (zoneId === 'sleeve-left' || zoneId === 'sleeve-right' || subZoneId.includes('sleeve')) {
      depth = boxSize.z * 0.60;
    } else if (IS_HOODIES && zoneId === 'back') {
      depth = boxSize.z * 0.50;
    } else if (IS_HOODIES && zoneId === 'front') {
      depth = boxSize.z * 0.35;
    } else if (IS_JEANS) {
      depth = boxSize.z * 0.55;
    } else {
      depth = boxSize.z * 0.85;
    }
  } else if (IS_HEADWEAR) depth = boxSize.z * 0.28;
  else depth = Math.min(boxSize.z * 0.70, 0.45);

  const size = new THREE.Vector3(planeW, planeW, depth);
  targetDecalMeshes.forEach(mesh => {
    try {
      const dg = new DecalGeometry(mesh, pos, ori, size);
      const dm = new THREE.Mesh(dg, mat);
      dm.renderOrder = 1;
      scene.add(dm);
      hwDecalMeshes.push(dm);
    } catch(e) {
      console.warn('Decal generation failed on mesh:', mesh.name || mesh.uuid, e);
    }
  });
}


// ─── PUBLIC API ──────────────────────────────────────────────────────────────


window.applyHeadwearPrint = function (imageUrl) {
  const z = window.printPlacement || 'front-center';
  // Merge into zone config (do NOT clear other zones or the label data)
  const existing = window.zoneCustomizations[z] || {};
  if (imageUrl) {
    // Load image then store it; rebuild decals after load
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      window.zoneCustomizations[z] = Object.assign({}, existing, { printImg: img, printUrl: imageUrl });
      _rebuildAllDecals();
    };
    img.onerror = () => {
      console.warn('applyHeadwearPrint: failed to load', imageUrl);
    };
    img.src = imageUrl;
  } else {
    // Clear print but keep label
    const updated = Object.assign({}, existing);
    delete updated.printImg;
    delete updated.printUrl;
    delete updated.printPosNormX;
    delete updated.printPosNormY;
    delete updated.printScale;
    window.zoneCustomizations[z] = updated;
    _rebuildAllDecals();
  }
};

window.applyHeadwearLabel = function (text, color) {
  const z = window.printPlacement || 'front-center';
  // Merge into zone config (do NOT clear the print data)
  const existing = window.zoneCustomizations[z] || {};
  window.zoneCustomizations[z] = Object.assign({}, existing, {
    labelText: (text || '').toUpperCase(),
    labelColor: color || '#ffffff'
  });
  _rebuildAllDecals();
};

window.setHeadwearDecalScale = function (sliderPct) {
  // sliderPct: 40 = smallest, 100 = default, 160 = largest
  const scale = 0.15 + ((sliderPct - 40) / 120) * 0.50;
  const z = window.printPlacement || 'front-center';
  const existing = window.zoneCustomizations[z] || {};
  window.zoneCustomizations[z] = Object.assign({}, existing, { scale });
  _rebuildAllDecals();
};

window.clearHeadwearDecal = function () {
  // Clear ALL zones so no stale prints remain on any zone
  if (window.clearAllZones) window.clearAllZones();
};


window.applyMockupTexture = function (imageUrl) {
  if (!imageUrl) {
    shirtMeshes.forEach(m => [].concat(m.material).forEach(mat => { mat.map = null; mat.needsUpdate = true; }));
    return;
  }
  new THREE.TextureLoader().load(imageUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    shirtMeshes.forEach(m => [].concat(m.material).forEach(mat => { mat.map = tex; mat.needsUpdate = true; }));
  });
};

window.rebuildAllDecals = _rebuildAllDecals;

// ─── BOOT ────────────────────────────────────────────────────────────────────
if (document.readyState !== 'loading') {
  initThreeViewer();
} else {
  document.addEventListener('DOMContentLoaded', initThreeViewer);
}
