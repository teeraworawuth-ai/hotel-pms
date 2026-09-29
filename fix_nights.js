const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const newNights = `  const [nights, setNights] = useState<number | ''>(() => {
    if (room.status === 'reserved' || room.status === 'occupied') {
      if (room.check_in_time && room.check_out_time) {
        const inTime = new Date(room.check_in_time);
        const outTime = new Date(room.check_out_time);
        const diff = outTime.getTime() - inTime.getTime();
        const n = Math.round(diff / (1000 * 60 * 60 * 24));
        if (n > 0) return n;
      }
    }
    if (dateOffset === 0) {
      const h = getNow().getHours();
      if (h >= 0 && h < 7) return 0; // Late night defaults to 0 nights (checkout today noon)
    }
    return 1;
  });`;

content = content.replace(/const \[nights, setNights\] = useState<number \| ''>\(\(\) => \{[\s\S]*?return 1;\r?\n\s*\}\);/, newNights);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
