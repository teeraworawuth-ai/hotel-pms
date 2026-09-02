const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// Fix focus outline black box
content = content.replace('className="w-full h-[140px] cursor-grab active:cursor-grabbing touch-pan-y"', 'className="w-full h-[140px] cursor-grab active:cursor-grabbing touch-pan-y outline-none focus:outline-none" style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}');

// Fix XAxis props: remove interval="preserveStartEnd" and minTickGap={0} completely. We will let it render all ticks or use interval={0} but wait, Recharts might hide them if we just remove interval. We must use interval={0} to FORCE it to show every tick we explicitly generate.
content = content.replace(/interval="preserveStartEnd"/, 'interval={0}');
content = content.replace(/minTickGap=\{0\}/, 'minTickGap={-1000}');

// Fix CustomTooltip
const customTooltipRegex = /const CustomTooltip = \(\{ active, payload, label \}: any\) => \{[\s\S]*?return null;\n  \};/;
const newCustomTooltip = `const CustomTooltip = ({ active, payload, label }: any) => {
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

// Fix renderTick
const renderTickRegex = /const renderTick = \(props: any\) => \{[\s\S]*?return \([\s\S]*?<\/g>\);\n  \};/g;
const newRenderTick = `const renderTick = (props: any) => {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    const date = new Date(payload.value);

    let fSize = 9;
    const rangeMs = domain[1] - domain[0];
    const rangeHours = rangeMs / (60 * 60 * 1000);
    
    let timeStr = "";
    if (rangeHours > 16) {
      // Unzoomed
      const day = date.getDate().toString().padStart(2, '0');
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = months[date.getMonth()];
      const hrs = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      timeStr = \`\${day} \${month} \${hrs}:\${mins}\`;
      fSize = 8;
    } else {
      // Zoomed
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
// Replaces the ENTIRE renderTick function. I used g flag and [\s\S]*? to capture the whole thing correctly.
content = content.replace(renderTickRegex, newRenderTick);

// Update margins of AreaChart so XAxis label and Ticks fit perfectly
content = content.replace(/margin=\{\{ top: 10, right: 10, left: 0, bottom: 5 \}\}/, 'margin={{ top: 25, right: 10, left: 0, bottom: 20 }}');

// Update CartesianGrid to fix clipping and add XAxis Title
// Actually the user wants "เวลา" on X-Axis. I can add label={{ value: 'เวลา', position: 'insideBottom', offset: -15, style: { fill: '#64748b', fontSize: 11, fontWeight: 'bold' } }} to XAxis.
const xAxisRegex = /<XAxis[\s\S]*?minTickGap=\{[-0-9]+\}\n\s*\/>/;
const newXAxis = `<XAxis 
                dataKey="fullTime"
                type="number"
                domain={domain}
                ticks={getDynamicTicks()}
                tick={renderTick}
                tickLine={false}
                axisLine={false}
                interval={0}
                minTickGap={-1000}
                label={{ value: 'เวลา', position: 'insideBottom', offset: -18, style: { fill: '#64748b', fontSize: 11, fontWeight: 'bold' } }}
              />`;
content = content.replace(xAxisRegex, newXAxis);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed ALL remaining UI elements.');
