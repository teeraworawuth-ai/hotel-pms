const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

// 1. actualPrice
content = content.replace(
    'onChange={(e) => updateDailyActualPrice(day.date, e.target.value)}',
    'onChange={(e) => updateDailyActualPrice(day.date, e.target.value)}\n                                        disabled={room.status === \'occupied\' || room.status === \'reserved\'}'
);

// 2. First Check-in Button text
content = content.replace(
    '🚪 Check-in ทันที',
    '{timeBand === \'early_in\' ? \'🚪 Early Check-in\' : \'🚪 Check-in ทันที\'}'
);

// 3. Remove duplicate check-in block
const dupBlock = `{room.status === 'reserved' && dateOffset === 0 && !isReschedulingBooking && (
                  <button 
                    onClick={handleCheckInReserved} disabled={loading}
                    className="w-full py-4 mt-4 text-white font-bold rounded-xl text-lg bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {timeBand === 'early_in' ? '🚪 Early Check-in (เข้าพักก่อนเวลา)' : '🚪 Check-in (เข้าพักเลย)'}
                  </button>
                )}`;
content = content.replace(dupBlock, '');

// 4. Payment Time Confirm/Cancel UI
const ptTarget = `{(Number(payTransfer) > 0 || isScanningSlip) && (
                      <div className="pt-2 border-t border-slate-200 mt-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">เวลาที่โอน (ตามสลิป)</label>
                        <div className="flex gap-2">
                          <input type="datetime-local" value={paymentTime} onChange={e => setPaymentTime(e.target.value)} className="flex-1 border-slate-200 rounded-lg p-2 text-xs focus:ring-blue-500 bg-white" />
                          <label className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors border border-blue-200">
                            {isScanningSlip ? '⏳ สแกน...' : '📷 สแกนสลิป'}
                            <input type="file" accept="image/*" className="hidden" onChange={handleScanSlip} disabled={isScanningSlip} />
                          </label>
                        </div>
                      </div>
                    )}`;
const ptReplacement = `{(Number(payTransfer) > 0 || isScanningSlip) && (
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
content = content.replace(ptTarget, ptReplacement);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
console.log('All replacements done');
