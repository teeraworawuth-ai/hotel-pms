const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

content = content.replace("alert('سԴС͹ӡêԹ');", "alert('กรุณาเปิดกะก่อนรับชำระเงิน');");
content = content.replace("`͹: ${paymentTime.replace('T', ' ')}`", "`โอนเวลา: ${paymentTime.replace('T', ' ')}`");
content = content.replace("alert('ѹ֡Թ');", "alert('บันทึกรับชำระเงินเพิ่มเติมสำเร็จ');");

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
