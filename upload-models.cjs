/**
 * upload-models.cjs
 * Uploads all .glb models to Supabase Storage (product-images/models/)
 * Run: node upload-models.cjs
 */
const fs   = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mihpdlhbijlvbdcqvzdw.supabase.co';
const ANON_KEY     = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET       = 'product-images';

// All models live in public/
const MODELS = [
  { name: 'cap.glb',    src: path.join(__dirname, 'public', 'cap.glb') },
  { name: 'bucket.glb', src: path.join(__dirname, 'public', 'bucket.glb') },
  { name: 'jacket.glb', src: path.join(__dirname, 'public', 'jacket.glb') },
  { name: 'hoodie.glb', src: path.join(__dirname, 'public', 'hoodie.glb') },
  { name: 'tshirt.glb', src: path.join(__dirname, 'public', 'tshirt.glb') },
];

function uploadFile(localPath, storagePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(localPath)) {
      reject(new Error(`File not found: ${localPath}`));
      return;
    }
    const fileBuffer = fs.readFileSync(localPath);
    const fileSize   = fileBuffer.length;
    console.log(`  Uploading ${path.basename(localPath)} (${(fileSize/1024/1024).toFixed(2)} MB) → ${storagePath}...`);

    const url = new URL(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`);
    const options = {
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey':        ANON_KEY,
        'Content-Type':  'model/gltf-binary',
        'Content-Length': fileSize,
        'x-upsert':      'true',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
          resolve({ storagePath, publicUrl, statusCode: res.statusCode });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

async function main() {
  console.log('=== OVRG Model Upload to Supabase ===\n');
  const results = [];

  for (const model of MODELS) {
    const storagePath = `models/${model.name}`;
    try {
      const result = await uploadFile(model.src, storagePath);
      console.log(`  ✅ ${model.name} → ${result.publicUrl}`);
      results.push({ ...result, name: model.name, ok: true });
    } catch (err) {
      console.error(`  ❌ ${model.name}: ${err.message}`);
      results.push({ name: model.name, error: err.message, ok: false });
    }
  }

  console.log('\n=== SUMMARY ===');
  results.forEach(r => {
    if (r.ok) console.log(`✅ ${r.name}: ${r.publicUrl}`);
    else       console.log(`❌ ${r.name}: FAILED — ${r.error}`);
  });
}

main().catch(console.error);
