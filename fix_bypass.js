const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const targetStr = `  const handleCheckOut = async () => {
    if (room.unpaid_balance && room.unpaid_balance > 0) {
      alert(\`ลูกค้ามียอดค้างชำระ \${room.unpaid_balance.toLocaleString()} บาท กรุณากด "จัดการบิล / ชำระเงิน" เพื่อรับชำระให้ครบก่อน Check-out\`);
      return;
    }`;

const newStr = `  const handleCheckOut = async () => {
    if (room.unpaid_balance && room.unpaid_balance > 0) {
      if (activeShift?.staff_role === 'staff') {
        const confirmBypass = window.confirm(\`ลูกค้ามียอดค้างชำระ \${room.unpaid_balance.toLocaleString()} บาท\\n\\n(โหมดทดลองใช้งาน) ระบบอนุญาตให้ข้ามการชำระเงินชั่วคราว คุณต้องการเช็คเอาต์เลยหรือไม่?\`);
        if (!confirmBypass) return;
      } else {
        alert(\`ลูกค้ามียอดค้างชำระ \${room.unpaid_balance.toLocaleString()} บาท กรุณากด "จัดการบิล / ชำระเงิน" เพื่อรับชำระให้ครบก่อน Check-out\`);
        return;
      }
    }`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, newStr);
  fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
  console.log('Fixed bypass check-out');
}
