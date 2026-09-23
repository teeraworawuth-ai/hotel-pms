const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

const pStateIdx = lines.findIndex(l => l.includes('const [paymentMethod, setPaymentMethod]'));
if (pStateIdx >= 0) {
  lines[pStateIdx] = `  const [payCash, setPayCash] = useState<number | ''>('');
  const [payTransfer, setPayTransfer] = useState<number | ''>('');
  const [payCredit, setPayCredit] = useState<number | ''>('');`;
}

const checkInStartIdx = lines.findIndex(l => l.includes('const startDate = new Date(displayDateStr);'));
if (checkInStartIdx >= 0) {
  const replaceStr = `    let startDate: Date;
    if (dateOffset > 0 || isReservationForToday) {
      // ถ้าจองล่วงหน้า หรือจองของวันนี้ที่ยังไม่มาถึง ให้เวลาเริ่มคือ 14:00 น. ของวันนั้น
      startDate = new Date(displayDateStr);
      startDate.setHours(14, 0, 0, 0);
    } else {
      // สำหรับ Walk-in เช็คอินเดี๋ยวนี้: ใช้เวลาปัจจุบันเลยเป๊ะๆ
      startDate = getNow();
    }`;
  lines.splice(checkInStartIdx, 5, replaceStr);
}

const payLogStartIdx = lines.findIndex(l => l.includes('// --- 5. บันทึกการรับชำระเงิน (Payment) ยอดรวมทั้งหมด ---'));
if (payLogStartIdx >= 0) {
  const replaceStr = `        // --- 5. บันทึกการรับชำระเงิน (Payment) แยกช่องทาง ---
        const cash = Number(payCash) || 0;
        const transfer = Number(payTransfer) || 0;
        const credit = Number(payCredit) || 0;
        
        const paymentInserts = [];
        if (cash > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: room.id, booking_id: insertedBooking.id, transaction_type: 'payment', category: 'cash', amount: -cash });
        if (transfer > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: room.id, booking_id: insertedBooking.id, transaction_type: 'payment', category: 'transfer', amount: -transfer, notes: paymentTime ? \`โอนเวลา: \${paymentTime.replace('T', ' ')}\` : undefined });
        if (credit > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: room.id, booking_id: insertedBooking.id, transaction_type: 'payment', category: 'credit_card', amount: -credit });
        
        if (paymentInserts.length > 0) {
          await supabase.from('ledger_transactions').insert(paymentInserts);
        }`;
  lines.splice(payLogStartIdx, 14, replaceStr);
}

const uiStartIdx = lines.findIndex(l => l.includes('<div className="pt-2 border-t border-slate-100">'));
if (uiStartIdx >= 0) {
  const nextDivIdx = lines.findIndex((l, i) => i > uiStartIdx && l.includes('{activeTab === \'overnight\' ? ('));
  
  const uiStr = `                {/* --- Key Deposit UI --- */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={keyDepositEnabled}
                        onChange={e => setKeyDepositEnabled(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-bold text-slate-700">รับมัดจำกุญแจ</span>
                    </label>
                  </div>
                  {keyDepositEnabled && (
                    <div className="flex gap-2">
                      <input 
                        type="number"
                        value={keyDepositAmount}
                        onChange={e => setKeyDepositAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="flex-1 border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-emerald-500 focus:border-emerald-500 bg-emerald-50"
                        placeholder="จำนวนเงินมัดจำ..."
                      />
                    </div>
                  )}
                </div>

                {/* --- Split Payment UI --- */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-slate-700">รับชำระเงิน (บาท)</label>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">จ่ายแยกช่องทางได้</span>
                  </div>
                  
                  <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-500">ยอดที่ต้องชำระทั้งหมด:</span>
                      <span className="text-sm font-black text-rose-600">฿{totalToPay.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-16 text-xs font-bold text-slate-600">💵 เงินสด:</div>
                      <input 
                        type="number" 
                        value={payCash} 
                        onChange={e => setPayCash(e.target.value === '' ? '' : Number(e.target.value))}
                        className="flex-1 border-slate-200 rounded-lg p-2 text-sm font-bold focus:ring-emerald-500 focus:border-emerald-500" 
                        placeholder="0"
                      />
                      <button type="button" onClick={() => setPayCash(totalToPay)} className="text-[10px] bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded font-bold">เต็มยอด</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 text-xs font-bold text-slate-600">📱 โอนเงิน:</div>
                      <input 
                        type="number" 
                        value={payTransfer} 
                        onChange={e => setPayTransfer(e.target.value === '' ? '' : Number(e.target.value))}
                        className="flex-1 border-slate-200 rounded-lg p-2 text-sm font-bold focus:ring-emerald-500 focus:border-emerald-500" 
                        placeholder="0"
                      />
                      <button type="button" onClick={() => setPayTransfer(totalToPay)} className="text-[10px] bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded font-bold">เต็มยอด</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 text-xs font-bold text-slate-600">💳 เครดิต:</div>
                      <input 
                        type="number" 
                        value={payCredit} 
                        onChange={e => setPayCredit(e.target.value === '' ? '' : Number(e.target.value))}
                        className="flex-1 border-slate-200 rounded-lg p-2 text-sm font-bold focus:ring-emerald-500 focus:border-emerald-500" 
                        placeholder="0"
                      />
                    </div>
                    
                    {Number(payTransfer) > 0 && (
                      <div className="pt-2 border-t border-slate-200 mt-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">เวลาที่โอน (ตามสลิป)</label>
                        <input type="datetime-local" value={paymentTime} onChange={e => setPaymentTime(e.target.value)} className="w-full border-slate-200 rounded-lg p-2 text-xs focus:ring-blue-500 bg-white" />
                      </div>
                    )}
                  </div>
                </div>
`;
  lines.splice(uiStartIdx, nextDivIdx - uiStartIdx, uiStr);
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
