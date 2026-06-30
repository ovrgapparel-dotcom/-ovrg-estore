
// ══════════════════════════════════════════════════════════════
//  PLACEMENT GUIDE POPUP — JS
//  Draws an interactive hat diagram with clickable embroidery zones
// ══════════════════════════════════════════════════════════════

// Colours for each zone (index-based)
const ZONE_COLORS = ['#ff6b35','#4ecdc4','#ffe66d','#a8e6cf'];

let pgCurrentType   = 'cap';     // 'cap' | 'bucket'
let pgSelectedZone  = 'front-center';
let pgHoveredZone   = null;

// Open popup, sync to current state
function openPlacementGuide() {
  pgCurrentType  = productType;
  pgSelectedZone = activeZoneId;
  document.getElementById('placementGuide').style.display = '';
  document.body.style.overflow = 'hidden';
  // Sync type buttons
  document.getElementById('pgTypeCap').classList.toggle('active', pgCurrentType === 'cap');
  document.getElementById('pgTypeBucket').classList.toggle('active', pgCurrentType === 'bucket');
  document.getElementById('pgHatLabel').textContent = pgCurrentType === 'cap' ? 'casquette' : 'bob';
  pgBuildZoneList();
  pgDraw();
}

function closePlacementGuide() {
  document.getElementById('placementGuide').style.display = 'none';
  document.body.style.overflow = '';
}

function setPgType(type) {
  pgCurrentType = type;
  pgSelectedZone = 'front-center';
  document.getElementById('pgTypeCap').classList.toggle('active', type === 'cap');
  document.getElementById('pgTypeBucket').classList.toggle('active', type === 'bucket');
  document.getElementById('pgHatLabel').textContent = type === 'cap' ? 'casquette' : 'bob';
  pgBuildZoneList();
  pgDraw();
}

function applyPgSelection() {
  // Push type + zone back to main page
  if (pgCurrentType !== productType) setProductType(pgCurrentType);
  setZone(pgSelectedZone);
  closePlacementGuide();
}

// Build the zone list in the right panel
function pgBuildZoneList() {
  const list = document.getElementById('pgZoneList');
  if (!list) return;
  const zones = EMBROIDERY_ZONES[pgCurrentType] || EMBROIDERY_ZONES.cap;
  list.innerHTML = zones.map((z, i) => `
    <div class="pg-zone-item${z.id === pgSelectedZone ? ' active' : ''}"
         onclick="pgSelectZone('${z.id}'); applyPgSelection();" data-zone="${z.id}">
      <div class="pg-zone-dot" style="background:${ZONE_COLORS[i % ZONE_COLORS.length]}"></div>
      <span class="pg-zone-name">${z.label}</span>
    </div>`).join('');
}

function pgSelectZone(zoneId) {
  pgSelectedZone = zoneId;
  // Update zone list highlight
  document.querySelectorAll('#pgZoneList .pg-zone-item').forEach(el => {
    el.classList.toggle('active', el.dataset.zone === zoneId);
  });
  pgDraw();
}

// ── Canvas drawing ────────────────────────────────────────────
// Scaled from the 600×600 paintFallbackCanvas paths → 400×380 canvas
const PG_W = 400, PG_H = 380;
const PG_SX = PG_W / 600, PG_SY = PG_H / 600;

function pgScale(x, y) { return [x * PG_SX, y * PG_SY]; }

