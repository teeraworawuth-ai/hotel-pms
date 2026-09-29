const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

// 1. Fix nights initialization
const oldNights = `  const [nights, setNights] = useState<number | ''>(() => {
    if (dateOffset === 0) {
      const h = getNow().getHours();
      if (h >= 0 && h < 7) return 0; // Late night defaults to 0 nights (checkout today noon)
    }
    return 1;
  });`;

const newNights = `  const [nights, setNights] = useState<number | ''>(() => {
    if (room.status === 'reserved' || room.status === 'occupied') {
      if (room.check_in_time && room.check_out_time) {
        const inTime = new Date(room.check_in_time);
        const outTime = new Date(room.check_out_time);
        const diff = outTime.getTime() - inTime.getTime();
        const n = Math.round(diff / (1000 * 60 * 60 * 24));
        if (n > 0) return n;
      }
    }
    if (dateOffset === 0) {
      const h = getNow().getHours();
      if (h >= 0 && h < 7) return 0; // Late night defaults to 0 nights (checkout today noon)
    }
    return 1;
  });`;

content = content.replace(oldNights, newNights);

// 2. Fix UI Breakdown
const oldUI = `<div className="flex flex-col mb-3 pb-3 border-b border-slate-200 gap-1">
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

const newUI = `<div className="flex flex-col mb-3 pb-3 border-b border-slate-200 gap-1">
                      <div className="flex justify-between items-center text-sm text-slate-600">
                        <span>ค่าห้องพัก ({nights} คืน):</span>
                        <span>฿{Number(actualPrice || 0).toLocaleString()}</span>
                      </div>
                      {keyDepositEnabled && (
                        <div className="flex justify-between items-center text-sm text-slate-600">
                          <span>มัดจำกุญแจ (คืนตอนออก):</span>
                          <span>฿{Number(keyDepositAmount || 0).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100">
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

content = content.replace(oldUI, newUI);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
