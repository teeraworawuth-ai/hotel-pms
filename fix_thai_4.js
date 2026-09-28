const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const target1 = "alert('سԴС͹ӡêԹ');";
const target2 = "notes: paymentTime ? `͹: ${paymentTime.replace('T', ' ')}` : undefined";
const target3 = "alert('ѹ֡Թ');";

content = content.replace(target1, "alert('กรุณาเปิดกะก่อนทำรายการ');");
content = content.replace(target2, "notes: paymentTime ? `โอนเวลา: ${paymentTime.replace('T', ' ')}` : undefined");
content = content.replace(target3, "alert('บันทึกรับชำระเงินเพิ่มเติมสำเร็จ');");

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
