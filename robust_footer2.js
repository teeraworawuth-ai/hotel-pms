const fs = require('fs');

const currentCode = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

let newCode = currentCode.replace(
  'className={`relative min-h-[140px] pb-[34px] flex items-center justify-center rounded-xl border-2 transition-all active:scale-95 group overflow-hidden ${statusClass}`}',
  'className={`relative flex flex-col items-center justify-start rounded-xl border-2 transition-all active:scale-95 group overflow-hidden ${statusClass} min-h-[140px]`}'
);

newCode = newCode.replace(
  '                        {/* Left Section (Details) */}',
  '                        <div className="relative flex-1 w-full h-full min-h-[110px]">\n                        {/* Left Section (Details) */}'
);

newCode = newCode.replace(
  '                        {/* Financial Summary for Occupied Rooms */}',
  '                        </div>\n\n                        {/* Financial Summary for Occupied Rooms */}'
);

const oldFooter = `                        {room.status === 'occupied' && (
                          <div className="absolute bottom-0 left-0 right-0 z-30 bg-slate-50/95 backdrop-blur-sm border-t border-slate-200 px-1.5 py-1 text-[10px] sm:text-[11px] leading-tight flex flex-col justify-center shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                            <div className="flex justify-between items-center text-slate-500 mb-[1px]">
                              <span>ยอดเรียกเก็บ</span>
                              <span className="font-medium text-slate-700">฿{(room.total_charges || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-500 mb-[1px]">
                              <span>ยอดชำระแล้ว</span>
                              <span className="font-medium text-emerald-600">฿{(room.total_payments || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-200/60 mt-[2px] pt-[2px] font-bold">
                              <span>ยอดคงเหลือ</span>
                              <span className={((room.unpaid_balance || 0) < 0) ? 'text-rose-600' : (room.unpaid_balance || 0) > 0 ? 'text-indigo-600' : 'text-emerald-600'}>
                                ฿{Math.abs(room.unpaid_balance || 0).toLocaleString()} {((room.unpaid_balance || 0) < 0) ? '(ค้าง)' : ''}
                              </span>
                            </div>
                          </div>
                        )}`;

const newFooter = `                        {room.status === 'occupied' && (
                          <div className="w-full h-[22px] flex-shrink-0 flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-[13px] font-black z-30 whitespace-nowrap bg-white/60 backdrop-blur-[1px] border-t border-slate-300/40 text-slate-600">
                            <span>{room.total_charges || 0}</span>
                            <span className="text-slate-400 font-bold">-</span>
                            <span>{room.total_payments || 0}</span>
                            <span className="text-slate-400 font-bold">=</span>
                            <span className={((room.unpaid_balance || 0) < 0) ? 'text-indigo-600' : (room.unpaid_balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {room.unpaid_balance || 0}
                            </span>
                          </div>
                        )}`;

newCode = newCode.replace(oldFooter, newFooter);

fs.writeFileSync('src/app/checkin/page.tsx', newCode, 'utf8');