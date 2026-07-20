const https = require('https');
const url = 'https://mihpdlhbijlvbdcqvzdw.supabase.co/rest/v1/headwear_embroideries';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1paHBkbGhiaWpsdmJkY3F2emR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDkzMTgsImV4cCI6MjA4Nzk4NTMxOH0.X-2XjKKi3enHck1KBtlga-RiVjXN3BS5EhW3fnF3oTE';

const options = {
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  });
}).on('error', (err) => {
  console.error("Error: " + err.message);
});
