"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AreaChart,
  Area,
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
  color?: "red" | "emerald" | "blue";
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
  areas?: ChartArea[]; // ช่วงที่ต้องการไฮไลต์ (เช่น รอบที่ผิดปกติ หรือ ช่วงที่มีผู้เข้าพัก)
  height?: number;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
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
  // ล็อกค่าเวลาปัจจุบันตามการเปิดหน้าต่าง เพื่อป้องกัน Infinite Render Loop จาก Date.now()
  const stableNowMs = useMemo(
    () => Math.floor(Date.now() / 10000) * 10000,
    [roomId, startMs, endMs, maxBoundStartMs, maxBoundEndMs]
  );

  // ขอบเขตข้อมูลทั้งหมดที่ดึง (สูงสุด 3 วัน)
  const dataStart = useMemo(() => maxBoundStartMs ?? startMs, [maxBoundStartMs, startMs]);
  const dataEnd = useMemo(() => {
    const rawEnd = Math.min(maxBoundEndMs ?? endMs, stableNowMs);
    return Math.max(dataStart + 30 * 60000, rawEnd);
  }, [dataStart, maxBoundEndMs, endMs, stableNowMs]);

  // ขอบเขตที่เริ่มต้นแสดง (ปกติคือช่วงคืนหรือรอบที่กำลังดู)
  const initialViewStart = useMemo(() => focusStartMs ?? startMs, [focusStartMs, startMs]);
  const initialViewEnd = useMemo(() => {
    const rawFocusEnd = Math.min(focusEndMs ?? endMs, dataEnd);
    return Math.max(initialViewStart + 30 * 60000, rawFocusEnd);
  }, [initialViewStart, focusEndMs, endMs, dataEnd]);

  const [logs, setLogs] = useState<{ t: number; watt: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewRange, setViewRange] = useState<{ start: number; end: number }>({
    start: initialViewStart,
    end: initialViewEnd,
  });

  const viewRangeRef = useRef(viewRange);
  useEffect(() => {
    viewRangeRef.current = viewRange;
  }, [viewRange]);

  const chartBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startRange: { start: number; end: number } }>({
    active: false,
    startX: 0,
    startRange: { start: initialViewStart, end: initialViewEnd },
  });

  // อัปเดต viewRange เมื่อ props โฟกัสเปลี่ยน
  useEffect(() => {
    setViewRange({
      start: initialViewStart,
      end: initialViewEnd,
    });
  }, [roomId, initialViewStart, initialViewEnd]);

  // ดึงข้อมูล energy_logs ของห้องนี้ (ดึงเผื่อก่อนหน้า 30 นาที เพื่อให้เส้นกราฟต่อเนื่องตั้งแต่ขอบซ้าย)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const queryStartIso = new Date(dataStart - 30 * 60000).toISOString();
        const queryEndIso = new Date(dataEnd + 5 * 60000).toISOString();

        // ดึงรอบแรกโดยไม่บังคับ SQL ORDER BY เพื่อให้ใช้ Index room_id ได้เร็วที่สุด (~100ms)
        const { data: firstBatch, error } = await supabase
          .from("energy_logs")
          .select("wattage, recorded_at")
          .eq("room_id", roomId)
          .gte("recorded_at", queryStartIso)
          .lte("recorded_at", queryEndIso)
          .limit(1000);

        if (error) throw error;

        let rawRows: any[] = firstBatch || [];

        // กรณีดึงย้อนหลัง 3 วันและมีเกิน 1,000 แถว ให้ดึงส่วนที่เหลือเพิ่มเติม
        if (rawRows.length === 1000) {
          let allPaged: any[] = [];
          let from = 0;
          const limit = 1000;
          while (true) {
            const { data: pageData, error: pageErr } = await supabase
              .from("energy_logs")
              .select("wattage, recorded_at")
              .eq("room_id", roomId)
              .gte("recorded_at", queryStartIso)
              .lte("recorded_at", queryEndIso)
              .order("recorded_at", { ascending: true })
              .range(from, from + limit - 1);
            if (pageErr || !pageData) break;
            allPaged = allPaged.concat(pageData);
            if (pageData.length < limit) break;
            from += limit;
          }
          if (allPaged.length > 0) rawRows = allPaged;
        }

        const mapped = rawRows
          .map((l: any) => ({
            t: new Date(l.recorded_at).getTime(),
            watt: Math.max(0, Number(l.wattage) || 0),
          }))
          .filter((p) => Number.isFinite(p.t))
          .sort((a, b) => a.t - b.t);

        if (!cancelled) {
          setLogs(mapped);
          setLoading(false);
        }
      } catch (err: any) {
        console.error("EnergyRangeChart fetch error:", err);
        if (!cancelled) {
          setErrorMsg("เกิดข้อผิดพลาดในการโหลดข้อมูลกราฟไฟฟ้า");
          setLogs([]);
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [roomId, dataStart, dataEnd]);

  // แทรกจุดตัด 0W เมื่อข้อมูลขาดหายเกิน 25 นาที เพื่อไม่ให้เส้นค้างลากยาวข้ามช่วงออฟไลน์
  const continuousLogs = useMemo(() => {
    if (logs.length === 0) return [];
    const GAP_MS = 25 * 60000;
    const out: { t: number; watt: number }[] = [];
    for (let i = 0; i < logs.length; i++) {
      const curr = logs[i];
      if (i > 0) {
        const prev = logs[i - 1];
        if (curr.t - prev.t > GAP_MS) {
          out.push({ t: prev.t + 1000, watt: 0 });
          out.push({ t: curr.t - 1000, watt: 0 });
        }
      }
      out.push(curr);
    }
    return out;
  }, [logs]);

  // สร้างข้อมูลสำหรับวาดกราฟในช่วง viewRange ปัจจุบัน พร้อมจุดขอบซ้าย-ขวาเพื่อให้แสดงผลได้แม้มีเพียง 1 จุดข้อมูล
  const chartData = useMemo(() => {
    if (continuousLogs.length === 0) return [];
    const { start, end } = viewRange;
    const inView = continuousLogs.filter((l) => l.t >= start && l.t <= end);

    // หาค่าไฟล่าสุดก่อนขอบซ้าย (ภายใน 25 นาที)
    let leftWatt = 0;
    for (let i = continuousLogs.length - 1; i >= 0; i--) {
      if (continuousLogs[i].t <= start) {
        if (start - continuousLogs[i].t <= 25 * 60000) {
          leftWatt = continuousLogs[i].watt;
        }
        break;
      }
    }

    const result: { t: number; watt: number }[] = [];
    if (inView.length === 0 || inView[0].t > start) {
      result.push({ t: start, watt: leftWatt });
    }
    result.push(...inView);

    // ต่อเส้นด้านขวาจนถึงเวลาสิ้นสุด (หรือเวลาปัจจุบัน) หากจุดสุดท้ายห่างไม่เกิน 15 นาที
    const lastPt = result[result.length - 1];
    const effectiveRightEdge = Math.min(end, stableNowMs);
    if (lastPt && effectiveRightEdge > lastPt.t) {
      if (effectiveRightEdge - lastPt.t <= 15 * 60000) {
        result.push({ t: effectiveRightEdge, watt: lastPt.watt });
      } else {
        result.push({ t: lastPt.t + 1000, watt: 0 });
        result.push({ t: effectiveRightEdge, watt: 0 });
      }
    }

    return result;
  }, [continuousLogs, viewRange, stableNowMs]);

  // คัดกรอง log จริงในช่วง viewRange เพื่อคำนวณสถิติ
  const visibleLogs = useMemo(() => {
    return logs.filter((l) => l.t >= viewRange.start && l.t <= viewRange.end);
  }, [logs, viewRange]);

  const maxWatt = Math.max(...chartData.map((l) => l.watt), 100);
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
      if (dtMs > 25 * 60000) continue;
      kwh += (((visibleLogs[i - 1].watt + visibleLogs[i].watt) / 2) * (dtMs / 3600000)) / 1000;
    }
    return kwh.toFixed(2);
  }, [visibleLogs]);

  // เส้นแบ่งวัน: 00:00:01 ของทุกวันในช่วงที่มองเห็น
  const dayLines = useMemo(() => {
    const out: number[] = [];
    const d = new Date(viewRange.start);
    d.setHours(24, 0, 1, 0);
    while (d.getTime() < viewRange.end) {
      if (d.getTime() > viewRange.start) out.push(d.getTime());
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [viewRange]);

  // เส้นตัดรอบเที่ยงวัน 12:00:00 ในช่วงที่มองเห็น
  const noonLines = useMemo(() => {
    const out: number[] = [];
    const d = new Date(viewRange.start);
    d.setHours(12, 0, 0, 0);
    if (d.getTime() <= viewRange.start) d.setDate(d.getDate() + 1);
    while (d.getTime() < viewRange.end) {
      out.push(d.getTime());
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [viewRange]);

  // ฟังก์ชันควบคุมการซูมและเลื่อน
  const clampRange = (newStart: number, newEnd: number) => {
    const totalSpan = Math.max(30 * 60000, dataEnd - dataStart);
    const minSpan = Math.min(15 * 60000, totalSpan);
    let span = Math.max(minSpan, Math.min(totalSpan, newEnd - newStart));
    let s = newStart;
    let e = s + span;
    if (s < dataStart) {
      s = dataStart;
      e = Math.min(dataEnd, s + span);
    }
    if (e > dataEnd) {
      e = dataEnd;
      s = Math.max(dataStart, e - span);
    }
    return { start: s, end: Math.max(s + 60000, e) };
  };

  const handleZoomIn = () => {
    const currentSpan = viewRange.end - viewRange.start;
    const center = (viewRange.start + viewRange.end) / 2;
    const newSpan = currentSpan * 0.65;
    setViewRange(clampRange(center - newSpan / 2, center + newSpan / 2));
  };

  const handleZoomOut = () => {
    const currentSpan = viewRange.end - viewRange.start;
    const center = (viewRange.start + viewRange.end) / 2;
    const newSpan = currentSpan * 1.5;
    setViewRange(clampRange(center - newSpan / 2, center + newSpan / 2));
  };

  const handlePanLeft = () => {
    const span = viewRange.end - viewRange.start;
    const shift = span * 0.3;
    setViewRange(clampRange(viewRange.start - shift, viewRange.end - shift));
  };

  const handlePanRight = () => {
    const span = viewRange.end - viewRange.start;
    const shift = span * 0.3;
    setViewRange(clampRange(viewRange.start + shift, viewRange.end + shift));
  };

  const handleResetToNight = () => {
    setViewRange({ start: initialViewStart, end: initialViewEnd });
  };

  const handleShowFull3Days = () => {
    setViewRange({ start: dataStart, end: dataEnd });
  };

  // รองรับการหมุนลูกกลิ้งเมาส์เพื่อซูมเข้า-ออกบนกราฟ
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const cur = viewRangeRef.current;
      const span = cur.end - cur.start;
      const factor = e.deltaY < 0 ? 0.75 : 1.35;
      const nextSpan = span * factor;
      const anchor = cur.start + ratio * span;
      setViewRange(clampRange(anchor - ratio * nextSpan, anchor + (1 - ratio) * nextSpan));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [dataStart, dataEnd]);

  // รองรับการคลิกลากซ้าย-ขวาบนกราฟ
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startRange: { ...viewRange },
    };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.active || !chartBoxRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const width = Math.max(1, chartBoxRef.current.getBoundingClientRect().width);
    const span = dragRef.current.startRange.end - dragRef.current.startRange.start;
    const timeShift = (dx / width) * span;
    setViewRange(clampRange(dragRef.current.startRange.start - timeShift, dragRef.current.startRange.end - timeShift));
  };
  const onMouseUp = () => {
    dragRef.current.active = false;
  };

  const multiDay = viewRange.end - viewRange.start > 14 * 3600000;
  const canShowFull = dataEnd - dataStart > (initialViewEnd - initialViewStart) * 1.08;
  const visibleAreas = useMemo(
    () => areas.filter((a) => a.end > viewRange.start && a.start < viewRange.end),
    [areas, viewRange]
  );

  return (
    <div className="space-y-3">
      {/* แถบเครื่องมือควบคุมการซูมและเลื่อนเวลา */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={handlePanLeft}
            disabled={viewRange.start <= dataStart + 1000}
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white shadow-sm transition-all"
            title="เลื่อนถอยหลัง"
          >
            ◀ ย้อนเวลา
          </button>
          <button
            type="button"
            onClick={handlePanRight}
            disabled={viewRange.end >= dataEnd - 1000}
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
            🎯 {activeNightLabel || "ช่วงที่โฟกัส"}
          </button>
          {canShowFull && (
            <button
              type="button"
              onClick={handleShowFull3Days}
              className="px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg font-bold hover:bg-purple-100 transition-all shadow-sm"
            >
              🌐 ดูเต็มช่วงเวลา
            </button>
          )}
        </div>
      </div>

      {/* แถบสรุปสถิติตามช่วงเวลาที่กำลังซูมดู */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
        <span className="bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-lg border border-blue-100">
          เฉลี่ย {avg} W
        </span>
        <span className="bg-rose-50 text-rose-700 font-bold px-2.5 py-1 rounded-lg border border-rose-100">
          สูงสุด {Math.round(maxWatt === 100 && activeLogs.length === 0 ? 0 : maxWatt)} W
        </span>
        <span className="bg-amber-50 text-amber-800 font-bold px-2.5 py-1 rounded-lg border border-amber-100">
          ไฟช่วงที่ดู: {viewKwh} kWh
        </span>
        <span className="text-slate-500 font-medium py-1 ml-auto">
          ช่วงเวลา: {fmtDate(viewRange.start)} {fmtTime(viewRange.start)} - {fmtDate(viewRange.end)} {fmtTime(viewRange.end)}
        </span>
      </div>

      {/* พื้นที่แสดงกราฟ */}
      <div
        ref={chartBoxRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ height }}
        className="w-full min-w-0 select-none cursor-grab active:cursor-grabbing bg-white rounded-xl border border-slate-100 p-2"
      >
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>กำลังโหลดข้อมูลกราฟไฟฟ้า...</span>
          </div>
        ) : errorMsg ? (
          <div className="h-full flex items-center justify-center text-rose-500 text-sm bg-rose-50/50 rounded-xl border border-dashed border-rose-200">
            {errorMsg}
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            ไม่มีข้อมูลการใช้ไฟฟ้าในช่วงเวลานี้
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height - 16}>
            <AreaChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id={`wattGrad-${roomId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[viewRange.start, viewRange.end]}
                allowDataOverflow={true}
                tickCount={7}
                tickFormatter={(v) => (multiDay ? `${fmtDate(v)} ${fmtTime(v)}` : fmtTime(v))}
                tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="number"
                domain={[0, yMax]}
                allowDataOverflow={true}
                tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}w`}
                width={60}
              />
              <Tooltip
                labelFormatter={(v) => `${fmtDate(Number(v))} ${fmtTime(Number(v))} น.`}
                formatter={(v: any) => [`${Math.round(Number(v) || 0).toLocaleString()} W`, "กำลังไฟฟ้า"]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 12px rgb(0 0 0 / 0.08)",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              />

              {/* ไฮไลต์รอบคืนปัจจุบัน ถ้ามี focusStartMs/focusEndMs */}
              {focusStartMs &&
                focusEndMs &&
                focusEndMs > viewRange.start &&
                focusStartMs < viewRange.end && (
                  <ReferenceArea
                    x1={Math.max(focusStartMs, viewRange.start)}
                    x2={Math.min(focusEndMs, viewRange.end)}
                    fill="#3b82f6"
                    fillOpacity={0.07}
                    stroke="#3b82f6"
                    strokeOpacity={0.35}
                    strokeDasharray="4 2"
                    label={{
                      value: activeNightLabel || "ช่วงเวลาเข้าพัก",
                      position: "insideTop",
                      fontSize: 11,
                      fontWeight: 700,
                      fill: "#2563eb",
                    }}
                  />
                )}

              {/* พื้นที่ไฮไลต์สำหรับ Anomaly (สีแดง) หรือ ช่วงเข้าพัก (สีเขียว/น้ำเงิน) */}
              {visibleAreas.map((a, i) => {
                const isEmerald = a.color === "emerald";
                const isBlue = a.color === "blue";
                const fill = isEmerald ? "#10b981" : isBlue ? "#3b82f6" : "#ef4444";
                const textFill = isEmerald ? "#047857" : isBlue ? "#1d4ed8" : "#b91c1c";
                return (
                  <ReferenceArea
                    key={i}
                    x1={Math.max(a.start, viewRange.start)}
                    x2={Math.min(a.end, viewRange.end)}
                    fill={fill}
                    fillOpacity={isEmerald || isBlue ? 0.1 : 0.16}
                    stroke={fill}
                    strokeOpacity={0.45}
                    label={{
                      value: a.label,
                      position: "insideTop",
                      fontSize: 11,
                      fontWeight: 700,
                      fill: textFill,
                    }}
                  />
                );
              })}

              {/* เส้นแบ่งวัน 00:00:01 */}
              {dayLines.map((ms) => (
                <ReferenceLine
                  key={`day-${ms}`}
                  x={ms}
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  label={{
                    value: `00:00 (${fmtDate(ms)})`,
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

              <Area
                type="stepAfter"
                dataKey="watt"
                stroke="#2563eb"
                strokeWidth={2.2}
                fill={`url(#wattGrad-${roomId})`}
                dot={visibleLogs.length <= 24 ? { r: 2.5, fill: "#2563eb" } : false}
                activeDot={{ r: 5, fill: "#1d4ed8", stroke: "#dbeafe", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
