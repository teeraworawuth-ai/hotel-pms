const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const fetchStart = content.indexOf('const fetchData = async () => {');
const queryStart = content.indexOf('const { data: logData', fetchStart);

const beforeBlock = content.substring(0, fetchStart);
const afterBlock = content.substring(queryStart);

const newBlock = `const fetchData = async () => {
      try {
        setLoading(true);
  
        const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 3, 0, 0, 0);
        let endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 2, 0, 0, 0);
  
        const now = new Date();
        if (now < endOfDay) {
           if (now < startOfRange) {
             setData([]);
             return;
           } else {
             endOfDay = now;
           }
        }
  
        `;

content = beforeBlock + newBlock + afterBlock;
fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log("Replaced fetchData logic perfectly.");
