const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  'if (rangeMs < 6 * 60 * 60 * 1000) {',
  'if (rangeMs < 16 * 60 * 60 * 1000) {'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed time format zoom threshold');
