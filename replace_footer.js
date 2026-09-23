const fs = require('fs');
let code = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

const regex = /\{\/\* Financial Summary for Occupied Rooms \*\/\}[\s\S]*?<\/div>\s*\)\}\s*<\/button>/;

const newFooter = `{/* Financial Summary for Occupied Rooms */}
                        {room.status === 'occupied' && (
                          <div className="w-full h-[22px] flex-shrink-0 flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-[13px] font-black z-30 whitespace-nowrap bg-white/60 backdrop-blur-[1px] border-t border-slate-300/40 text-slate-600">
                            <span>{room.total_charges || 0}</span>
                            <span className="text-slate-400 font-bold">-</span>
                            <span>{room.total_payments || 0}</span>
                            <span className="text-slate-400 font-bold">=</span>
                            <span className={((room.unpaid_balance || 0) < 0) ? 'text-indigo-600' : (room.unpaid_balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {room.unpaid_balance || 0}
                            </span>
                          </div>
                        )}
                      </button>`;

code = code.replace(regex, newFooter);
fs.writeFileSync('src/app/checkin/page.tsx', code, 'utf8');