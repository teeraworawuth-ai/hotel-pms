const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');
const bLine = lines.findIndex(l => l.includes('🚪 Check-in (เข้าพักเลย)'));

if (bLine !== -1) {
    if (lines[bLine - 4].includes("room.status === 'reserved'") && lines[bLine + 2].includes(')}')) {
        lines.splice(bLine - 4, 7); 
        fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
        console.log('Removed duplicate block');
    }
}
