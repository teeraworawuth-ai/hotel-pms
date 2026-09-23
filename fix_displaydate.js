const fs = require('fs');
const path = 'src/app/components/RoomCheckinModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove the old declaration
const oldRegex = /^\s*const displayDate = getNow\(\);\s*displayDate\.setDate\(displayDate\.getDate\(\) \+ dateOffset\);\s*$/m;
content = content.replace(oldRegex, '');

// 2. Fix the injected literal \n
content = content.replace('const { activeShift } = useShift();\\n  const displayDate = getNow();\\n  displayDate.setDate(displayDate.getDate() + dateOffset);', 'const { activeShift } = useShift();');

// 3. Inject it properly after activeShift
const target = 'const { activeShift } = useShift();';
content = content.replace(target, target + '\n  const displayDate = getNow();\n  displayDate.setDate(displayDate.getDate() + dateOffset);');

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed displayDate position.');
