const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

content = content.replace(
  /<h1 className="text-2xl font-bold text-slate-800 tracking-tight">สมุดจอง & สถานะห้อง<\/h1>/,
  '<h1 className="text-2xl font-bold text-slate-800 tracking-tight">สมุดจอง & สถานะห้อง <span className="text-xs text-slate-400 font-normal ml-2">(v2)</span></h1>'
);

fs.writeFileSync('src/app/checkin/page.tsx', content);
