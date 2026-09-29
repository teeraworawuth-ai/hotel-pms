const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const keyDepositLogic = `
  const handleAddKeyDeposit = async () => {
    if (!activeShift) { alert('กรุณาเปิดกะก่อน'); return; }
    const { error } = await supabase.from('ledger_transactions').insert({
      shift_id: activeShift.id, staff_name: activeShift.staff_name,
      room_id: roomId, booking_id: bookingId,
      transaction_type: 'revenue', category: 'ค่ามัดจำกุญแจ', amount: 200
    });
    if (!error) onUpdate();
  };

  const handleRemoveKeyDeposit = async () => {
    const keyTx = validTxs.find(t => t.category.includes('มัดจำกุญแจ') && t.amount > 0);
    if (keyTx) {
      const { error } = await supabase.from('ledger_transactions').delete().eq('id', keyTx.id);
      if (!error) onUpdate();
    }
  };
`;

const insertLogicPoint = `const handleAddTransaction = async () => {`;
content = content.replace(insertLogicPoint, keyDepositLogic + '\n\n  ' + insertLogicPoint);

const keyDepositUI = `
            {totalKeyDeposit > 0 ? (
               <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg flex items-center justify-between mb-3 shadow-sm">
                 <span className="text-sm font-bold">✅ รับมัดจำกุญแจแล้ว (฿{totalKeyDeposit.toLocaleString()})</span>
                 <button onClick={handleRemoveKeyDeposit} className="text-xs text-emerald-600 hover:text-emerald-800 underline font-bold">แก้ไข/ยกเลิก</button>
               </div>
            ) : (
               <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg flex items-center justify-between mb-3 shadow-sm">
                 <span className="text-sm font-bold">⚠️ ยังไม่ได้รับมัดจำกุญแจ</span>
                 <button onClick={handleAddKeyDeposit} className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded font-bold shadow-sm transition-all hover:scale-105 active:scale-95">รับมัดจำ ฿200</button>
               </div>
            )}
`;

const insertUIPoint = `<div className="flex-1 flex flex-col">
            <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">รายการในบิล (Folio)</h3>`;
content = content.replace(insertUIPoint, insertUIPoint + '\n' + keyDepositUI);

fs.writeFileSync('src/app/components/BillingModal.tsx', content, 'utf8');