function pgDraw() {
  const canvas = document.getElementById('pgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, PG_W, PG_H);

  // Dark background
  ctx.fillStyle = '#1a1d24';
  ctx.beginPath();
  ctx.roundRect(0, 0, PG_W, PG_H, 12);
  ctx.fill();

  const zones = EMBROIDERY_ZONES[pgCurrentType] || EMBROIDERY_ZONES.cap;

  // ── Draw hat silhouette ──────────────────────────────────────
  if (pgCurrentType === 'bucket') {
    pgDrawBucketSilhouette(ctx);
  } else {
    pgDrawCapSilhouette(ctx);
  }

  // ── Draw zone overlays ────────────────────────────────────────
  zones.forEach((z, i) => {
    const cx  = z.cx * PG_SX;
    const cy  = z.cy * PG_SY;
    const hw  = z.w  * PG_SX / 2;
    const hh  = z.h  * PG_SY / 2;
    const col = ZONE_COLORS[i % ZONE_COLORS.length];
    const isSelected = z.id === pgSelectedZone;
    const isHovered  = z.id === pgHoveredZone;

    ctx.save();
    ctx.globalAlpha = isSelected ? 0.35 : isHovered ? 0.20 : 0.10;
    ctx.fillStyle   = col;
    ctx.beginPath();
    ctx.roundRect(cx - hw, cy - hh, hw * 2, hh * 2, 4);
    ctx.fill();
    ctx.globalAlpha = isSelected ? 1.0 : isHovered ? 0.75 : 0.45;
    ctx.strokeStyle = col;
    ctx.lineWidth   = isSelected ? 2.5 : 1.5;
    ctx.setLineDash(isSelected ? [] : [4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Zone label inside the box
    ctx.save();
    ctx.font = `${isSelected ? 600 : 500} ${Math.min(10, hw * 0.35)}px DM Sans, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = isSelected ? '#fff' : col;
    ctx.globalAlpha  = isSelected ? 1.0 : 0.8;
    ctx.fillText(z.label, cx, cy);
    ctx.restore();
  });

  // ── Selected zone: animated ring ─────────────────────────────
  const selZone = zones.find(z => z.id === pgSelectedZone);
  if (selZone) {
    const cx = selZone.cx * PG_SX;
    const cy = selZone.cy * PG_SY;
    const hw = selZone.w  * PG_SX / 2;
    const hh = selZone.h  * PG_SY / 2;
    ctx.save();
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = 'rgba(255,107,53,0.6)';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.roundRect(cx - hw - 3, cy - hh - 3, hw * 2 + 6, hh * 2 + 6, 6);
    ctx.stroke();
    ctx.restore();
  }
}

function pgDrawCapSilhouette(ctx) {
  const c = (x, y) => pgScale(x, y);
  ctx.save();
  ctx.fillStyle = '#2d3142'; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5;
  // Crown
  ctx.beginPath();
  ctx.moveTo(...c(100,360)); ctx.bezierCurveTo(...c(80,180),...c(160,80),...c(300,70));
  ctx.bezierCurveTo(...c(440,80),...c(500,180),...c(510,360)); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Visor
  ctx.fillStyle = '#252836';
  ctx.beginPath();
  ctx.moveTo(...c(100,360)); ctx.bezierCurveTo(...c(80,375),...c(60,390),...c(50,410));
  ctx.bezierCurveTo(...c(80,430),...c(200,445),...c(305,440));
  ctx.bezierCurveTo(...c(200,435),...c(110,410),...c(110,390));
  ctx.bezierCurveTo(...c(115,375),...c(120,368),...c(130,365));
  ctx.fill(); ctx.stroke();
  // Sweatband
  ctx.beginPath();
  ctx.moveTo(...c(100,360)); ctx.bezierCurveTo(...c(200,375),...c(400,378),...c(510,360));
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2.5; ctx.stroke();
  // Centre seam
  ctx.beginPath();
  ctx.moveTo(...c(300,70)); ctx.lineTo(...c(300,355));
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

function pgDrawBucketSilhouette(ctx) {
  const c = (x, y) => pgScale(x, y);
  ctx.save();
  ctx.fillStyle = '#252836'; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5;
  // Brim
  ctx.beginPath();
  ctx.ellipse(...c(300,440), 230 * PG_SX, 55 * PG_SY, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // Crown
  ctx.fillStyle = '#2d3142';
  ctx.beginPath();
  ctx.moveTo(...c(100,410));
  ctx.bezierCurveTo(...c(80,250),...c(130,100),...c(300,90));
  ctx.bezierCurveTo(...c(470,100),...c(520,250),...c(500,410));
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// Hit-test: find which zone the click lands in
function pgGetZoneAt(mx, my) {
  const zones = EMBROIDERY_ZONES[pgCurrentType] || EMBROIDERY_ZONES.cap;
  // Iterate in reverse so top-most zone wins
  for (let i = zones.length - 1; i >= 0; i--) {
    const z  = zones[i];
    const cx = z.cx * PG_SX, cy = z.cy * PG_SY;
    const hw = z.w * PG_SX / 2, hh = z.h * PG_SY / 2;
    if (mx >= cx - hw && mx <= cx + hw && my >= cy - hh && my <= cy + hh) return z.id;
  }
  return null;
}

function pgCanvasPos(e) {
  const r = e.target.getBoundingClientRect();
  const sx = PG_W / r.width, sy = PG_H / r.height;
  return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy];
}

function pgHandleClick(e) {
  const [mx, my] = pgCanvasPos(e);
  const zoneId = pgGetZoneAt(mx, my);
  if (zoneId) {
    pgSelectZone(zoneId);
    applyPgSelection();
  }
}

function pgHandleHover(e) {
  const [mx, my] = pgCanvasPos(e);
  const zoneId = pgGetZoneAt(mx, my);
  if (zoneId !== pgHoveredZone) {
    pgHoveredZone = zoneId;
    e.target.style.cursor = zoneId ? 'pointer' : 'default';
    pgDraw();
  }
}

function pgHandleLeave() {
  pgHoveredZone = null;
  pgDraw();
}
