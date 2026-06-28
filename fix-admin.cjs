const fs = require('fs');

let html = fs.readFileSync('outerwear.html', 'utf8');

// 1. Fix admin color mockup generation
html = html.replace(/cap_front: null, cap_side: null, cap_back: null,/g, "jacket_front: null, jacket_side: null, jacket_back: null,");
html = html.replace(/bucket_front: null, bucket_side: null, bucket_back: null/g, "hoodie_front: null, hoodie_side: null, hoodie_back: null");

// 2. Fix admin color mockup upload keys in renderSettingsColorMockups
html = html.replace(/uploadHeadwearMockup\(event, i, 'cap_front'\)/g, "uploadHeadwearMockup(event, i, 'jacket_front')");
html = html.replace(/uploadHeadwearMockup\(event, i, 'cap_side'\)/g, "uploadHeadwearMockup(event, i, 'jacket_side')");
html = html.replace(/uploadHeadwearMockup\(event, i, 'cap_back'\)/g, "uploadHeadwearMockup(event, i, 'jacket_back')");
html = html.replace(/uploadHeadwearMockup\(event, i, 'bucket_front'\)/g, "uploadHeadwearMockup(event, i, 'hoodie_front')");
html = html.replace(/uploadHeadwearMockup\(event, i, 'bucket_side'\)/g, "uploadHeadwearMockup(event, i, 'hoodie_side')");
html = html.replace(/uploadHeadwearMockup\(event, i, 'bucket_back'\)/g, "uploadHeadwearMockup(event, i, 'hoodie_back')");

// Also replace the names in the admin table
html = html.replace(/>Casquette Devant</g, ">Veste Devant<");
html = html.replace(/>Casquette Côté</g, ">Veste Côté<");
html = html.replace(/>Casquette Dos</g, ">Veste Dos<");
html = html.replace(/>Bob Devant</g, ">Hoodie Devant<");
html = html.replace(/>Bob Côté</g, ">Hoodie Côté<");
html = html.replace(/>Bob Dos</g, ">Hoodie Dos<");

// Replace properties for src lookup in the template
html = html.replace(/src="\$\{m\.cap_front/g, 'src="${m.jacket_front');
html = html.replace(/src="\$\{m\.cap_side/g, 'src="${m.jacket_side');
html = html.replace(/src="\$\{m\.cap_back/g, 'src="${m.jacket_back');
html = html.replace(/src="\$\{m\.bucket_front/g, 'src="${m.hoodie_front');
html = html.replace(/src="\$\{m\.bucket_side/g, 'src="${m.hoodie_side');
html = html.replace(/src="\$\{m\.bucket_back/g, 'src="${m.hoodie_back');

// 3. Fix payload ID
html = html.replace(/id: 2,/g, "id: 3,");

// 4. Fix updateShirtImagesForColor
html = html.replace(/if \(productType === 'cap'\) \{[\s\S]*?SHIRT_IMAGES\.back  = match\.bucket_back  \|\| null;\n  \}/, `if (productType === 'jacket') {
    SHIRT_IMAGES.front = match.jacket_front || null;
    SHIRT_IMAGES.side  = match.jacket_side  || null;
    SHIRT_IMAGES.back  = match.jacket_back  || null;
  } else {
    SHIRT_IMAGES.front = match.hoodie_front || null;
    SHIRT_IMAGES.side  = match.hoodie_side  || null;
    SHIRT_IMAGES.back  = match.hoodie_back  || null;
  }`);

// 5. Check paintFallbackCanvas logic for outerwear
html = html.replace(/function paintFallbackCanvas\(view\) \{[\s\S]*?ctx\.restore\(\);\n\}/, `function paintFallbackCanvas(view) {
  const canvas = document.getElementById('tshirt-' + view);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 600; canvas.height = 600;
  ctx.clearRect(0, 0, 600, 600);
  
  // Outerwear fallback placeholder
  ctx.fillStyle = selectedColor || '#333';
  ctx.fillRect(100, 100, 400, 400); // Simple square fallback
  
  ctx.fillStyle = '#fff';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(productType.toUpperCase() + ' - ' + view.toUpperCase(), 300, 300);
  ctx.font = '16px sans-serif';
  ctx.fillText('Mockup manquant', 300, 330);
}`);

fs.writeFileSync('outerwear.html', html);
console.log('Fixed admin settings in outerwear.html');
