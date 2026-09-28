const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const start = content.indexOf('const handleAdditionalPayment = async () => {');
const end = content.indexOf('};', start) + 2;

let fn = content.substring(start, end);
fn = fn.replace(/alert\(.*?\);/g, (m) => {
  if (m.length < 25) return "alert('บันทึกรับชำระเงินเพิ่มเติมสำเร็จ!');";
  return "alert('กรุณาเปิดกะก่อนทำรายการ');";
});
fn = fn.replace(/notes:.*?undefined/, "notes: paymentTime ? `โอนเวลา: ${paymentTime.replace('T', ' ')}` : undefined");

content = content.substring(0, start) + fn + content.substring(end);
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
