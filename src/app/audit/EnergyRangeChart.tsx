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
  areas?: ChartArea[]; // ช่วงที่ต้องการไฮไลต์ (เช่น รอบที่ผิดปกติ)
  height?: number;
}

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };

// กราฟไฟฟ้าแบบหน้า Energy ของห้องหนึ่งในช่วงเวลาที่กำหนด + เส้นแบ่งวันที่ 00:00:01
export default function EnergyRangeChart({ roomId, startMs, endMs, areas = [], height = 320 }: Props) {
  const [logs, setLogs] = useState<{ t: number; watt: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const effectiveEnd = Math.min(endMs, Date.now());

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
          .gte("recorded_at", new Date(startMs).toISOString())
          .lte("recorded_at", new Date(effectiveEnd).toISOString())
          .order("recorded_at", { ascending: true })
          .range(from, from + limit - 1);
        if (!data) break;
        all = all.concat(data.map((l: any) => ({ t: new Date(l.recorded_at).getTime(), watt: Number(l.wattage) || 0 })));
        if (data.length < limit) break;
        from += limit;
      }
      if (!cancelled) { setLogs(all); setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [roomId, startMs, effectiveEnd]);

  // เส้นแบ่งวัน: 00:00:01 ของทุกวันที่อยู่ในช่วงกราฟ
  const dayLines = useMemo(() => {
    const out: number[] = [];
    const d = new Date(startMs);
    d.setHours(24, 0, 1, 0);
    while (d.getTime() < effectiveEnd) {
      out.push(d.getTime());
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [startMs, effectiveEnd]);

  const multiDay = dayLines.length > 0;
  const maxWatt = Math.max(...logs.map(l => l.watt), 100);
  const yMax = Math.ceil(maxWatt / 200) * 200 + 200;
  const avg = logs.filter(l => l.watt > 0).length
    ? Math.round(logs.filter(l => l.watt > 0).reduce((s, l) => s + l.watt, 0) / logs.filter(l => l.watt > 0).length)
    : 0;

  return (
    <div>
      <div className="flex gap-3 text-xs mb-2 flex-wrap">
        <span className="bg-blue-50 text-blue-700 font-bold px-2 py-1 rounded">เฉลี่ยตอนใช้งาน {avg} W</span>
        <span className="bg-rose-50 text-rose-700 font-bold px-2 py-1 rounded">สูงสุด {Math.round(maxWatt === 100 && logs.length === 0 ? 0 : maxWatt)} W</span>
        <span className="text-slate-400 py-1">{fmtDate(startMs)} {fmtTime(startMs)} - {fmtDate(effectiveEnd)} {fmtTime(effectiveEnd)}</span>
      </div>
      <div style={{ height }} className="w-full">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">กำลังโหลดกราฟ...</div>
        ) : logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            ไม่มีข้อมูลในช่วงเวลานี้
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={logs} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[startMs, effectiveEnd]}
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
              {areas.map((a, i) => (
                <ReferenceArea
                  key={i}
                  x1={Math.max(a.start, startMs)}
                  x2={Math.min(a.end, effectiveEnd)}
                  fill="#ef4444"
                  fillOpacity={0.15}
                  stroke="#ef4444"
                  strokeOpacity={0.4}
                  label={{ value: a.label, position: "insideTop", fontSize: 11, fontWeight: 700, fill: "#b91c1c" }}
                />
              ))}
              {dayLines.map(ms => (
                <ReferenceLine
                  key={ms}
                  x={ms}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{ value: `วันที่ ${fmtDate(ms)}`, position: "insideTopRight", fontSize: 11, fontWeight: 700, fill: "#b45309" }}
                />
              ))}
              <Line type="stepAfter" dataKey="watt" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
