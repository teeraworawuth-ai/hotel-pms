const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Remove ReferenceArea for offline periods
const offlineRegex = /\{offlinePeriods\.map\(\(period, idx\) => \([\s\S]*?\}\)\}/;
content = content.replace(offlineRegex, '');

// 2. Add allowDataOverflow to XAxis and YAxis
content = content.replace(/<XAxis[\s\S]*?minTickGap=\{[-0-9]+\}/, (match) => {
  return match + '\n                allowDataOverflow={true}';
});
content = content.replace(/<YAxis[\s\S]*?width=\{55\}/, (match) => {
  return match + '\n                  allowDataOverflow={true}';
});

// 3. Revert renderTick back to simple hour numbers (7, 9, 11...)
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
    
    // Normal dynamic ticks
    let fSize = 9.5;
    const rangeMs = domain[1] - domain[0];
    let timeStr = date.getHours().toString();
    
    // Zoomed in (< 16 hours), show HH:mm
    if (rangeMs < 16 * 60 * 60 * 1000) { 
      timeStr = \`\${date.getHours().toString().padStart(2, '0')}:\${date.getMinutes().toString().padStart(2, '0')}\`;
      fSize = 8;
    }

    return (
      <g>
        <line x1={x} y1={y} x2={x} y2={y + 2} stroke="#cbd5e1" strokeWidth={1} />
        <text x={x} y={y + 11} textAnchor="middle" fill="#cbd5e1" fontSize={fSize} fontWeight="normal">{timeStr}</text>
      </g>
    );
  };`;

content = content.replace(renderTickRegex, newRenderTick);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed offline area and tick format');
