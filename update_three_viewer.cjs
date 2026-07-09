const fs = require('fs');
let code = fs.readFileSync('three-viewer.js', 'utf8');

// The new multi-zone logic to add before window.applyHeadwearPrint
const multiZoneLogic = `
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
      roughness: 0.85, opacity: 1.0 - blend * 0.3,
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
      // T-shirt simple zones
      if (zoneId === 'front') {
        px = cx; py = box.min.y + boxSize.y * 0.65; pz = cz; ori.y = 0;
      } else if (zoneId === 'back') {
        px = cx; py = box.min.y + boxSize.y * 0.65; pz = box.min.z; ori.y = Math.PI;
      }
    }

    const pos = new THREE.Vector3(px, py, pz);
    const size = new THREE.Vector3(planeW, planeW, 2.5);

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
`;

// Replace `function _rebuildHwOverlay()` completely
const rebuildRegex = /function _rebuildHwOverlay\(\) \{[\s\S]*?\n\}/;
code = code.replace(rebuildRegex, multiZoneLogic);

// We need to keep legacy window.applyHeadwearPrint working by redirecting to multi-zone API
const legacyWrapperRegex = /window\.applyHeadwearPrint = function[\s\S]*?window\.clearHeadwearDecal = function \(\) \{[\s\S]*?\n\};/;
const newWrappers = `
window.applyHeadwearPrint = function (imageUrl) {
  const z = window.printPlacement || 'front-center';
  window.setZoneCustomization(z, { printUrl: imageUrl });
};

window.applyHeadwearLabel = function (text, color) {
  const z = window.printPlacement || 'front-center';
  window.setZoneCustomization(z, { labelText: (text||'').toUpperCase(), labelColor: color || '#ffffff' });
};

window.setHeadwearDecalScale = function (pct) {
  const z = window.printPlacement || 'front-center';
  window.setZoneCustomization(z, { scale: 0.20 + (pct / 70) * 0.55 });
};

window.clearHeadwearDecal = function () {
  const z = window.printPlacement || 'front-center';
  window.clearZoneCustomization(z);
};
`;
code = code.replace(legacyWrapperRegex, newWrappers);

// Fix model loading to call _rebuildAllDecals instead of _rebuildHwOverlay
code = code.replace(/_rebuildHwOverlay\(\);/g, '_rebuildAllDecals();');
code = code.replace(/_clearHwOverlay\(\);/g, 'window.clearAllZones();');

fs.writeFileSync('three-viewer.js', code);
console.log('three-viewer.js updated for multi-zone.');
