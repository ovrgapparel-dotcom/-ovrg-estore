const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

async function analyze(file) {
    console.log(`Loading ${file}...`);
    const img = await loadImage(file);
    const canvas = createCanvas(10, 10);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 10, 10);
    const data = ctx.getImageData(0, 0, 10, 10).data;
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i+1];
        b += data[i+2];
        a += data[i+3];
    }
    const count = data.length / 4;
    console.log(`Average color for ${file}: rgb(${Math.round(r/count)}, ${Math.round(g/count)}, ${Math.round(b/count)}) alpha=${Math.round(a/count)}`);
}

async function run() {
    await analyze('scratch/jacket_textures/texture_0.jpg');
    await analyze('scratch/jacket_textures/texture_1.png');
    await analyze('scratch/jacket_textures/texture_2.jpg');
}

run().catch(console.error);
