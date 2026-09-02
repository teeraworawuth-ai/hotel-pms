const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Imports
content = content.replace('LineChart,', 'AreaChart,\n  Area,');
content = content.replace('Line,', '');

// 2. Ticks Logic
const dynamicTicksRegex = /const getDynamicTicks = \(\) => \{[\s\S]*?return ticks\.sort\(\(a, b\) => a - b\);\n\s*\};/;
const newDynamicTicks = `const getDynamicTicks = () => {
    const ticks = [];
    const [min, max] = domain;
    const rangeMs = max - min;
    const rangeHours = rangeMs / (60 * 60 * 1000);
    
    let intervalHours = 2;
    if (rangeHours > 16) intervalHours = 2; // Unzoomed: 2 hrs
    else if (rangeHours > 8) intervalHours = 1; // 1st zoom: 1 hr
    else if (rangeHours > 4) intervalHours = 0.5; // 2nd zoom: 30m
    else if (rangeHours > 1.5) intervalHours = 0.25; // 3rd zoom: 15m
    else if (rangeHours > 0.5) intervalHours = 1/6; // 4th zoom: 10m
    else intervalHours = 1/12; // 5th zoom: 5m

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    let tickMs = Math.ceil(min / intervalMs) * intervalMs;
    while (tickMs <= max) {
      ticks.push(tickMs);
      tickMs += intervalMs;
    }
    
    if (defaultStartMs >= min && defaultStartMs <= max && !ticks.includes(defaultStartMs)) ticks.push(defaultStartMs);
    const secondSeven = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime();
    if (secondSeven >= min && secondSeven <= max && !ticks.includes(secondSeven)) ticks.push(secondSeven);

    return ticks.sort((a, b) => a - b);
  };`;
content = content.replace(dynamicTicksRegex, newDynamicTicks);

// 3. Render Tick (Formatting)
const renderTickRegex = /const renderTick = \(props: any\) => \{[\s\S]*?return \([\s\S]*?<\/g>\);\n\s*\};/;
const newRenderTick = `const renderTick = (props: any) => {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    const date = new Date(payload.value);

    let fSize = 9;
    const rangeMs = domain[1] - domain[0];
    const rangeHours = rangeMs / (60 * 60 * 1000);
    
    let timeStr = "";
    
    // Unzoomed (> 16 hours) -> DD MMM HH:mm
    if (rangeHours > 16) {
      const day = date.getDate().toString().padStart(2, '0');
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = months[date.getMonth()];
      const hrs = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      timeStr = \`\${day} \${month} \${hrs}:\${mins}\`;
      fSize = 8;
    } else {
      // Zoomed -> HH:mm
      timeStr = \`\${date.getHours().toString().padStart(2, '0')}:\${date.getMinutes().toString().padStart(2, '0')}\`;
      fSize = 9;
    }

    return (
      <g>
        <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#94a3b8" strokeWidth={1} />
        <text x={x} y={y + 14} textAnchor="middle" fill="#64748b" fontSize={fSize} fontWeight="normal">{timeStr}</text>
      </g>
    );
  };`;
content = content.replace(renderTickRegex, newRenderTick);

// 4. Custom Tooltip
const customTooltipRegex = /const CustomTooltip = \(\{ active, payload \}: any\) => \{[\s\S]*?return null;\n  \};/;
const newCustomTooltip = `const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.watt === null) {
        return (
          <div className="bg-slate-800 text-white p-2 rounded-md shadow-lg text-xs font-mono">
            <p className="text-slate-400 text-[10px] mb-1">Offline / No Data</p>
          </div>
        );
      }
      
      const date = new Date(data.fullTime);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = (date.getFullYear() + 543).toString();
      const hrs = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      const secs = date.getSeconds().toString().padStart(2, '0');
      
      return (
        <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-700 text-white p-2.5 rounded-lg shadow-xl text-xs flex flex-col gap-1.5 z-50">
          <p className="font-semibold text-slate-200 tracking-wide">\${day}/\${month}/\${year} \${hrs}:\${mins}:\${secs}</p>
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <div className="w-2.5 h-2.5 bg-blue-400 rounded-sm"></div>
            <span className="text-yellow-400">⚡</span>
            <span>\${data.watt} W</span>
          </div>
        </div>
      );
    }
    return null;
  };`;
content = content.replace(customTooltipRegex, newCustomTooltip);

// 5. Chart structure (AreaChart, Labels, Grid)
content = content.replace(/<LineChart/g, '<AreaChart');
content = content.replace(/<\/LineChart>/g, '</AreaChart>');
// Fix margin to make room for axes labels
content = content.replace('margin={{ top: 10, right: 10, left: -20, bottom: 0 }}', 'margin={{ top: 25, right: 10, left: 10, bottom: 15 }}');
// Update CartesianGrid
content = content.replace('<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />', '<CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="#e2e8f0" />');
// YAxis Label
content = content.replace(/<YAxis[\s\S]*?\/>/, `<YAxis 
                  type="number"
                  domain={[0, yAxisMax]}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={true}
                  axisLine={true}
                  tickFormatter={(value) => value.toLocaleString()}
                  orientation="left"
                  width={55}
                  label={{ value: 'กำลังไฟฟ้า (Watts)', angle: -90, position: 'insideLeft', offset: 0, style: { textAnchor: 'middle', fill: '#64748b', fontSize: 11, fontWeight: 'bold' } }}
                />`);

// Line -> Area
const lineRegex = /<Line[\s\S]*?dot=\{false\}[\s\S]*?\/>/;
const newArea = `<Area 
                  type="linear" 
                  dataKey="watt" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  fill="#eff6ff"
                  fillOpacity={0.8}
                  dot={false}
                  activeDot={{ r: 5, fill: '#ffffff', stroke: '#3b82f6', strokeWidth: 3 }}
                  animationDuration={0}
                  isAnimationActive={false}
                />`;
content = content.replace(lineRegex, newArea);

// Legend Overlay
content = content.replace('{/* Tooltips & Elements */}', `{/* Legend */}
                <text x="50%" y="10" textAnchor="middle" fill="#475569" fontSize="12" fontWeight="bold">
                  <tspan className="fill-blue-500">■</tspan> กำลังไฟฟ้า (W)
                </text>
                
                {/* Tooltips & Elements */}`);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Graph UI converted to AreaChart 100% style');
