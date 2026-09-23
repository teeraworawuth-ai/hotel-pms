const fs = require('fs');

let c = fs.readFileSync('src/app/components/RatePlanSettings.tsx', 'utf8');

const target = `<button 
                onClick={() => openCalendar(plan)}
                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 py-2 rounded-lg text-xs font-bold transition-colors"
              >
                📅 ปฏิทินราคาพิเศษ
              </button>
              <button 
                onClick={() => { setEditingPlan(plan); setSelectedIcon(ratePlanIcons[plan.id] || '⭐'); setIsPlanModalOpen(true); }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition-colors"
              >
                ✏️
              </button>
              <button 
                onClick={() => deleteRatePlan(plan.id)}
                className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition-colors"
              >
                🗑️
              </button>`;

const replacement = `<button 
                onClick={() => { setEditingPlan(plan); setSelectedIcon(ratePlanIcons[plan.id] || '⭐'); setIsPlanModalOpen(true); }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
              >
                ✏️ แก้ไขแพ็กเกจ
              </button>
              <button 
                onClick={() => deleteRatePlan(plan.id)}
                className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg transition-colors flex items-center justify-center"
                title="ลบแพ็กเกจ"
              >
                🗑️
              </button>`;

c = c.replace(target, replacement);

fs.writeFileSync('src/app/components/RatePlanSettings.tsx', c, 'utf8');
console.log('Removed calendar button and adjusted UI');
