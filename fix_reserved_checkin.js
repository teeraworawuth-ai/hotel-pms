const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const syncKeyDepositLogic = `
    // [NEW] Sync Key Deposit Charge for existing bookings
    if (keyDepositEnabled !== initialKeyDepositStatus) {
      if (keyDepositEnabled && Number(keyDepositAmount) > 0) {
        await supabase.from('ledger_transactions').insert({
          shift_id: activeShift.id, staff_name: activeShift.staff_name,
          room_id: room.id, booking_id: room.booking_id,
          transaction_type: 'revenue', category: 'ค่ามัดจำกุญแจ', amount: Number(keyDepositAmount)
        });
      } else if (!keyDepositEnabled) {
        await supabase.from('ledger_transactions').delete().eq('booking_id', room.booking_id).in('category', ['ค่ามัดจำกุญแจ', 'key_deposit']).gt('amount', 0);
      }
      setInitialKeyDepositStatus(keyDepositEnabled);
    }
`;

const insertPaymentPoint = `const paymentInserts = [];`;
content = content.replace(insertPaymentPoint, syncKeyDepositLogic + '\n    ' + insertPaymentPoint);

const checkinPaymentLogic = `
    const cash = Number(payCash) || 0;
    const transfer = Number(payTransfer) || 0;
    const credit = Number(payCredit) || 0;
    
    if (cash > 0 || transfer > 0 || credit > 0 || keyDepositEnabled !== initialKeyDepositStatus) {
      await handleAdditionalPayment();
    }
`;

content = content.replace(/setLoading\(true\);\s*\n\s*\/\/ 1\. Update Booking Status/, `setLoading(true);\n\n${checkinPaymentLogic}\n\n    // 1. Update Booking Status`);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
