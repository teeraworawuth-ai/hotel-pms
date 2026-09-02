const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const oldLogic = `let intervalHours = 2;
      if (rangeHours > 24) intervalHours = 6;
      else if (rangeHours > 12) intervalHours = 2;
      else if (rangeHours > 6) intervalHours = 1;
      else if (rangeHours > 3) intervalHours = 0.5;
      else if (rangeHours > 1) intervalHours = 0.25; // 15m
      else intervalHours = 1/12; // 5m`;

const newLogic = `let intervalHours = 2;
      if (rangeHours > 16) intervalHours = 2;
      else if (rangeHours > 8) intervalHours = 1;
      else if (rangeHours > 4) intervalHours = 0.5; // 30m
      else if (rangeHours > 1.5) intervalHours = 0.25; // 15m
      else intervalHours = 1/12; // 5m`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed tick intervals');
