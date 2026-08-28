const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

const summaryBlock = `
                        {/* Financial Summary for Occupied Rooms */}
                        {room.status === 'occupied' && (
                          <div className="w-full mt-1.5 pt-1.5 border-t border-slate-300/30 flex items-center justify-center gap-1 sm:gap-1.5 text-[13px] sm:text-[15px] font-black z-20 whitespace-nowrap bg-white/40 rounded-lg px-2 py-1 shadow-sm mx-auto overflow-hidden">
                            <span className="text-slate-600">{room.total_charges || 0}</span>
                            <span className="text-slate-400 font-bold">-</span>
                            <span className="text-slate-600">{room.total_payments || 0}</span>
                            <span className="text-slate-400 font-bold">=</span>
                            <span className={((room.unpaid_balance || 0) < 0) ? 'text-indigo-600' : (room.unpaid_balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {room.unpaid_balance || 0}
                            </span>
                          </div>
                        )}
                      </button>
`;

content = content.replace(
  /                        \)\} \/\/ End of Right Section\n                      <\/button>/,
  "                        )} // End of Right Section\n" + summaryBlock
); // Wait, my regex might fail because of comments.

content = content.replace(
  /                          <\/div>\n                        \)\}\n                      <\/button>/,
  "                          </div>\n                        )}\n" + summaryBlock
);

fs.writeFileSync('src/app/checkin/page.tsx', content);
console.log("Injected summary block");
