const fs = require('fs');
let c = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

c = c.replace(/const newIcons = \{ \.\.\.roomTypeIcons \};[\s\S]*?setRoomTypeIcons\(newIcons\);/,
`if (!checked) {
                               setFormIcons([]);
                             } else {
                               setFormIcons([availableIcons[0]]);
                             }`);

fs.writeFileSync('src/app/settings/page.tsx', c, 'utf8');
console.log('Fixed leftover roomTypeIcons');
