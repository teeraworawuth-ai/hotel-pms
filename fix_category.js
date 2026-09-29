const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

content = content.replace(/tx\.category === 'key_deposit' \|\| tx\.category === 'มัดจำกุญแจ'/g, "tx.category === 'key_deposit' || tx.category === 'ค่ามัดจำกุญแจ' || tx.category.includes('มัดจำกุญแจ')");

fs.writeFileSync('src/app/checkin/page.tsx', content, 'utf8');
