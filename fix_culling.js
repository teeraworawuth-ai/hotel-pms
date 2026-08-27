const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  'interval="preserveStartEnd"\n                  minTickGap={0}',
  'minTickGap={-200}'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Set minTickGap to -200');
