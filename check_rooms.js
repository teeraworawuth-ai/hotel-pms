const fs = require('fs');
const content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');
const lines = content.split('\n');
const bLine = lines.findIndex(l => l.includes('const fetchRooms = async'));
console.log(lines.slice(bLine - 2, bLine + 40).join('\n'));
