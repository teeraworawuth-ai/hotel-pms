"use client";

import { useEffect, useRef, useState } from "react";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";

/**
 * ตัวเลือกวันที่-เวลาโอนเงินแบบกระชับ
 * ขั้นตอน: เลือกวัน (ค่าเริ่มต้น = วันนี้) → เลือกชั่วโมง → เลือกนาที → ปิดแผงอัตโนมัติทันที
 * value / onChange ใช้รูปแบบเดียวกับ <input type="datetime-local"> คือ "YYYY-MM-DDTHH:mm"
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function TransferTimePicker({ value, onChange, className = "" }: Props) {
  const { getNow } = useSimulatedTime();
  const [open, setOpen] = useState(false);
  const [datePart, setDatePart] = useState("");
  const [hourPart, setHourPart] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // เปิดแผงทุกครั้ง: ตั้งวันที่จากค่าเดิม (หรือวันนี้) และให้เลือกชั่วโมงใหม่
  const openPanel = () => {
    const base = value ? value.slice(0, 10) : toDateStr(getNow());
    setDatePart(base);
    setHourPart(null);
    setOpen(true);
  };

  // คลิกนอกแผง = ปิด
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const commit = (h: number, m: number) => {
    onChange(`${datePart}T${pad(h)}:${pad(m)}`);
    setOpen(false);
  };

  const setNow = () => {
    const n = getNow();
    onChange(`${toDateStr(n)}T${pad(n.getHours())}:${pad(n.getMinutes())}`);
    setOpen(false);
  };

  const today = toDateStr(getNow());
  const yd = new Date(getNow());
  yd.setDate(yd.getDate() - 1);
  const yesterday = toDateStr(yd);

  const label = value
    ? `${new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "2-digit",
      })} • ${value.slice(11, 16)} น.`
    : "เลือกวัน-เวลาโอน";

  return (
    <div ref={wrapRef} className={`relative flex-1 min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={`w-full flex items-center justify-between gap-1.5 border rounded-lg px-2 py-1 text-xs bg-white transition-colors ${
          open ? "border-blue-500 ring-2 ring-blue-500/20" : "border-blue-200 hover:border-blue-400"
        } ${value ? "text-slate-800 font-bold" : "text-slate-400"}`}
      >
        <span className="truncate">🕒 {label}</span>
        <span className="text-[10px] text-blue-600 shrink-0">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-[290px] max-w-[85vw] bg-white border-2 border-blue-200 rounded-xl shadow-xl p-2.5 space-y-2 text-xs">
          {/* 1. วันที่ */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-black text-slate-700">1. วันที่โอน</span>
              <button type="button" onClick={setNow} className="text-[11px] font-bold text-blue-700 hover:underline">
                ⚡ ใช้เวลาปัจจุบัน
              </button>
            </div>
            <div className="flex items-center gap-1">
              {[
                { k: today, t: "วันนี้" },
                { k: yesterday, t: "เมื่อวาน" },
              ].map((d) => (
                <button
                  key={d.k}
                  type="button"
                  onClick={() => setDatePart(d.k)}
                  className={`px-2 py-1 rounded-lg border font-bold transition-colors ${
                    datePart === d.k
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50"
                  }`}
                >
                  {d.t}
                </button>
              ))}
              <input
                type="date"
                value={datePart}
                onChange={(e) => e.target.value && setDatePart(e.target.value)}
                className="flex-1 min-w-0 border border-slate-200 rounded-lg px-1.5 py-1 text-xs bg-white text-slate-700"
              />
            </div>
          </div>

          {/* 2. ชั่วโมง */}
          <div className="space-y-1">
            <span className="font-black text-slate-700">2. ชั่วโมง</span>
            <div className="grid grid-cols-8 gap-0.5">
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHourPart(h)}
                  className={`py-1 rounded-md font-bold transition-colors ${
                    hourPart === h ? "bg-blue-600 text-white" : "bg-slate-50 hover:bg-blue-50 text-slate-700"
                  }`}
                >
                  {pad(h)}
                </button>
              ))}
            </div>
          </div>

          {/* 3. นาที (เลือกแล้วปิดแผงทันที) */}
          <div className="space-y-1">
            <span className={`font-black ${hourPart === null ? "text-slate-300" : "text-slate-700"}`}>
              3. นาที {hourPart === null ? "(เลือกชั่วโมงก่อน)" : `— ${pad(hourPart)}:__ (เลือกแล้วปิดอัตโนมัติ)`}
            </span>
            <div className="grid grid-cols-10 gap-0.5">
              {Array.from({ length: 60 }, (_, m) => (
                <button
                  key={m}
                  type="button"
                  disabled={hourPart === null}
                  onClick={() => hourPart !== null && commit(hourPart, m)}
                  className="py-0.5 rounded text-[10px] font-bold bg-slate-50 hover:bg-blue-600 hover:text-white text-slate-700 disabled:opacity-30 disabled:hover:bg-slate-50 disabled:hover:text-slate-700 transition-colors"
                >
                  {pad(m)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
