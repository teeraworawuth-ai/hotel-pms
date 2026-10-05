const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

const target = "} else if (finalRoom.status === 'reserved') {";
const replacement = `} else if (finalRoom.status === 'reserved') {
            finalRoom.booking_id = incomingBookingToday.id;
            finalRoom.guest_name = incomingBookingToday.guest_name;
            finalRoom.guest_phone = incomingBookingToday.guest_phone;
            finalRoom.actual_price = getDailyPrice(incomingBookingToday);
            finalRoom.staff_name = incomingBookingToday.staff_name;`;

if (content.includes(target) && !content.includes('finalRoom.booking_id = incomingBookingToday.id')) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/app/checkin/page.tsx', content, 'utf8');
  console.log('Fixed reserved room missing fields');
}
