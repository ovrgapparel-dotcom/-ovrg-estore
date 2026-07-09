const fs = require('fs');

const files = ['showcase.html', 'outerwear.html', 'headwear.html'];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');

  // 1. Add Type dropdown to admin form
  const categoryRegex = /<label>Catégorie \/ Badge<\/label>\s*<input type="text" id="printCategory"/;
  const newFields = `
              <label>Type de design</label>
              <select id="printType" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-bottom: 1rem; background: var(--light); font-family: inherit;">
                <option value="print">🎨 Imprimé</option>
                <option value="embroidery">🧵 Broderie</option>
              </select>
              <label>Catégorie / Badge</label>
              <input type="text" id="printCategory"`;
  code = code.replace(categoryRegex, newFields);

  // 2. Update resetPrintForm to reset printType
  code = code.replace(
    /document\.getElementById\('printCategory'\)\.value = 'Édition Limitée';/,
    `document.getElementById('printCategory').value = 'Édition Limitée';\n  if(document.getElementById('printType')) document.getElementById('printType').value = 'print';`
  );

  // 3. Update editPrint logic to populate printType
  const editRegex = /document\.getElementById\('printCategory'\)\.value = p\.category \|\| '';/;
  const editReplace = `document.getElementById('printCategory').value = p.category || '';
  if(document.getElementById('printType')) {
    document.getElementById('printType').value = (p.category && p.category.startsWith('Broderie')) ? 'embroidery' : 'print';
  }`;
  code = code.replace(editRegex, editReplace);

  // 4. Update savePrint logic to read printType and prefix category
  const saveRegex = /const category = document\.getElementById\('printCategory'\)\.value\.trim\(\);/;
  const saveReplace = `let category = document.getElementById('printCategory').value.trim();
    const type = document.getElementById('printType') ? document.getElementById('printType').value : 'print';
    if (type === 'embroidery' && !category.startsWith('Broderie')) {
      category = 'Broderie: ' + category;
    }`;
  code = code.replace(saveRegex, saveReplace);

  // 5. Update admin Print list to show badge
  const badgeRegex = /<span class="admin-badge">\${p\.category}<\/span>` : ''\}/g;
  const badgeReplace = `<span class="admin-badge">\${p.category}</span>\` : ''}
              <span class="admin-badge" style="background:\${(p.category && p.category.startsWith('Broderie')) ? '#4ecdc4' : '#ff6b35'}">\${(p.category && p.category.startsWith('Broderie')) ? 'Broderie' : 'Imprimé'}</span>`;
  code = code.replace(badgeRegex, badgeReplace);

  fs.writeFileSync(file, code);
  console.log(file + ' updated admin panel.');
}
