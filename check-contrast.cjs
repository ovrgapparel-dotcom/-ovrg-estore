const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

async function checkContrast() {
    const cropDir = 'scratch/jacket_crops';
    const files = fs.readdirSync(cropDir).filter(f => f.endsWith('.jpg'));
    
    let candidates = [];
    
    for (const file of files) {
        const filePath = path.join(cropDir, file);
        const img = await loadImage(filePath);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;
        
        // Calculate standard deviation of grayscale values
        let sum = 0;
        let sumSq = 0;
        const count = img.width * img.height;
        
        for (let i = 0; i < data.length; i += 4) {
            const gray = (data[i] + data[i+1] + data[i+2]) / 3;
            sum += gray;
            sumSq += gray * gray;
        }
        
        const mean = sum / count;
        const variance = (sumSq / count) - (mean * mean);
        const stdDev = Math.sqrt(variance);
        
        candidates.push({ file, stdDev, mean });
    }
    
    // Sort by stdDev (highest contrast/texture detail)
    candidates.sort((a,b) => b.stdDev - a.stdDev);
    console.log("=== Top Contrast Candidates ===");
    candidates.slice(0, 15).forEach(c => console.log(`${c.file}: stdDev=${c.stdDev.toFixed(2)}, mean=${c.mean.toFixed(2)}`));
}

checkContrast().catch(console.error);
