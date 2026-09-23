const fs = require('fs');
let c = fs.readFileSync('src/app/components/RatePlanSettings.tsx', 'utf8');

c = c.replace(/<button[\s\n]*onClick=\{\(\) => openCalendar\(plan\)\}[\s\n]*className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 py-2 rounded-lg text-xs font-bold transition-colors"[\s\n]*>[\s\n]*📅 ปฏิทินราคาพิเศษ[\s\n]*<\/button>/, '');

c = c.replace(/className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition-colors"[\s\n]*>[\s\n]*✏️[\s\n]*<\/button>/, 
`className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  ✏️ แก้ไขแพ็กเกจ
                </button>`);

c = c.replace(/className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition-colors"[\s\n]*>[\s\n]*🗑️[\s\n]*<\/button>/,
`className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg transition-colors flex items-center justify-center" title="ลบแพ็กเกจ"
                >
                  🗑️
                </button>`);

fs.writeFileSync('src/app/components/RatePlanSettings.tsx', c, 'utf8');
console.log('Removed button with regex');
