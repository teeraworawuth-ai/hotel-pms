const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const target = '<div className="p-4 border-b bg-slate-50 rounded-t-xl flex justify-between items-center">';
const replacement = target + `
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">จัดการบิลค่าใช้จ่ายห้อง {roomNo}</h2>
            {totalKeyDeposit > 0 && (
              <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-md border border-amber-200">
                🔑 มีมัดจำกุญแจ {totalKeyDeposit} บ.
              </span>
            )}
          </div>`;

content = content.replace('<h2 className="text-xl font-bold text-slate-800">จัดการบิลค่าใช้จ่ายห้อง {roomNo}</h2>', '');
content = content.replace(target, replacement);

fs.writeFileSync('src/app/components/BillingModal.tsx', content, 'utf8');
