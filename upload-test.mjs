import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://mihpdlhbijlvbdcqvzdw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1paHBkbGhiaWpsdmJkY3F2emR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDkzMTgsImV4cCI6MjA4Nzk4NTMxOH0.X-2XjKKi3enHck1KBtlga-RiVjXN3BS5EhW3fnF3oTE';
const BUCKET = 'product-images';

const MODELS = [
  { name: 'bucket.glb',  src: path.join(__dirname, 'public', 'bucket.glb') },
  { name: 'jacket.glb',  src: path.join(__dirname, 'jacket.glb') },
  { name: 'hoodie.glb',  src: path.join(__dirname, 'hoodie.glb') },
];

async function uploadFile(localPath, storagePath) {
  if (!fs.existsSync(localPath)) throw new Error(`File not found: ${localPath}`);
  const fileBuffer = fs.readFileSync(localPath);
  console.log(`  Uploading ${storagePath} (${(fileBuffer.length/1024/1024).toFixed(1)} MB)...`);

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'model/gltf-binary',
      'x-upsert': 'true',
      'apikey': ANON_KEY,
    },
    body: new Blob([fileBuffer])
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

async function main() {
  for (const model of MODELS) {
    try {
      const url = await uploadFile(model.src, `models/${model.name}`);
      console.log(`  ✅ ${model.name} -> ${url}`);
    } catch (e) {
      console.error(`  ❌ ${model.name} ->`, e.message);
    }
  }
}

main();
