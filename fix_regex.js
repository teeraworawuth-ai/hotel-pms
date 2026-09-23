const fs = require('fs');
let c = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

c = c.replace(/<span className="text-sm font-semibold text-slate-700 cursor-pointer">ไอคอน \([^\)]+\)<\/span>/g, '<span className="text-sm font-semibold text-slate-700 cursor-pointer">กำหนดไอคอนเฉพาะห้องนี้</span>');

fs.writeFileSync('patch_settings_per_room_icons2.js', fs.readFileSync('patch_settings_per_room_icons.js', 'utf8').replace(/c\.replace\(\/<span className="text-sm font-semibold text-slate-700 cursor-pointer">ไอคอน[^\n]+\n/g, ''), 'utf8');
