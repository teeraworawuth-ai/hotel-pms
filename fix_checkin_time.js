const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const fixStartDate = `    const startDate = (dateOffset === 0 && !isReservationForToday) ? getNow() : new Date(displayDateStr);
    if (dateOffset > 0 || isReservationForToday) {
      // ถ้าจองล่วงหน้า หรือจองของวันนี้ที่ยังไม่มาถึง ให้เวลาเริ่มคือ 14:00 น. ของวันนั้น
      startDate.setHours(14, 0, 0, 0);
    }`;

content = content.replace(/    const startDate = new Date\(displayDateStr\);\s*if \(dateOffset > 0 \|\| isReservationForToday\) \{\s*\/\/ ถ้าจองล่วงหน้า หรือจองของวันนี้ที่ยังไม่มาถึง ให้เวลาเริ่มคือ 14:00 น\. ของวันนั้น\s*startDate\.setHours\(14, 0, 0, 0\);\s*\}/, fixStartDate);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
