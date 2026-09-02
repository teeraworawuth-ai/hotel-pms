const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  /\{loading \? null : \(\s*<div/g,
  `{loading ? null : (<>\n              <div`
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
