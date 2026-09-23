const fs = require('fs');
let c = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

c = c.replace('<React.Fragment key={id}>', '<span key={id}>');
c = c.replace('</React.Fragment>', '</span>');

fs.writeFileSync('src/app/checkin/page.tsx', c, 'utf8');
console.log('Fixed React.Fragment');
