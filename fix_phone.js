const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

const target = `            if (activeBooking) {
              finalRoom.booking_id = activeBooking.id;
              finalRoom.unpaid_balance = financialSummary[activeBooking.id]?.balance || 0;
              finalRoom.total_charges = financialSummary[activeBooking.id]?.charges || 0;
              finalRoom.total_payments = financialSummary[activeBooking.id]?.payments || 0;
              finalRoom.c_all = financialSummary[activeBooking.id]?.c_all || 0;
              finalRoom.c_today = financialSummary[activeBooking.id]?.c_today || 0;
              finalRoom.has_key_deposit = financialSummary[activeBooking.id]?.has_key_deposit;
              finalRoom.actual_price = getDailyPrice(activeBooking);
            }`;

const replacement = `            if (activeBooking) {
              finalRoom.booking_id = activeBooking.id;
              finalRoom.guest_name = activeBooking.guest_name;
              finalRoom.guest_phone = activeBooking.guest_phone;
              finalRoom.unpaid_balance = financialSummary[activeBooking.id]?.balance || 0;
              finalRoom.total_charges = financialSummary[activeBooking.id]?.charges || 0;
              finalRoom.total_payments = financialSummary[activeBooking.id]?.payments || 0;
              finalRoom.c_all = financialSummary[activeBooking.id]?.c_all || 0;
              finalRoom.c_today = financialSummary[activeBooking.id]?.c_today || 0;
              finalRoom.has_key_deposit = financialSummary[activeBooking.id]?.has_key_deposit;
              finalRoom.actual_price = getDailyPrice(activeBooking);
            }`;

content = content.replace(target, replacement);
fs.writeFileSync('src/app/checkin/page.tsx', content, 'utf8');
console.log('Fixed guest phone/name for occupied rooms');
