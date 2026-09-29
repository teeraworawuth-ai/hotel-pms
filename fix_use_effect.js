const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const oldUseEffect = `  useEffect(() => {
    if (room.booking_id) {
      supabase.from('ledger_transactions')
        .select('id, category, amount, created_at, notes')
        .eq('booking_id', room.booking_id)
        .eq('transaction_type', 'payment')
        .then(({ data }) => {
          if (data) setPastPayments(data);
        });
    }
  }, [room.booking_id]);`;

const newUseEffect = `  useEffect(() => {
    if (room.booking_id) {
      supabase.from('ledger_transactions')
        .select('id, category, amount, created_at, notes, transaction_type')
        .eq('booking_id', room.booking_id)
        .then(({ data }) => {
          if (data) {
            const payments = data.filter(d => d.transaction_type === 'payment');
            setPastPayments(payments);
            
            // Check if key deposit charge exists
            const keyDepositTx = data.find(d => d.category === 'ค่ามัดจำกุญแจ' || d.category === 'key_deposit');
            if (keyDepositTx) {
              setKeyDepositEnabled(true);
            } else {
              setKeyDepositEnabled(false);
            }
          }
        });
    } else {
      setKeyDepositEnabled(true);
    }
  }, [room.booking_id]);`;

content = content.replace(oldUseEffect, newUseEffect);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
