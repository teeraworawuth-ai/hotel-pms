const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const newTickLogic = `
    const renderTick = (props: any) => {
      const { x, y, payload } = props;
      if (!payload || !payload.value) return null;
      const date = new Date(payload.value);

      if (isExpanded) {
        const timeStr = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
        return (
          <g transform={\`translate(\${x},\${y})\`}>
            <text x={0} y={15} dy={0} textAnchor="middle" fill="#94a3b8" fontSize={10} className="font-medium">
              {timeStr}
            </text>
          </g>
        );
      } else {
        const isStartOrEnd = payload.value === startOfDayMs || payload.value === (startOfDayMs + 24 * 3600 * 1000 - 60000);
        const isHour = date.getMinutes() === 0 || date.getMinutes() === 45 || date.getMinutes() === 44; // To handle the 07:00 vs 06:45
        // Wait, the old logic checked date.getMinutes() === 0, but graphStart is 06:45. Let's just use the exact old logic.
        const isOddHour = date.getHours() % 2 !== 0; 
        
        if (isStartOrEnd) {
          return (
            <g>
              <line x1={x} y1={y} x2={x} y2={y + 3} stroke="#94a3b8" strokeWidth={1.5} />
              <text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">
                7
              </text>
            </g>
          );
        } else if (date.getMinutes() === 0) {
          if (isOddHour || showControls) {
            const hour = date.getHours();
            const fSize = hour >= 10 ? 9.5 : 11;
            return (
              <g>
                <line x1={x} y1={y} x2={x} y2={y + 2} stroke="#cbd5e1" strokeWidth={1} />
                <text x={x} y={y + 11} textAnchor="middle" fill="#cbd5e1" fontSize={showControls ? 11 : fSize}>
                  {hour}
                </text>
              </g>
            );
          }
        }
        return null;
      }
    };
`;

const insertMarker = "const showControls = !loading && data.length > 0 && !isExpanded;";
const insertPos = content.indexOf(insertMarker) + insertMarker.length;
content = content.substring(0, insertPos) + '\n' + newTickLogic + '\n' + content.substring(insertPos);

content = content.replace('tick={<CustomTick />}', 'tick={renderTick}');
content = content.replace('interval="preserveStartEnd"', 'interval={isExpanded ? "preserveStartEnd" : 0}');
content = content.replace('minTickGap={20}', 'minTickGap={isExpanded ? 20 : 10}');

// Let's also make sure `smallTicks` generates hourly ticks for unexpanded view correctly!
// In my new logic, `zoomIntervalMins` for zoomLevel 0 is 60 minutes.
// `firstTickMs = startOfDayMs + 15 * 60 * 1000;` // 07:00
// It generates ticks at 07:00, 08:00, 09:00, etc. This is perfect for the old CustomTick to match `date.getMinutes() === 0`.

// Remove the old unused CustomTick outside of EnergyGraph
// Actually, it's defined inside EnergyGraph but before renderGraph.
const oldTickRegex = /const CustomTick = \(props: any\) => \{[\s\S]*?\};\n\n/g;
content = content.replace(oldTickRegex, '');

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content, 'utf8');
