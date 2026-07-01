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
let decalMeshes    = [];
let currentTransform = { scale: 0.5, preset: 'center', blend: 0 };

// Headwear overlay state (conformal decals)
let hwDecalMeshes  = [];
let hwOverlayMat   = null;   // THREE.MeshStandardMaterial
let _hwCanvas      = null;
let _hwPrintImg    = null;
let _hwLabelText   = '';
let _hwLabelColor  = '#ffffff';
let _hwScale       = 0.42;   // 0–1 fraction of model height

const IS_HEADWEAR = window.location.pathname.toLowerCase().includes('headwear');
const IS_OUTERWEAR = window.location.pathname.toLowerCase().includes('outerwear');

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
    _clearDecals();
    window.clearAllZones();
  }

  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  gltfLoader.register(parser => new DummySpecularGlossinessExtension(parser));

  gltfLoader.load(modelUrl, (gltf) => {
    if (currentModelUrl !== modelUrl) return;   // stale load

    const model = gltf.scene;
    currentModelGroup = model;

    // Normalise: centre and scale to height 2
    const rawBox  = new THREE.Box3().setFromObject(model);
    const centre  = rawBox.getCenter(new THREE.Vector3());
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const s       = 2.0 / rawSize.y;
    model.scale.set(s, s, s);
    model.position.set(-centre.x * s, -centre.y * s - 0.3, -centre.z * s);
    scene.add(model);

    // Clone materials and force WHITE base colour
    model.traverse((child) => {
      if (!child.isMesh) return;
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

    // Apply pending colour
    const col = window._pendingColorHex || '#ffffff';
    window._pendingColorHex = col;
    window.setShirtColor(col);

    model.updateMatrixWorld(true);

    if (IS_HEADWEAR || IS_OUTERWEAR) {
      _rebuildAllDecals();
    } else {
      _updateTshirtDecals();
    }
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

  const startUrl = IS_HEADWEAR ? '/cap.glb' : (IS_OUTERWEAR ? '/jacket.glb' : '/scene.gltf');
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
    if (decalMaterial) decalMaterial.opacity = 1.0 - (currentTransform.blend || 0) * 0.3;
    _updateTshirtDecals();
    // Headwear / outerwear multi-zone: update active zone scale directly
    const z = window.printPlacement || 'front-center';
    const zc = (window.zoneCustomizations || {})[z];
    if (zc !== undefined && window.setZoneCustomization) {
      // Map newScale (0.15–2.5) to headwear decal scale fraction (0.10–0.65)
      const hwScale = 0.10 + (Math.min(newScale, 2.0) / 2.0) * 0.55;
      const merged = Object.assign({}, zc, { scale: hwScale });
      window.zoneCustomizations[z] = merged;
      _rebuildAllDecals();
    }
    // Sync page scale slider (fires page's input handler to update printScale etc.)
    const slider = document.getElementById('scaleSlider') || document.getElementById('printScale');
    if (slider) {
      const pct = Math.round(newScale * 100);
      slider.value = Math.max(+slider.min || 40, Math.min(+slider.max || 250, pct));
      slider.dispatchEvent(new Event('input'));
    }
  });
  handle.addEventListener('pointerup', (e) => { handle.releasePointerCapture(e.pointerId); });
}

function _onResize() {
  const c = document.getElementById('threeContainer');
  if (!c || !c.clientWidth) return;
  camera.aspect = c.clientWidth / c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth, c.clientHeight);
}
window.trigger3DResize = _onResize;

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
  if (!imageUrl) { printTexture = null; _clearDecals(); return; }
  new THREE.TextureLoader().load(imageUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    printTexture = tex;
    if (!decalMaterial) {
      decalMaterial = new THREE.MeshStandardMaterial({
        map: tex, transparent: true,
        depthTest: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
        roughness: 0.85,
      });
    } else {
      decalMaterial.map = tex;
      decalMaterial.needsUpdate = true;
    }
    _updateTshirtDecals();
  });
};

window.setPrintTransform = function ({ scale, preset, blend }) {
  currentTransform = { scale, preset, blend };
  if (decalMaterial) decalMaterial.opacity = 1.0 - blend * 0.3;
  _updateTshirtDecals();
};

function _clearDecals() {
  decalMeshes.forEach(d => { scene?.remove(d); d.geometry.dispose(); });
  decalMeshes = [];
}

