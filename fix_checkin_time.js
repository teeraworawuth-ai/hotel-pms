const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const oldLogic = `    const startDate = new Date(displayDateStr);
    if (dateOffset > 0 || isReservationForToday) {
      // ถ้าจองล่วงหน้า หรือจองของวันนี้ที่ยังไม่มาถึง ให้เวลาเริ่มคือ 14:00 น. ของวันนั้น
      startDate.setHours(14, 0, 0, 0);
    }`;

const newLogic = `    let startDate: Date;
    if (dateOffset > 0 || isReservationForToday) {
      // ถ้าจองล่วงหน้า หรือจองของวันนี้ที่ยังไม่มาถึง ให้เวลาเริ่มคือ 14:00 น. ของวันนั้น
      startDate = new Date(displayDateStr);
      startDate.setHours(14, 0, 0, 0);
    } else {
      // Walk-in ณ วันนี้ ให้ใช้เวลาปัจจุบันจริงๆ
      startDate = getNow();
    }`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
