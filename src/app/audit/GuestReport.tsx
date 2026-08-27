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
    try {
      setLoading(true);
      const res = await fetch(`/api/audit/guests?dateOffset=${dateOffset}`);
      if (!res.ok) {
        console.error("Failed to fetch guest report");
        return;
      }
      const json = await res.json();
      
      const parsedData = (json.processed || []).map((item: any) => ({
        ...item,
        checkIn: new Date(item.checkIn),
        checkOut: new Date(item.checkOut),
        effectiveCheckOut: new Date(item.effectiveCheckOut)
      }));
      
      setData(parsedData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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