function _updateTshirtDecals() {
  _clearDecals();
  if (!printTexture || !decalMaterial || !shirtMeshes.length || !currentModelGroup) return;

  currentModelGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(currentModelGroup);
  const bs  = box.getSize(new THREE.Vector3());
  const mcx = (box.min.x + box.max.x) / 2;

  const ar     = printTexture.image.width / printTexture.image.height;
  const w      = bs.x * 0.50 * currentTransform.scale;
  const h      = w / ar;
  const preset = currentTransform.preset || 'center';

  let px = mcx;
  if (preset.includes('left'))  px = mcx - bs.x * 0.16;
  if (preset.includes('right')) px = mcx + bs.x * 0.16;

  let py = box.min.y + bs.y * (
    preset.includes('top')    ? 0.72 :
    preset.includes('bottom') ? 0.30 : 0.52);

  // Place origin just INSIDE the front surface so DecalGeometry hits the mesh correctly
  const inset = bs.z * 0.08;   // 8% of model depth below front surface
  let pz = box.max.z - inset;

  const ori = new THREE.Euler();
  if (preset.includes('back')) {
    pz = box.min.z + inset;   // just inside back surface
    ori.y = Math.PI;
    px = mcx - (px - mcx);
  }

  const pos  = new THREE.Vector3(px, py, pz);
  // Depth ~40% of model depth — deep enough to stamp the curved surface but never punch through
  const size = new THREE.Vector3(w, h, Math.min(bs.z * 0.42, 0.22));

  shirtMeshes.forEach(mesh => {
    try {
      const dg = new DecalGeometry(mesh, pos, ori, size);
      const dm = new THREE.Mesh(dg, decalMaterial);
      dm.renderOrder = 1;
      scene.add(dm);
      decalMeshes.push(dm);
    } catch (e) { console.warn('T-shirt decal error:', e); }
  });
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
  const sz = Math.min(maxH * 0.85, maxW / Math.max(text.length, 1) * 1.4);
  ctx.save();
  ctx.font      = `900 ${sz}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // stroke for readability against any cap colour
  ctx.strokeStyle = color === '#ffffff' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)';
  ctx.lineWidth   = sz * 0.09;
  ctx.lineJoin    = 'round';
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle   = color;
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
window.zoneCustomizations = {};
// structure: { 'front-center': { type: 'print'|'embroidery'|'label'|'both', printImg: <Image>, labelText: '', labelColor: '', scale: 0.42, blend: 0.55 }, ... }

const hwMaterials = {}; // map of zoneId -> Material

window.setZoneCustomization = function(zoneId, config) {
  if (!window.zoneCustomizations[zoneId]) {
    window.zoneCustomizations[zoneId] = { scale: 0.42, blend: 0.55 };
  }
  Object.assign(window.zoneCustomizations[zoneId], config);
  
  if (config.printUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { 
      window.zoneCustomizations[zoneId].printImg = img; 
      _rebuildAllDecals(); 
    };
    img.onerror = () => {
      window.zoneCustomizations[zoneId].printImg = null;
      _rebuildAllDecals();
    };
    img.src = config.printUrl;
  } else if (config.printUrl === null) {
    window.zoneCustomizations[zoneId].printImg = null;
    _rebuildAllDecals();
  } else {
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

function _rebuildAllDecals() {
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
  const cy      = box.min.y + boxSize.y * 0.58;
  const cz      = box.max.z;

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
      roughness: 0.85, opacity: 1.0,
    });
    hwMaterials[zoneId] = mat;

    const scale = config.scale !== undefined ? config.scale : 0.42;
    const planeW = boxSize.x * scale;

    let px = cx, py = cy, pz = cz;
    const ori = new THREE.Euler(0, 0, 0);

    if (IS_OUTERWEAR) {
      if (zoneId === 'front' || zoneId === 'front-center') {
        py = cy + boxSize.y * 0.15; pz = cz - boxSize.z * 0.02;
      } else if (zoneId === 'front-left') {
        px = cx - boxSize.x * 0.22; py = cy + boxSize.y * 0.20; pz = cz - boxSize.z * 0.05; ori.y = Math.PI / 12;
      } else if (zoneId === 'front-right') {
        px = cx + boxSize.x * 0.22; py = cy + boxSize.y * 0.20; pz = cz - boxSize.z * 0.05; ori.y = -Math.PI / 12;
      } else if (zoneId === 'back' || zoneId === 'back-center') {
        px = cx; py = cy + boxSize.y * 0.15; pz = box.min.z + boxSize.z * 0.02; ori.y = Math.PI;
      } else if (zoneId === 'sleeve-left') {
        px = cx - boxSize.x * 0.45; py = cy + boxSize.y * 0.10; pz = cz - boxSize.z * 0.35; ori.y = Math.PI / 2;
      } else if (zoneId === 'sleeve-right') {
        px = cx + boxSize.x * 0.45; py = cy + boxSize.y * 0.10; pz = cz - boxSize.z * 0.35; ori.y = -Math.PI / 2;
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
        // Front / back presets
        if (preset.includes('left'))   tx = cx - boxSize.x * 0.16;
        if (preset.includes('right'))  tx = cx + boxSize.x * 0.16;
        if (preset.includes('top'))    ty = box.min.y + boxSize.y * 0.72;
        if (preset.includes('bottom')) ty = box.min.y + boxSize.y * 0.30;

        if (zoneId === 'back' || (preset && preset.includes('back'))) {
          tz = box.min.z + inset;   // just INSIDE back surface
          ori.y = Math.PI;
          if (tx !== cx) tx = cx - (tx - cx);
        }
      }

      px = tx; py = ty; pz = tz;
    }

    const pos = new THREE.Vector3(px, py, pz);
    let depth;
    if (IS_OUTERWEAR) depth = Math.max(0.3, boxSize.z * 1.4);
    else if (IS_HEADWEAR) depth = Math.max(2.0, boxSize.z * 1.5);
    else depth = Math.min(boxSize.z * 0.42, 0.22); // T-shirt: thin stamp, no punch-through

    const size = new THREE.Vector3(planeW, planeW, depth);
    shirtMeshes.forEach(mesh => {
      try {
        const dg = new DecalGeometry(mesh, pos, ori, size);
        const dm = new THREE.Mesh(dg, mat);
        dm.renderOrder = 1;
        scene.add(dm);
        hwDecalMeshes.push(dm);
      } catch(e) {}
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
