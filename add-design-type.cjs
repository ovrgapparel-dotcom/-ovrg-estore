/**
 * add-design-type.cjs
 * Adds a 'design_type' column to the showcase_prints table
 * via Supabase's built-in pg_meta API.
 * Run: node add-design-type.cjs
 *
 * NOTE: This requires the SERVICE ROLE key (not anon).
 * If you don't have it, run this SQL manually in Supabase:
 *
 *   ALTER TABLE showcase_prints
 *     ADD COLUMN IF NOT EXISTS design_type text DEFAULT 'print';
 *   UPDATE showcase_prints SET design_type = 'print' WHERE design_type IS NULL;
 *   ALTER TABLE showcase_prints
 *     ALTER COLUMN design_type SET NOT NULL;
 */
const https = require('https');

const SUPABASE_URL  = 'https://mihpdlhbijlvbdcqvzdw.supabase.co';
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1paHBkbGhiaWpsdmJkY3F2emR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDkzMTgsImV4cCI6MjA4Nzk4NTMxOH0.X-2XjKKi3enHck1KBtlga-RiVjXN3BS5EhW3fnF3oTE';

// Check if design_type column exists by querying a record
function checkColumn() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'mihpdlhbijlvbdcqvzdw.supabase.co',
      path: '/rest/v1/showcase_prints?limit=1&select=design_type',
      method: 'GET',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Column design_type already exists!');
          resolve(true);
        } else {
          console.log('ℹ️  Column design_type does not exist yet (status:', res.statusCode, ')');
          console.log('Response:', data);
          resolve(false);
        }
      });
    });
    req.on('error', (e) => { console.error('Error:', e.message); resolve(false); });
    req.end();
  });
}

async function main() {
  console.log('=== Checking design_type column ===\n');
  const exists = await checkColumn();

  if (!exists) {
    console.log('\n⚠️  Please run the following SQL in your Supabase SQL Editor:');
    console.log(`
ALTER TABLE showcase_prints
  ADD COLUMN IF NOT EXISTS design_type text DEFAULT 'print';

UPDATE showcase_prints SET design_type = 'print' WHERE design_type IS NULL;

COMMENT ON COLUMN showcase_prints.design_type IS 'Values: print or embroidery';
`);
    console.log('Then run this script again to verify.');
  }
}

main().catch(console.error);
