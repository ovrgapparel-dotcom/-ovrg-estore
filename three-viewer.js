import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
    _clearHwOverlay();
  }

  new GLTFLoader().load(modelUrl, (gltf) => {
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

    if (IS_HEADWEAR) {
      _rebuildHwOverlay();
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

  // Lighting – bright and flat so white model reads white
  scene.add(new THREE.AmbientLight(0xffffff, 2.0));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.0);
  d1.position.set(1, 2, 3); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.4);
  d2.position.set(-2, 0, -2); scene.add(d2);

  const startUrl = IS_HEADWEAR ? '/cap.glb' : '/scene.gltf';
  window.load3DModel(startUrl);

  new ResizeObserver(_onResize).observe(container);

  (function loop() {
    requestAnimationFrame(loop);
    controls?.update();
    renderer?.render(scene, camera);
  })();
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
  if (!printTexture || !decalMaterial || !shirtMeshes.length) return;
  const ar = printTexture.image.width / printTexture.image.height;
  const w  = 0.8 * currentTransform.scale;
  const h  = w / ar;
  let px = currentTransform.preset.includes('left') ? -0.2
         : currentTransform.preset.includes('right') ? 0.2 : 0;
  let py = currentTransform.preset.includes('top') ? 0.45
         : currentTransform.preset.includes('bottom') ? -0.05 : 0.2;
  let pz = 0.5;
  const ori = new THREE.Euler();
  if (currentTransform.preset.includes('back')) { pz = -0.5; ori.y = Math.PI; px = -px; }
  const pos  = new THREE.Vector3(px, py, pz);
  const size = new THREE.Vector3(w, h, 1.5);
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

function _rebuildHwOverlay() {
  _clearHwOverlay();
  if (!currentModelGroup) return;

  const cv = _buildHwCanvas();
  if (!cv) return;

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace  = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const blend = typeof window.EMBROIDERY_BLEND !== 'undefined' ? window.EMBROIDERY_BLEND : 0.55;
  hwOverlayMat = new THREE.MeshStandardMaterial({
    map:         tex,
    transparent: true,
    depthTest:   true,
    depthWrite:  false,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
    roughness:   0.85,
    opacity:     1.0 - blend * 0.3,
  });

  currentModelGroup.updateMatrixWorld(true);
  const box     = new THREE.Box3().setFromObject(currentModelGroup);
  const boxSize = box.getSize(new THREE.Vector3());
  const cx      = (box.min.x + box.max.x) / 2;
  const cy      = box.min.y + boxSize.y * 0.58;
  const cz      = box.max.z;

  const planeW = boxSize.x * _hwScale;

  const zoneId = window.printPlacement || 'front-center';

  let px = cx;
  let py = cy;
  let pz = cz;
  const ori = new THREE.Euler(0, 0, 0);

  if (zoneId === 'front-left') {
    px = cx - boxSize.x * 0.16;
    pz = cz - boxSize.z * 0.05;
    ori.y = Math.PI / 6;
  } else if (zoneId === 'front-right') {
    px = cx + boxSize.x * 0.16;
    pz = cz - boxSize.z * 0.05;
    ori.y = -Math.PI / 6;
  } else if (zoneId === 'back-center') {
    px = cx;
    pz = box.min.z;
    ori.y = Math.PI;
  } else if (zoneId === 'brim-front') {
    py = box.min.y + boxSize.y * 0.18;
    pz = box.max.z + 0.08;
    ori.x = -Math.PI / 6;
  }

  const pos  = new THREE.Vector3(px, py, pz);
  const size = new THREE.Vector3(planeW, planeW, 2.5);

  shirtMeshes.forEach(mesh => {
    try {
      const dg = new DecalGeometry(mesh, pos, ori, size);
      const dm = new THREE.Mesh(dg, hwOverlayMat);
      dm.renderOrder = 1;
      scene.add(dm);
      hwDecalMeshes.push(dm);
    } catch(e) {
      console.warn('Headwear decal projection error:', e);
    }
  });
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

window.applyHeadwearPrint = function (imageUrl) {
  if (!imageUrl) { _hwPrintImg = null; _rebuildHwOverlay(); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload  = () => { _hwPrintImg = img;  _rebuildHwOverlay(); };
  img.onerror = () => { _hwPrintImg = null; _rebuildHwOverlay(); };
  img.src = imageUrl;
};

window.applyHeadwearLabel = function (text, color) {
  _hwLabelText  = (text  || '').toUpperCase();
  _hwLabelColor =  color || '#ffffff';
  _rebuildHwOverlay();
};

window.setHeadwearDecalScale = function (pct) {
  _hwScale = 0.20 + (pct / 70) * 0.55;
  _rebuildHwOverlay();
};

window.clearHeadwearDecal = function () {
  _hwPrintImg  = null;
  _hwLabelText = '';
  _clearHwOverlay();
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
