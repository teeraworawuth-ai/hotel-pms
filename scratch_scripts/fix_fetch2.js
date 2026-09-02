const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Fix startOfRange and endOfDay
content = content.replace(
  /const startOfRange = new Date\([^)]+\);[\s\S]*?let endOfDay = new Date\([^)]+\);/,
  `const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 3, 0, 0, 0);
      let endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 2, 0, 0, 0);`
);

// 2. Fix limit to 50000
content = content.replace(/\.limit\(15000\)/, '.limit(50000)');

// 3. Fix Watermark styling
content = content.replace(
  /className="text-slate-200 font-black text-5xl sm:text-7xl select-none opacity-40"/g,
  'className="text-slate-300 font-black text-4xl sm:text-5xl select-none opacity-50"'
);

// 4. Fix Area fill styling
// Look for <Area type="monotone" dataKey="watt" ... fill="#eff6ff" ... />
content = content.replace(
  /fill="#eff6ff"/g,
  'fill="#dbeafe"'
);
content = content.replace(
  /fillOpacity=\{0\.8\}/g,
  'fillOpacity={0.9}'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log("Fixes applied successfully.");
