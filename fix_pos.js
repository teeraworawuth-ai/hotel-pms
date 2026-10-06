const fs = require('fs');
let content = fs.readFileSync('src/app/components/PosSettings.tsx', 'utf8');
if (!content.includes('"use client"')) {
  content = '"use client";\n' + content;
  fs.writeFileSync('src/app/components/PosSettings.tsx', content, 'utf8');
  console.log('Fixed PosSettings');
}
