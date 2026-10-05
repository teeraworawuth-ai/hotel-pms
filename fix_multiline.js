const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

// Find paymentTime block
const ptLine = lines.findIndex(l => l.includes('value={paymentTime}'));
if (ptLine !== -1) {
    // 3 lines up is {(Number...
    const ptReplacement = `                    {(Number(payTransfer) > 0 || isScanningSlip) && (
                      <div className="pt-2 border-t border-slate-200 mt-2 flex flex-col gap-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">เวลาที่โอน (ตามสลิป)</label>
                        <div className="flex gap-2">
                          <input type="datetime-local" value={paymentTime} onChange={e => setPaymentTime(e.target.value)} className="flex-1 border-slate-200 rounded-lg p-2 text-xs focus:ring-blue-500 bg-white" />
                          <label className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors border border-blue-200">
                            {isScanningSlip ? '⏳ สแกน...' : '📷 สแกนสลิป'}
                            <input type="file" accept="image/*" className="hidden" onChange={handleScanSlip} disabled={isScanningSlip} />
                          </label>
                        </div>
                        {paymentTime && (
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setPaymentTime('')}
                              className="px-3 py-1 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                            >
                              ✕ ยกเลิก/ล้างเวลา
                            </button>
                            <button
                              type="button"
                              onClick={() => { /* time is already set, just visual confirmation */ }}
                              className="px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                            >
                              ✓ ยืนยันเวลา
                            </button>
                          </div>
                        )}
                      </div>
                    )}`;
    lines.splice(ptLine - 3, 10, ...ptReplacement.split('\n'));
}

// Find duplicate block
const dupBlockIdx = lines.findIndex(l => l.includes('🚪 Check-in (เข้าพักเลย)'));
if (dupBlockIdx !== -1) {
    // 5 lines up is {room.status === 'reserved'
    lines.splice(dupBlockIdx - 5, 8);
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
console.log('Fixed multiline blocks');
