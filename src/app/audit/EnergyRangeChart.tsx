"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

export interface ChartArea {
  start: number;
  end: number;
  label: string;
}

interface Props {
  roomId: string;
  startMs: number;
  endMs: number;
  maxBoundStartMs?: number;
  maxBoundEndMs?: number;
  focusStartMs?: number;
  focusEndMs?: number;
  activeNightLabel?: string;
  areas?: ChartArea[]; // ช่วงที่ต้องการไฮไลต์ (เช่น รอบที่ผิดปกติ)
  height?: number;
}

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

export default function EnergyRangeChart({
  roomId,
  startMs,
  endMs,
  maxBoundStartMs,
  maxBoundEndMs,
  focusStartMs,
  focusEndMs,
  activeNightLabel,
  areas = [],
  height = 320,
}: Props) {
  // ขอบเขตข้อมูลทั้งหมดที่ดึง (สูงสุด 3 วัน)
  const dataStart = maxBoundStartMs ?? startMs;
  const dataEnd = Math.max(dataStart + 60000, Math.min(maxBoundEndMs ?? endMs, Date.now()));

  // ขอบเขตที่เริ่มต้นแสดง (ปกติคือช่วงคืนที่กำลังดู)
  const initialViewStart = focusStartMs ?? startMs;
  const initialViewEnd = Math.max(initialViewStart + 60000, Math.min(focusEndMs ?? endMs, dataEnd));

  const [logs, setLogs] = useState<{ t: number; watt: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewRange, setViewRange] = useState<{ start: number; end: number }>({
    start: initialViewStart,
    end: initialViewEnd,
  });

  // อัปเดต viewRange เมื่อ props เปลี่ยน
  useEffect(() => {
    setViewRange({
      start: initialViewStart,
      end: initialViewEnd,
    });
  }, [initialViewStart, initialViewEnd]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      let all: { t: number; watt: number }[] = [];
      let from = 0;
      const limit = 1000;
      while (true) {
        const { data } = await supabase
          .from("energy_logs")
          .select("wattage, recorded_at")
          .eq("room_id", roomId)
          .gte("recorded_at", new Date(dataStart).toISOString())
          .lte("recorded_at", new Date(dataEnd).toISOString())
          .order("recorded_at", { ascending: true })
          .range(from, from + limit - 1);
        if (!data) break;
        all = all.concat(data.map((l: any) => ({ t: new Date(l.recorded_at).getTime(), watt: Number(l.wattage) || 0 })));
        if (data.length < limit) break;
        from += limit;
      }
      if (!cancelled) {
        setLogs(all);
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [roomId, dataStart, dataEnd]);

  // เส้นแบ่งวัน: 00:00:01 ของทุกวันในช่วงข้อมูล
  const dayLines = useMemo(() => {
    const out: number[] = [];
    const d = new Date(dataStart);
    d.setHours(24, 0, 1, 0);
    while (d.getTime() < dataEnd) {
      out.push(d.getTime());
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [dataStart, dataEnd]);

  // เส้นตัดรอบเที่ยงวัน 12:00:00
  const noonLines = useMemo(() => {
    const out: number[] = [];
    const d = new Date(dataStart);
    d.setHours(12, 0, 0, 0);
    if (d.getTime() < dataStart) d.setDate(d.getDate() + 1);
    while (d.getTime() < dataEnd) {
      out.push(d.getTime());
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [dataStart, dataEnd]);

  // คัดกรอง log ในช่วง viewRange ปัจจุบันเพื่อคำนวณสถิติ
  const visibleLogs = useMemo(() => {
    return logs.filter((l) => l.t >= viewRange.start && l.t <= viewRange.end);
  }, [logs, viewRange]);

  const maxWatt = Math.max(...visibleLogs.map((l) => l.watt), 100);
  const yMax = Math.ceil(maxWatt / 200) * 200 + 200;
  const activeLogs = visibleLogs.filter((l) => l.watt > 0);
  const avg = activeLogs.length
    ? Math.round(activeLogs.reduce((s, l) => s + l.watt, 0) / activeLogs.length)
    : 0;

  // คำนวณ kWh ในช่วงที่กำลังดูอยู่
  const viewKwh = useMemo(() => {
    let kwh = 0;
    for (let i = 1; i < visibleLogs.length; i++) {
      const dtMs = visibleLogs[i].t - visibleLogs[i - 1].t;
      if (dtMs > 15 * 60000) continue;
      kwh += (((visibleLogs[i - 1].watt + visibleLogs[i].watt) / 2) * (dtMs / 3600000)) / 1000;
    }
    return kwh.toFixed(2);
  }, [visibleLogs]);

  // ฟังก์ชันควบคุมการซูมและเลื่อน
  const handleZoomIn = () => {
    const currentSpan = viewRange.end - viewRange.start;
    const center = (viewRange.start + viewRange.end) / 2;
    const totalSpan = dataEnd - dataStart;
    const minSpan = Math.min(30 * 60000, totalSpan);
    const newSpan = Math.min(totalSpan, Math.max(currentSpan * 0.65, minSpan)); // ซูมละเอียดสุด 30 นาที (หรือเท่าที่มี)
    const newStart = Math.max(dataStart, center - newSpan / 2);
    const newEnd = Math.min(dataEnd, newStart + newSpan);
    setViewRange({ start: newStart, end: newEnd });
  };

  const handleZoomOut = () => {
    const currentSpan = viewRange.end - viewRange.start;
    const center = (viewRange.start + viewRange.end) / 2;
    const newSpan = Math.min(currentSpan * 1.5, dataEnd - dataStart);
    let newStart = center - newSpan / 2;
    let newEnd = center + newSpan / 2;
    if (newStart < dataStart) {
      newStart = dataStart;
      newEnd = Math.min(dataEnd, newStart + newSpan);
    }
    if (newEnd > dataEnd) {
      newEnd = dataEnd;
      newStart = Math.max(dataStart, newEnd - newSpan);
    }
    setViewRange({ start: newStart, end: newEnd });
  };

  const handlePanLeft = () => {
    const span = viewRange.end - viewRange.start;
    const shift = span * 0.3;
    const newStart = Math.max(dataStart, viewRange.start - shift);
    const newEnd = newStart + span;
    setViewRange({ start: newStart, end: Math.min(dataEnd, newEnd) });
  };

  const handlePanRight = () => {
    const span = viewRange.end - viewRange.start;
    const shift = span * 0.3;
    const newEnd = Math.min(dataEnd, viewRange.end + shift);
    const newStart = newEnd - span;
    setViewRange({ start: Math.max(dataStart, newStart), end: newEnd });
  };

  const handleResetToNight = () => {
    setViewRange({ start: initialViewStart, end: initialViewEnd });
  };

  const handleShowFull3Days = () => {
    setViewRange({ start: dataStart, end: dataEnd });
  };

  const multiDay = viewRange.end - viewRange.start > 14 * 3600000;
  const canShow3Days = dataEnd - dataStart > (initialViewEnd - initialViewStart) * 1.1;

  return (
    <div className="space-y-3">
      {/* แถบเครื่องมือควบคุมการซูมและเลื่อนเวลา */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={handlePanLeft}
            disabled={viewRange.start <= dataStart}
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white shadow-sm transition-all"
            title="เลื่อนถอยหลัง"
          >
            ◀ ย้อนเวลา
          </button>
          <button
            type="button"
            onClick={handlePanRight}
            disabled={viewRange.end >= dataEnd}
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white shadow-sm transition-all"
            title="เลื่อนไปข้างหน้า"
          >
            ไปข้างหน้า ▶
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 shadow-sm transition-all"
            title="ขยายดูกราฟแบบละเอียด"
          >
            🔍 ขยาย (+)
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 shadow-sm transition-all"
            title="ซูมออกดูภาพกว้าง"
          >
            🔍 ซูมออก (-)
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={handleResetToNight}
            className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg font-bold hover:bg-blue-100 transition-all shadow-sm"
          >
            🎯 รอบคืนนี้
          </button>
          {canShow3Days && (
            <button
              type="button"
              onClick={handleShowFull3Days}
              className="px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg font-bold hover:bg-purple-100 transition-all shadow-sm"
            >
              🌐 ดูทั้งหมด (สูงสุด 3 วัน)
            </button>
          )}
        </div>
      </div>

      {/* แถบสรุปสถิติตามช่วงเวลาที่กำลังซูมดู */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="bg-blue-50 text-blue-700 font-bold px-2 py-1 rounded">
          เฉลี่ย {avg} W
        </span>
        <span className="bg-rose-50 text-rose-700 font-bold px-2 py-1 rounded">
          สูงสุด {Math.round(maxWatt === 100 && visibleLogs.length === 0 ? 0 : maxWatt)} W
        </span>
        <span className="bg-amber-50 text-amber-800 font-bold px-2 py-1 rounded">
          ไฟช่วงที่ดู: {viewKwh} kWh
        </span>
        <span className="text-slate-500 font-medium py-1 ml-auto">
          ช่วงเวลา: {fmtDate(viewRange.start)} {fmtTime(viewRange.start)} - {fmtDate(viewRange.end)} {fmtTime(viewRange.end)}
        </span>
      </div>

      {/* พื้นที่แสดงกราฟ */}
      <div style={{ height }} className="w-full">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            กำลังโหลดข้อมูลกราฟไฟฟ้า...
          </div>
        ) : logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            ไม่มีข้อมูลการใช้ไฟฟ้าในช่วงเวลานี้
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={logs} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[viewRange.start, viewRange.end]}
                tickCount={6}
                tickFormatter={(v) => (multiDay ? `${fmtDate(v)} ${fmtTime(v)}` : fmtTime(v))}
                tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="number"
                domain={[0, yMax]}
                tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}w`}
                width={60}
              />
              <Tooltip
                labelFormatter={(v) => `${fmtDate(Number(v))} ${fmtTime(Number(v))}`}
                formatter={(v: any) => [`${v} W`, "กำลังไฟ"]}
              />

              {/* ไฮไลต์รอบคืนปัจจุบัน ถ้าเปิดดูภาพกว้าง */}
              {focusStartMs && focusEndMs && (viewRange.start < focusStartMs || viewRange.end > focusEndMs) && (
                <ReferenceArea
                  x1={Math.max(focusStartMs, viewRange.start)}
                  x2={Math.min(focusEndMs, viewRange.end)}
                  fill="#3b82f6"
                  fillOpacity={0.08}
                  stroke="#3b82f6"
                  strokeOpacity={0.3}
                  strokeDasharray="4 2"
                  label={{
                    value: activeNightLabel || "รอบคืนที่กำลังดู",
                    position: "insideTop",
                    fontSize: 11,
                    fontWeight: 700,
                    fill: "#2563eb",
                  }}
                />
              )}

              {/* พื้นที่ไฮไลต์สำหรับ Anomaly (ถ้ามี) */}
              {areas.map((a, i) => (
                <ReferenceArea
                  key={i}
                  x1={Math.max(a.start, viewRange.start)}
                  x2={Math.min(a.end, viewRange.end)}
                  fill="#ef4444"
                  fillOpacity={0.15}
                  stroke="#ef4444"
                  strokeOpacity={0.4}
                  label={{ value: a.label, position: "insideTop", fontSize: 11, fontWeight: 700, fill: "#b91c1c" }}
                />
              ))}

              {/* เส้นแบ่งวัน 00:00:01 */}
              {dayLines.map((ms) => (
                <ReferenceLine
                  key={`day-${ms}`}
                  x={ms}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  label={{
                    value: `00:00 วันใหม่ (${fmtDate(ms)})`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fontWeight: 700,
                    fill: "#b45309",
                  }}
                />
              ))}

              {/* เส้นตัดรอบคิดค่าไฟ 12:00 น. */}
              {noonLines.map((ms) => (
                <ReferenceLine
                  key={`noon-${ms}`}
                  x={ms}
                  stroke="#a855f7"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  label={{
                    value: `ตัดรอบ 12:00 น.`,
                    position: "insideTopLeft",
                    fontSize: 10,
                    fontWeight: 700,
                    fill: "#7e22ce",
                  }}
                />
              ))}

              <Line
                type="stepAfter"
                dataKey="watt"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
