const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

content = content.replace(/<label className="block text-sm font-bold text-slate-700 mb-2">.*?\(Past Payments\)<\/label>/g, '<label className="block text-sm font-bold text-slate-700 mb-2">ประวัติการรับชำระเงิน (Past Payments)</label>');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
