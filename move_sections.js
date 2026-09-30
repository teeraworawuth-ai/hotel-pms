const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

// We need to:
// 1. REMOVE Key Deposit block (lines 1487-1517, 0-indexed: 1486-1516)
// 2. REMOVE Extra Charges block (lines 1519-1554, 0-indexed: 1518-1553)
// 3. INSERT both blocks AFTER Past Payments (after line 1569, 0-indexed: 1568)

// Extract Key Deposit block (lines 1486-1516)
const keyDepositBlock = lines.slice(1486, 1517).join('\n');
// Extract Extra Charges block (lines 1518-1553)
const extraChargesBlock = lines.slice(1518, 1554).join('\n');

// Build new content: remove those blocks
const part1 = lines.slice(0, 1486).join('\n'); // before Key Deposit
const part2 = lines.slice(1517, 1518).join('\n'); // empty line between KD and Extra
const part3 = lines.slice(1554).join('\n'); // from after Extra Charges

// Find the end of Past Payments section in part3
// part3 starts from line 1554 of original (0-indexed)
// Past Payments ends at line ~1569 closing }) of the pastPayments block
// which is now at offset 1569-1554 = 15 lines from start of part3
const part3Lines = part3.split('\n');
const pastPaymentsEndRelative = part3Lines.findIndex(l => l.includes('Split Payment UI'));
console.log('Past Payments ends at offset:', pastPaymentsEndRelative - 2, 'from start of part3');
console.log('Line:', part3Lines[pastPaymentsEndRelative - 2]);

// After Past Payments closing )} is at pastPaymentsEndRelative - 2
// We insert Key Deposit + Extra Charges here
const insertAt = pastPaymentsEndRelative - 1;
part3Lines.splice(insertAt, 0, '', keyDepositBlock, '', extraChargesBlock, '');
const newPart3 = part3Lines.join('\n');

const newContent = part1 + '\n' + newPart3;
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', newContent, 'utf8');
console.log('Moved Key Deposit and Extra Charges below Past Payments');
