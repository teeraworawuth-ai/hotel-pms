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
    setLoading(true);
    
    // ดึง Location Order
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .single();
    
    let locationsOrder: string[] = [];
    if (settingsData && settingsData.value) {
      locationsOrder = settingsData.value as string[];
    }

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dateOffset);
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
    
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);
    const now = new Date();

    const { data: roomsData } = await supabase.from("rooms").select("id, room_no, location, sort_order");

    const { data: bookingsData } = await supabase
      .from("bookings")
      .select("room_id, check_in_time, check_out_time")
      .lte("check_in_time", endOfDay.toISOString())
      .gte("check_out_time", startOfDay.toISOString())
      .neq("status", "cancelled");

    let energyData = [];
    let from = 0;
    const limit = 1000;
    while (true) {
      const { data } = await supabase
        .from("energy_logs")
        .select("room_id, wattage, recorded_at")
        .gte("recorded_at", startOfDay.toISOString())
        .lte("recorded_at", endOfDay.toISOString())
        .order("recorded_at", { ascending: true })
        .range(from, from + limit - 1);
        
      if (data) {
        energyData = energyData.concat(data);
        if (data.length < limit) break;
      } else {
        break;
      }
      from += limit;
    }    const { data: reviewsData } = await supabase
      .from("anomaly_reviews")
      .select("room_id, session_start_time")
      .gte("session_start_time", startOfDay.toISOString())
      .lte("session_start_time", endOfDay.toISOString());

    if (roomsData && energyData) {
      const anomalies = roomsData.map((room) => {
        // ดึงการจองของห้องนี้
        const roomBookings = (bookingsData || []).filter(b => b.room_id === room.id).map(b => {
          const out = new Date(b.check_out_time);
          return {
            in: new Date(b.check_in_time),
            out: out > now ? now : out // ถ้ายังไม่ checkout ถือว่าครอบคลุมถึงปัจจุบัน
          };
        });

        // ดึง log เฉพาะของห้องนี้
        const roomLogs = energyData.filter(l => l.room_id === room.id);

        // คัดเฉพาะ log ที่อยู่นอกเวลาจอง
        const outsideLogs = roomLogs.filter(log => {
          const t = new Date(log.recorded_at);
          // เช็คว่า t ทับซ้อนกับการจองไหนบ้างไหม
          const isInBooking = roomBookings.some(b => t >= b.in && t <= b.out);
          return !isInBooking;
        });

        // จัดกลุ่มเป็น Sessions
        const sessions: any[] = [];
        let currentSession: any = null;

        for (const log of outsideLogs) {
          const t = new Date(log.recorded_at);
          const w = log.wattage || 0;

          if (w > 0) {
            if (!currentSession) {
              currentSession = { startTime: t, lastTime: t, wattages: [w], logs: [{t, w}] };
            } else {
              // เช็คเวลาห่าง ถ้าเกิน 15 นาที ถือว่าเป็นรอบใหม่
              const diffMins = (t.getTime() - currentSession.lastTime.getTime()) / 60000;
              if (diffMins > 15) {
                sessions.push(currentSession);
                currentSession = { startTime: t, lastTime: t, wattages: [w], logs: [{t, w}] };
              } else {
                currentSession.lastTime = t;
                currentSession.wattages.push(w);
                currentSession.logs.push({t, w});
              }
            }
          } else {
            // ถ้า w == 0 ปิด session
            if (currentSession) {
              sessions.push(currentSession);
              currentSession = null;
            }
          }
        }
        if (currentSession) sessions.push(currentSession);

        // คำนวณ duration และคัดกรองเฉพาะ session ที่นานเกิน 20 นาที และยังไม่ได้รีวิว
        const filteredSessions = sessions.map((s, index) => {
          let endTime = s.lastTime;
          let isOngoing = false;

          // เช็คว่าไฟยังคงเปิดอยู่หรือไม่ (ถ้า log สุดท้ายห่างจากปัจจุบันไม่เกิน 10 นาที)
          if (dateOffset === 0) {
            const timeSinceLastLog = (now.getTime() - s.lastTime.getTime()) / 60000;
            if (timeSinceLastLog <= 10) {
              endTime = now;
              isOngoing = true;
            }
          }

          const durationMins = (endTime.getTime() - s.startTime.getTime()) / 60000;
          const avgW = Math.round(s.wattages.reduce((a: number, b: number) => a + b, 0) / s.wattages.length);

          let kwh = 0;
          if (s.logs && s.logs.length > 1) {
            for (let i = 1; i < s.logs.length; i++) {
              const prev = s.logs[i - 1];
              const curr = s.logs[i];
              const diffHours = (curr.t.getTime() - prev.t.getTime()) / 3600000;
              const avgW_interval = (prev.w + curr.w) / 2; // คำนวณแบบพื้นที่ใต้กราฟ (Trapezoidal rule)
              kwh += (avgW_interval * diffHours) / 1000;
            }
          }

          if (isOngoing && s.logs && s.logs.length > 0) {
            const lastLog = s.logs[s.logs.length - 1];
            const diffHours = (now.getTime() - lastLog.t.getTime()) / 3600000;
            kwh += (lastLog.w * diffHours) / 1000;
          }

          // Fallback กรณีมีจุดเดียวแล้วจบเลย (ถึงแม้ปกติจะไม่ถึง 20 นาทีก็ตาม)
          if (kwh === 0 && durationMins > 0) {
             const durationHours = durationMins / 60;
             kwh = (avgW * durationHours) / 1000;
          }

          const estimatedCost = kwh * 5; // 5 THB per unit (approximate for 3-star hotel)

          return {
            id: index + 1,
            startTime: s.startTime,
            endTime,
            durationMins: Math.round(durationMins),
            avgW,
            kwhStr: kwh > 0.001 ? kwh.toFixed(3) : "0.001",
            estimatedCost: estimatedCost > 0.01 ? estimatedCost.toFixed(2) : "0.01",
            isOngoing
          };
        }).filter(s => {
          if (s.durationMins < 20) return false;
          // ตรวจสอบว่า session นี้ถูกรีวิวไปแล้วหรือยัง โดยเทียบเวลาเริ่ม (ยอมให้คลาดเคลื่อนได้ 1 นาที)
          const isReviewed = (reviewsData || []).some(r => 
            r.room_id === room.id && 
            Math.abs(new Date(r.session_start_time).getTime() - s.startTime.getTime()) < 60000
          );
          return !isReviewed;
        });

        if (filteredSessions.length === 0) return null;

        return {
          roomId: room.id,
          roomNo: room.room_no,
          location: room.location,
          sortOrder: room.sort_order || 0,
          sessions: filteredSessions
        };
      }).filter(Boolean);

      anomalies.sort((a: any, b: any) => {
        let indexA = locationsOrder.indexOf(a.location);
        let indexB = locationsOrder.indexOf(b.location);
        if (indexA === -1) indexA = 999;
        if (indexB === -1) indexB = 999;
        if (indexA !== indexB) return indexA - indexB;
        return a.sortOrder - b.sortOrder;
      });
      setData(anomalies);
    }
    setLoading(false);
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
