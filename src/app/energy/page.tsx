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
    // ตั้งเวลาให้รีเฟรชข้อมูลหน้าจอทุกๆ 30 วินาที
    const interval = setInterval(fetchIoTData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchIoTData() {
    setLoading(true);
    
    // ดึงการตั้งค่า Location Order เพื่อจัดเรียง
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .single();

    // ดึงเฉพาะห้องที่มีระบบ IoT
    const { data: roomsData, error } = await supabase
      .from("rooms")
      .select("*")
      .not("tuya_device_id", "is", null)
      .neq("tuya_device_id", "");

    if (error) {
      console.error("Error fetching IoT rooms:", error);
    } else {
      // แก้ไข Type Error ตรงนี้ให้ Vercel แล้วครับ
      let fetchedRooms = (roomsData as Room[]) || [];
      
      // จัดเรียง
      if (settingsData && settingsData.value) {
        const locationsOrder = settingsData.value as string[];
        fetchedRooms.sort((a, b) => {
          const locA = a.location || "ไม่มีสถานที่";
          const locB = b.location || "ไม่มีสถานที่";
          let indexA = locationsOrder.indexOf(locA);
          let indexB = locationsOrder.indexOf(locB);
          if (indexA === -1) indexA = 999;
          if (indexB === -1) indexB = 999;
          if (indexA !== indexB) return indexA - indexB;
          return (a.sort_order || 0) - (b.sort_order || 0);
        });
      } else {
        fetchedRooms.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      }
      
      setRooms(fetchedRooms);
    }
    setLoading(false);
  }

  // ฟังก์ชันเช็คสถานะออฟไลน์ (เกิน 5 นาที)
  const isOnline = (lastActive: string | null) => {
    if (!lastActive) return false;
    const diff = new Date().getTime() - new Date(lastActive).getTime();
    return diff <= 300000; // 5 minutes in ms
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">ระบบติดตามค่าไฟฟ้า (Energy)</h1>
          <p className="text-slate-500 mt-2">ตรวจสอบสถานะการทำงานของอุปกรณ์และการใช้พลังงานในแต่ละห้อง</p>
        </div>
        <button onClick={fetchIoTData} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-all active:scale-95">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          รีเฟรชข้อมูล
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading && rooms.length === 0 ? (
          <div className="col-span-full text-center py-10 text-slate-500">กำลังโหลดข้อมูลเซ็นเซอร์...</div>
        ) : rooms.length === 0 ? (
          <div className="col-span-full text-center py-10 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-500">
            ยังไม่มีห้องพักใดติดตั้งระบบ IoT
          </div>
        ) : (
          rooms.map((room) => {
            const online = isOnline(room.last_active_at);
            const wattage = room.latest_wattage || 0;
            
            // เดาสถานะการใช้ไฟเบื้องต้น (ถ้าไฟเดินเกิน 100W อาจแปลว่าแอร์ทำงาน)
            const isAcOn = online && wattage > 100;

            return (
              <div key={room.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow relative">
                
                {/* แถบสีด้านบนบอกสถานะ (เขียว=ปกติ, แดง=ออฟไลน์) */}
                <div className={`h-1.5 w-full ${online ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col">
                      <span className="text-2xl font-black text-slate-800">{room.room_no}</span>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full mt-1 w-fit">
                        {room.room_type || "ไม่ระบุ"}
                      </span>
                    </div>
                    
                    {online ? (
                       <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-100">
                         <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                         ออนไลน์
                       </div>
                    ) : (
                       <div className="flex items-center gap-1.5 bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold border border-red-100">
                         <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                         ออฟไลน์
                       </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                      <span className="text-sm font-medium text-slate-500">โซนสถานที่</span>
                      <span className="text-sm font-bold text-slate-700">{room.location || "-"}</span>
                    </div>

                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                      <span className="text-sm font-medium text-slate-500">การใช้พลังงาน</span>
                      <div className="text-right">
                        <span className={`text-xl font-black ${online ? 'text-indigo-600' : 'text-slate-400'}`}>
                          {online ? wattage.toLocaleString() : "0"} 
                        </span>
                        <span className="text-xs text-slate-500 ml-1">W</span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-500">สถานะแอร์ (คาดเดา)</span>
                      <span className={`text-sm font-bold ${isAcOn ? 'text-amber-500' : 'text-slate-400'}`}>
                        {online ? (isAcOn ? 'ทำงานอยู่ ❄️' : 'สแตนด์บาย') : '-'}
                      </span>
                    </div>

                  </div>
                </div>
                
                {/* บอกเวลาอัปเดตล่าสุด */}
                <div className="bg-slate-50 px-5 py-2 text-[10px] text-slate-400 font-medium text-center border-t border-slate-100">
                  อัปเดตล่าสุด: {room.last_active_at ? new Date(room.last_active_at).toLocaleTimeString('th-TH') : "ไม่เคย"}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
