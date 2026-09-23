const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

const original = `        const startDate = new Date(displayDateStr);
        if (dateOffset > 0) startDate.setHours(14, 0, 0, 0);`;

const targetIdx = lines.findIndex(l => l.includes('let startDate: Date;'));
if (targetIdx >= 0 && targetIdx < 150) {
  lines.splice(targetIdx, 9, original);
}
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
