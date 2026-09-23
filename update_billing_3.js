const fs = require('fs');
let code = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const uiTabsNew = `<div className="flex flex-col bg-slate-100 rounded-lg p-3 mb-2 shrink-0 gap-3 border border-slate-200">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600 whitespace-nowrap">เลือกวันที่:</label>
                  <select 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)}
                    className="flex-1 bg-white border border-slate-300 rounded-md py-1.5 px-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="ALL">ทั้งหมด (ALL)</option>
                    {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 pl-1 border-t border-slate-200 pt-2">
                  <input 
                    type="checkbox" 
                    id="showPayments" 
                    checked={showPayments} 
                    onChange={e => setShowPayments(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="showPayments" className="text-xs font-bold text-slate-600 cursor-pointer">แสดงรายการรับชำระเงิน (Payments)</label>
                </div>
              </div>`;

code = code.replace(/<div className="flex bg-slate-100 rounded-lg p-1 mb-2 shrink-0">[\s\S]*?<\/div>/, uiTabsNew);

fs.writeFileSync('src/app/components/BillingModal.tsx', code);
console.log('Replaced tabs');
