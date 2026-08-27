"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AnomalyReviewModal from "./AnomalyReviewModal";

interface AnomalyReportProps {
  dateOffset: number;
}

export default function AnomalyReport({ dateOffset }: AnomalyReportProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState<any | null>(null);

  useEffect(() => {
    fetchData();
  }, [dateOffset]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/audit/anomalies?dateOffset=${dateOffset}`);
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

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {data.map(room => {
          // คำนวณเวลาที่สูญเปล่าและค่าไฟทั้งหมดในห้องนี้
          const totalWastedMins = room.sessions.reduce((acc: number, s: any) => acc + s.durationMins, 0);
          const totalCost = room.sessions.reduce((acc: number, s: any) => acc + Number(s.estimatedCost), 0).toFixed(2);
          
          const hours = Math.floor(totalWastedMins / 60);
          const mins = totalWastedMins % 60;
          const totalStr = hours > 0 ? `${hours} ชม. ${mins} นาที` : `${mins} นาที`;

          return (
            <div key={room.roomId} className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden flex flex-col h-full">
              <div className="bg-red-50 px-3 py-2 border-b border-red-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-lg font-black text-red-900">{room.roomNo}</span>
                    {room.location && <span className="bg-red-200/50 text-red-700 px-1.5 py-0.5 rounded text-[9px] font-bold">{room.location}</span>}
                  </div>
                  <p className="text-[11px] text-red-700 font-medium">สูญเสีย: <span className="font-bold">{totalStr}</span> (ประมาณ <span className="font-bold">{totalCost}฿</span>)</p>
                </div>
                <div className="bg-red-500 text-white p-1.5 rounded-lg shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
              </div>

              <div className="p-3 flex-1 bg-slate-50/30">
                <div className="space-y-2.5">
                  {room.sessions.map((session: any) => (
                    <div key={session.id} className={`p-2.5 rounded-lg border ${session.isOngoing ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-100'}`}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[11px] font-bold text-slate-700">รอบที่ {session.id}</span>
                        {session.isOngoing ? (
                          <span className="text-[9px] font-bold bg-rose-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">กำลังเปิดอยู่</span>
                        ) : (
                          <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">จบแล้ว</span>
                        )}
                      </div>
                      
                      <div className="flex justify-between items-end mb-2">
                        <div className="text-[10px] text-slate-500">
                          {session.startTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} 
                          {" - "}
                          {session.isOngoing ? 'ปัจจุบัน' : session.endTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          <div className="mt-0.5 font-medium text-slate-700">ใช้เวลา: {session.durationMins} นาที</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-400 mb-0.5">ไฟเฉลี่ย / <span className="text-blue-500 font-bold">หน่วย</span> / <span className="text-rose-500 font-bold">สูญเสีย</span></div>
                          <div className="text-sm font-black text-slate-700 mt-1">
                            {session.avgW}<span className="text-[9px] text-slate-400 ml-0.5 mr-1.5">W</span>
                            <span className="text-blue-600">{session.kwhStr}</span><span className="text-[9px] text-blue-400 ml-0.5 mr-1.5">kWh</span>
                            <span className="text-rose-600">{session.estimatedCost}</span><span className="text-[9px] text-rose-400 ml-0.5">฿</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedReview({ room, session })}
                        className="w-full mt-1.5 py-1.5 text-[11px] font-bold bg-white border border-slate-200 text-slate-600 rounded-md hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        🔍 ตรวจสอบ/ระบุสาเหตุ
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedReview && (
        <AnomalyReviewModal
          room={selectedReview.room}
          session={selectedReview.session}
          onClose={() => setSelectedReview(null)}
          onSuccess={() => {
            setSelectedReview(null);
            fetchData(); // โหลดข้อมูลใหม่เพื่อให้รายการที่ตรวจสอบแล้วหายไป
          }}
        />
      )}
    </>
  );
}
