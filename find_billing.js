const fs = require('fs');
const lines = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('<div className="flex-1 overflow-y-auto p-2 space-y-1">'));
console.log('START:', start+1);
for (let i = start; i < start + 30; i++) {
  console.log(i + 1, lines[i]);
}
