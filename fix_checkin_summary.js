const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

content = content.replace(/const financialSummary: Record<string, \{ charges: number, payments: number, balance: number, c_all: number, c_today: number \}> = \{\};/g, 'const financialSummary: Record<string, { charges: number, payments: number, balance: number, c_all: number, c_today: number, has_key_deposit?: boolean }> = {};');

content = content.replace(/financialSummary\[tx\.booking_id\] = \{ charges: 0, payments: 0, balance: 0, c_all: 0, c_today: 0 \};/g, 'financialSummary[tx.booking_id] = { charges: 0, payments: 0, balance: 0, c_all: 0, c_today: 0, has_key_deposit: false };');

content = content.replace(/if \(tx\.category !== 'ค่าห้องพัก' && tx\.category !== 'room_charge'\) \{/g, `if (tx.category === 'key_deposit' || tx.category === 'มัดจำกุญแจ') {
                  financialSummary[tx.booking_id].has_key_deposit = true;
                }
                if (tx.category !== 'ค่าห้องพัก' && tx.category !== 'room_charge') {`);

fs.writeFileSync('src/app/checkin/page.tsx', content, 'utf8');
