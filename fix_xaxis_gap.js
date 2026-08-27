const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  'interval={0}\n                minTickGap={5}',
  'interval="preserveStartEnd"\n                minTickGap={0}'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed XAxis interval and gap');
