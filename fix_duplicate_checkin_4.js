const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');
const bLine = lines.findIndex(l => l.includes('🚪 Check-in (เข้าพักเลย)'));

if (bLine !== -1) {
    // 1742 is bLine. 1737 is bLine - 5
    lines.splice(bLine - 5, 8); 
    fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
    console.log('Removed duplicate block');
}
