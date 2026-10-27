"use client";

import { useEffect, useState } from "react";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";
import DailyReport from "./DailyReport";
import GuestReport from "./GuestReport";
import AnomalyReport from "./AnomalyReport";
import AnomalyHistory from "./AnomalyHistory";
import HousekeepingOvertime from "./HousekeepingOvertime";
import ActivityLogView from "./ActivityLogView";

export default function AuditPage() {
  const { getNow } = useSimulatedTime();
  const [activeTab, setActiveTab] = useState<"daily" | "guest" | "anomaly" | "history" | "activity_log">("daily");
  const [dateOffset, setDateOffset] = useState<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "daily" || tabParam === "activity_log" || tabParam === "guest" || tabParam === "anomaly" || tabParam === "history") {
        setActiveTab(tabParam);
      }
    }
  }, []);

  // สร้างตัวเลือก Dropdown 15 วัน (อิงรอบวันธุรกิจ 06:45 - 06:44 ของอีกวัน)
  const dateOptions = Array.from({ length: 16 }, (_, i) => {
    const d = getNow();
    if (d.getHours() < 6 || (d.getHours() === 6 && d.getMinutes() < 45)) {
      d.setDate(d.getDate() - 1);
    }
    d.setDate(d.getDate() - i);
    const labelStr = d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    return {
      offset: -i,
      label: i === 0 ? `วันนี้ (${labelStr})` : labelStr,
    };
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">รายงานประจำวัน &amp; ตรวจสอบ (Daily Report &amp; Audit)</h1>
          <p className="text-slate-500 mt-2">สรุปรายได้-รับชำระเงินประจำวัน ตรวจสอบความผิดปกติ วิเคราะห์การใช้พลังงาน และดูประวัติการใช้งานย้อนหลัง 30 วัน</p>
        </div>
        <a
          href="/simulation-5-days.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold shadow-xs transition-all whitespace-nowrap"
        >
          🖨️ เปิดเอกสารจำลองสถานการณ์ 5 วัน (พิมพ์ A4)
        </a>
      </header>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("daily")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
            activeTab === "daily" ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          📊 รายงานเงินสดประจำวัน
        </button>
        <button
          onClick={() => setActiveTab("guest")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
            activeTab === "guest" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          👤 รายงานผู้เข้าพัก
        </button>
        <button
          onClick={() => setActiveTab("anomaly")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
            activeTab === "anomaly" ? "bg-red-50 text-red-700" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          🚨 ความผิดปกติ
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
            activeTab === "history" ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          ✅ ประวัติการตรวจสอบ
        </button>
        <button
          onClick={() => setActiveTab("activity_log")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
            activeTab === "activity_log" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          📜 ประวัติการใช้งาน (Log 30 วัน)
        </button>
      </div>

      {/* Date Dropdown (เฉพาะแท็บรายงานรายวัน) */}
      {activeTab !== "activity_log" && (
        <div className="flex items-center gap-2 bg-white p-4 rounded-xl shadow-sm border border-slate-200 w-fit">
          <label className="text-sm font-bold text-slate-700 mr-1">เลือกวันที่ตรวจสอบ:</label>
          <button
            type="button"
            onClick={() => setDateOffset((d) => Math.max(-15, d - 1))}
            disabled={dateOffset <= -15}
            className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black disabled:opacity-40"
          >
            ◀
          </button>
          <select
            value={dateOffset}
            onChange={(e) => setDateOffset(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {dateOptions.map((opt) => (
              <option key={opt.offset} value={opt.offset}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setDateOffset((d) => Math.min(0, d + 1))}
            disabled={dateOffset >= 0}
            className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black disabled:opacity-40"
          >
            ▶
          </button>
        </div>
      )}

      {/* Content */}
      <div className="mt-6">
        {activeTab === "daily" && <DailyReport dateOffset={dateOffset} onChangeDateOffset={setDateOffset} />}
        {activeTab === "guest" && <GuestReport dateOffset={dateOffset} />}
        {activeTab === "anomaly" && <HousekeepingOvertime dateOffset={dateOffset} />}
        {activeTab === "anomaly" && <AnomalyReport dateOffset={dateOffset} />}
        {activeTab === "history" && <AnomalyHistory dateOffset={dateOffset} />}
        {activeTab === "activity_log" && <ActivityLogView />}
      </div>
    </div>
  );
}
