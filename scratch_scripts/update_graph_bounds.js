const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Revert graphStartMs to 06:45:00
content = content.replace(
  'let graphStartMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 7, 0, 0).getTime();',
  'let graphStartMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0).getTime();'
);

// 2. Set graphEndMs to exactly 13:00 of next day
content = content.replace(
  'let graphEndMs = graphStartMs + 30 * 3600 * 1000;',
  'let graphEndMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 13, 0, 0).getTime();'
);

// 3. Revert fullScreenStart to 06:45:00
content = content.replace(
  'const fullScreenStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 7, 0, 0);',
  'const fullScreenStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);'
);

// 4. Set fullScreenEnd to 13:00 of next day (isExpanded was 30 hours, but now it's specifically to 13:00 next day)
// Wait, for fullScreen we don't have graphEndMs redefined separately, it just uses the line below it
content = content.replace(
  'graphEndMs = graphStartMs + 30 * 3600 * 1000;',
  'graphEndMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 13, 0, 0).getTime();'
);


// 5. Custom smallTicks logic
// For isExpanded, it builds ticks dynamically. For not expanded, we need custom ticks.
const targetTicksStr = `    const smallTicks = [];
    if (isExpanded) {
      const firstTickMs = graphStartMs; 
      for (let m = 0; m <= 30 * 60 + 15; m += tickIntervalMin) {
        const timeMs = firstTickMs + m * 60 * 1000;
        if (timeMs <= graphEndMs) {
          smallTicks.push(timeMs);
        }
      }
      smallTicks.push(graphEndMs);
    } else {
      // Custom ticks for collapsed graph
      smallTicks.push(graphStartMs); // 06:45 (labeled 7 bold)
      
      // 9, 11, 13, 15, 17, 19, 21, 23, 1, 3, 5
      for (let h = 9; h <= 23; h += 2) {
        smallTicks.push(new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), h, 0, 0).getTime());
      }
      for (let h = 1; h <= 5; h += 2) {
        smallTicks.push(new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, h, 0, 0).getTime());
      }
      
      const secondSeven = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime();
      smallTicks.push(secondSeven); // 06:44:59 next day (labeled 7 bold)
      
      // 9, 11, 13 next day
      for (let h = 9; h <= 13; h += 2) {
        smallTicks.push(new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, h, 0, 0).getTime());
      }
    }`;

// Replace old smallTicks loop
const oldTicksLoopRegex = /const smallTicks = \[\];[\s\S]*?smallTicks\.push\(graphEndMs\);/;
content = content.replace(oldTicksLoopRegex, targetTicksStr);

// 6. Update renderTick for collapsed
const oldRenderTickCollapsed = `        const isStartOrEnd = payload.value === graphStartMs || payload.value === graphEndMs;
        const isOddHour = date.getHours() % 2 !== 0; 
        
        if (isStartOrEnd) {
          return (
            <g>
              <line x1={x} y1={y} x2={x} y2={y + 3} stroke="#94a3b8" strokeWidth={1.5} />
              <text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">
                {date.getHours()}
              </text>
            </g>
          );
        } else if (date.getMinutes() === 0) {
          if (isOddHour) {
            const hour = date.getHours();
            const fSize = hour >= 10 ? 9.5 : 11;
            return (
              <g>
                <line x1={x} y1={y} x2={x} y2={y + 2} stroke="#cbd5e1" strokeWidth={1} />
                <text x={x} y={y + 11} textAnchor="middle" fill="#cbd5e1" fontSize={fSize}>
                  {hour}
                </text>
              </g>
            );
          }
        }
        return null;`;

const newRenderTickCollapsed = `        const isFirstSeven = payload.value === graphStartMs;
        // The second 7 is at 06:44:59 of next day
        const isSecondSeven = Math.abs(payload.value - new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime()) < 5000;
        
        if (isFirstSeven || isSecondSeven) {
          return (
            <g>
              <line x1={x} y1={y} x2={x} y2={y + 3} stroke="#94a3b8" strokeWidth={1.5} />
              <text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">
                7
              </text>
            </g>
          );
        } else {
          // Normal odd hours (9, 11, 13...)
          let hour = date.getHours();
          if (payload.value === graphEndMs) hour = 13; // Just in case it's 13:00
          
          const fSize = hour >= 10 ? 9.5 : 11;
          return (
            <g>
              <line x1={x} y1={y} x2={x} y2={y + 2} stroke="#cbd5e1" strokeWidth={1} />
              <text x={x} y={y + 11} textAnchor="middle" fill="#cbd5e1" fontSize={fSize} fontWeight="normal">
                {hour}
              </text>
            </g>
          );
        }`;

content = content.replace(oldRenderTickCollapsed, newRenderTickCollapsed);

// 7. Fix updateHover domain in isExpanded
content = content.replace(
  'const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 7, 0, 0).getTime();',
  'const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0).getTime();'
);
content = content.replace(
  'const endOfRange = startOfRange + 30 * 3600 * 1000;',
  'const endOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 13, 0, 0).getTime();'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Successfully reverted boundaries and tick bolding logic.');
