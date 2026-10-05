const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

// 1. key_deposit -> load existing extra charges
const kdLine = lines.findIndex(l => l.includes('setKeyDepositEnabled(false); setInitialKeyDepositStatus(false);'));
if (kdLine !== -1) {
    const code = `            
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
    lines.splice(kdLine + 2, 0, ...code.split('\n'));
}

// 2. newBalance calculation
const balLine = lines.findIndex(l => l.includes("unpaid_balance: newBalance"));
if (balLine !== -1) {
    lines[balLine] = lines[balLine].replace('newBalance', '(newBalance + newExtrasTotal)');
    // Add mark as saved
    lines.splice(balLine + 3, 0, '      setDailyExtras(prev => prev.map(e => ({...e, isSaved: true})));');
}

// 3. paymentInserts -> push new extras
const payLine = lines.findIndex(l => l.includes('const paymentInserts = [];'));
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

// 4. Render dailyExtras
const dropLine = lines.findIndex(l => l.includes("ui_type === 'dropdown'"));
if (dropLine !== -1) {
    const code = `                  {dailyExtras.length > 0 && (
                    <div className="mb-3 space-y-1 mt-2">
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
                  )}`;
    lines.splice(dropLine - 1, 0, ...code.split('\n'));
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
console.log('Fixed extra charges handling properly');
