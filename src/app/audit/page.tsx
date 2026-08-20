"use client";

import { useState } from "react";
import GuestReport from "./GuestReport";
import AnomalyReport from "./AnomalyReport";
import AnomalyHistory from "./AnomalyHistory";

export default function AuditPage() {
  const [activeTab, setActiveTab] = useState<"guest" | "anomaly" | "history">("guest");
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
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">รายงานการตรวจสอบ (Audit)</h1>
          <p className="text-slate-500 mt-2">ตรวจสอบความผิดปกติและวิเคราะห์การใช้พลังงานเชิงลึก</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("guest")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === "guest" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          👤 รายงานผู้เข้าพัก
        </button>
        <button
          onClick={() => setActiveTab("anomaly")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === "anomaly" ? "bg-red-50 text-red-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          🚨 ความผิดปกติ
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === "history" ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          ✅ ประวัติการตรวจสอบ
        </button>
      </div>

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
        {activeTab === "guest" && <GuestReport dateOffset={dateOffset} />}
        {activeTab === "anomaly" && <AnomalyReport dateOffset={dateOffset} />}
        {activeTab === "history" && <AnomalyHistory dateOffset={dateOffset} />}
      </div>
    </div>
  );
}
