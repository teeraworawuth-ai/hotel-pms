const fs = require('fs');
let c = fs.readFileSync('src/app/smart-pricing/page.tsx', 'utf8');
c = c.replace(/\\`/g, '`');
c = c.replace(/\\\$/g, '$');
fs.writeFileSync('src/app/smart-pricing/page.tsx', c);
