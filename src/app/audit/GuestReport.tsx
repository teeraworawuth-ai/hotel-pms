"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip
} from "recharts";

interface GuestReportProps {
  dateOffset: number;
}

export default function GuestReport({ dateOffset }: GuestReportProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [dateOffset]);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. คำนวณช่วงเวลาของวันที่เลือก
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dateOffset);
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
    
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);
    const now = new Date();

    // 2. ดึงข้อมูลการจองที่ทับซ้อนกับวันนี้
    const { data: bookingsData } = await supabase
      .from("bookings")
      .select(`
        id, room_id, guest_name, check_in_time, check_out_time, status,
        rooms ( room_no, location, sort_order )
      `)
      .lte("check_in_time", endOfDay.toISOString())
      .gte("check_out_time", startOfDay.toISOString())
      .neq("status", "cancelled");

    // 3. ดึงข้อมูลไฟของทุกห้องในวันนี้
    const { data: energyData } = await supabase
      .from("energy_logs")
      .select("room_id, wattage, recorded_at")
      .gte("recorded_at", startOfDay.toISOString())
      .lte("recorded_at", endOfDay.toISOString())
      .order("recorded_at", { ascending: true }); // เพิ่มการเรียงลำดับเวลาให้กราฟแสดงถูกต้อง

    if (bookingsData && energyData) {
      const processed = bookingsData.map((b: any) => {
        const room = b.rooms;
        const checkIn = new Date(b.check_in_time);
        const checkOut = new Date(b.check_out_time);
        
        // เวลา Check-out จริงที่จะใช้คำนวณ (ถ้ายังไม่ถึงเวลาออก ให้ใช้เวลาปัจจุบัน)
        const effectiveCheckOut = checkOut > now ? now : checkOut;
        // ถ้าเช็คอินในอนาคต (ยังไม่เกิด) ข้ามการคำนวณ
        if (checkIn > now) return null;

        // ดึง log เฉพาะห้องนี้ และอยู่ในช่วงเวลาที่พัก
        const logs = energyData.filter(log => {
          if (log.room_id !== b.room_id) return false;
          const logTime = new Date(log.recorded_at);
          return logTime >= checkIn && logTime <= effectiveCheckOut;
        });

        // จัดเตรียมข้อมูลสำหรับกราฟ
        const chartData = logs.map(l => {
          const d = new Date(l.recorded_at);
          return {
            time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
            fullTime: d.getTime(),
            watt: Number(l.wattage) || 0
          };
        });

        const startMs = checkIn.getTime();
        const endMs = effectiveCheckOut.getTime();
        
        const maxWatt = Math.max(...chartData.map(d => d.watt), 100);
        const yAxisMax = Math.ceil(maxWatt / 200) * 200 + 200;

        // คัดเฉพาะ log ที่มีการใช้ไฟ (> 0)
        const activeLogs = logs.filter(l => l.wattage > 0);
        const wattages = activeLogs.map(l => Number(l.wattage)).sort((x, y) => x - y);

        let avg = 0, min10 = 0, max10 = 0, percent = 0;

        if (wattages.length > 0) {
          avg = wattages.reduce((sum, w) => sum + w, 0) / wattages.length;
          
          const lowest10 = wattages.slice(0, 10);
          min10 = lowest10.reduce((sum, w) => sum + w, 0) / lowest10.length;

          const highest10 = wattages.slice(-10);
          max10 = highest10.reduce((sum, w) => sum + w, 0) / highest10.length;

          // คำนวณ % การใช้ไฟ
          const durationMins = (effectiveCheckOut.getTime() - checkIn.getTime()) / 60000;
          if (durationMins > 0) {
            // สมมติฐาน 1 log = 1 นาที (โดยประมาณ)
            percent = (activeLogs.length / durationMins) * 100;
            if (percent > 100) percent = 100;
          }
        }

        return {
          bookingId: b.id,
          roomId: b.room_id,
          roomNo: room.room_no,
          location: room.location,
          guestName: b.guest_name,
          checkIn,
          checkOut,
          effectiveCheckOut,
          avg: Math.round(avg),
          min10: Math.round(min10),
          max10: Math.round(max10),
          percent: Math.round(percent),
          sortOrder: room.sort_order || 0,
          chartData,
          startMs,
          endMs,
          yAxisMax
        };
      }).filter(Boolean); // ลบ null ทิ้ง

      // จัดเรียงตาม location_order
      processed.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      setData(processed);
    }
    setLoading(false);
  };

  if (loading) return <div className="py-10 text-center text-slate-500">กำลังประมวลผลข้อมูล...</div>;

  if (data.length === 0) return (
    <div className="py-20 text-center bg-white rounded-xl shadow-sm border border-slate-200">
      <h3 className="text-lg font-bold text-slate-700">ไม่มีประวัติผู้เข้าพักในวันนี้</h3>
    </div>
  );

  return (
    <div className="space-y-6">
      {data.map(item => (
        <div key={item.bookingId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* ข้อมูลสรุปด้านบน */}
          <div className="p-5 flex flex-col md:flex-row gap-6 items-center border-b border-slate-100 bg-slate-50/50">
            <div className="flex-1 w-full flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl font-black text-slate-800">{item.roomNo}</span>
                {item.location && <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">{item.location}</span>}
              </div>
              <div className="text-sm font-medium text-slate-600 mb-3">{item.guestName}</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 bg-white border border-slate-200 p-2 rounded-lg">
                <div><span className="font-bold">IN:</span> {item.checkIn.toLocaleTimeString('th-TH')}</div>
                <div><span className="font-bold">OUT:</span> {item.checkOut > new Date() ? 'กำลังพักอยู่' : item.checkOut.toLocaleTimeString('th-TH')}</div>
              </div>
            </div>

            <div className="flex-[2] w-full grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-center">
                <div className="text-xs text-blue-600 font-bold mb-1">เฉลี่ยใช้งานจริง</div>
                <div className="text-xl font-black text-blue-700">{item.avg} <span className="text-xs">W</span></div>
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-center">
                <div className="text-xs text-emerald-600 font-bold mb-1">ต่ำสุด (เฉลี่ย 10)</div>
                <div className="text-xl font-black text-emerald-700">{item.min10} <span className="text-xs">W</span></div>
              </div>
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-100 text-center">
                <div className="text-xs text-rose-600 font-bold mb-1">สูงสุด (เฉลี่ย 10)</div>
                <div className="text-xl font-black text-rose-700">{item.max10} <span className="text-xs">W</span></div>
              </div>
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-center">
                <div className="text-xs text-amber-600 font-bold mb-1">% การใช้งาน</div>
                <div className="text-xl font-black text-amber-700">{item.percent}%</div>
              </div>
            </div>
          </div>

          {/* กราฟด้านล่าง */}
          <div className="p-4 pt-6 bg-white w-full h-[250px]">
            {item.chartData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm font-medium bg-slate-50 rounded-xl border border-dashed border-slate-200">
                ไม่มีข้อมูลในช่วงเวลานี้
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={item.chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="fullTime"
                    type="number"
                    domain={[item.startMs, item.endMs]}
                    tickCount={6}
                    tickFormatter={(val) => new Date(val).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    type="number"
                    domain={[0, item.yAxisMax]}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}w`}
                    width={60}
                  />
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
      ))}
    </div>
  );
}

