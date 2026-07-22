/**
 * OVRG Invoice System
 * ───────────────────
 * Provides:
 *  - generateInvoicePDF(orderData, snapshotDataUrl?) → Blob + dataUrl
 *  - sendInvoiceEmail(orderData, pdfBase64)
 *  - saveOrderToSupabase(sbClient, orderData)
 *  - captureApparel(containerEl?) → dataUrl
 *  - showInvoiceModal(orderData, captureEl, sbClient, onDone?)
 *
 * Requires jsPDF to be loaded before this script (via CDN).
 */

(function () {
  'use strict';

  /* ── Brand constants ─────────────────────────────── */
  const BRAND = {
    orange:    '#FF6B35',
    dark:      '#0D0D0D',
    grey:      '#555555',
    lightGrey: '#F4F4F4',
    white:     '#FFFFFF',
    adminEmail:'orvg.apparel@gmail.com',
    wa:        '+2250799108108',
    website:   'laboutiqueovrg.com',
    address:   'Abidjan, Côte d\'Ivoire',
  };

  /* ── Helpers ─────────────────────────────────────── */
  function fmt(n) {
    return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
  }

  function isoDate() {
    return new Date().toLocaleDateString('fr-FR', { year:'numeric', month:'long', day:'numeric' });
  }

  function invoiceNumber() {
    const d = new Date();
    return 'OVRG-' + d.getFullYear() +
           String(d.getMonth()+1).padStart(2,'0') +
           String(d.getDate()).padStart(2,'0') + '-' +
           String(d.getHours()).padStart(2,'0') +
           String(d.getMinutes()).padStart(2,'0') +
           String(d.getSeconds()).padStart(2,'0');
  }

  const COLOR_NAMES = {
    '#ffffff':'Blanc', '#1a1a1a':'Noir', '#e63946':'Rouge',
    '#457b9d':'Bleu',  '#2a9d8f':'Vert', '#f4a261':'Orange'
  };

  const TIER_LABELS = {
    standard: 'Standard',
    'high-end': 'High-End',
    premium:  'Premium'
  };

  /* ── Canvas capture ─────────────────────────────── */
  async function captureApparel(containerEl) {
    try {
      if (typeof html2canvas !== 'undefined' && containerEl) {
        const c = await html2canvas(containerEl, {
          backgroundColor: '#1a1a1a',
          scale: 1.5,
          useCORS: true,
          allowTaint: true,
          logging: false,
        });
        return c.toDataURL('image/jpeg', 0.85);
      }
    } catch (e) {
      console.warn('[OVRG Invoice] html2canvas failed:', e);
    }
    return null;
  }

  /* ── Price helpers ──────────────────────────────── */
  function _calcSurcharge(orderData) {
    let s = 0;
    const zones = (orderData.customization && orderData.customization.zones) || {};
    for (const key in zones) {
      const cfg = zones[key];
      if (!cfg || !cfg.print) continue;
      s += cfg.type === 'embroidery' ? 9000 : (cfg.print.price || 16000);
    }
    return s;
  }

  /* ── PDF generation ─────────────────────────────── */
  function generateInvoicePDF(orderData, snapshotDataUrl) {
    const jspdfLib = (window.jspdf && window.jspdf.jsPDF) || (typeof jsPDF !== 'undefined' && jsPDF);
    if (!jspdfLib) {
      console.error('[OVRG Invoice] jsPDF not loaded');
      return null;
    }
    const doc = new jspdfLib({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const W = 210;
    const MARGIN = 18;
    let y = 0;

    function hexToRgb(hex) {
      return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    }
    function setFill(hex) { const [r,g,b]=hexToRgb(hex); doc.setFillColor(r,g,b); }
    function setTxt(hex)  { const [r,g,b]=hexToRgb(hex); doc.setTextColor(r,g,b); }
    function rect(x,yy,w,h,hex) { setFill(hex); doc.rect(x,yy,w,h,'F'); }
    function txt(s,x,yy,opts)   { doc.text(String(s),x,yy,opts||{}); }

    /* HEADER BAND */
    rect(0, 0, W, 38, BRAND.orange);
    doc.setFont('helvetica','bold');
    doc.setFontSize(30);
    setTxt(BRAND.white);
    txt('OVRG.', MARGIN, 20);
    doc.setFontSize(9);
    doc.setFont('helvetica','normal');
    txt('La boutique OVRG — ' + BRAND.address, MARGIN, 27);
    txt(BRAND.website + '  ·  WhatsApp: ' + BRAND.wa, MARGIN, 33);

    doc.setFont('helvetica','bold');
    doc.setFontSize(22);
    txt('FACTURE', W-MARGIN, 18, {align:'right'});
    doc.setFontSize(8);
    doc.setFont('helvetica','normal');
    const ref = orderData.invoiceRef || invoiceNumber();
    txt('N° ' + ref, W-MARGIN, 26, {align:'right'});
    txt('Date: ' + isoDate(), W-MARGIN, 33, {align:'right'});

    y = 46;

    /* CUSTOMER / ORDER CARDS */
    rect(MARGIN, y, 82, 30, BRAND.lightGrey);
    setTxt(BRAND.dark);
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
    txt('FACTURER À', MARGIN+4, y+7);
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    txt(orderData.customerName || 'Client', MARGIN+4, y+15);
    doc.setFontSize(8); setTxt(BRAND.grey);
    txt(orderData.customerEmail || '', MARGIN+4, y+22);

    const cx = W - MARGIN - 82;
    rect(cx, y, 82, 30, BRAND.lightGrey);
    setTxt(BRAND.dark);
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
    txt('DÉTAILS COMMANDE', cx+4, y+7);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); setTxt(BRAND.grey);
    txt('Référence: ' + ref, cx+4, y+14);
    txt('Taille: ' + (orderData.size||'—'), cx+4, y+20);
    txt('Couleur: ' + (COLOR_NAMES[orderData.color] || orderData.color || '—'), cx+4, y+26);

    y += 38;

    /* ORDER TABLE */
    const rowH = 7.5;
    const cols = { item:MARGIN, zone:MARGIN+72, qty:MARGIN+104, unit:MARGIN+120, total:W-MARGIN };
    rect(MARGIN, y, W-2*MARGIN, rowH+2, BRAND.dark);
    setTxt(BRAND.white); doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
    txt('ARTICLE', cols.item+2, y+5.5);
    txt('ZONE',    cols.zone+2, y+5.5);
    txt('QTÉ',     cols.qty,    y+5.5);
    txt('P.U.',    cols.unit,   y+5.5);
    txt('TOTAL',   cols.total,  y+5.5, {align:'right'});
    y += rowH + 2;

    const lines = [];
    const tierLabel = TIER_LABELS[orderData.customization && orderData.customization.tier] || 'Standard';
    const basePrice = orderData.price - _calcSurcharge(orderData);
    lines.push({ item:'T-Shirt OVRG — '+tierLabel, zone:'—', qty:1, unit:basePrice });

    const zones = (orderData.customization && orderData.customization.zones) || {};
    for (const zoneId in zones) {
      const cfg = zones[zoneId];
      if (!cfg || !cfg.print) continue;
      const zLabel  = zoneId === 'back' ? 'Dos' : 'Devant';
      const tLabel  = cfg.type === 'embroidery' ? 'Broderie' : 'Imprimé';
      const unitP   = cfg.type === 'embroidery' ? 9000 : (cfg.print.price || 16000);
      lines.push({ item: tLabel + ' — ' + cfg.print.name, zone: zLabel, qty:1, unit:unitP });
    }

    let stripe = false;
    for (const line of lines) {
      const lineTotal = line.qty * line.unit;
      if (stripe) { rect(MARGIN, y, W-2*MARGIN, rowH, '#F9F6F3'); }
      stripe = !stripe;
      setTxt(BRAND.dark); doc.setFont('helvetica','normal'); doc.setFontSize(8);
      const wrapped = doc.splitTextToSize(line.item, 68);
      txt(wrapped, cols.item+2, y+5.2);
      txt(line.zone, cols.zone+2, y+5.2);
      txt(String(line.qty), cols.qty, y+5.2);
      txt(fmt(line.unit), cols.unit, y+5.2);
      txt(fmt(lineTotal), cols.total, y+5.2, {align:'right'});
      y += Math.max(rowH, wrapped.length * 3.8);
    }

    rect(MARGIN, y, W-2*MARGIN, 10, BRAND.orange);
    setTxt(BRAND.white); doc.setFont('helvetica','bold'); doc.setFontSize(10);
    txt('TOTAL', cols.item+2, y+7);
    txt(fmt(orderData.price), cols.total, y+7, {align:'right'});
    y += 16;

    /* MOCKUP IMAGE */
    if (snapshotDataUrl && y < 240) {
      try {
        const imgW=60, imgH=70, ix=(W-imgW)/2;
        setFill(BRAND.lightGrey); doc.roundedRect(ix-2, y-2, imgW+4, imgH+4, 3, 3, 'F');
        doc.addImage(snapshotDataUrl, 'JPEG', ix, y, imgW, imgH);
        setTxt(BRAND.grey); doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
        txt('Aperçu du design personnalisé', W/2, y+imgH+6, {align:'center'});
        y += imgH + 14;
      } catch(e) { console.warn('[OVRG Invoice] Image embed:', e); }
    }

    /* FOOTER */
    const footerY = 282;
    rect(0, footerY, W, 15, BRAND.dark);
    setTxt(BRAND.white); doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
    txt('Merci pour votre commande! — ' + BRAND.website + '  ·  ' + BRAND.address + '  ·  WhatsApp: ' + BRAND.wa,
        W/2, footerY+6, {align:'center'});
    txt('© ' + new Date().getFullYear() + ' OVRG Apparel. Tous droits réservés.',
        W/2, footerY+11, {align:'center'});

    const blob   = doc.output('blob');
    const dataUrl= doc.output('datauristring');
    return { blob, dataUrl, ref };
  }

  /* ── Email delivery ─────────────────────────────── */
  async function sendInvoiceEmail(orderData, pdfBase64) {
    const tierLabel  = TIER_LABELS[orderData.customization && orderData.customization.tier] || 'Standard';
    const colorLabel = COLOR_NAMES[orderData.color] || orderData.color || '—';
    const subject    = 'Commande OVRG — ' + (orderData.invoiceRef||'') + ' — ' + (orderData.customerName||'Client');

    let designLines = '';
    const zones = (orderData.customization && orderData.customization.zones) || {};
    for (const zoneId in zones) {
      const cfg = zones[zoneId];
      if (!cfg || !cfg.print) continue;
      designLines += '• ' + (zoneId==='back'?'Dos':'Devant') +
        ' (' + (cfg.type==='embroidery'?'Broderie':'Imprimé') + '): ' + cfg.print.name + '\n';
    }
    if (!designLines) designLines = '• ' + (orderData.name || 'Design personnalisé');

    const body = [
      '=== NOUVELLE COMMANDE OVRG ===',
      'Réf: ' + (orderData.invoiceRef||'—'),
      'Date: ' + isoDate(),
      '',
      '── CLIENT ──',
      'Nom: ' + (orderData.customerName||'—'),
      'Email: ' + (orderData.customerEmail||'—'),
      '',
      '── COMMANDE ──',
      'Produit: T-Shirt OVRG — ' + tierLabel,
      'Couleur: ' + colorLabel,
      'Taille: ' + (orderData.size||'—'),
      'Design(s):\n' + designLines,
      'Total: ' + fmt(orderData.price),
    ].join('\n');

    const autoReply = [
      'Bonjour ' + (orderData.customerName||'') + '!',
      '',
      'Merci pour votre commande OVRG 🎉',
      'Réf: ' + (orderData.invoiceRef||''),
      '',
      'Récapitulatif:',
      designLines,
      'Total: ' + fmt(orderData.price),
      '',
      'Nous vous contacterons sous 24h pour la livraison.',
      '',
      "L'équipe OVRG — " + BRAND.website,
    ].join('\n');

    const fd = new FormData();
    fd.append('name',         orderData.customerName || 'Client OVRG');
    fd.append('email',        orderData.customerEmail || '');
    fd.append('_subject',     subject);
    fd.append('message',      body);
    fd.append('_autoresponse',autoReply);
    fd.append('_template',    'table');
    fd.append('_captcha',     'false');
    if (pdfBase64) fd.append('invoice.pdf', pdfBase64);

    try {
      await fetch('https://formsubmit.co/ajax/' + BRAND.adminEmail, {
        method: 'POST', headers: {'Accept':'application/json'}, body: fd,
      });
    } catch(e) { console.warn('[OVRG Invoice] Email failed:', e); }
  }

  /* ── Supabase persistence ───────────────────────── */
  async function saveOrderToSupabase(sbClient, orderData) {
    if (!sbClient) return;
    try {
      await sbClient.from('orders').insert({
        customer_name:  orderData.customerName || '',
        customer_email: orderData.customerEmail || '',
        total_amount:   orderData.price,
        items:          [orderData],
        status:         'pending',
        payment_method: 'invoice',
        invoice_ref:    orderData.invoiceRef || '',
        created_at:     new Date().toISOString(),
      });
    } catch(e) { console.warn('[OVRG Invoice] Supabase save failed:', e); }
  }

  /* ── Invoice Modal ──────────────────────────────── */
  function _injectStyles() {
    if (document.getElementById('ovrg-invoice-styles')) return;
    const s = document.createElement('style');
    s.id = 'ovrg-invoice-styles';
    s.textContent = `
.ovrg-inv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:10000;
  display:flex;align-items:center;justify-content:center;opacity:0;
  transition:opacity .35s ease;padding:1rem;box-sizing:border-box;}
.ovrg-inv-overlay.open{opacity:1;}
.ovrg-inv-modal{background:#fff;border-radius:20px;width:100%;max-width:520px;
  box-shadow:0 30px 80px rgba(0,0,0,.4);
  transform:translateY(40px) scale(.96);
  transition:transform .35s cubic-bezier(.34,1.2,.64,1);
  overflow:hidden;max-height:92vh;overflow-y:auto;
  font-family:'DM Sans','Inter',sans-serif;}
.ovrg-inv-overlay.open .ovrg-inv-modal{transform:translateY(0) scale(1);}
.ovrg-inv-header{background:#FF6B35;color:#fff;padding:1.4rem 1.6rem 1.2rem;
  display:flex;align-items:center;justify-content:space-between;}
.ovrg-inv-header h2{margin:0;font-size:1.15rem;font-weight:800;letter-spacing:-.02em;}
.ovrg-inv-header p{margin:.2rem 0 0;font-size:.78rem;opacity:.85;}
.ovrg-inv-close{background:rgba(255,255,255,.2);border:none;color:#fff;
  width:32px;height:32px;border-radius:50%;font-size:1rem;cursor:pointer;
  flex-shrink:0;display:flex;align-items:center;justify-content:center;
  transition:background .2s;}
.ovrg-inv-close:hover{background:rgba(255,255,255,.35);}
.ovrg-inv-body{padding:1.4rem 1.6rem;}
.ovrg-inv-mockup{width:100%;aspect-ratio:4/3;background:#1a1a1a;border-radius:12px;
  overflow:hidden;margin-bottom:1.2rem;display:flex;align-items:center;
  justify-content:center;}
.ovrg-inv-mockup img{width:100%;height:100%;object-fit:cover;}
.ovrg-inv-mockup-ph{color:#888;font-size:2.5rem;text-align:center;line-height:1.4;}
.ovrg-inv-summary{background:#f9f6f3;border-radius:12px;padding:1rem 1.1rem;
  margin-bottom:1.2rem;font-size:.85rem;color:#333;}
.ovrg-inv-srow{display:flex;justify-content:space-between;padding:.28rem 0;
  border-bottom:1px solid #eee;}
.ovrg-inv-srow:last-child{border-bottom:none;font-weight:700;font-size:.95rem;color:#FF6B35;}
.ovrg-inv-slbl{color:#666;}
.ovrg-inv-field{margin-bottom:1rem;}
.ovrg-inv-field label{display:block;font-size:.78rem;font-weight:700;color:#555;
  margin-bottom:.35rem;text-transform:uppercase;letter-spacing:.05em;}
.ovrg-inv-field input{width:100%;padding:.75rem 1rem;border:1.5px solid #e0e0e0;
  border-radius:10px;font-size:.95rem;font-family:inherit;
  transition:border-color .2s;outline:none;box-sizing:border-box;}
.ovrg-inv-field input:focus{border-color:#FF6B35;}
.ovrg-inv-field input.ovrg-err{border-color:#ef4444;}
.ovrg-inv-actions{display:flex;gap:.75rem;margin-top:1.2rem;}
.ovrg-inv-btn{flex:1;padding:.9rem;border:none;border-radius:12px;
  font-family:inherit;font-size:.92rem;font-weight:700;cursor:pointer;
  transition:all .2s;display:flex;align-items:center;justify-content:center;gap:.5rem;}
.ovrg-inv-btn-primary{background:#FF6B35;color:#fff;}
.ovrg-inv-btn-primary:hover{background:#e05a28;transform:translateY(-1px);}
.ovrg-inv-btn-secondary{background:#f0f0f0;color:#333;}
.ovrg-inv-btn-secondary:hover{background:#e4e4e4;}
.ovrg-inv-btn:disabled{opacity:.6;cursor:not-allowed;transform:none!important;}
.ovrg-inv-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);
  border-top-color:#fff;border-radius:50%;
  animation:ovrg-spin .7s linear infinite;display:inline-block;}
@keyframes ovrg-spin{to{transform:rotate(360deg);}}
.ovrg-inv-success{text-align:center;padding:2rem 1rem;}
.ovrg-inv-success-icon{font-size:3rem;margin-bottom:.75rem;}
.ovrg-inv-success h3{margin:0 0 .5rem;font-size:1.2rem;color:#0D0D0D;}
.ovrg-inv-success p{margin:0;font-size:.88rem;color:#666;}
.ovrg-inv-dl{display:inline-flex;align-items:center;gap:.5rem;
  background:#FF6B35;color:#fff;padding:.8rem 1.6rem;border-radius:10px;
  text-decoration:none;font-weight:700;margin-top:1.2rem;font-size:.9rem;
  transition:background .2s;}
.ovrg-inv-dl:hover{background:#e05a28;}
    `;
    document.head.appendChild(s);
  }

  async function showInvoiceModal(orderData, captureEl, sbClient, onDone) {
    _injectStyles();

    const snapshotPromise = captureEl ? captureApparel(captureEl) : Promise.resolve(null);

    const existing = document.getElementById('ovrgInvoiceOverlay');
    if (existing) existing.remove();

    const invRef = invoiceNumber();
    orderData.invoiceRef = invRef;

    const tierLabel  = TIER_LABELS[orderData.customization && orderData.customization.tier] || 'Standard';
    const colorLabel = COLOR_NAMES[orderData.color] || orderData.color || '—';

    let zoneSummaryHTML = '';
    const zones = (orderData.customization && orderData.customization.zones) || {};
    for (const zoneId in zones) {
      const cfg = zones[zoneId];
      if (!cfg || !cfg.print) continue;
      const zLabel = zoneId === 'back' ? 'Dos' : 'Devant';
      const tLabel = cfg.type === 'embroidery' ? 'Broderie' : 'Imprimé';
      const unitP  = cfg.type === 'embroidery' ? 9000 : (cfg.print.price || 16000);
      zoneSummaryHTML += `<div class="ovrg-inv-srow"><span class="ovrg-inv-slbl">${tLabel} ${zLabel} — ${cfg.print.name}</span><span>${fmt(unitP)}</span></div>`;
    }

    const overlay = document.createElement('div');
    overlay.id = 'ovrgInvoiceOverlay';
    overlay.className = 'ovrg-inv-overlay';
    overlay.innerHTML = `
<div class="ovrg-inv-modal" role="dialog" aria-modal="true" aria-label="Confirmation de commande">
  <div class="ovrg-inv-header">
    <div><h2>📋 Confirmation de commande</h2><p>Réf: ${invRef}</p></div>
    <button class="ovrg-inv-close" id="ovrgInvClose" aria-label="Fermer">✕</button>
  </div>
  <div class="ovrg-inv-body">
    <div class="ovrg-inv-mockup" id="ovrgInvMockup">
      <div class="ovrg-inv-mockup-ph">👕<br><span style="font-size:.8rem">Capture en cours…</span></div>
    </div>
    <div class="ovrg-inv-summary">
      <div class="ovrg-inv-srow"><span class="ovrg-inv-slbl">T-Shirt OVRG — ${tierLabel}</span><span>${fmt(orderData.price - _calcSurcharge(orderData))}</span></div>
      ${zoneSummaryHTML}
      <div class="ovrg-inv-srow"><span class="ovrg-inv-slbl">Couleur / Taille</span><span>${colorLabel} / ${orderData.size||'—'}</span></div>
      <div class="ovrg-inv-srow"><span>Total</span><span>${fmt(orderData.price)}</span></div>
    </div>
    <div class="ovrg-inv-field">
      <label for="ovrgInvName">Votre nom complet</label>
      <input type="text" id="ovrgInvName" placeholder="Jean Kouamé" autocomplete="name">
    </div>
    <div class="ovrg-inv-field">
      <label for="ovrgInvEmail">E-mail (pour recevoir la facture)</label>
      <input type="email" id="ovrgInvEmail" placeholder="jean@exemple.com" autocomplete="email">
    </div>
    <div class="ovrg-inv-actions">
      <button class="ovrg-inv-btn ovrg-inv-btn-secondary" id="ovrgInvSkip">Ignorer</button>
      <button class="ovrg-inv-btn ovrg-inv-btn-primary" id="ovrgInvGenerate">📄 Générer ma facture</button>
    </div>
  </div>
</div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    function closeModal() {
      overlay.classList.remove('open');
      setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 350);
    }
    document.getElementById('ovrgInvClose').onclick = closeModal;
    document.getElementById('ovrgInvSkip').onclick  = closeModal;
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

    // Populate mockup when ready
    snapshotPromise.then(dataUrl => {
      const el = document.getElementById('ovrgInvMockup');
      if (!el) return;
      overlay._snapshot = dataUrl;
      if (dataUrl) {
        el.innerHTML = `<img src="${dataUrl}" alt="Aperçu">`;
      } else {
        el.innerHTML = `<div class="ovrg-inv-mockup-ph">👕<br><span style="font-size:.8rem;color:#888">Aperçu non disponible</span></div>`;
      }
    });

    document.getElementById('ovrgInvGenerate').onclick = async function () {
      const nameEl  = document.getElementById('ovrgInvName');
      const emailEl = document.getElementById('ovrgInvEmail');
      const name  = (nameEl.value||'').trim();
      const email = (emailEl.value||'').trim();

      nameEl.classList.remove('ovrg-err');
      emailEl.classList.remove('ovrg-err');

      if (!name)               { nameEl.classList.add('ovrg-err');  nameEl.focus();  return; }
      if (!email||!email.includes('@')) { emailEl.classList.add('ovrg-err'); emailEl.focus(); return; }

      const btn = this;
      btn.disabled = true;
      btn.innerHTML = '<span class="ovrg-inv-spinner"></span> Génération…';

      orderData.customerName  = name;
      orderData.customerEmail = email;

      const snapshot = (overlay._snapshot !== undefined) ? overlay._snapshot : await snapshotPromise;

      try {
        const result = generateInvoicePDF(orderData, snapshot);
        if (!result) throw new Error('PDF generation failed');

        // Trigger download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(result.blob);
        a.download = result.ref + '.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 8000);

        // Email + Supabase (fire & forget)
        const pdfB64 = result.dataUrl.split(',')[1] || '';
        sendInvoiceEmail(orderData, pdfB64);
        if (sbClient) saveOrderToSupabase(sbClient, orderData);

        // Success state
        const body = overlay.querySelector('.ovrg-inv-body');
        body.innerHTML = `
<div class="ovrg-inv-success">
  <div class="ovrg-inv-success-icon">🎉</div>
  <h3>Facture générée!</h3>
  <p>Votre facture <strong>${result.ref}</strong> a été téléchargée.<br>
     Un e-mail de confirmation est envoyé à <strong>${email}</strong>.<br>
     L'équipe OVRG vous contactera sous 24h.</p>
  <a href="${result.dataUrl}" download="${result.ref}.pdf" class="ovrg-inv-dl">⬇ Retélécharger la facture</a>
</div>`;

        if (onDone) onDone(orderData);
        setTimeout(closeModal, 7000);

      } catch(err) {
        console.error('[OVRG Invoice]', err);
        btn.disabled = false;
        btn.innerHTML = '📄 Réessayer';
        btn.style.background = '#ef4444';
      }
    };
  }

  /* ── Public API ──────────────────────────────────── */
  window.OVRGInvoice = {
    captureApparel,
    generateInvoicePDF,
    sendInvoiceEmail,
    saveOrderToSupabase,
    showInvoiceModal,
  };

})();
