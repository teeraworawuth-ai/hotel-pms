const fs = require('fs');
let c = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

c = c.replace(
  /const displayDate = getNow\(\);\s*displayDate\.setDate\(displayDate\.getDate\(\) \+ dateOffset\);\s*const \[showBilling/g,
  "const displayDate = getNow();\n  displayDate.setDate(displayDate.getDate() + dateOffset);\n  const displayDateStr = displayDate.toLocaleDateString('en-CA');\n  const [showBilling"
);

c = c.replace(
  /\}, \[activeTab, nights, displayDate, dateOffset, room, yieldRules, ratePlans, availablePercent\]\);/g,
  "}, [activeTab, nights, displayDateStr, dateOffset, room, yieldRules, ratePlans, availablePercent]);"
);

c = c.replace(
  /const startDate = new Date\(displayDate\);/g,
  "const startDate = new Date(displayDateStr);"
);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', c, 'utf8');
