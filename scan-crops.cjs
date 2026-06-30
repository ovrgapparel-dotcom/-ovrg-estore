const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

async function scan() {
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
        
        let bluePixels = 0;
        let brownPixels = 0; // leather tag: r > 120, g > 80, b < 60
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            // GAP blue tag: b is dominant, r and g are low
            if (b > r + 35 && b > g + 35 && b > 50) {
                bluePixels++;
            }
            
            // Leather tag: reddish-brown
            if (r > 100 && g > 60 && r > g + 20 && g > b + 20 && b < 100) {
                brownPixels++;
            }
        }
        
        candidates.push({
            file,
            blue: bluePixels / (img.width * img.height),
            brown: brownPixels / (img.width * img.height)
        });
    }
    
    // Sort by blue density
    console.log("=== Top Blue Candidates ===");
    candidates.sort((a,b) => b.blue - a.blue);
    candidates.slice(0, 5).forEach(c => console.log(`${c.file}: blue=${(c.blue*100).toFixed(2)}%, brown=${(c.brown*100).toFixed(2)}%`));
    
    // Sort by brown density
    console.log("\n=== Top Brown Candidates ===");
    candidates.sort((a,b) => b.brown - a.brown);
    candidates.slice(0, 5).forEach(c => console.log(`${c.file}: blue=${(c.blue*100).toFixed(2)}%, brown=${(c.brown*100).toFixed(2)}%`));
}

scan().catch(console.error);
