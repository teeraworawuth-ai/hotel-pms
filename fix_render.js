const fs = require('fs');
let content = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

const targetStr = `      ) : activeTab === 'rate-plans' ? (
          <RatePlanSettings />
        ) : (`;

const newStr = `      ) : activeTab === 'rate-plans' ? (
          <RatePlanSettings />
        ) : activeTab === 'staff' ? (
          <StaffSettings />
        ) : (`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, newStr);
  fs.writeFileSync('src/app/settings/page.tsx', content, 'utf8');
  console.log('Fixed rendering logic');
} else {
  console.log('Target string not found!');
}
