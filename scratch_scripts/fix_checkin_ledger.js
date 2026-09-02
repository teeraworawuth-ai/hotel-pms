const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

// Update RoomStatus Type
content = content.replace(
  'unpaid_balance?: number;',
  'unpaid_balance?: number;\n  total_charges?: number;\n  total_payments?: number;'
);

// Update Ledger Fetch Logic
const ledgerCodeRegex = /const unpaidBalances: Record<string, number> = {};[\s\S]*?if \(!ledgerError && ledgers\) \{[\s\S]*?ledgers\.forEach\(tx => \{[\s\S]*?if \(tx\.booking_id\) \{[\s\S]*?unpaidBalances\[tx\.booking_id\] = \(unpaidBalances\[tx\.booking_id\] \|\| 0\) \+ Number\(tx\.amount\);[\s\S]*?\}[\s\S]*?\}\);[\s\S]*?\}[\s\S]*?\}/;

const newLedgerCode = `const financialSummary: Record<string, { charges: number, payments: number, balance: number }> = {};
    
    if (activeBookingIds.length > 0) {
      const { data: ledgers, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('booking_id, amount')
        .in('booking_id', activeBookingIds);
        
      if (!ledgerError && ledgers) {
        ledgers.forEach(tx => {
          if (tx.booking_id) {
            if (!financialSummary[tx.booking_id]) {
              financialSummary[tx.booking_id] = { charges: 0, payments: 0, balance: 0 };
            }
            const amt = Number(tx.amount);
            financialSummary[tx.booking_id].balance += amt;
            if (amt > 0) {
              financialSummary[tx.booking_id].charges += amt;
            } else {
              financialSummary[tx.booking_id].payments += Math.abs(amt);
            }
          }
        });
      }
    }`;

content = content.replace(ledgerCodeRegex, newLedgerCode);

// Update finalRoom Assignment (two places)
content = content.replace(
  /finalRoom\.unpaid_balance = unpaidBalances\[incomingBookingToday\.id\] \|\| 0;/g,
  `finalRoom.unpaid_balance = financialSummary[incomingBookingToday.id]?.balance || 0;
            finalRoom.total_charges = financialSummary[incomingBookingToday.id]?.charges || 0;
            finalRoom.total_payments = financialSummary[incomingBookingToday.id]?.payments || 0;`
);

content = content.replace(
  /unpaid_balance: unpaidBalances\[incomingBookingToday\.id\] \|\| 0/g,
  `unpaid_balance: financialSummary[incomingBookingToday.id]?.balance || 0,
                total_charges: financialSummary[incomingBookingToday.id]?.charges || 0,
                total_payments: financialSummary[incomingBookingToday.id]?.payments || 0`
);

content = content.replace(
  /finalRoom\.unpaid_balance = unpaidBalances\[activeBooking\.id\] \|\| 0;/g,
  `finalRoom.unpaid_balance = financialSummary[activeBooking.id]?.balance || 0;
            finalRoom.total_charges = financialSummary[activeBooking.id]?.charges || 0;
            finalRoom.total_payments = financialSummary[activeBooking.id]?.payments || 0;`
);

fs.writeFileSync('src/app/checkin/page.tsx', content);
console.log("Updated checkin ledger logic");
