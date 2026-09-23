const fs = require('fs');
let code = fs.readFileSync('src/contexts/SimulatedTimeContext.tsx', 'utf8');
code = code.replace(/sessionStorage/g, 'localStorage');
fs.writeFileSync('src/contexts/SimulatedTimeContext.tsx', code);
console.log('Switched to localStorage');
