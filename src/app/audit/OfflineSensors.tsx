"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function OfflineSensors() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, room_no, location, last_active_at, tuya_device_id, sort_order")
      .not("tuya_device_id", "is", null)
      .neq("tuya_device_id", "");

    if (rooms) {
      const now = new Date();
      const offlineRooms = rooms.filter(r => {
        if (!r.last_active_at) return true;
        const diffMins = (now.getTime() - new Date(r.last_active_at).getTime()) / 60000;
        return diffMins > 15;
      });

      offlineRooms.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setData(offlineRooms);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading && data.length === 0) return <div className="py-10 text-center text-slate-500">กำลังตรวจสอบสถานะอุปกรณ์...</div>;

  if (data.length === 0) return (
    <div className="py-20 text-center bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
      <div className="text-4xl mb-3">🟢</div>
      <h3 className="text-lg font-bold text-slate-700">อุปกรณ์ออนไลน์ครบทุกห้อง</h3>
      <p className="text-slate-500 text-sm mt-1">ไม่มีเซ็นเซอร์ตัวไหนขาดการเชื่อมต่อ</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {data.map(room => (
        <div key={room.id} className="bg-white rounded-2xl shadow-sm border-slate-200 overflow-hidden flex flex-col h-full border">
          <div className="bg-slate-100 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl font-black text-slate-800">{room.room_no}</span>
                {room.location && <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{room.location}</span>}
              </div>
            </div>
            <div className="bg-slate-500 text-white p-2 rounded-xl shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"></path></svg>
            </div>
          </div>
          <div className="p-5 flex-1 flex items-center justify-between">
            <span className="text-slate-600 font-bold text-sm bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">ออฟไลน์</span>
            <div className="text-right">
              <div className="text-xs text-slate-400 mb-0.5">ออนไลน์ล่าสุด</div>
              <div className="text-sm font-bold text-slate-700">
                {room.last_active_at ? new Date(room.last_active_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : "ไม่เคยออนไลน์"}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
