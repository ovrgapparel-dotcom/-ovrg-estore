const { Document, NodeIO } = require('@gltf-transform/core');
const { KHRMaterialsPBRSpecularGlossiness } = require('@gltf-transform/extensions');
const fs = require('fs');

async function inspect(filename) {
    const io = new NodeIO().registerExtensions([KHRMaterialsPBRSpecularGlossiness]);
    const document = await io.read(filename);
    
    console.log(`=== ${filename} ===`);
    console.log("Nodes:");
    for (const node of document.getRoot().listNodes()) {
        console.log(`- Node: ${node.getName()}`);
    }

    console.log("Materials:");
    for (const mat of document.getRoot().listMaterials()) {
        console.log(`- Material: ${mat.getName()}`);
        console.log(`  Color: ${mat.getBaseColorFactor()}`);
        const texture = mat.getBaseColorTexture();
        if (texture) {
            console.log(`  Base Color Texture: ${texture.getName()} (${texture.getMimeType()})`);
        }
    }

    console.log("Textures:");
    for (const tex of document.getRoot().listTextures()) {
        console.log(`- Texture: ${tex.getName()} (${tex.getMimeType()})`);
    }
    console.log("\n");
}

async function run() {
    await inspect('public/cap.glb');
    await inspect('public/bucket.glb');
}

run().catch(console.error);
