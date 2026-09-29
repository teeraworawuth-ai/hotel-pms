const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const targetInsert = '  const totalToPay = Number(actualPrice || 0) + (keyDepositEnabled ? Number(keyDepositAmount || 0) : 0) + getTotalExtrasAmount();';

const replacement = `  const totalToPay = Number(actualPrice || 0) + (keyDepositEnabled ? Number(keyDepositAmount || 0) : 0) + getTotalExtrasAmount();
  const totalPaid = pastPayments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  const remainingBalance = totalToPay - totalPaid;`;

if(content.includes(targetInsert)) {
  content = content.replace(targetInsert, replacement);
  fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
  console.log('Fixed');
} else {
  console.log('Not found');
}
