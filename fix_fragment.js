const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  /\( \? null : \(/g, 
  `( ? null : (<>`
);

content = content.replace(
  / \) :\s*\(\s*<div className="absolute inset-0 flex items-center justify-center/g, 
  ` ) : (\n            <>\n            <div className="absolute inset-0 flex items-center justify-center`
);

content = content.replace(
  /\{renderChartContent\(\)\}\s*<\/ResponsiveContainer>\s*\)/g,
  `{renderChartContent()}\n            </ResponsiveContainer>\n            </>)`
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
