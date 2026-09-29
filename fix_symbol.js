const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

content = content.replace(/฿\{Math\.abs/g, '฿{Math.abs');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
