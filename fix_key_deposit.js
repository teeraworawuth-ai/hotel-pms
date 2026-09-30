const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

// Find the key deposit block start (after Past Payments closing)
// and replace the broken block (1501 to 1532) with clean version

const before = lines.slice(0, 1500).join('\n'); // up to line 1500 (end of Past Payments section)
const after = lines.slice(1533).join('\n');      // from line 1534 (Extra Charges section)

const cleanKeyDeposit = `
                {/* --- Key Deposit UI --- */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={keyDepositEnabled}
                        onChange={e => setKeyDepositEnabled(e.target.checked)} disabled={room.status === 'occupied'}
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
                        onChange={e => setKeyDepositAmount(e.target.value === '' ? '' : Number(e.target.value))} disabled={room.status === 'occupied'}
                        className="flex-1 border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-emerald-500 focus:border-emerald-500 bg-emerald-50"
                        placeholder="จำนวนเงินมัดจำ..."
                      />
                    </div>
                  )}
                </div>
`;

const newContent = before + '\n' + cleanKeyDeposit + '\n' + after;
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', newContent, 'utf8');
console.log('Replaced Key Deposit block cleanly');
