const fs = require('fs');
let c = fs.readFileSync('src/app/components/RoomIcons.tsx', 'utf8');

c = c.replace(/\\`/g, '`').replace(/\\\$/g, '$');

fs.writeFileSync('src/app/components/RoomIcons.tsx', c, 'utf8');
console.log('Fixed RoomIcons');
