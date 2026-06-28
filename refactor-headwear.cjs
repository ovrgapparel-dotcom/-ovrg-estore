const fs = require('fs');
let html = fs.readFileSync('headwear.html', 'utf8');

// 1. Change PRINTS_TABLE
html = html.replace(/const PRINTS_TABLE\s*=\s*'showcase_prints';/, "const PRINTS_TABLE    = 'headwear_embroideries';");

// 2. Update SQL comment
html = html.replace(/create table if not exists showcase_prints/g, "create table if not exists headwear_embroideries");
html = html.replace(/alter table showcase_prints/g, "alter table headwear_embroideries");
html = html.replace(/on showcase_prints/g, "on headwear_embroideries");

// 3. Add back-view UI in the visualizer-tabs
const tabsSearch = `<div class="view-tabs" id="viewTabs">
        <button class="view-tab active" onclick="switchView('front')">Devant</button>
        <button class="view-tab" onclick="switchView('side')">Côté</button>
        <button class="view-tab" onclick="switchView('3d')">Vue 3D</button>
      </div>`;
const tabsReplace = `<div class="view-tabs" id="viewTabs">
        <button class="view-tab active" onclick="switchView('front')">Devant</button>
        <button class="view-tab" onclick="switchView('side')">Côté</button>
        <button class="view-tab" onclick="switchView('back')">Dos</button>
        <button class="view-tab" onclick="switchView('3d')">Vue 3D</button>
      </div>`;
html = html.replace(tabsSearch, tabsReplace);

// 4. Add back-view div
const sideViewSearch = `<div class="tshirt-wrapper" id="side-view" style="display:none">
          <canvas id="tshirt-side" class="tshirt-canvas"></canvas>
          <div class="print-overlay" id="canvas-side" style="display:none"><canvas></canvas></div>
        </div>`;
const backViewStr = `
        <div class="tshirt-wrapper" id="back-view" style="display:none">
          <canvas id="tshirt-back" class="tshirt-canvas"></canvas>
          <div class="print-overlay" id="canvas-back" style="display:none"><canvas></canvas></div>
        </div>`;
html = html.replace(sideViewSearch, sideViewSearch + backViewStr);

// 5. Update loadShirtImages to handle back view
const loadShirtImagesSearch = `['front','side'].forEach(side => {`;
const loadShirtImagesReplace = `['front','side','back'].forEach(side => {`;
html = html.replace(loadShirtImagesSearch, loadShirtImagesReplace);

// 6. Update Admin Settings UI for Mockups
const newAdminTabSettingsHTML = `          <div style="margin-top:1.5rem;">
            <label>Prix de base (FCFA)</label>
            <input type="number" id="headwearBasePrice" placeholder="9000" value="9000" min="0" step="500" style="width: 150px;">
          </div>

          <h3 style="margin-top:2rem; color:var(--primary); font-family:'Bebas Neue',sans-serif; letter-spacing:0.05em; font-size:1.3rem;">Mockups par couleur</h3>
          <p style="color:#aaa;font-size:0.85rem;margin-bottom:1rem">Uploadez les mockups spécifiques (Devant, Côté, Dos) pour Casquette et Bob.</p>
          
          <div id="settingsColorMockupsList">
            <!-- Rendu JS -->
          </div>

          <div style="margin-top:1.5rem; display:flex; gap:0.5rem; align-items:center;">
            <input type="color" id="newGlobalColor" value="#ff0000" style="width:40px;height:40px;padding:0;border:none;border-radius:4px;cursor:pointer">
            <button class="btn-secondary" style="padding:0.6rem 1rem;font-size:0.85rem" onclick="addColorMockup()">+ Ajouter une couleur</button>
          </div>

          <div style="margin-top:2rem">
            <button class="btn-save" onclick="saveHeadwearSettings()">💾 Sauvegarder les paramètres</button>
          </div>`;

html = html.replace(/<div style="margin-top:1.5rem;">[\s\S]*?<label>Prix de base \(FCFA\)<\/label>[\s\S]*?<button class="btn-save" onclick="saveHeadwearSettings\(\)">💾 Sauvegarder les paramètres<\/button>\s*<\/div>/, newAdminTabSettingsHTML);

fs.writeFileSync('headwear.html', html);
console.log('Done refactoring basic HTML strings.');
