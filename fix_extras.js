const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

// 1. In the useEffect for fetching past payments, load extra charges
const fetchTarget = `            const keyDepositTx = data.find(d => d.category === 'ค่ามัดจำกุญแจ' || d.category === 'key_deposit');
            if (keyDepositTx) {
              setKeyDepositEnabled(true); setInitialKeyDepositStatus(true);
            } else {
              setKeyDepositEnabled(false); setInitialKeyDepositStatus(false);
            }`;
const fetchReplacement = `            const keyDepositTx = data.find(d => d.category === 'ค่ามัดจำกุญแจ' || d.category === 'key_deposit');
            if (keyDepositTx) {
              setKeyDepositEnabled(true); setInitialKeyDepositStatus(true);
            } else {
              setKeyDepositEnabled(false); setInitialKeyDepositStatus(false);
            }
            
            // Load existing extra charges
            const existingExtras = data.filter(d => 
              d.transaction_type === 'revenue' && 
              !['ค่าห้องพัก', 'ค่ามัดจำกุญแจ', 'key_deposit', 'early_in_fee', 'late_out_fee'].includes(d.category) &&
              !d.category.includes('ค่าห้องพัก')
            ).map(d => ({
              id: d.id,
              name: d.category,
              price: d.amount,
              qty: 1,
              isPerNight: d.notes?.includes('คืน'),
              amount: d.amount,
              isSaved: true
            }));
            if (existingExtras.length > 0) {
              setDailyExtras(existingExtras);
            }`;
content = content.replace(fetchTarget, fetchReplacement);


// 2. In handleAdditionalPayment, save new extra charges
const paymentTarget = `    const cash = Number(payCash) || 0;
    const transfer = Number(payTransfer) || 0;
    const credit = Number(payCredit) || 0;
    
    const paymentInserts = [];`;
const paymentReplacement = `    const cash = Number(payCash) || 0;
    const transfer = Number(payTransfer) || 0;
    const credit = Number(payCredit) || 0;
    
    const paymentInserts = [];
    let newExtrasTotal = 0;
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
content = content.replace(paymentTarget, paymentReplacement);

const balanceTarget = `      const totalNewPayment = cash + transfer + credit;
      const { data: booking } = await supabase.from('bookings').select('unpaid_balance').eq('id', room.booking_id).single();
      if (booking) {
        const newBalance = (booking.unpaid_balance || 0) - totalNewPayment;
        await supabase.from('bookings').update({ unpaid_balance: newBalance }).eq('id', room.booking_id);
      }`;
const balanceReplacement = `      const totalNewPayment = cash + transfer + credit;
      const { data: booking } = await supabase.from('bookings').select('unpaid_balance').eq('id', room.booking_id).single();
      if (booking) {
        const newBalance = (booking.unpaid_balance || 0) - totalNewPayment + newExtrasTotal;
        await supabase.from('bookings').update({ unpaid_balance: newBalance }).eq('id', room.booking_id);
      }
      // mark them as saved
      setDailyExtras(prev => prev.map(e => ({...e, isSaved: true})));`;
content = content.replace(balanceTarget, balanceReplacement);


// 3. Render the dailyExtras list in UI
const renderTarget = `                  {extraSettings.filter(e => e.ui_type === 'dropdown').length > 0 && (
                    <select `;
const renderReplacement = `                  {dailyExtras.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {dailyExtras.map(ext => (
                        <div key={ext.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 text-sm shadow-sm">
                          <span className="font-medium text-slate-700">{ext.name} {ext.isPerNight ? '(รายวัน)' : '(ครั้งเดียว)'}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-slate-900">฿{ext.amount}</span>
                            {room.status !== 'occupied' && !ext.isSaved && (
                              <button onClick={() => handleRemoveExtra(ext.id)} className="text-red-500 hover:text-red-700 font-bold px-2 bg-red-50 rounded">✕</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {extraSettings.filter(e => e.ui_type === 'dropdown').length > 0 && (
                    <select `;
content = content.replace(renderTarget, renderReplacement);


// Write to file
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
console.log('Fixed extra charges handling');
