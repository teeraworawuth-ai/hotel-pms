const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Completely replace CustomTooltip
const tooltipStart = content.indexOf('const CustomTooltip =');
const tooltipEnd = content.indexOf('};', tooltipStart) + 2;
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
      <div className="text-slate-800 font-bold text-[11px] drop-shadow-sm bg-white/90 backdrop-blur-sm border border-slate-200 px-2 py-1 rounded pointer-events-none flex items-center gap-1">
        <span className="text-indigo-600">{dateStr} {hrs}:{mins}</span>
        <span className="text-slate-300 font-normal">|</span>
        <span>{formattedWatt} <span className="text-[9px] font-normal text-slate-500">W</span></span>
      </div>
    );
  }
  return null;
};`;
content = content.substring(0, tooltipStart) + newTooltip + content.substring(tooltipEnd);

// 2. Fix YAxis width and formatter
content = content.replace(/<YAxis[\s\S]*?\/>/, (match) => {
  let m = match.replace(/width=\{[0-9]+\}/, 'width={45}');
  m = m.replace(/tickFormatter=\{[^\}]+\}/, 'tickFormatter={(value) => Math.round(value).toLocaleString()}');
  return m;
});

// 3. Fix duplicate 7 ticks
const getDynamicTicksStart = content.indexOf('const getDynamicTicks = () => {');
const getDynamicTicksEnd = content.indexOf('};', getDynamicTicksStart) + 2;
const newGetDynamicTicks = `const getDynamicTicks = () => {
    const ticks = [];
    const [min, max] = domain;
    const rangeMs = max - min;
    const rangeHours = rangeMs / (60 * 60 * 1000);
    
    let intervalHours = 2;
    if (rangeHours > 16) intervalHours = 2; // Unzoomed: 2 hrs
    else if (rangeHours > 8) intervalHours = 2; // 8-16h: 2 hr (prevent overlap)
    else if (rangeHours > 4) intervalHours = 1; // 4-8h: 1 hr
    else if (rangeHours > 2) intervalHours = 0.5; // 2-4h: 30m
    else if (rangeHours > 1) intervalHours = 0.25; // 1-2h: 15m
    else if (rangeHours > 0.5) intervalHours = 1/6; // 30m-1h: 10m
    else intervalHours = 1/12; // < 30m: 5m

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    let tickMs = Math.ceil(min / intervalMs) * intervalMs;
    while (tickMs <= max) {
      ticks.push(tickMs);
      tickMs += intervalMs;
    }
    
    const secondSeven = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime();
    
    // Filter out dynamic ticks that are too close to our bold 7s (within 30 mins)
    const filteredTicks = ticks.filter(t => 
      Math.abs(t - defaultStartMs) > 30 * 60 * 1000 && 
      Math.abs(t - secondSeven) > 30 * 60 * 1000
    );
    
    if (defaultStartMs >= min && defaultStartMs <= max) filteredTicks.push(defaultStartMs);
    if (secondSeven >= min && secondSeven <= max) filteredTicks.push(secondSeven);

    return Array.from(new Set(filteredTicks)).sort((a, b) => a - b);
  };`;
content = content.substring(0, getDynamicTicksStart) + newGetDynamicTicks + content.substring(getDynamicTicksEnd);

// 4. Ensure no line behind 7
const renderTickStart = content.indexOf('const renderTick = (props: any) => {');
const renderTickEnd = content.indexOf('};', renderTickStart) + 2;
const newRenderTick = `const renderTick = (props: any) => {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    const date = new Date(payload.value);

    // Bold 7 at start and end of day
    if (payload.value === defaultStartMs || payload.value === new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime()) {
      return (
        <g>
          <text x={x} y={y + 11} textAnchor="middle" fill="#0f172a" fontSize={12} fontWeight="bold">7</text>
        </g>
      );
    }
    
    // Normal dynamic ticks
    let fSize = 9.5;
    const rangeMs = domain[1] - domain[0];
    let timeStr = date.getHours().toString();
    
    if (rangeMs < 16 * 60 * 60 * 1000) { // < 6 hours zoom, show minutes
      timeStr = \`\${date.getHours().toString().padStart(2, '0')}:\${date.getMinutes().toString().padStart(2, '0')}\`;
      fSize = 8;
    }

    return (
      <g>
        <line x1={x} y1={y} x2={x} y2={y + 2} stroke="#cbd5e1" strokeWidth={1} />
        <text x={x} y={y + 11} textAnchor="middle" fill="#64748b" fontSize={fSize} fontWeight="normal">{timeStr}</text>
      </g>
    );
  };`;
content = content.substring(0, renderTickStart) + newRenderTick + content.substring(renderTickEnd);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Successfully applied all fixes robustly.');
