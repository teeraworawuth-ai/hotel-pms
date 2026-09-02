const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// Update renderTick to add rotation
const renderTickRegex = /const renderTick = \(props: any\) => \{[\s\S]*?return \([\s\S]*?<\/g>\);\n  \};/g;
const newRenderTick = `const renderTick = (props: any) => {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    const date = new Date(payload.value);

    // Bold 7 at start and end of day (06:45:00 and 06:44:59)
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
    let isZoomed = false;
    
    if (rangeMs < 16 * 60 * 60 * 1000) { 
      timeStr = \`\${date.getHours().toString().padStart(2, '0')}:\${date.getMinutes().toString().padStart(2, '0')}\`;
      fSize = 8.5;
      isZoomed = true;
    }

    // Slant the text down to the right by 30 degrees if zoomed
    const rotation = isZoomed ? "rotate(-30)" : "";
    const dx = isZoomed ? -5 : 0;
    const dy = isZoomed ? 18 : 11;

    return (
      <g>
        <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#cbd5e1" strokeWidth={1} />
        <text 
          x={x} 
          y={y} 
          dx={dx} 
          dy={dy} 
          textAnchor={isZoomed ? "end" : "middle"} 
          fill="#64748b" 
          fontSize={fSize} 
          fontWeight="normal"
          transform={isZoomed ? \`rotate(-30 \${x} \${y})\` : ""}
        >
          {timeStr}
        </text>
      </g>
    );
  };`;
content = content.replace(renderTickRegex, newRenderTick);

// Increase bottom margin to accommodate slanted text
content = content.replace(/margin=\{\{ top: 25, right: 10, left: 0, bottom: 20 \}\}/, 'margin={{ top: 25, right: 10, left: 0, bottom: 25 }}');

// Adjust X-Axis label "เวลา" to be a little lower
content = content.replace(/offset: -18/, 'offset: -22');

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed rotation and layout');
