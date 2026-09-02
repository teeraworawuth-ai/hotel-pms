const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');
if (content.endsWith('}\n}\n')) {
  content = content.slice(0, -2);
  fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
}
