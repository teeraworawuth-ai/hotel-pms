const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(/15 \* 60 \* 1000/g, '10 * 60 * 1000'); 

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log("EnergyGraph updated.");
