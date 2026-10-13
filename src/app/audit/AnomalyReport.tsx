"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AnomalyReviewModal from "./AnomalyReviewModal";
import EnergyRangeChart from "./EnergyRangeChart";
import { businessWindow } from "@/lib/stayWindow";

interface AnomalyReportProps {
  dateOffset: number;
}

const fmtTime = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

export default function AnomalyReport({ dateOffset }: AnomalyReportProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState<any | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [allLocations, setAllLocations] = useState<string[]>([]);

  useEffect(() => {
    const loadLocations = async () => {
      const { data: rooms } = await supabase.from("rooms").select("location");
      const { data: ord } = await supabase.from("system_settings").select("value").eq("key", "locations_order").maybeSingle();
      const order: string[] = (ord?.value as string[]) || [];
      const locs = Array.from(new Set((rooms || []).map((r: any) => r.location).filter(Boolean))) as string[];
      locs.sort((a, b) => {
        let ia = order.indexOf(a); if (ia === -1) ia = 999;
        let ib = order.indexOf(b); if (ib === -1) ib = 999;
        return ia - ib;
      });
      setAllLocations(locs);
    };
    loadLocations();
  }, []);

  useEffect(() => {
    fetchData();
  }, [dateOffset]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/audit/anomalies?dateOffset=${dateOffset}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      if (!res.ok) {
        console.error("Failed to fetch anomalies");
        return;
      }
      const json = await res.json();
      
      const parsedAnomalies = (json.anomalies || []).map((anomaly: any) => ({
        ...anomaly,
        sessions: anomaly.sessions.map((s: any) => ({
          ...s,
          startTime: new Date(s.startTime),
          endTime: new Date(s.endTime)
        }))
      }));
      
      setData(parsedAnomalies);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-slate-500">กำลังประมวลผลข้อมูล...</div>;

  if (data.length === 0) return (
    <div className="py-20 text-center bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
      <div className="text-4xl mb-3">🎉</div>
      <h3 className="text-lg font-bold text-slate-700">ไม่พบความผิดปกติที่รอตรวจสอบ</h3>
      <p className="text-slate-500 text-sm mt-1">ไม่มีการเปิดใช้ไฟฟ้าเกินเวลา หรือ ตรวจสอบครบหมดแล้ว</p>
    </div>
  );

  const selectedRoom = selectedRoomId ? data.find(r => r.roomId === selectedRoomId) : null;
  const win = businessWindow(dateOffset);

  return (
    <>
      {/* ตัวกรองสถานที่ เหมือนหน้า Check-in */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilter(null)}
          className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${filter === null ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          ทั้งหมด
        </button>
        {allLocations.map((loc: any) => (
          <button
            key={loc}
            onClick={() => setFilter(loc)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${filter === loc ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {loc}
          </button>
        ))}
      </div>

      {/* การ์ดขนาดเท่าการ์ดหน้า Check-in */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1.5 sm:gap-2 lg:gap-2.5">
        {data.filter(r => !filter || r.location === filter).map(room => {
          const totalWastedMins = room.sessions.reduce((acc: number, s: any) => acc + s.durationMins, 0);
          const totalCost = room.sessions.reduce((acc: number, s: any) => acc + Number(s.estimatedCost), 0).toFixed(0);
          const hours = Math.floor(totalWastedMins / 60);
          const mins = totalWastedMins % 60;
          const totalStr = hours > 0 ? `${hours}ชม.${mins}น.` : `${mins}น.`;
          const hasOngoing = room.sessions.some((s: any) => s.isOngoing);

          return (
            <button
              key={room.roomId}
              onClick={() => setSelectedRoomId(room.roomId)}
              className="relative aspect-[16/14] w-full flex flex-col items-center justify-start rounded-xl border-2 transition-all active:scale-95 overflow-hidden bg-red-50 border-red-300 text-red-800 hover:bg-red-100 hover:border-red-400 shadow-sm"
            >
              <div className="pt-[1px] sm:pt-1 flex items-center justify-center gap-0.5">
                <span className="text-[15px] sm:text-xl font-black text-red-900 leading-none">{room.roomNo}</span>
                {hasOngoing && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>}
              </div>
              {room.location && <span className="text-[7px] sm:text-[9px] font-bold text-red-700/70 leading-none mt-[2px] truncate max-w-full px-0.5">{room.location}</span>}
              <div className="mt-[2px] text-[8px] sm:text-[10px] font-bold text-red-700 leading-tight text-center">
                <div>{room.sessions.length} รอบ</div>
                <div>{totalStr}</div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-[14px] sm:h-[18px] flex items-center justify-center text-[8px] sm:text-[10px] font-black text-rose-600 bg-white/60 border-t border-red-200">
                ⚡ {totalCost}฿
              </div>
            </button>
          );
        })}
      </div>

      {/* กราฟไฟฟ้า + รายการรอบที่ผิดปกติ */}
      {selectedRoom && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={() => setSelectedRoomId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-red-900">{selectedRoom.roomNo}</span>
                {selectedRoom.location && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">{selectedRoom.location}</span>}
                <span className="text-sm text-slate-500">ใช้ไฟนอกช่วงเช็คอิน-เช็คเอาท์ {selectedRoom.sessions.length} รอบ</span>
              </div>
              <button onClick={() => setSelectedRoomId(null)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>

            <EnergyRangeChart
              roomId={selectedRoom.roomId}
              startMs={win.start.getTime()}
              endMs={win.end.getTime()}
              areas={selectedRoom.sessions.map((s: any) => ({
                start: s.startTime.getTime(),
                end: s.endTime.getTime(),
                label: `รอบ ${s.id}`,
              }))}
            />

            <div className="mt-4 space-y-2">
              {selectedRoom.sessions.map((session: any) => (
                <div key={session.id} className={`p-3 rounded-lg border flex flex-wrap items-center gap-x-4 gap-y-1 ${session.isOngoing ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                  <span className="font-black text-red-700 text-sm">รอบที่ {session.id}</span>
                  {session.isOngoing && <span className="text-[10px] font-bold bg-rose-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">กำลังเปิดอยู่</span>}
                  <span className="text-xs text-slate-600">
                    {fmtTime(session.startTime)} - {session.isOngoing ? 'ปัจจุบัน' : fmtTime(session.endTime)}
                  </span>
                  <span className="text-xs font-bold text-slate-700">{session.durationMins} นาที</span>
                  <span className="text-xs text-slate-600">เฉลี่ย {session.avgW} W</span>
                  <span className="text-xs text-blue-600 font-bold">{session.kwhStr} kWh</span>
                  <span className="text-xs text-rose-600 font-bold">{session.estimatedCost} ฿</span>
                  <button
                    onClick={() => setSelectedReview({ room: selectedRoom, session })}
                    className="ml-auto px-3 py-1.5 text-[11px] font-bold bg-white border border-slate-200 text-slate-600 rounded-md hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    🔍 ตรวจสอบ/ระบุสาเหตุ
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedReview && (
        <AnomalyReviewModal
          room={selectedReview.room}
          session={selectedReview.session}
          onClose={() => setSelectedReview(null)}
          onSuccess={() => {
            const reviewedRoomId = selectedReview.room.roomId;
            const reviewedSessionId = selectedReview.session.id;
            
            setData(prev => {
              const newData = prev.map(r => {
                if (r.roomId === reviewedRoomId) {
                  return {
                    ...r,
                    sessions: r.sessions.filter((s: any) => s.id !== reviewedSessionId)
                  };
                }
                return r;
              }).filter(r => r.sessions.length > 0);
              if (!newData.some(r => r.roomId === reviewedRoomId)) setSelectedRoomId(null);
              return newData;
            });
            
            setSelectedReview(null);
          }}
        />
      )}
    </>
  );
}
