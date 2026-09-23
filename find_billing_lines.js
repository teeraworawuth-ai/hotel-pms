const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');
const lines = content.split('\n');
let start = lines.findIndex(l => l.includes('<div className="flex-1 overflow-y-auto p-2 space-y-1">'));
let end = -1;
for (let i = start; i < lines.length; i++) {
  if (lines[i].includes('{true && (')) {
    end = i;
    break;
  }
}
console.log('Start:', start, 'End:', end);
