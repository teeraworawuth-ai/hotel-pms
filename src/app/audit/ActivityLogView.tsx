"use client";

import { useEffect, useState } from "react";
import {
  ActivityLogCategory,
  ActivityLogEntry,
  ACTIVITY_ACTION_LABELS,
  ACTIVITY_CATEGORY_LABELS,
  fetchActivityLogs,
} from "@/lib/activityLog";

export default function ActivityLogView({ initialCategory = "ALL" }: { initialCategory?: ActivityLogCategory | "ALL" }) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ActivityLogCategory | "ALL">(initialCategory);
  const [selectedStaff, setSelectedStaff] = useState<string>("ALL");
  const [daysFilter, setDaysFilter] = useState<number>(30);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const loadLogs = async () => {
    setLoading(true);
    const data = await fetchActivityLogs({ days: 30, category: "ALL" });
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const staffList = Array.from(new Set(logs.map((l) => l.staff_name).filter(Boolean)));

  const nowMs = Date.now();
  const filteredLogs = logs.filter((entry) => {
    if (selectedCategory !== "ALL" && entry.category !== selectedCategory) return false;
    if (selectedStaff !== "ALL" && entry.staff_name !== selectedStaff) return false;
    const entryMs = new Date(entry.timestamp).getTime();
    if (daysFilter > 0 && nowMs - entryMs > daysFilter * 24 * 3600 * 1000) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${entry.target} ${entry.details} ${entry.staff_name} ${entry.room_no || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const countByCategory: Record<string, number> = { ALL: logs.length };
  (Object.keys(ACTIVITY_CATEGORY_LABELS) as ActivityLogCategory[]).forEach((cat) => {
    countByCategory[cat] = logs.filter((l) => l.category === cat).length;
  });

  return (
    <div className="space-y-5">
      {/* Header & Category Filter Pills */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <span>📜</span> ประวัติการทำงานทั้งหมด (Activity Log ย้อนหลัง 30 วัน)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              บันทึกทุกการเพิ่ม แก้ไข ลบ และทำรายการโดยอัตโนมัติ (ระบบล้างข้อมูลที่เก่าเกิน 30 วันอัตโนมัติ)
            </p>
          </div>
          <button
            type="button"
            onClick={loadLogs}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <span>🔄</span> รีเฟรชข้อมูล
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
              selectedCategory === "ALL"
                ? "bg-slate-800 text-white border-slate-800 shadow-xs"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <span>📋 รวมทุกเมนู</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 font-black">
              {countByCategory.ALL || 0}
            </span>
          </button>

          {(Object.keys(ACTIVITY_CATEGORY_LABELS) as ActivityLogCategory[]).map((cat) => {
            const info = ACTIVITY_CATEGORY_LABELS[cat];
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{info.icon}</span>
                <span>{info.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    isSelected ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {countByCategory[cat] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search, Staff & Date Range Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">ค้นหารายการ / ห้อง / รายละเอียด</label>
            <input
              type="text"
              placeholder="พิมพ์ชื่อรายการ, เลขห้อง, หรือชื่อพนักงาน..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">กรองตามพนักงานผู้ทำรายการ</label>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">พนักงานทั้งหมด ({staffList.length} คน)</option>
              {staffList.map((st) => (
                <option key={st} value={st}>
                  👤 {st}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">ช่วงเวลาที่แสดง</label>
            <select
              value={daysFilter}
              onChange={(e) => setDaysFilter(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>เฉพาะ 24 ชั่วโมงล่าสุด</option>
              <option value={7}>ย้อนหลัง 7 วัน</option>
              <option value={15}>ย้อนหลัง 15 วัน</option>
              <option value={30}>ย้อนหลัง 30 วัน (สูงสุด)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log Entries Table / List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm font-medium">กำลังโหลดประวัติการทำงาน...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            ยังไม่มีประวัติการทำงานในหมวดหมู่หรือเงื่อนไขที่เลือก
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((entry) => {
              const catInfo = ACTIVITY_CATEGORY_LABELS[entry.category] || ACTIVITY_CATEGORY_LABELS.settings;
              const actInfo = ACTIVITY_ACTION_LABELS[entry.action] || ACTIVITY_ACTION_LABELS.ACTION;
              const dt = new Date(entry.timestamp);
              const dateLabel = dt.toLocaleDateString("th-TH", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });
              const timeLabel = dt.toLocaleTimeString("th-TH", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });

              return (
                <div
                  key={entry.id}
                  className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${catInfo.badgeClass}`}>
                        {catInfo.icon} {catInfo.label}
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${actInfo.className}`}>
                        {actInfo.label}
                      </span>
                      {entry.room_no && (
                        <span className="text-[11px] font-black bg-slate-800 text-white px-2 py-0.5 rounded-md">
                          ห้อง {entry.room_no}
                        </span>
                      )}
                      <span className="text-sm font-black text-slate-800">{entry.target}</span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium break-words pl-0.5">{entry.details}</p>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                        👤 {entry.staff_name}
                      </span>
                      {entry.shift_name && entry.shift_name !== entry.staff_name && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          กะ: {entry.shift_name}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">
                      🕒 {dateLabel} • {timeLabel} น.
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
