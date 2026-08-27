const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  "activeDot={{ r: 4, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}",
  "activeDot={{ r: 6, fill: '#ffffff', stroke: '#6366f1', strokeWidth: 3 }}"
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed activeDot visibility');
