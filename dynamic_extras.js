const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const newGetTotalExtras = `  const getTotalExtrasAmount = () => dailyExtras.reduce((sum, ext) => {
    return sum + (ext.isPerNight ? (ext.price * ext.qty * (Number(nights) || 1)) : (ext.price * ext.qty));
  }, 0);`;

content = content.replace("const getTotalExtrasAmount = () => dailyExtras.reduce((sum, ext) => sum + Number(ext.amount || 0), 0);", newGetTotalExtras);

// Replace UI display to be dynamic
content = content.replace("<span>฿{Number(ext.amount).toLocaleString()}</span>", "<span>฿{(ext.isPerNight ? (ext.price * ext.qty * (Number(nights) || 1)) : (ext.price * ext.qty)).toLocaleString()}</span>");

// Replace insert logic in handleCheckIn
content = content.replace("amount: ext.amount", "amount: ext.isPerNight ? (ext.price * ext.qty * (Number(nights) || 1)) : (ext.price * ext.qty)");
// there are two of them (handleCheckIn and handleAdditionalPayment)
content = content.replace("amount: ext.amount", "amount: ext.isPerNight ? (ext.price * ext.qty * (Number(nights) || 1)) : (ext.price * ext.qty)");

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
