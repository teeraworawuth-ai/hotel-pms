const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Update CustomTooltip
const tooltipRegex = /const CustomTooltip = \(\{ active, payload \}: any\) => \{[\s\S]*?return null;\n\};/;
const newTooltip = `const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (data.watt === null) return null;
    
    const date = new Date(data.fullTime);
    const hrs = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    const dateStr = isToday ? 'วันนี้' : (date.getDate().toString().padStart(2, '0') + '/' + (date.getMonth() + 1).toString().padStart(2, '0'));
    const formattedWatt = Math.round(data.watt).toLocaleString();

    return (
      <div className="font-bold text-[12px] pointer-events-none flex items-center gap-1" style={{ textShadow: '1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white' }}>
        <span className="text-indigo-700">{dateStr} {hrs}:{mins}</span>
        <span className="text-slate-400 font-normal">|</span>
        <span className="text-slate-800">{formattedWatt} <span className="text-[10px] font-normal text-slate-600">W</span></span>
      </div>
    );
  }
  return null;
};`;
content = content.replace(tooltipRegex, newTooltip);


// 2. Import Label from recharts
if (!content.includes('Label,')) {
  content = content.replace('ReferenceLine', 'ReferenceLine,\n  Label');
}


// 3. Update ReferenceLine for midnights
const referenceLineRegex = /\{midnights\.map\(\(m, idx\) => \(\s*<ReferenceLine key=\{\'mid\-\' \+ idx\} x=\{m\} stroke="#000000" strokeDasharray="5 5" strokeWidth=\{1\.5\} strokeOpacity=\{0\.8\} \/>\s*\)\)\}/;
const newReferenceLine = `{midnights.map((m, idx) => {
          const date = new Date(m);
          const now = new Date();
          const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
          const dateStr = isToday ? 'วันนี้' : (date.getDate().toString().padStart(2, '0') + '/' + (date.getMonth() + 1).toString().padStart(2, '0'));
          return (
            <ReferenceLine key={'mid-' + idx} x={m} stroke="#000000" strokeDasharray="5 5" strokeWidth={1.5} strokeOpacity={0.8}>
              <Label value={dateStr} position="insideTopLeft" fill="#334155" fontSize={11} fontWeight="bold" offset={5} />
            </ReferenceLine>
          );
        })}`;
// Wait, 'position="top"' puts it outside the chart if there is no top margin. 
// "insideTopLeft" puts it inside the chart, anchored to the top left of the reference line.
content = content.replace(referenceLineRegex, newReferenceLine);


// 4. Calculate Watermark and inject it
const returnStart = content.lastIndexOf('return (');
const contentBeforeReturn = content.substring(0, returnStart);
const contentAfterReturn = content.substring(returnStart);

// Inject calculations before the final return
const watermarkCalc = `
  const centerMs = (domain[0] + domain[1]) / 2;
  const centerDate = new Date(centerMs);
  const now = new Date();
  const isCenterToday = centerDate.getDate() === now.getDate() && centerDate.getMonth() === now.getMonth() && centerDate.getFullYear() === now.getFullYear();
  const watermarkText = isCenterToday ? 'วันนี้' : (centerDate.getDate().toString().padStart(2, '0') + '/' + (centerDate.getMonth() + 1).toString().padStart(2, '0'));
  `;

// Inject the div before ResponsiveContainer
// Note: ResponsiveContainer is used twice (fullscreen and normal). 
// I will replace both occurrences.
let newContentAfterReturn = contentAfterReturn.replace(
  /<ResponsiveContainer width="100%" height="100%">/g, 
  `<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
              <span className="text-slate-200 font-black text-5xl sm:text-7xl select-none opacity-40">{watermarkText}</span>
            </div>
            <ResponsiveContainer width="100%" height="100%" className="relative z-10">`
);

content = contentBeforeReturn + watermarkCalc + newContentAfterReturn;

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Done.');
