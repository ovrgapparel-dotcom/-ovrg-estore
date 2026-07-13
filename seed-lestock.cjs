/**
 * seed-lestock.cjs
 * Stores LeStock inventory as JSON inside color_mockups column (existing JSONB field).
 * Row ID = 5 in showcase_settings.
 */
const https = require('https');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1paHBkbGhiaWpsdmJkY3F2emR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDkzMTgsImV4cCI6MjA4Nzk4NTMxOH0.X-2XjKKi3enHck1KBtlga-RiVjXN3BS5EhW3fnF3oTE';

const BASE_HEADERS = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates'
};

// We store the inventory inside color_mockups as an array with a special _lestock_inventory key
// (wrapping as [{_type:"lestock", ...}] so the column schema remains valid)
const INVENTORY = {
  tshirt:  { name: 'T-Shirt',      icon: '👕', customizer: 'showcase.html',            standard: { price: 18000, stock: 50 }, highend: { price: 25000, stock: 30 }, premium: { price: 35000, stock: 15 } },
  cap:     { name: 'Casquette',    icon: '🧢', customizer: 'headwear.html?type=cap',   standard: { price: 12000, stock: 40 }, highend: { price: 18000, stock: 25 }, premium: { price: 25000, stock: 10 } },
  bobble:  { name: 'Bonnet',       icon: '🎿', customizer: 'headwear.html?type=bucket',standard: { price: 15000, stock: 35 }, highend: { price: 20000, stock: 20 }, premium: { price: 28000, stock: 8  } },
  jacket:  { name: 'Veste en Jean',icon: '🧥', customizer: 'jeans.html',               standard: { price: 35000, stock: 25 }, highend: { price: 45000, stock: 15 }, premium: { price: 60000, stock: 7  } },
  hoodie:  { name: 'Hoodie',       icon: '🫡', customizer: 'hoodies.html',             standard: { price: 25000, stock: 30 }, highend: { price: 35000, stock: 18 }, premium: { price: 48000, stock: 10 } }
};

// Encode as color_mockups: [{_type:"lestock_v1", inventory: {...}}]
const color_mockups_payload = [{ _type: 'lestock_v1', inventory: INVENTORY }];

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'mihpdlhbijlvbdcqvzdw.supabase.co', path, method,
      headers: { ...BASE_HEADERS, ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}) }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); } });
    });
    r.on('error', reject);
    if (postData) r.write(postData);
    r.end();
  });
}

async function main() {
  console.log('-- Seeding LeStock (row id=5) --');
  const check = await req('GET', '/rest/v1/showcase_settings?id=eq.5&select=id', null);
  const exists = Array.isArray(check.data) && check.data.length > 0;

  if (exists) {
    console.log('Row 5 found. Updating...');
    const r = await req('PATCH', '/rest/v1/showcase_settings?id=eq.5', { color_mockups: color_mockups_payload });
    console.log(r.status === 204 ? 'Done!' : 'Status ' + r.status + ' ' + JSON.stringify(r.data));
  } else {
    console.log('Inserting row 5...');
    const r = await req('POST', '/rest/v1/showcase_settings', {
      id: 5,
      color_mockups: color_mockups_payload,
      global_colors: ['#ffffff','#1a1a1a','#e63946','#457b9d','#2a9d8f','#f4a261']
    });
    console.log((r.status === 201 || r.status === 200) ? 'Inserted!' : 'Status ' + r.status + ' ' + JSON.stringify(r.data));
  }
}

main().catch(console.error);
