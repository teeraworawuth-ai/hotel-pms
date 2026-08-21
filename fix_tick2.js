const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// Replace the specific line in CustomTick
content = content.replace('if (isOddHour || showControls) {', 'if (isOddHour) {');

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content, 'utf8');
