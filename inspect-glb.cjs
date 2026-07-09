const { Document, NodeIO } = require('@gltf-transform/core');
const fs = require('fs');

async function inspect() {
    const io = new NodeIO();
    const document = await io.read('public/tshirt.glb');
    
    console.log("=== Nodes ===");
    for (const node of document.getRoot().listNodes()) {
        console.log(`Node: ${node.getName()}`);
    }

    console.log("\n=== Materials ===");
    for (const mat of document.getRoot().listMaterials()) {
        console.log(`Material: ${mat.getName()}`);
    }

    console.log("\n=== Textures ===");
    for (const tex of document.getRoot().listTextures()) {
        console.log(`Texture: ${tex.getName()} (${tex.getMimeType()})`);
    }
}

inspect().catch(console.error);
