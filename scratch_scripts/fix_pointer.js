const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

content = content.replace(
  '<div className="absolute inset-0 z-10 bg-black/0 group-hover:bg-indigo-500/5 transition-colors rounded-xl flex items-center justify-center">',
  '<div className="absolute inset-0 z-10 pointer-events-none bg-black/0 group-hover:bg-indigo-500/5 transition-colors rounded-xl flex items-center justify-center">'
);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed pointer events');
