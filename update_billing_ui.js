const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const newUI = `            {/* 3. Split Payment */}
            <div className="bg-white border-2 border-slate-200 p-5 rounded-2xl shadow-sm">
              <h3 className="text-sm font-black text-slate-700 mb-4 flex justify-between items-center">
                <span className="flex items-center gap-2"><span className="text-lg">💳</span> รับชำระเงิน</span>
                <span className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-1 rounded">จ่ายแยกช่องทางได้</span>
              </h3>
              
              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div className="w-24 text-xs font-bold text-slate-600 flex items-center gap-1">💵 เงินสด:</div>
                  <input 
                    type="number" 
                    value={payCash} 
                    onChange={e => setPayCash(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-0 bg-transparent p-2 text-right text-base font-black text-emerald-700 focus:ring-0 outline-none" 
                    placeholder="0.00"
                  />
                  <span className="text-slate-400 font-bold pr-2">฿</span>
                </div>
                
                <div className="flex flex-col gap-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-24 text-xs font-bold text-slate-600 flex items-center gap-1">📱 โอนเงิน:</div>
                    <input 
                      type="number" 
                      value={payTransfer} 
                      onChange={e => setPayTransfer(e.target.value === '' ? '' : Number(e.target.value))}
                      className="flex-1 border-0 bg-transparent p-2 text-right text-base font-black text-emerald-700 focus:ring-0 outline-none" 
                      placeholder="0.00"
                    />
                    <span className="text-slate-400 font-bold pr-2">฿</span>
                  </div>
                  {(Number(payTransfer) > 0 || isScanningSlip) && (
                    <div className="flex items-center gap-2 pl-2 pr-2 pt-2 border-t border-slate-200 mt-1">
                      <input 
                        type="datetime-local" 
                        value={paymentTime} 
                        onChange={e => setPaymentTime(e.target.value)} 
                        className="flex-1 border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-blue-500 bg-white" 
                      />
                      <label className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border border-blue-200">
                        {isScanningSlip ? '⏳ สแกน...' : '📷 สแกนสลิป'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleScanSlip} disabled={isScanningSlip} />
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div className="w-24 text-xs font-bold text-slate-600 flex items-center gap-1">💳 บัตรเครดิต:</div>
                  <input 
                    type="number" 
                    value={payCredit} 
                    onChange={e => setPayCredit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-0 bg-transparent p-2 text-right text-base font-black text-emerald-700 focus:ring-0 outline-none" 
                    placeholder="0.00"
                  />
                  <span className="text-slate-400 font-bold pr-2">฿</span>
                </div>
              </div>
              
              <button 
                onClick={handlePayment}
                disabled={(Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0) <= 0 || loading}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-black py-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex justify-between items-center px-5 text-lg"
              >
                <span>{loading ? 'กำลังบันทึก...' : 'บันทึกรับชำระเงิน'}</span>
                {!loading && (Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0) > 0 && (
                  <span className="bg-white text-emerald-600 px-3 py-1 rounded-lg text-base">
                    ฿{((Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0)).toLocaleString()}
                  </span>
                )}
              </button>
            </div>`;

const startIdx = content.indexOf('{/* 3. Split Payment */}');
const endIdx = content.indexOf('</div>', content.indexOf('</button>', startIdx)) + 6;

if (startIdx !== -1 && endIdx !== -1) {
  content = content.substring(0, startIdx) + newUI + content.substring(endIdx);
  
  // Add paymentTime and isScanningSlip states
  if (!content.includes('paymentTime')) {
    const stateHookStr = `  const [payCredit, setPayCredit] = useState<number | ''>('');`;
    content = content.replace(stateHookStr, stateHookStr + `\n  const [paymentTime, setPaymentTime] = useState<string>('');\n  const [isScanningSlip, setIsScanningSlip] = useState(false);`);
  }
  
  // Add handleScanSlip function
  if (!content.includes('handleScanSlip')) {
    const fnStr = `
  const handleScanSlip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsScanningSlip(true);
    try {
      const formData = new FormData();
      formData.append('slip', file);
      
      const res = await fetch('/api/ocr-slip', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('AI Error');
      const data = await res.json();
      
      if (data.amount) setPayTransfer(Number(data.amount));
      if (data.date && data.time) {
        setPaymentTime(\`\${data.date}T\${data.time}\`);
      }
      alert(\`AI ดึงข้อมูลสำเร็จ!\\nธนาคาร: \${data.sender_bank || '-'}\\nยอดเงิน: \${data.amount || '-'}\`);
    } catch (err) {
      alert('AI ไม่สามารถอ่านข้อมูลสลิปนี้ได้ หรือ API Error');
    } finally {
      setIsScanningSlip(false);
    }
  };
`;
    const funcAnchor = `const handlePayment = async () => {`;
    content = content.replace(funcAnchor, fnStr + '\n  ' + funcAnchor);
  }
  
  // Also pass paymentTime to ledger_transactions when inserting transfer
  if (!content.includes('notes: paymentTime')) {
    const oldTransferInsert = `category: 'transfer', amount: -transfer });`;
    const newTransferInsert = `category: 'transfer', amount: -transfer, notes: paymentTime ? \`โอนเวลา: \${paymentTime.replace('T', ' ')}\` : undefined });`;
    content = content.replace(oldTransferInsert, newTransferInsert);
  }

  fs.writeFileSync('src/app/components/BillingModal.tsx', content, 'utf8');
}
