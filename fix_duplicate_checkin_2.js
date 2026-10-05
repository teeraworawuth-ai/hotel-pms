const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

// 1. Update the first check-in button
const btn1Line = lines.findIndex(l => l.includes('🚪 Check-in ทันที'));
if (btn1Line !== -1) {
    lines[btn1Line] = `                        {timeBand === 'early_in' ? '🚪 Early Check-in' : '🚪 Check-in ทันที'}`;
}

// 2. Remove the second check-in button block
const btn2StartLine = lines.findIndex((l, i) => l.includes("{room.status === 'reserved' && dateOffset === 0 && !isReschedulingBooking && (") && lines[i+4] && lines[i+4].includes('Check-in'));

if (btn2StartLine !== -1) {
    lines.splice(btn2StartLine, 8); // remove 8 lines
    console.log('Removed duplicate button block at line', btn2StartLine);
} else {
    console.log('Could not find duplicate button block');
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
console.log('Done');
