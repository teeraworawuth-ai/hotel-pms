const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const oldTooltip = `<div className="bg-slate-800 text-white p-3 rounded-xl shadow-lg border border-slate-700 text-sm z-50">
        <p className="font-bold text-blue-300 mb-1">{timeStr}</p>
        <p className="flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
           <span>กำลังไฟ: <span className="font-bold">{watt} W</span></span>
        </p>
      </div>`;

const newTooltip = `<div className="bg-white/80 backdrop-blur-[2px] text-slate-800 px-2 py-1 rounded border border-slate-200 text-[10px] font-bold shadow-sm pointer-events-none">
        <span className="text-indigo-600">{timeStr}</span>
        <span className="text-slate-300 font-normal mx-1">|</span>
        <span>{watt} <span className="text-[9px] font-normal text-slate-500">W</span></span>
      </div>`;

content = content.replace(oldTooltip, newTooltip);
fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Tooltip updated');
