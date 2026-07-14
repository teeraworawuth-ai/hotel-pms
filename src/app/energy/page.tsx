"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  room_no: string;
  room_type: string;
  tuya_device_id: string | null;
  location: string | null;
  last_active_at: string | null;
  latest_wattage: number | null;
  sort_order: number;
};

export default function EnergyPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIoTData();
    const interval = setInterval(fetchIoTData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchIoTData() {
    setLoading(true);
    const { data: roomsData, error } = await supabase
      .from("rooms")
      .select("*")
      .not("tuya_device_id", "is", null)
      .neq("tuya_device_id", "");

    if (!error) {
      setRooms(roomsData || []);
    }
    setLoading(false);
  }

  const isOnline = (lastActive: string | null) => {
    if (!lastActive) return false;
    return (new Date().getTime() - new Date(lastActive).getTime()) <= 300000;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">ระบบติดตามค่าไฟฟ้า (Energy)</h1>
          <p className="text-slate-500 mt-1">ตรวจสอบสถานะอุปกรณ์และการใช้พลังงาน</p>
        </div>
        <button onClick={fetchIoTData} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50">
          รีเฟรชข้อมูล
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading && rooms.length === 0 ? (
          <div className="col-span-full text-center py-10 text-slate-500">กำลังโหลด...</div>
        ) : rooms.length === 0 ? (
          <div className="col-span-full text-center py-10 bg-white rounded-xl shadow-sm border text-slate-500">ยังไม่มีห้องพักใดติดตั้งระบบ IoT</div>
        ) : (
          rooms.map((room) => {
            const online = isOnline(room.last_active_at);
            const wattage = room.latest_wattage || 0;
            return (
              <div key={room.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className={"h-1.5 w-full " + (online ? "bg-emerald-500" : "bg-red-500")}></div>
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-2xl font-black text-slate-800">{room.room_no}</span>
                    {online ? (
                      <span className="bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-xs font-bold">ออนไลน์</span>
                    ) : (
                      <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold">ออฟไลน์</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-sm text-slate-500">โซนสถานที่</span>
                    <span className="text-sm font-bold text-slate-700">{room.location || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3">
                    <span className="text-sm text-slate-500">การใช้พลังงาน</span>
                    <span className={"text-xl font-black " + (online ? "text-indigo-600" : "text-slate-400")}>{online ? wattage : 0} W</span>
                  </div>
                </div>
                <div className="bg-slate-50 px-5 py-2 text-xs text-slate-400 text-center border-t">
                  อัปเดตล่าสุด: {room.last_active_at ? new Date(room.last_active_at).toLocaleTimeString("th-TH") : "ไม่เคย"}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
