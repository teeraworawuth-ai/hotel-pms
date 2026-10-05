const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');
const lines = content.split('\n');

const bLine = lines.findIndex(l => l.includes('finalRoom.booking_id = activeBooking.id;'));
if (bLine !== -1) {
    // Add guest_name and guest_phone after booking_id
    lines.splice(bLine + 1, 0, 
        '              finalRoom.guest_name = activeBooking.guest_name;',
        '              finalRoom.guest_phone = activeBooking.guest_phone;'
    );
    fs.writeFileSync('src/app/checkin/page.tsx', lines.join('\n'), 'utf8');
    console.log('Fixed phone in page.tsx');
}
