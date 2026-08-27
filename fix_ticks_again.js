const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

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
    else intervalHours = 1/6; // 4th zoom: 10m

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

content = content.replace(/minTickGap=\{[-0-9]+\}/g, 'minTickGap={0}');

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed tick rules and gap');
