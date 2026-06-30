/**
 * upload-models.cjs
 * Uploads cap.glb, bucket.glb, jacket.glb, hoodie.glb to Supabase Storage
 * using the service role key (or anon key + public policy).
 * Run: node upload-models.cjs
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = 'https://mihpdlhbijlvbdcqvzdw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1paHBkbGhiaWpsdmJkY3F2emR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDkzMTgsImV4cCI6MjA4Nzk4NTMxOH0.X-2XjKKi3enHck1KBtlga-RiVjXN3BS5EhW3fnF3oTE';
const BUCKET = 'product-images';

const MODELS = [
  { name: 'cap.glb',     src: path.join(__dirname, 'public', 'cap.glb') },
  { name: 'bucket.glb',  src: path.join(__dirname, 'public', 'bucket.glb') },
  { name: 'jacket.glb',  src: path.join(__dirname, 'jacket.glb') },
  { name: 'hoodie.glb',  src: path.join(__dirname, 'hoodie.glb') },
];

function uploadFile(localPath, storagePath, authToken) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(localPath)) {
      reject(new Error(`File not found: ${localPath}`));
      return;
    }
    const fileBuffer = fs.readFileSync(localPath);
    const fileSize = fileBuffer.length;
    console.log(`  Uploading ${storagePath} (${(fileSize/1024/1024).toFixed(1)} MB)...`);

    const url = new URL(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'model/gltf-binary',
        'Content-Length': fileSize,
        'x-upsert': 'true',
        'apikey': ANON_KEY,
      }
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
  console.log('=== OVRG Model Upload Script ===\n');
  console.log('Using anon key (requires public INSERT policy on storage bucket).\n');

  const results = [];
  for (const model of MODELS) {
    const storagePath = `models/${model.name}`;
    try {
      const result = await uploadFile(model.src, storagePath, ANON_KEY);
      console.log(`  ✅ ${model.name} -> ${result.publicUrl}`);
      results.push({ name: model.name, url: result.publicUrl, ok: true });
    } catch (err) {
      console.error(`  ❌ ${model.name}: ${err.message}`);
      results.push({ name: model.name, error: err.message, ok: false });
    }
  }

  console.log('\n=== RESULTS ===');
  results.forEach(r => {
    if (r.ok) console.log(`${r.name}: ${r.url}`);
    else console.log(`${r.name}: FAILED - ${r.error}`);
  });

  // Print the three-viewer.js MODEL_URLS constant
  const successURLs = results.filter(r => r.ok);
  if (successURLs.length > 0) {
    console.log('\n=== Paste into three-viewer.js ===');
    console.log('const MODEL_URLS = {');
    successURLs.forEach(r => {
      const key = r.name.replace('.glb', '');
      console.log(`  '${key}': '${r.url}',`);
    });
    console.log('};');
  }
}

main().catch(console.error);
