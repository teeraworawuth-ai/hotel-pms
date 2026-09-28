const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const targetSummaryStart = `<div className={\`\${room.status === 'reserved' ? 'bg-purple-50 border-purple-100' : 'bg-blue-50 border-blue-100'} p-4 rounded-xl border mb-6\`}>
                <div className="flex justify-between items-start mb-3 gap-2">
                  <span className="text-sm font-medium text-slate-700 shrink-0 pt-1">{room.status === 'reserved' ? 'จองโดย:' : 'ผู้เข้าพัก:'}</span>
                  <div className="flex flex-wrap justify-end items-center gap-x-2 gap-y-1 text-right">
                    <span className="text-lg font-bold text-slate-900">{room.guest_name || \`👤 \${room.guest_count} คน\`}</span>
                    {room.guest_phone && <span className="text-sm font-medium text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-sm">📞 {room.guest_phone}</span>}
                    {room.staff_name && <span className="text-sm font-medium text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-sm">🤵 {room.staff_name}</span>}
                  </div>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-700">เวลาออก:</span>
                  <span className="text-sm font-bold text-slate-900 bg-white px-2 py-1 rounded shadow-sm">
                    {room.check_out_time ? new Date(room.check_out_time).toLocaleString('th-TH') : '-'}
                  </span>
                </div>`;

if(content.includes(targetSummaryStart)) {
  content = content.replace(targetSummaryStart, `<div className="mt-2 pt-4 border-t border-slate-200">`);
  console.log("Replaced summary block");
} else {
  console.log("Could not find summary block");
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
