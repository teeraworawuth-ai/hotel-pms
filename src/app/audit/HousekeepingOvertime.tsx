"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const LIMIT_MINS = 15;

interface Props {
  dateOffset: number;
}

// แม่บ้านทำความสะอาดห้องเกิน 15 นาที (หรือยังค้างสถานะ "กำลังทำ" เกิน 15 นาที)
export default function HousekeepingOvertime({ dateOffset }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() + dateOffset);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const { data, error } = await supabase
          .from("housekeeping_logs")
          .select("*")
          .gte("started_at", start.toISOString())
          .lt("started_at", end.toISOString())
          .neq("status", "cancelled")
          .order("started_at", { ascending: false });
        if (error) { setRows([]); return; }
        const now = Date.now();
        const over = (data || []).map((r: any) => {
          const s = new Date(r.started_at).getTime();
          const e = r.finished_at ? new Date(r.finished_at).getTime() : now;
          return { ...r, mins: Math.round((e - s) / 60000), ongoing: !r.finished_at };
        }).filter((r: any) => r.mins > LIMIT_MINS);
        setRows(over);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateOffset]);

  if (loading || rows.length === 0) return null;

  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mb-6 bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
      <div className="bg-amber-50 px-4 py-2 border-b border-amber-200 text-sm font-bold text-amber-800">
        🧹 แม่บ้านทำความสะอาดเกิน {LIMIT_MINS} นาที ({rows.length} รายการ)
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map(r => (
          <div key={r.id} className="px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-black text-slate-800">{r.room_no}</span>
            {r.location && <span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{r.location}</span>}
            <span className="text-slate-500">{fmt(r.started_at)} - {r.ongoing ? "ยังไม่กดเสร็จ" : fmt(r.finished_at)}</span>
            <span className="font-bold text-red-600">{r.mins} นาที</span>
            {r.note && <span className="text-slate-500 text-xs">📝 {r.note}</span>}
            {(r.photo_urls || []).map((u: string) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="text-blue-600 text-xs underline">📷 รูป</a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
