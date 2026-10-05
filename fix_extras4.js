const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

const handleLine = lines.findIndex(l => l.includes('const handleAdditionalPayment = async () => {'));
if (handleLine !== -1) {
    const payLine = lines.findIndex((l, i) => i > handleLine && l.includes('const paymentInserts = []'));
    if (payLine !== -1) {
        const code = `    let newExtrasTotal = 0;
    const newExtras = dailyExtras.filter(e => !e.isSaved);
    if (newExtras.length > 0) {
      newExtras.forEach(ext => {
        paymentInserts.push({
          shift_id: activeShift.id,
          staff_name: activeShift.staff_name,
          room_id: room.id,
          booking_id: room.booking_id,
          transaction_type: 'revenue',
          category: ext.name,
          notes: ext.isPerNight ? '(' + (nights || 1) + ' คืน)' : null,
          amount: ext.amount
        });
        newExtrasTotal += ext.amount;
      });
    }`;
        lines.splice(payLine + 1, 0, ...code.split('\n'));
    }

    const balLine = lines.findIndex((l, i) => i > handleLine && l.includes("const newBalance = (booking.unpaid_balance || 0) - totalNewPayment;"));
    if (balLine !== -1) {
        lines[balLine] = lines[balLine].replace('totalNewPayment', '(totalNewPayment - newExtrasTotal)');
        lines.splice(balLine + 3, 0, '      setDailyExtras(prev => prev.map(e => ({...e, isSaved: true})));');
    }
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
console.log('Fixed extra charges handling properly (v4)');
