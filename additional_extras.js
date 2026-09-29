const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const additionalExtrasLogic = `
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
    
    // [NEW] Sync Extra Charges for existing bookings
    if (dailyExtras.length > 0) {
      const ledgerExtras = dailyExtras.map(ext => ({
        shift_id: activeShift.id, staff_name: activeShift.staff_name,
        room_id: room.id, booking_id: room.booking_id,
        transaction_type: 'revenue', category: ext.name, 
        notes: ext.isPerNight ? \`(\${nights || 1} คืน)\` : null, amount: ext.amount
      }));
      await supabase.from('ledger_transactions').insert(ledgerExtras);
    }
`;

content = content.replace(/(\/\/ \[NEW\] Sync Key Deposit Charge for existing bookings)[\s\S]*?(setInitialKeyDepositStatus\(keyDepositEnabled\);\s*})/, additionalExtrasLogic);

const clearExtrasLogic = `
    setPayCash('');
    setPayTransfer('');
    setPayCredit('');
    setPaymentTime('');
    setDailyExtras([]); // clear extras after save
    setLoading(false);
`;

content = content.replace(/setPayCash\(''\);\s*setPayTransfer\(''\);\s*setPayCredit\(''\);\s*setPaymentTime\(''\);\s*setLoading\(false\);/, clearExtrasLogic);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
