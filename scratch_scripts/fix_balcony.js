const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

const svgBalcony = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 translate-y-[1px] opacity-80"><path d="M3 12h18"/><path d="M3 16h18"/><path d="M3 20h18"/><path d="M6 12v8"/><path d="M10 12v8"/><path d="M14 12v8"/><path d="M18 12v8"/><path d="M5 4h14a1 1 0 0 1 1 1v7H4V5a1 1 0 0 1 1-1z"/></svg>`;

content = content.replace(
  /<img src="\/balcony.png"[\s\S]*?alt="ระเบียง" \/>/,
  svgBalcony
);

fs.writeFileSync('src/app/checkin/page.tsx', content);
console.log("Replaced balcony PNG with SVG");
