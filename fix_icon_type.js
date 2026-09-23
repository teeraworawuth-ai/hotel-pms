const fs = require('fs');
let c = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

c = c.replace('availableIcons.map(icon => (', 'availableIcons.map((icon: string) => (');

fs.writeFileSync('src/app/settings/page.tsx', c, 'utf8');
console.log('Fixed icon any type');
