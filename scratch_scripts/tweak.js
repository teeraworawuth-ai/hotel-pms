const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

content = content.replace(
/className="w-\[105%\] mt-auto pt-1 pb-0\.5 border-t border-slate-300\/40 flex items-center justify-center gap-1 sm:gap-1\.5 text-\[12px\] sm:text-\[14px\] font-black z-20 whitespace-nowrap bg-white\/50 px-1 shadow-sm overflow-hidden"/g,
'className="w-[calc(100%+16px)] mt-auto pt-1 pb-1 -mb-1.5 border-t border-slate-300/40 flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-[13px] font-black z-20 whitespace-nowrap bg-white/50 px-1 rounded-b-lg"'
);

fs.writeFileSync('src/app/checkin/page.tsx', content);
