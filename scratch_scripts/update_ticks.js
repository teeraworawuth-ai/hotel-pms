const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  /const zoomWidths = \['700%', '1400%', '2800%', '8400%', '33600%'\];/,
  "const zoomWidths = ['100%', '200%', '400%', '600%', '1200%'];"
);
content = content.replace(
  /const zoomIntervalMins = \[60, 30, 15, 5, 1\]; \/\/ 0=60m, 1=30m, 2=15m, 3=5m, 4=1m/,
  "const zoomIntervalMins = [60, 30, 15, 10, 5]; // 0=60m, 1=30m, 2=15m, 3=10m, 4=5m"
);

const oldRenderTickExpanded = `      if (isExpanded) {
        // Hide ticks on edges to prevent overflow if they get squished
        if (payload.value === graphStartMs || payload.value === graphEndMs) return null;
        
        const timeStr = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
        // At zoom level 0 or 1, show date at noon
        return (
          <g transform={\`translate(\${x},\${y})\`}>
            <text x={0} y={15} dy={0} textAnchor="middle" fill="#94a3b8" fontSize={10} className="font-medium">
              {timeStr}
            </text>
            {zoomLevel <= 1 && date.getHours() === 12 && date.getMinutes() === 0 && (
               <text x={0} y={28} dy={0} textAnchor="middle" fill="#64748b" fontSize={9} fontWeight="bold">
                 {date.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
               </text>
            )}
          </g>
        );
      }`;

const newRenderTickExpanded = `      if (isExpanded) {
        if (payload.value === graphStartMs || payload.value === graphEndMs) return null;
        
        if (zoomLevel === 0 && date.getMinutes() !== 0) return null; 
        
        const timeStr = zoomLevel === 0 
           ? date.getHours().toString() 
           : date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

        return (
          <g transform={\`translate(\${x},\${y})\`}>
            {zoomLevel === 0 ? (
               <text x={0} y={15} dy={0} textAnchor="middle" fill="#64748b" fontSize={11} fontWeight="bold">
                 {timeStr}
               </text>
            ) : (
               <text x={0} y={15} dy={0} textAnchor="middle" fill="#94a3b8" fontSize={10} className="font-medium">
                 {timeStr}
               </text>
            )}
            
            {zoomLevel <= 1 && date.getHours() === 12 && date.getMinutes() === 0 && (
               <text x={0} y={28} dy={0} textAnchor="middle" fill="#64748b" fontSize={9} fontWeight="bold">
                 {date.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
               </text>
            )}
          </g>
        );
      }`;

content = content.replace(oldRenderTickExpanded, newRenderTickExpanded);

content = content.replace(
  '<text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">\n                7\n              </text>',
  '<text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">\n                {date.getHours()}\n              </text>'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log("Updated");
