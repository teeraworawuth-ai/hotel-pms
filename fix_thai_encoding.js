const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

content = content.replace('ѵԡêԹ (Past Payments)', 'ประวัติการรับชำระเงิน (Past Payments)');
content = content.replace('{Math.abs(p.amount).toLocaleString()}', '฿{Math.abs(p.amount).toLocaleString()}');
content = content.replace("alert('ѹ֡Թ');", "alert('บันทึกรับชำระเงินเพิ่มเติมสำเร็จ!');");

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
