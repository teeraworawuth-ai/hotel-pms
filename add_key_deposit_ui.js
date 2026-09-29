const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const keyDepositCheckbox = `                <div className="flex justify-between items-center text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={includeKeyDeposit}
                      onChange={(e) => setIncludeKeyDeposit(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-800"
                    />
                    <span>รวมค่ามัดจำกุญแจ (ถ้ามี)</span>
                  </label>
                  <span>{includeKeyDeposit ? totalKeyDeposit.toLocaleString() : "0"}</span>
                </div>`;

const insertionPoint = `                <div className="flex justify-between items-center text-slate-300">
                  <span>รายการเพิ่มเติมรายวัน (อนาคต)</span>
                  <span>{futureExtras.toLocaleString()}</span>
                </div>`;

content = content.replace(insertionPoint, insertionPoint + "\n" + keyDepositCheckbox);

fs.writeFileSync('src/app/components/BillingModal.tsx', content, 'utf8');
