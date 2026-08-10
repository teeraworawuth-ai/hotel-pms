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

interface GraphModalProps {
  booking: any;
  onClose: () => void;
}

export default function GraphModal({ booking, onClose }: GraphModalProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [booking]);

  const fetchData = async () => {
    setLoading(true);
    const { data: logs } = await supabase
      .from("energy_logs")
      .select("wattage, recorded_at")
      .eq("room_id", booking.roomId)
      .gte("recorded_at", booking.checkIn.toISOString())
      .lte("recorded_at", booking.effectiveCheckOut.toISOString())
      .order("recorded_at", { ascending: true });

    if (logs) {
      const formatted = logs.map(l => {
        const d = new Date(l.recorded_at);
        return {
          time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
          fullTime: d.getTime(),
          watt: Number(l.wattage) || 0
        };
      });
      setData(formatted);
    }
    setLoading(false);
  };

  const startMs = booking.checkIn.getTime();
  const endMs = booking.effectiveCheckOut.getTime();
  
  // สร้าง ticks คร่าวๆ ทุกๆ 1 หรือ 2 ชั่วโมงตามความยาว
  const durationHours = (endMs - startMs) / 3600000;
  const tickInterval = durationHours > 12 ? 2 : 1; // ถ้าเกิน 12 ชม. ให้ขีดทุก 2 ชม.
  const ticks = [];
  let currentTick = new Date(startMs);
  currentTick.setMinutes(0, 0, 0); // ปัดลงเป็นชั่วโมงถ้วน
  if (currentTick.getTime() < startMs) {
    currentTick.setHours(currentTick.getHours() + 1);
  }
  
  while (currentTick.getTime() <= endMs) {
    ticks.push(currentTick.getTime());
    currentTick.setHours(currentTick.getHours() + tickInterval);
  }

  const maxWatt = Math.max(...data.map(d => d.watt), 100);
  const yAxisMax = Math.ceil(maxWatt / 200) * 200 + 200;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[80vh] animate-in zoom-in-95 duration-200">
        
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-800">
              วิเคราะห์การใช้ไฟฟ้า: ห้อง {booking.roomNo}
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-1">
              ผู้เข้าพัก: {booking.guestName}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="flex-1 p-6 flex flex-col min-h-0 bg-white">
          <div className="flex justify-between items-center mb-4 px-2">
            <div className="text-sm font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              IN: {booking.checkIn.toLocaleTimeString('th-TH')}
            </div>
            <div className="text-xs text-slate-400 font-medium">ขอบเขตเวลา Check-in ถึง Check-out</div>
            <div className="text-sm font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              OUT: {booking.checkOut > new Date() ? 'กำลังพักอยู่' : booking.checkOut.toLocaleTimeString('th-TH')}
            </div>
          </div>

          <div className="flex-1 w-full bg-slate-50/50 rounded-2xl border border-slate-100 p-4">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center text-slate-400">กำลังโหลดกราฟ...</div>
            ) : data.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-slate-400">ไม่มีข้อมูลในช่วงเวลานี้</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="fullTime"
                    type="number"
                    domain={[startMs, endMs]}
                    ticks={ticks}
                    tickFormatter={(val) => new Date(val).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    type="number"
                    domain={[0, yAxisMax]}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}w`}
                    width={65}
                  />
                  <Tooltip 
                    labelFormatter={(label) => new Date(label).toLocaleTimeString('th-TH')}
                    formatter={(value: any) => [`${value} W`, 'การใช้ไฟ']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line 
                    type="stepAfter" 
                    dataKey="watt" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#2563eb', stroke: '#bfdbfe', strokeWidth: 3 }}
                    animationDuration={1000}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
