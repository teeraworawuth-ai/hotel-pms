const fs = require('fs');
let content = fs.readFileSync('src/app/settings/page.tsx', 'utf8');
const lines = content.split(/\r?\n/);
const start = lines.findIndex(l => l.includes('<RatePlanSettings />'));

if (start !== -1 && lines[start + 1].includes(') : (')) {
  lines.splice(start + 1, 1,
    "        ) : activeTab === 'staff' ? (",
    "          <StaffSettings />",
    "        ) : ("
  );
  
  // also clean up the one I mistakenly added earlier at the end if it's there
  const badStart = lines.findIndex(l => l.includes("{activeTab === 'staff' && ("));
  if (badStart !== -1) {
    lines.splice(badStart, 3);
  }

  fs.writeFileSync('src/app/settings/page.tsx', lines.join('\n'), 'utf8');
  console.log('Fixed rendering logic');
}
