const { Document, NodeIO } = require('@gltf-transform/core');
const { KHRMaterialsPBRSpecularGlossiness } = require('@gltf-transform/extensions');
const fs = require('fs');
const path = require('path');

async function extract(filename, outDir) {
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    const io = new NodeIO().registerExtensions([KHRMaterialsPBRSpecularGlossiness]);
    const document = await io.read(filename);
    
    const textures = document.getRoot().listTextures();
    console.log(`Extracting ${textures.length} textures from ${filename}...`);
    for (let i = 0; i < textures.length; i++) {
        const tex = textures[i];
        const name = tex.getName() || `texture_${i}`;
        const mime = tex.getMimeType();
        const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
        const fileOut = path.join(outDir, `${name}.${ext}`);
        fs.writeFileSync(fileOut, Buffer.from(tex.getImage()));
        console.log(`Saved ${fileOut}`);
    }
}

async function run() {
    await extract('jacket.glb', 'scratch/jacket_textures');
}

run().catch(console.error);
