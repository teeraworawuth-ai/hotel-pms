const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const dynamicTicksRegex = /const getDynamicTicks = \(\) => \{[\s\S]*?return ticks\.sort\(\(a, b\) => a - b\);\n\s*\};/;
const newDynamicTicks = `const getDynamicTicks = () => {
    const ticks = [];
    const [min, max] = domain;
    const rangeMs = max - min;
    const rangeHours = rangeMs / (60 * 60 * 1000);
    
    let intervalHours = 1;
    if (rangeHours > 16) intervalHours = 1; // 1 hr
    else if (rangeHours > 8) intervalHours = 0.5; // 30m
    else if (rangeHours > 4) intervalHours = 0.25; // 15m
    else intervalHours = 1/6; // 10m

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    let tickMs = Math.ceil(min / intervalMs) * intervalMs;
    while (tickMs <= max) {
      ticks.push(tickMs);
      tickMs += intervalMs;
    }
    
    // Always include start 06:45 and end 06:45 if in view
    if (defaultStartMs >= min && defaultStartMs <= max && !ticks.includes(defaultStartMs)) ticks.push(defaultStartMs);
    const secondSeven = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime();
    if (secondSeven >= min && secondSeven <= max && !ticks.includes(secondSeven)) ticks.push(secondSeven);

    return ticks.sort((a, b) => a - b);
  };`;
content = content.replace(dynamicTicksRegex, newDynamicTicks);

const renderTickRegex = /const renderTick = \(props: any\) => \{[\s\S]*?return \([\s\S]*?<\/g>\);\n\s*\};/;
const newRenderTick = `const renderTick = (props: any) => {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    const date = new Date(payload.value);

    // Bold 7 at start and end of day
    if (payload.value === defaultStartMs || payload.value === new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime()) {
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y + 3} stroke="#94a3b8" strokeWidth={1.5} />
          <text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={10} fontWeight="bold">7</text>
        </g>
      );
    }
    
    let fSize = 9;
    const rangeMs = domain[1] - domain[0];
    const rangeHours = rangeMs / (60 * 60 * 1000);
    
    let timeStr = date.getHours().toString();
    
    // If zoomed in (interval < 1 hr), show minutes
    if (rangeHours <= 16) { 
      timeStr = \`\${date.getHours().toString().padStart(2, '0')}:\${date.getMinutes().toString().padStart(2, '0')}\`;
      fSize = 7.5;
    }

    return (
      <g>
        <line x1={x} y1={y} x2={x} y2={y + 2} stroke="#cbd5e1" strokeWidth={1} />
        <text x={x} y={y + 11} textAnchor="middle" fill="#cbd5e1" fontSize={fSize} fontWeight="normal">{timeStr}</text>
      </g>
    );
  };`;
content = content.replace(renderTickRegex, newRenderTick);

content = content.replace(/minTickGap=\{[-0-9]+\}/g, 'minTickGap={-1000}');

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed specific ticks logic');
