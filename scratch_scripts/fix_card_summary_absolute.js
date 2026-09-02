const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

// Remove from Center section
content = content.replace(
/                          \{\/\* Financial Summary for Occupied Rooms \*\/\}\s*\{room\.status === 'occupied' && \(\s*<div className="w-\[calc\(100%\+16px\)\] mt-auto pt-1 pb-1 -mb-1\.5 border-t border-slate-300\/40 flex items-center justify-center gap-1 sm:gap-1\.5 text-\[11px\] sm:text-\[13px\] font-black z-20 whitespace-nowrap bg-white\/50 px-1 rounded-b-lg">\s*<span className="text-slate-600">\{room\.total_charges \|\| 0\}<\/span>\s*<span className="text-slate-400 font-bold">-<\/span>\s*<span className="text-slate-600">\{room\.total_payments \|\| 0\}<\/span>\s*<span className="text-slate-400 font-bold">=<\/span>\s*<span className=\{.*?\}>\s*\{room\.unpaid_balance \|\| 0\}\s*<\/span>\s*<\/div>\s*\)\}\s*/s,
""
);

// Inject absolute block before </button>
const absoluteBlock = `
                        {/* Financial Summary for Occupied Rooms */}
                        {room.status === 'occupied' && (
                          <div className="absolute bottom-0 left-0 right-0 w-full pt-0.5 pb-1 flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-[13px] font-black z-30 whitespace-nowrap bg-white/80 border-t border-slate-300/40">
                            <span className="text-slate-600">{room.total_charges || 0}</span>
                            <span className="text-slate-400 font-bold">-</span>
                            <span className="text-slate-600">{room.total_payments || 0}</span>
                            <span className="text-slate-400 font-bold">=</span>
                            <span className={((room.unpaid_balance || 0) < 0) ? 'text-indigo-600' : (room.unpaid_balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {room.unpaid_balance || 0}
                            </span>
                          </div>
                        )}
`;

content = content.replace(
/                      <\/button>\s*\);\s*\}\)\}\s*<\/div>\s*\)\s*:\s*\(\s*<div/s,
absoluteBlock + "                      </button>\n                    );\n                  })}\n                </div>\n              ) : (\n                <div"
);

fs.writeFileSync('src/app/checkin/page.tsx', content);
