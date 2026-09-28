const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

// Replace corrupted Thai with correct Thai
content = content.replace(/ѵԡêԹ \(Past Payments\)/g, 'ประวัติการรับชำระเงิน (Past Payments)');
content = content.replace(/฿฿/g, '฿');
content = content.replace(/ѹ֡Թ/g, 'บันทึกรับชำระเงินเพิ่มเติมสำเร็จ');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
