"use client";

import { useState } from "react";
import DailyReport from "../audit/DailyReport";

export default function ManagerPage() {
  const [dateOffset, setDateOffset] = useState<number>(0);

  // สร้างตัวเลือก Dropdown 15 วัน
  const dateOptions = Array.from({ length: 16 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return {
      offset: -i,
      label: i === 0 ? "วันนี้ (Today)" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
    };
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">รายงานประจำวัน (Manager)</h1>
          <p className="text-slate-500 mt-2">สรุปยอดรายรับ-รายจ่าย และสถานะประจำวัน</p>
        </div>
      </header>

      {/* Date Dropdown */}
      <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200 w-fit">
        <label className="text-sm font-bold text-slate-700">เลือกวันที่ตรวจสอบ:</label>
        <select 
          value={dateOffset} 
          onChange={(e) => setDateOffset(Number(e.target.value))}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
        >
          {dateOptions.map(opt => (
            <option key={opt.offset} value={opt.offset}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="mt-6">
        <DailyReport dateOffset={dateOffset} />
      </div>
    </div>
  );
}
