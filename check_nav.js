const fs = require('fs');
const content = fs.readFileSync('src/app/settings/page.tsx', 'utf8');
const lines = content.split(/\r?\n/);
const start = lines.findIndex(l => l.includes('<nav className="-mb-px flex space-x-4"'));
if (start !== -1) {
  console.log(lines.slice(start, start + 60).join('\n'));
} else {
  console.log('Nav not found');
}
