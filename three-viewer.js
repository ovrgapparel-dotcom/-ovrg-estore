import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

let scene, camera, renderer, controls;
let shirtMeshes = [];
let printTexture = null;
let decalMaterial = null;
let decalMeshes = []; // The decals projected onto the shirt

// Transform state
let currentTransform = { scale: 0.5, preset: 'center', blend: 0 };

export function initThreeViewer() {
  console.log("initThreeViewer called!");
  const container = document.getElementById('threeContainer');
  if (!container) { console.log("No container found!"); return; }
  
  // container.style.border = "5px solid red";

  container.innerHTML = ''; // Clear

  const initWidth = container.clientWidth || 400;
  const initHeight = container.clientHeight || 500;

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#f0f0f0'); 

  camera = new THREE.PerspectiveCamera(45, initWidth / initHeight, 0.1, 100);
  camera.position.set(0, 0, 3.5);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(initWidth, initHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 1.5;
  controls.maxDistance = 6;
  controls.target.set(0, 0.2, 0); // Look slightly up at chest

  // Auto rotate to make it dynamic
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2.0;
  
  // Pause auto-rotation when user interacts
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);
  
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(2, 2, 2);
  scene.add(dirLight);

  const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
  backLight.position.set(-2, 2, -2);
  scene.add(backLight);

  // Load GLTF Model
  console.log("Starting GLTFLoader...");
  const loader = new GLTFLoader();
  loader.load('/scene.gltf', (gltf) => {
    console.log("GLTF model loaded!");
    const model = gltf.scene;
    
    // Center the model and scale it to fit viewport
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Normalize scale so height is approx 2 units
    const scale = 2.0 / size.y;
    model.scale.set(scale, scale, scale);
    model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    
    // Lower it slightly so chest is centered
    model.position.y -= 0.3;

    scene.add(model);

    // Collect meshes to apply colors and decals
    model.traverse((child) => {
      if (child.isMesh) {
        shirtMeshes.push(child);
        // Ensure material is unique if we want to change color safely
        if (child.material) {
          child.material = child.material.clone();
          child.material.color.set('#ffffff'); // Default white
          child.material.needsUpdate = true;
        }
      }
    });

    // Re-apply decal if texture was loaded before model finished
    updateDecals();
  });

  const resizeObserver = new ResizeObserver(() => {
    onWindowResize();
  });
  resizeObserver.observe(container);

  console.log("Setup complete, starting animate loop.");
  function animate() {
    requestAnimationFrame(animate);
    if(controls) controls.update();
    if(renderer && scene && camera) renderer.render(scene, camera);
  }
  animate();
}

function onWindowResize() {
  const container = document.getElementById('threeContainer');
  console.log("onWindowResize triggered. Container width:", container?.clientWidth);
  if (!container || container.clientWidth === 0) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.trigger3DResize = function() {
  onWindowResize();
};

// ── GLOBAL HOOKS FOR UI ──

window.setShirtColor = function(colorHex) {
  shirtMeshes.forEach(mesh => {
    if (mesh.material) {
      mesh.material.color.set(colorHex);
    }
  });
};

window.applyPrintTexture = function(imageUrl) {
  if (!imageUrl) {
    printTexture = null;
    clearDecals();
    return;
  }

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(imageUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    printTexture = texture;
    
    if (!decalMaterial) {
      decalMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        roughness: 0.8 // fabric-like
      });
    } else {
      decalMaterial.map = texture;
    }
    
    updateDecals();
  });
};

window.setPrintTransform = function({ scale, preset, blend }) {
  currentTransform = { scale, preset, blend };
  
  if (decalMaterial) {
    decalMaterial.opacity = 1.0 - (blend * 0.3);
  }
  
  updateDecals();
};

function clearDecals() {
  decalMeshes.forEach(d => {
    scene.remove(d);
    d.geometry.dispose();
  });
  decalMeshes = [];
}

function updateDecals() {
  clearDecals();
  if (!printTexture || !decalMaterial || shirtMeshes.length === 0) return;

  const aspect = printTexture.image.width / printTexture.image.height;
  
  const baseWidth = 0.8; // slightly wider base
  let w = baseWidth * currentTransform.scale;
  let h = w / aspect;
  
  let posX = 0;
  let posY = 0.2; // Adjusted down slightly
  let posZ = 0.5;
  
  const orientation = new THREE.Euler(0, 0, 0);

  // 9-grid presets mapping
  // X: left = -0.2, center = 0, right = 0.2
  // Y: top = 0.45, center = 0.2, bottom = -0.05
  // Z: front = 0.5, back = -0.5
  
  if (currentTransform.preset.includes('left')) posX = -0.2;
  else if (currentTransform.preset.includes('right')) posX = 0.2;
  else posX = 0; // center

  if (currentTransform.preset.includes('top')) posY = 0.45;
  else if (currentTransform.preset.includes('bottom')) posY = -0.05;
  else posY = 0.2; // mid/center

  // If the preset explicitly says 'back' (for backward compatibility) or if we ever add back placement
  if (currentTransform.preset.includes('back')) {
    posZ = -0.5;
    orientation.y = Math.PI;
    // reverse X since we're looking at the back
    posX = -posX;
  }
  
  // Increase depth to 1.5 to guarantee intersection with the shirt mesh
  // The decal projector box extends depth/2 in both +Z and -Z from its position.
  // If orientation is 0,0,0, it projects along the local Z axis of the mesh? 
  // No, DecalGeometry uses world coordinates for position, but orientation determines the projection direction.
  const position = new THREE.Vector3(posX, posY, posZ);
  const size = new THREE.Vector3(w, h, 1.5); 


  shirtMeshes.forEach(mesh => {
    // Some meshes (like the GLTF exported from Blender) might be rotated.
    // DecalGeometry takes world position/orientation, but if the shirt's matrixWorld is wildly scaled, 
    // it could distort the decal. The shirt is uniformly scaled, so it should be fine.
    const decalGeo = new DecalGeometry(mesh, position, orientation, size);
    const decalMesh = new THREE.Mesh(decalGeo, decalMaterial);
    decalMesh.renderOrder = 1;
    scene.add(decalMesh);
    decalMeshes.push(decalMesh);
  });
}

// Initialize
if (document.readyState !== 'loading') {
  initThreeViewer();
} else {
  document.addEventListener('DOMContentLoaded', initThreeViewer);
}
