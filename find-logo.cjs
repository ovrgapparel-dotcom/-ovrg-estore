const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

async function findLogo() {
    console.log("Loading texture_0.jpg...");
    const img = await loadImage('scratch/jacket_textures/texture_0.jpg');
    const w = img.width;
    const h = img.height;
    console.log(`Dimensions: ${w}x${h}`);

    // Create canvas
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // We will scan the image in a grid of 100x100 blocks
    // and find blocks that have a distinct color (e.g. very blue, very red, or brown/leather, or solid color)
    // or we can save a downscaled version of the texture as a grid of crops.
    // Let's create a directory for crops
    const cropDir = 'scratch/jacket_crops';
    if (!fs.existsSync(cropDir)) {
        fs.mkdirSync(cropDir, { recursive: true });
    }

    // Let's divide the image into 8x8 grid (64 crops) so we can easily look at them
    const cols = 8;
    const rows = 8;
    const cw = Math.floor(w / cols);
    const ch = Math.floor(h / rows);

    console.log(`Saving ${cols * rows} grid crops of size ${cw}x${ch}...`);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cropCanvas = createCanvas(cw, ch);
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(img, c * cw, r * ch, cw, ch, 0, 0, cw, ch);
            
            // Check if this crop has something interesting (e.g., text or distinct colors)
            // Let's save all crops to make sure we don't miss anything.
            const fileOut = path.join(cropDir, `crop_r${r}_c${c}.jpg`);
            const out = fs.createWriteStream(fileOut);
            const stream = cropCanvas.createJPEGStream({ quality: 0.8 });
            stream.pipe(out);
            await new Promise(res => out.on('finish', res));
        }
    }
    console.log("Crops saved successfully!");
}

findLogo().catch(console.error);
