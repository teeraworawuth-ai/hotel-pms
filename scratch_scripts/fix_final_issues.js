const fs = require('fs');

// 1. Fix globals.css to completely remove SVG outline on focus
let cssContent = fs.readFileSync('src/app/globals.css', 'utf8');
if (!cssContent.includes('.recharts-wrapper')) {
  cssContent += `\n\n/* Remove Recharts Focus Outlines */\n.recharts-wrapper, .recharts-surface, .recharts-wrapper * {\n  outline: none !important;\n}\n`;
  fs.writeFileSync('src/app/globals.css', cssContent);
}

// 2. Fix EnergyGraph.tsx
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// A. Remove the white box from tooltip, make it just text
const customTooltipRegex = /const CustomTooltip = \(\{ active, payload, label \}: any\) => \{[\s\S]*?return null;\n  \};/;
const newCustomTooltip = `const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.watt === null) return null;
      
      const date = new Date(data.fullTime);
      const hrs = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      
      return (
        <div className="text-indigo-600 font-bold text-[11px] drop-shadow-md bg-white/50 px-1 rounded pointer-events-none">
          {hrs}:{mins} | {data.watt}W
        </div>
      );
    }
    return null;
  };`;
content = content.replace(customTooltipRegex, newCustomTooltip);

// B. Adjust tick intervals to prevent overlapping (max ~8 ticks)
const intervalRegex = /let intervalHours = 2;\n\s*if \(rangeHours > 16\) intervalHours = 2;.*?\n\s*else intervalHours = 1\/12; \/\/ 5th zoom: 5m/s;
const newIntervalLogic = `let intervalHours = 2;
    if (rangeHours > 16) intervalHours = 2; // Unzoomed: 2 hrs
    else if (rangeHours > 8) intervalHours = 2; // 8-16h: 2 hr (prevent overlap)
    else if (rangeHours > 4) intervalHours = 1; // 4-8h: 1 hr
    else if (rangeHours > 2) intervalHours = 0.5; // 2-4h: 30m
    else if (rangeHours > 1) intervalHours = 0.25; // 1-2h: 15m
    else if (rangeHours > 0.5) intervalHours = 1/6; // 30m-1h: 10m
    else intervalHours = 1/12; // < 30m: 5m`;
content = content.replace(intervalRegex, newIntervalLogic);

// C. Remove the slant from renderTick, keep it horizontal and simple
const renderTickRegex = /const renderTick = \(props: any\) => \{[\s\S]*?return \([\s\S]*?<\/g>\);\n  \};/g;
const newRenderTick = `const renderTick = (props: any) => {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    const date = new Date(payload.value);

    // Bold 7 at start and end of day
    if (payload.value === defaultStartMs || payload.value === new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime()) {
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y + 3} stroke="#94a3b8" strokeWidth={1.5} />
          <text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">7</text>
        </g>
      );
    }
    
    let fSize = 9.5;
    const rangeMs = domain[1] - domain[0];
    let timeStr = date.getHours().toString();
    
    if (rangeMs < 16 * 60 * 60 * 1000) { 
      timeStr = \`\${date.getHours().toString().padStart(2, '0')}:\${date.getMinutes().toString().padStart(2, '0')}\`;
      fSize = 9;
    }

    return (
      <g>
        <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#cbd5e1" strokeWidth={1} />
        <text x={x} y={y + 14} textAnchor="middle" fill="#64748b" fontSize={fSize} fontWeight="normal">{timeStr}</text>
      </g>
    );
  };`;
content = content.replace(renderTickRegex, newRenderTick);

// D. Enforce outline:none on chart component
content = content.replace(/<AreaChart data=\{data\} margin=\{\{ top: 25, right: 10, left: 0, bottom: 25 \}\}>/, '<AreaChart data={data} margin={{ top: 25, right: 10, left: 0, bottom: 25 }} style={{ outline: "none" }}>');

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed tooltip, intervals, slant, and outlines.');
