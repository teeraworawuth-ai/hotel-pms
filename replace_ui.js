const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('{/* ซ้าย: เครื่องมือ POS และชำระเงิน */}'));
const newRightPane = `          {/* ขวา: สรุปยอด, เครื่องมือ POS และชำระเงิน */}
          <div className="flex-1 flex flex-col gap-4">
            
            {/* 1. Grand Total Dashboard */}
            <div className="bg-slate-800 text-white p-5 rounded-xl shadow-md border-t-4 border-emerald-400">
              <h3 className="text-xs font-bold text-slate-300 mb-4 uppercase tracking-wider flex justify-between items-center">
                <span>สรุปยอดตลอดการเข้าพัก (Projected Total)</span>
                <span className="bg-slate-700 px-2 py-1 rounded text-[10px]">รวมอนาคต</span>
              </h3>
              
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between items-center text-slate-300">
                  <span>ค่าห้องและ POS ที่เกิดขึ้นแล้ว</span>
                  <span>{totalPostedCharges.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>ค่าห้องพัก (อนาคต)</span>
                  <span>{futureRates.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>รายการเพิ่มเติมรายวัน (อนาคต)</span>
                  <span>{futureExtras.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-700 font-bold">
                  <span>รวมค่าใช้จ่ายทั้งสิ้น</span>
                  <span className="text-white">{totalExpectedCharges.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-400 font-bold">
                  <span>ยอดชำระแล้ว (จ่ายแล้ว)</span>
                  <span>-{totalPaid.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="bg-slate-900 rounded-lg p-3 flex justify-between items-center">
                <span className="font-bold text-slate-300 text-sm">ยอดคงเหลือที่ต้องชำระสุทธิ</span>
                <span className={\`text-2xl font-black \${netRemaining > 0 ? 'text-rose-400' : netRemaining < 0 ? 'text-purple-400' : 'text-emerald-400'}\`}>
                  ฿{netRemaining.toLocaleString()}
                </span>
              </div>
            </div>

            {/* 2. POS Items */}
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">เพิ่มรายการ (POS)</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {posItems.map(item => (
                  <button 
                    key={item.id} 
                    onClick={() => handleAddPos(item)}
                    className="flex flex-col items-center justify-center p-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg transition-colors active:scale-95"
                  >
                    <span className="font-bold text-slate-700 text-sm">{item.name}</span>
                    <span className="text-blue-600 font-bold text-xs">+{item.default_price}</span>
                  </button>
                ))}
              </div>
              
              {/* Custom Item Entry */}
              <div className="border-t border-slate-100 pt-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">คีย์รายการรายได้อื่นๆ (พิมพ์เอง)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="ชื่อรายการ..." 
                    value={customItemName}
                    onChange={e => setCustomItemName(e.target.value)}
                    className="flex-[2] border-2 border-slate-200 rounded-lg p-2 text-sm focus:border-blue-500 outline-none"
                  />
                  <input 
                    type="number" 
                    placeholder="ราคา" 
                    value={customItemPrice}
                    onChange={e => setCustomItemPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm focus:border-blue-500 outline-none"
                  />
                  <button 
                    onClick={handleAddCustomPos}
                    disabled={!customItemName.trim() || !customItemPrice || loading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-3 rounded-lg text-sm shadow-sm transition-colors"
                  >
                    เพิ่ม
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Split Payment */}
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider flex justify-between items-center">
                <span>รับชำระเงิน</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">จ่ายแยกช่องทางได้</span>
              </h3>
              
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-20 text-xs font-bold text-slate-500">เงินสด:</div>
                  <input 
                    type="number" 
                    value={payCash} 
                    onChange={e => setPayCash(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm font-bold text-emerald-700 focus:border-emerald-500 outline-none" 
                    placeholder="0.00"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 text-xs font-bold text-slate-500">โอนเงิน:</div>
                  <input 
                    type="number" 
                    value={payTransfer} 
                    onChange={e => setPayTransfer(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm font-bold text-emerald-700 focus:border-emerald-500 outline-none" 
                    placeholder="0.00"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 text-xs font-bold text-slate-500">บัตรเครดิต:</div>
                  <input 
                    type="number" 
                    value={payCredit} 
                    onChange={e => setPayCredit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm font-bold text-emerald-700 focus:border-emerald-500 outline-none" 
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <button 
                onClick={handlePayment}
                disabled={(Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0) <= 0 || loading}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-black py-3 rounded-lg shadow-sm active:scale-95 transition-all flex justify-between items-center px-4"
              >
                <span>{loading ? 'กำลังบันทึก...' : 'บันทึกรับชำระเงิน'}</span>
                {!loading && (Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0) > 0 && (
                  <span className="bg-white/20 px-2 py-1 rounded text-sm">
                    ฿{((Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0)).toLocaleString()}
                  </span>
                )}
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
`;

lines.splice(start, lines.length - start, newRightPane);
fs.writeFileSync('src/app/components/BillingModal.tsx', lines.join('\n'), 'utf8');
