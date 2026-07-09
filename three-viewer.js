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
    model.traverse((child) => {
      if (!child.isMesh) return;
      
      // Calculate physical scale/score to ignore stitches/buttons
      const childBox = new THREE.Box3().setFromObject(child);
      const childSize = childBox.getSize(new THREE.Vector3());
      const childScore = childSize.x + childSize.y + childSize.z;
      
      if (childScore > modelScore * 0.01) {
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

const HW_SIZE = 512;

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
  const PAD = 20;

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

function _drawLabelText(ctx, text, color, cx, cy, maxW, maxH) {
  if (!text) return;
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
  ctx.restore();
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

  // Render each zone
  for (const zoneId of Object.keys(window.zoneCustomizations)) {
    const config = window.zoneCustomizations[zoneId];
    const cv = _buildZoneCanvas(config);
    if (!cv) continue;

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const blend = config.blend !== undefined ? config.blend : 0.55;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthTest: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
      roughness: 0.85, opacity: 1.0 - blend * 0.3,
    });
    hwMaterials[zoneId] = mat;

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

    let scale = config.scale !== undefined ? config.scale : 0.42;
    if (IS_OUTERWEAR) {
      const preset = config.placement || config.preset || 'center';
      let baseScale;
      if (zoneId === 'back' && !preset.endsWith('left') && !preset.endsWith('right')) {
        // Back center/full-back prints need larger coverage than front chest prints
        baseScale = 0.58;
      } else if (preset.endsWith('left') || preset.endsWith('right')) {
        baseScale = 0.30;  // chest-pocket sized (30% of body width)
      } else if (zoneId === 'sleeve-left' || zoneId === 'sleeve-right') {
        baseScale = 0.22;  // sleeve prints smaller
      } else {
        baseScale = 0.44;  // front center prints
      }
      scale = baseScale * (config.scale !== undefined ? config.scale : 1.0);
    } else if (!IS_HEADWEAR) {
      // T-shirt: scale config defaults to 0.50; base scale is 0.50 of boxSize.x
      const configScale = config.scale !== undefined ? config.scale : 0.50;
      scale = 0.50 * configScale;
    }
    const planeW = boxSize.x * scale;

    let px = cx, py = cy, pz = cz;
    const ori = new THREE.Euler(0, 0, 0);

    if (IS_JEANS) {
      const preset = config.placement || config.preset || 'center';
      const jFrontZ = box.max.z - boxSize.z * 0.10;
      const jBackZ  = box.min.z + boxSize.z * 0.10;
      const dx = boxSize.x * 0.12; // lateral offset
      // Vertical reference: normalized height 2.0, chest is ~70–76% from bottom
      const jTopY    = box.min.y + boxSize.y * 0.76;  // upper chest / breast pocket
      const jMidY    = box.min.y + boxSize.y * 0.70;  // mid-chest center
      const jBotY    = box.min.y + boxSize.y * 0.62;  // lower chest

      if (zoneId === 'front') {
        pz = jFrontZ;
        // Vertical Y
        if (preset.startsWith('top')) {
          py = jTopY;
        } else if (preset.startsWith('mid') || preset === 'center') {
          py = jMidY;
        } else if (preset.startsWith('bottom')) {
          py = jBotY;
        }
        // Horizontal X and orientation Y
        if (preset.endsWith('left')) {
          px = cx - dx; ori.y = Math.PI / 12;
        } else if (preset.endsWith('right')) {
          px = cx + dx; ori.y = -Math.PI / 12;
        } else {
          px = cx; ori.y = 0;
        }
      } else if (zoneId === 'back') {
        pz = jBackZ;
        ori.y = Math.PI;
        // Vertical Y
        if (preset.startsWith('top')) {
          py = jTopY;
        } else if (preset.startsWith('mid') || preset === 'center') {
          py = jMidY;
        } else if (preset.startsWith('bottom')) {
          py = jBotY;
        }
        // Horizontal X and orientation Y
        if (preset.endsWith('left')) {
          px = cx + dx; ori.y = Math.PI * 11/12;
        } else if (preset.endsWith('right')) {
          px = cx - dx; ori.y = -Math.PI * 11/12;
        } else {
          px = cx;
        }
      } else if (zoneId === 'sleeve-left') {
        px = cx - boxSize.x * 0.45; py = jMidY; pz = cz; ori.y = Math.PI / 2;
      } else if (zoneId === 'sleeve-right') {
        px = cx + boxSize.x * 0.45; py = jMidY; pz = cz; ori.y = -Math.PI / 2;
      }
    } else if (IS_HOODIES) {
      const preset = config.placement || config.preset || 'center';
      // Front: push 18% inside front surface to skip drawstring/collar outer meshes
      const hFrontZ = box.max.z - boxSize.z * 0.18;
      const hBackZ  = box.min.z + boxSize.z * 0.10;

      const dx = boxSize.x * 0.15;  // lateral offset for L/R separation

      // ─── FRONT Y positions ────────────────────────────────────────────────

      // Front chest area: from collar (Y≈0.25) to kangaroo pocket (Y≈-0.35)
      const hFrontTopY = box.min.y + boxSize.y * 0.67;  // Y≈0.04  upper chest (below collar)
      const hFrontMidY = box.min.y + boxSize.y * 0.61;  // Y≈-0.08 mid-chest
      const hFrontBotY = box.min.y + boxSize.y * 0.53;  // Y≈-0.24 lower chest (above pocket)

      // ─── BACK Y positions ─────────────────────────────────────────────────
      // Back area spans full height: shoulder blades to hem.
      // Adjusted so 'center' preset lands at true visual center of the back panel.
      const hBackTopY  = box.min.y + boxSize.y * 0.72;  // upper back / shoulder blades
      const hBackMidY  = box.min.y + boxSize.y * 0.57;  // true mid-back (visual centre of back panel)
      const hBackBotY  = box.min.y + boxSize.y * 0.38;  // lower back (above hem)

      if (zoneId === 'front') {
        pz = hFrontZ;
        // Vertical Y
        if (preset.startsWith('top')) {
          py = hFrontTopY;
        } else if (preset.startsWith('mid') || preset === 'center') {
          py = hFrontMidY;
        } else if (preset.startsWith('bottom')) {
          py = hFrontBotY;
        }
        // Horizontal X — hoodie -90° Y rotation: world +X = screen-LEFT.
        // So "right" (screen-right) needs world -X = cx-dx; "left" needs cx+dx.
        if (preset.endsWith('left')) {
          px = cx + dx; ori.y = -Math.PI / 12;
        } else if (preset.endsWith('right')) {
          px = cx - dx; ori.y = Math.PI / 12;
        } else {
          px = cx; ori.y = 0;
        }
      } else if (zoneId === 'back') {
        // box.min.z = hood tip (far behind). Torso back ≈ box.max.z − 88% of depth.
        // Increased from 0.85 → 0.88 to push stamp centre closer to actual torso back surface.
        const hTorsoBackZ = box.max.z - boxSize.z * 0.88;
        pz = hTorsoBackZ;
        ori.y = Math.PI;
        // Vertical Y — back uses DIFFERENT refs than front (back area is taller)
        if (preset.startsWith('top')) {
          py = hBackTopY;
        } else if (preset.startsWith('mid') || preset === 'center') {
          py = hBackMidY;
        } else if (preset.startsWith('bottom')) {
          py = hBackBotY;
        }
        // Horizontal X — from the back camera, screen-LEFT = world +X.
        // Same rule as jacket back. cx+dx for left, cx-dx for right.
        if (preset.endsWith('left')) {
          px = cx + dx; ori.y = Math.PI * 11/12;
        } else if (preset.endsWith('right')) {
          px = cx - dx; ori.y = -Math.PI * 11/12;
        } else {
          px = cx;
        }
      } else if (zoneId === 'sleeve-left') {
        px = cx - boxSize.x * 0.45; py = hFrontMidY; pz = hFrontZ; ori.y = Math.PI / 2;
      } else if (zoneId === 'sleeve-right') {
        px = cx + boxSize.x * 0.45; py = hFrontMidY; pz = hFrontZ; ori.y = -Math.PI / 2;
      }

    } else if (IS_HEADWEAR) {
      if (zoneId === 'front' || zoneId === 'front-center') {
      } else if (zoneId === 'front-left') {
        px = cx - boxSize.x * 0.16; pz = cz - boxSize.z * 0.05; ori.y = Math.PI / 6;
      } else if (zoneId === 'front-right') {
        px = cx + boxSize.x * 0.16; pz = cz - boxSize.z * 0.05; ori.y = -Math.PI / 6;
      } else if (zoneId === 'back-center' || zoneId === 'back') {
        px = cx; pz = box.min.z; ori.y = Math.PI;
      } else if (zoneId === 'brim-front') {
        py = box.min.y + boxSize.y * 0.18; pz = box.max.z + 0.08; ori.x = -Math.PI / 6;
      } else if (zoneId === 'front-high') {
        py = cy + boxSize.y * 0.12; pz = cz - boxSize.z * 0.08; ori.x = -Math.PI / 12;
      } else if (zoneId === 'front-low') {
        py = cy - boxSize.y * 0.10; pz = cz - boxSize.z * 0.02; ori.x = Math.PI / 24;
      }
    } else {
      // T-shirt: bounding-box-relative placement
      let tx = cx;
      let ty = box.min.y + boxSize.y * 0.52;
      const inset = boxSize.z * 0.08;
      let tz = box.max.z - inset;   // just INSIDE front surface

      const preset = config.preset || zoneId;

      // Sleeve / side zones — position decal on the side of the model
      if (zoneId === 'sleeve-left' || zoneId === 'left-sleeve' || preset === 'sleeve-left') {
        tx = box.min.x + boxSize.x * 0.12;
        ty = box.min.y + boxSize.y * 0.60;
        tz = (box.min.z + box.max.z) / 2;
        ori.y = Math.PI / 2;   // face left
      } else if (zoneId === 'sleeve-right' || zoneId === 'right-sleeve' || preset === 'sleeve-right') {
        tx = box.max.x - boxSize.x * 0.12;
        ty = box.min.y + boxSize.y * 0.60;
        tz = (box.min.z + box.max.z) / 2;
        ori.y = -Math.PI / 2;  // face right
      } else {
        // Front / back presets for T-shirt
        // Horizontal offset
        if (preset.includes('left'))   tx = cx - boxSize.x * 0.16;
        if (preset.includes('right'))  tx = cx + boxSize.x * 0.16;
        // Vertical: top=72%, mid=52%, center=52%, bottom=30%
        if (preset.includes('top'))         ty = box.min.y + boxSize.y * 0.72;
        else if (preset.includes('mid'))    ty = box.min.y + boxSize.y * 0.52;
        else if (preset.includes('bottom')) ty = box.min.y + boxSize.y * 0.30;
        // else center stays at 0.52 (default)

        if (zoneId === 'back' || (preset && preset.includes('back'))) {
          tz = box.min.z + inset;   // just INSIDE back surface
          ori.y = Math.PI;
          if (tx !== cx) tx = cx - (tx - cx);  // mirror X for back-camera view
        }
      }

      px = tx; py = ty; pz = tz;
    }

    const pos = new THREE.Vector3(px, py, pz);
    let depth;
    if (IS_OUTERWEAR) {
      if (zoneId === 'sleeve-left' || zoneId === 'sleeve-right' || subZoneId.includes('sleeve')) {
        depth = boxSize.z * 0.60;
      } else if (IS_HOODIES && zoneId === 'back') {
        depth = boxSize.z * 0.32;  // deeper stamp: covers full back torso panel without reaching hood tip
      } else if (IS_HOODIES && zoneId === 'front') {
        depth = boxSize.z * 0.40;  // moderate: chest panel only, skip outer drawstring meshes
      } else {
        depth = boxSize.z * 0.85; // deep stamp to penetrate puffy front surfaces (jacket)
      }
    } else if (IS_HEADWEAR) depth = Math.max(2.0, boxSize.z * 1.5);
    else depth = Math.min(boxSize.z * 0.70, 0.45); // T-shirt: deeper stamp to cover curved front panel without punch-through

    const size = new THREE.Vector3(planeW, planeW, depth);
    console.log("DEBUG_DECAL:", JSON.stringify({
      zoneId,
      subZoneId,
      pos: [pos.x, pos.y, pos.z],
      ori: [ori.x, ori.y, ori.z],
      size: [size.x, size.y, size.z]
    }));
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
}


// ─── PUBLIC API ──────────────────────────────────────────────────────────────


window.applyHeadwearPrint = function (imageUrl) {
  const z = window.printPlacement || 'front-center';
  // Clear ALL existing zone customizations first to prevent stacking
  // across zones (e.g. front-center + back-center both being rendered).
  if (window.clearAllZones) window.clearAllZones();
  if (imageUrl) {
    window.setZoneCustomization(z, { printUrl: imageUrl });
  }
};

window.applyHeadwearLabel = function (text, color) {
  const z = window.printPlacement || 'front-center';
  // Clear stale zones, then set only this one
  if (window.clearAllZones) window.clearAllZones();
  window.setZoneCustomization(z, { labelText: (text||'').toUpperCase(), labelColor: color || '#ffffff' });
};

window.setHeadwearDecalScale = function (sliderPct) {
  // sliderPct: 40 = smallest, 100 = default, 160 = largest
  // Map linearly to decal scale fraction of model bounding-box width.
  //   40%  → scale 0.15  (small)
  //   100% → scale 0.40  (default)
  //   160% → scale 0.65  (large)
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

// ─── BOOT ────────────────────────────────────────────────────────────────────
if (document.readyState !== 'loading') {
  initThreeViewer();
} else {
  document.addEventListener('DOMContentLoaded', initThreeViewer);
}
