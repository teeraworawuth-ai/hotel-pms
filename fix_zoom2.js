const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  'onMouseLeave={onMouseLeave}',
  'onMouseLeave={onMouseLeave}\n                  onDoubleClick={onDoubleClick}'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content, 'utf8');
