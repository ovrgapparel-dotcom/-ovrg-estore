const supabaseUrl = 'https://mihpdlhbijlvbdcqvzdw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1paHBkbGhiaWpsdmJkY3F2emR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDkzMTgsImV4cCI6MjA4Nzk4NTMxOH0.X-2XjKKi3enHck1KBtlga-RiVjXN3BS5EhW3fnF3oTE';

async function testUpload() {
  const url = `${supabaseUrl}/storage/v1/object/product-images/models/test.txt`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'text/plain'
      },
      body: 'test content'
    });
    
    const data = await res.json();
    if (res.ok) {
      console.log('Upload succeeded!', data);
    } else {
      console.log('Upload failed:', data);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

testUpload();
