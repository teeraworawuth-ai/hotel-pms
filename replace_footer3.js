const fs = require('fs');
let code = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

// Change Left Section bottom-0.5 to bottom-[24px]
code = code.replace(
  'absolute top-0.5 left-0 bottom-0.5 w-[30%]',
  'absolute top-0.5 left-0 bottom-[24px] w-[30%]'
);

// Change Right Section bottom-0.5 to bottom-[24px]
code = code.replace(
  'absolute top-0 right-1 bottom-0.5 flex flex-col',
  'absolute top-0 right-1 bottom-[24px] flex flex-col'
);

// Change Center Section pt-[22px] to include pb-[24px] to push base price up
code = code.replace(
  'flex-1 w-full h-full relative flex flex-col items-center justify-start pt-[22px] sm:pt-6 z-10',
  'flex-1 w-full h-full relative flex flex-col items-center justify-start pt-[22px] sm:pt-6 pb-[24px] z-10'
);

// Make the footer absolute bottom-0
const newFooter = `                        {/* Financial Summary for Occupied Rooms */}
                        {room.status === 'occupied' && (
                          <div className="absolute bottom-0 left-0 right-0 w-full h-[24px] flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-[13px] font-black z-30 whitespace-nowrap bg-white/60 backdrop-blur-[1px] border-t border-slate-300/40 text-slate-600">
                            <span>{room.total_charges || 0}</span>
                            <span className="text-slate-400 font-bold">-</span>
                            <span>{room.total_payments || 0}</span>
                            <span className="text-slate-400 font-bold">=</span>
                            <span className={((room.unpaid_balance || 0) < 0) ? 'text-indigo-600' : (room.unpaid_balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {room.unpaid_balance || 0}
                            </span>
                          </div>
                        )}`;

const regex = /\{\/\* Financial Summary for Occupied Rooms \*\/\}[\s\S]*?<\/div>\s*\)\}\s*<\/button>/;
code = code.replace(regex, newFooter + '\n                      </button>');

// Remove pb-[34px] from the button because we don't need padding if we use absolute positioning with bottom-[24px] constraints
code = code.replace(
  'className={`relative min-h-[140px] pb-[34px] flex items-center justify-center rounded-xl border-2 transition-all active:scale-95 group overflow-hidden ${statusClass}`}',
  'className={`relative min-h-[140px] flex items-center justify-center rounded-xl border-2 transition-all active:scale-95 group overflow-hidden ${statusClass}`}'
);

fs.writeFileSync('src/app/checkin/page.tsx', code, 'utf8');