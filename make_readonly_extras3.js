const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const regex = /<div className="flex gap-2">\s*<select[\s\S]*?<\/select>\s*<button type="button" onClick=\{handleAddSelectedExtra\}[\s\S]*?<\/button>\s*<\/div>/;

if (regex.test(content)) {
  content = content.replace(regex, (match) => `{room.status !== 'occupied' && ( ${match} )}`);
  fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
  console.log('Disabled Add Extra dropdown');
} else {
  console.log('Could not find Add Extra dropdown');
}
