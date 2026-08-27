const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  'tickLine={false}\n                axisLine={false}',
  'tickLine={false}\n                axisLine={false}\n                interval={0}\n                minTickGap={5}'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed XAxis interval');
