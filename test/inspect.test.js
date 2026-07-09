import { describe, it } from 'vitest';
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

describe('GLB Inspector', () => {
  it('inspects jacket.glb and hoodie.glb', async () => {
    const loader = new GLTFLoader();
    
    const inspectModel = (filename) => {
      return new Promise((resolve, reject) => {
        const filePath = `C:/Users/aut40nov19/.gemini/antigravity-ide/scratch/ovrg-estore/public/${filename}`;
        const buffer = fs.readFileSync(filePath);
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        
        loader.parse(arrayBuffer, '', (gltf) => {
          const model = gltf.scene || gltf.scenes[0];
          console.log(`\n================ ${filename} ================`);
          
          const rawBox = new THREE.Box3().setFromObject(model);
          const rawSize = rawBox.getSize(new THREE.Vector3());
          const modelScore = rawSize.x + rawSize.y + rawSize.z;
          
          console.log(`Bounding Box size: x=${rawSize.x.toFixed(4)}, y=${rawSize.y.toFixed(4)}, z=${rawSize.z.toFixed(4)}`);
          console.log(`modelScore: ${modelScore.toFixed(4)}`);
          
          let meshCount = 0;
          let targetCount = 0;
          
          model.traverse((child) => {
            if (child.isMesh) {
              meshCount++;
              const childBox = new THREE.Box3().setFromObject(child);
              const childSize = childBox.getSize(new THREE.Vector3());
              const childScore = childSize.x + childSize.y + childSize.z;
              const isTarget = childScore > modelScore * 0.01;
              if (isTarget) targetCount++;
              
              console.log(`Mesh: "${child.name}" [UUID: ${child.uuid}]`);
              console.log(`  - Size: x=${childSize.x.toFixed(4)}, y=${childSize.y.toFixed(4)}, z=${childSize.z.toFixed(4)}`);
              console.log(`  - Score: ${childScore.toFixed(4)} vs Threshold: ${(modelScore * 0.01).toFixed(4)} (Included: ${isTarget})`);
            }
          });
          
          console.log(`Summary: ${meshCount} total meshes, ${targetCount} target meshes.`);
          resolve();
        }, reject);
      });
    };

    await inspectModel('jacket.glb');
    await inspectModel('hoodie.glb');
  }, 60000);
});
