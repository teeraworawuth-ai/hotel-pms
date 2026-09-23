const fs = require('fs');
let c = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

c = c.replace(/<span className="opacity-90 ml-1 drop-shadow-sm text-slate-700 flex items-center gap-0\.5">/g, '<span className="opacity-90 ml-[2px] drop-shadow-sm text-slate-700 flex items-center gap-[1px]">');

c = c.replace(/w-\[13px\] h-\[13px\] sm:w-\[17px\] sm:h-\[17px\]/g, 'w-[13px] h-[16px] sm:w-[17px] sm:h-[20px]');

fs.writeFileSync('src/app/checkin/page.tsx', c, 'utf8');
console.log('Fixed gaps and sizes');
