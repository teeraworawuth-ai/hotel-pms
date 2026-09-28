const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const targetTotalToPay = `  const totalToPay = (room.status === 'available' || room.status === 'reserved' || room.status === 'occupied') 
    ? (activeTab === 'overnight' ? totalOvernight : totalShortStay)
    : 0;`;

const newTotalToPay = `  const totalToPay = (room.status === 'available' || room.status === 'reserved' || room.status === 'occupied') 
    ? (activeTab === 'overnight' ? totalOvernight : totalShortStay)
    : 0;
  
  const totalPaid = pastPayments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  const remainingBalance = totalToPay - totalPaid;
`;

if(content.includes(targetTotalToPay)) {
  content = content.replace(targetTotalToPay, newTotalToPay);
}

const targetDisplay = `<div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-500">ยอดที่ต้องชำระทั้งหมด:</span>
                      <span className="text-sm font-black text-rose-600">฿{totalToPay.toLocaleString()}</span>
                    </div>`;

const newDisplay = `<div className="flex flex-col mb-3 pb-3 border-b border-slate-200 gap-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">ยอดรวมทั้งหมด:</span>
                        <span className="text-sm font-bold text-slate-700">฿{totalToPay.toLocaleString()}</span>
                      </div>
                      {totalPaid > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">ชำระแล้ว:</span>
                          <span className="text-sm font-bold text-emerald-600">-฿{totalPaid.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100">
                        <span className="text-sm font-bold text-slate-700">ยอดคงเหลือที่ต้องชำระ:</span>
                        <span className="text-lg font-black text-rose-600">฿{remainingBalance.toLocaleString()}</span>
                      </div>
                    </div>`;

if(content.includes(targetDisplay)) {
  content = content.replace(targetDisplay, newDisplay);
} else {
  console.log("Could not find target display");
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
