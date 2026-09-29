const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const regex = /<div className="flex flex-wrap gap-2 mb-2">\s*\{extraSettings\.filter\(e => e\.ui_type === 'quick_button'\)\.map\(e => \([\s\S]*?<\/button>\s*\)\)\}\s*<\/div>/;

if (regex.test(content)) {
  content = content.replace(regex, (match) => `{room.status !== 'occupied' && ( ${match} )}`);
  fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
  console.log('Disabled Add Extra buttons');
} else {
  console.log('Could not find Add Extra buttons');
}
