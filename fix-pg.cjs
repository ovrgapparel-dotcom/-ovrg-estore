const fs = require('fs');

let html = fs.readFileSync('outerwear.html', 'utf8');

// 1. Add new zones
html = html.replace(/jacket: \[([\s\S]*?)\]/, (match, p1) => {
    return `jacket: [` + p1 + `,
    { id: 'front-center-high', label: 'Centre Haut',    cx: 300, cy: 150, w: 100, h: 80 },
    { id: 'front-center-mid',  label: 'Centre Milieu',  cx: 300, cy: 230, w: 120, h: 80 },
    { id: 'front-center-low',  label: 'Centre Bas',     cx: 300, cy: 310, w: 120, h: 80 }
  ]`;
});

html = html.replace(/hoodie: \[([\s\S]*?)\]/, (match, p1) => {
    return `hoodie: [` + p1 + `,
    { id: 'front-center-high', label: 'Centre Haut',    cx: 300, cy: 160, w: 100, h: 80 },
    { id: 'front-center-mid',  label: 'Centre Milieu',  cx: 300, cy: 240, w: 120, h: 80 },
    { id: 'front-center-low',  label: 'Centre Bas',     cx: 300, cy: 320, w: 120, h: 80 }
  ]`;
});

// 2. Fix placement guide logic
html = html.replace(/pgCurrentType\s*=\s*'cap'/g, "pgCurrentType = 'jacket'");
html = html.replace(/EMBROIDERY_ZONES\.cap/g, "EMBROIDERY_ZONES.jacket");

html = html.replace(/pgTypeCap/g, "pgTypeJacket");
html = html.replace(/pgTypeBucket/g, "pgTypeHoodie");
html = html.replace(/setPgType\('cap'\)/g, "setPgType('jacket')");
html = html.replace(/setPgType\('bucket'\)/g, "setPgType('hoodie')");
html = html.replace(/>Casquette</g, ">Veste<");
html = html.replace(/>Bob</g, ">Hoodie<");

html = html.replace(/pgCurrentType === 'cap'/g, "pgCurrentType === 'jacket'");
html = html.replace(/pgCurrentType === 'bucket'/g, "pgCurrentType === 'hoodie'");
html = html.replace(/\? 'casquette' : 'bob'/g, "? 'veste' : 'hoodie'");

// 3. Fix the draw function calls to something generic if we don't have silhouettes
let drawBlock = `  // • Draw silhouette •
  if (pgCurrentType === 'hoodie') {
    pgDrawHoodieSilhouette(ctx);
  } else {
    pgDrawJacketSilhouette(ctx);
  }`;

// Carefully replace the if/else for silhouette drawing
html = html.replace(/if \(pgCurrentType === 'bucket'\) \{[\s\S]*?pgDrawBucketSilhouette\(ctx\);[\s\S]*?\} else \{[\s\S]*?pgDrawCapSilhouette\(ctx\);[\s\S]*?\}/, drawBlock);

// 4. Also replace the function bodies for the silhouettes
let silhouettes = `
function pgDrawJacketSilhouette(ctx) {
  ctx.save();
  ctx.fillStyle = '#444';
  ctx.beginPath();
  ctx.moveTo(PG_SX * 200, PG_SY * 100);
  ctx.lineTo(PG_SX * 400, PG_SY * 100);
  ctx.lineTo(PG_SX * 450, PG_SY * 400);
  ctx.lineTo(PG_SX * 150, PG_SY * 400);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function pgDrawHoodieSilhouette(ctx) {
  ctx.save();
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(PG_SX * 250, PG_SY * 50);
  ctx.lineTo(PG_SX * 350, PG_SY * 50);
  ctx.lineTo(PG_SX * 400, PG_SY * 150);
  ctx.lineTo(PG_SX * 450, PG_SY * 400);
  ctx.lineTo(PG_SX * 150, PG_SY * 400);
  ctx.lineTo(PG_SX * 200, PG_SY * 150);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
`;
html = html.replace(/function pgDrawCapSilhouette[\s\S]*?function pgDrawBucketSilhouette[\s\S]*?\n\}/, silhouettes);

fs.writeFileSync('outerwear.html', html);
console.log('Fixed outerwear.html');
