const fs = require('fs');
let c = fs.readFileSync('src/app/smart-pricing/page.tsx', 'utf8');
c = c.replace(/<Navbar \/>\n/g, '');
fs.writeFileSync('src/app/smart-pricing/page.tsx', c);
console.log('Removed Navbar');
