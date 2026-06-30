const fs = require('fs');
const content = fs.readFileSync('headwear.html', 'utf8');
const scripts = [...content.matchAll(/<script>((?:.|\n)*?)<\/script>/g)];
scripts.forEach((m, i) => {
  fs.writeFileSync(`test_script_${i}.js`, m[1]);
  try {
    require('child_process').execSync(`node --check test_script_${i}.js`);
    console.log(`Script ${i} OK`);
  } catch(e) {
    console.error(`Script ${i} failed`);
    console.error(e.stdout.toString());
    console.error(e.stderr.toString());
  }
});
