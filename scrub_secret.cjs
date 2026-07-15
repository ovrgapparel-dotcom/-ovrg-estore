try{const fs=require('fs');let c=fs.readFileSync('upload-models.cjs','utf8');c=c.replace(/sb_secret_[A-Za-z0-9_-]+/g,'REMOVED_SECRET');fs.writeFileSync('upload-models.cjs',c);}catch(e){}
