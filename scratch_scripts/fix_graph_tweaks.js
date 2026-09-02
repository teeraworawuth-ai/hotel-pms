const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. YAxis adjustments
content = content.replace(/width=\{40\}/g, 'width={45}');
content = content.replace(/tickFormatter=\{\(value\) => value\.toLocaleString\(\)\}/g, 'tickFormatter={(value) => Math.round(value).toLocaleString()}');

// 2. Tooltip adjustments (round watt)
content = content.replace(/\| \{data\.watt\}W/g, '| {Math.round(data.watt)}W');

// 3. renderTick adjustments for '7'
const oldTick = `    // Bold 7 at start and end of day
    if (payload.value === defaultStartMs || payload.value === new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime()) {
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y + 3} stroke="#94a3b8" strokeWidth={1.5} />
          <text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">7</text>
        </g>
      );
    }`;
const newTick = `    // Bold 7 at start and end of day
    if (payload.value === defaultStartMs || payload.value === new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime()) {
      return (
        <g>
          <text x={x} y={y + 11} textAnchor="middle" fill="#0f172a" fontSize={12} fontWeight="bold">7</text>
        </g>
      );
    }`;
content = content.replace(oldTick, newTick);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed Y-axis width, rounded watts, and removed line behind 7.');
