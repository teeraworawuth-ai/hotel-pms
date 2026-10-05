const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

// 1. Update the first check-in button
const btn1Line = lines.findIndex(l => l.includes('🚪 Check-in ทันที'));
if (btn1Line !== -1) {
    lines[btn1Line] = `                        {timeBand === 'early_in' ? '🚪 Early Check-in' : '🚪 Check-in ทันที'}`;
}

// 2. Remove the second check-in button block
const btn2StartLine = lines.findIndex(l => l.includes("{room.status === 'reserved' && dateOffset === 0 && !isReschedulingBooking && (") && lines[l+4].includes('🚪 Check-in (เข้าพักเลย)'));

if (btn2StartLine !== -1) {
    // It's 7 lines block:
    // {room.status === 'reserved' && dateOffset === 0 && !isReschedulingBooking && (
    //   <button 
    //     onClick={handleCheckInReserved} disabled={loading}
    //     className="w-full py-4 mt-4 text-white font-bold rounded-xl text-lg bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
    //   >
    //     {timeBand === 'early_in' ? '🚪 Early Check-in (เข้าพักก่อนเวลา)' : '🚪 Check-in (เข้าพักเลย)'}
    //   </button>
    // )}
    lines.splice(btn2StartLine, 8); // remove 8 lines
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
console.log('Fixed duplicate check-in buttons');
