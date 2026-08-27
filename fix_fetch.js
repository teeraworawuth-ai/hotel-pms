const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const oldStart = `const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 7, 0, 0);
      let nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      let endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 13, 0, 0);`;

const newStart = `const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 1, 7, 0, 0);
      let nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 2);
      let endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 7, 0, 0);`;

content = content.replace(oldStart, newStart);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Modified fetch range to 3 days.');
