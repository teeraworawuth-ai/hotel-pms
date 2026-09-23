const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');
const index = lines.findIndex(l => l.includes('// 2. ถ้าเป็นการ Check-in'));
lines.splice(index, 0, '    }');
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
