const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  '<Tooltip content={<CustomTooltip />} cursor={{ stroke: \'#94a3b8\', strokeWidth: 1, strokeDasharray: \'3 3\' }} />',
  '{!isExpanded && <Tooltip content={<CustomTooltip />} cursor={{ stroke: \'#94a3b8\', strokeWidth: 1, strokeDasharray: \'3 3\' }} />}'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed double tooltip');
