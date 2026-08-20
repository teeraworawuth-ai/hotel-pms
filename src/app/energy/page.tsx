"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import EnergyGraph from "@/app/components/EnergyGraph";
import OfflineSensors from "../audit/OfflineSensors";

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
  const [activeTab, setActiveTab] = useState<"active" | "offline">("active");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [usedRoomIds, setUsedRoomIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dateOffset, setDateOffset] = useState<number>(0);

  useEffect(() => {
    fetchIoTData();
    // ตั้งเวลาให้รีเฟรชข้อมูลหน้าจอ (จาก Database) ทุกๆ 30 วินาที เฉพาะเมื่อดูของวันนี้
    let interval: NodeJS.Timeout;
    if (dateOffset === 0) {
      interval = setInterval(fetchIoTData, 30000);
    }
    return () => {
      if (interval) clearInterval(interval);
    }
  }, [dateOffset]);

  // Background Sync: ยิง API เพื่อดึงข้อมูลใหม่จาก Tuya ลง Database ทุกๆ 5 นาที (ใช้แทน Cron Job)
  useEffect(() => {
    const triggerTuyaSync = async () => {
      try {
        console.log("Triggering background Tuya sync...");
        await fetch("/api/cron/tuya-sync");
      } catch (e) {
        console.error("Background sync failed", e);
      }
    };
    
    if (dateOffset === 0) {
      // ยิงครั้งแรกทันที
      triggerTuyaSync();
      // ตั้งเวลายิงซ้ำทุก 5 นาที (300,000 ms)
      const syncInterval = setInterval(triggerTuyaSync, 300000);
      return () => clearInterval(syncInterval);
    }
  }, [dateOffset]);

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
      let fetchedRooms = (roomsData as Room[]) || [];
      
      // คำนวณขอบเขตเวลาของวันที่เลือก (06:45:00 ถึง 06:44:59 ของวันถัดไป)
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dateOffset);
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);

      // ตรวจสอบว่าแต่ละห้องมีการใช้ไฟ (> 0) ในช่วงเวลานี้หรือไม่
      const usedIds = new Set<string>();
      await Promise.all(fetchedRooms.map(async (room) => {
        const { data } = await supabase
          .from("energy_logs")
          .select("id")
          .eq("room_id", room.id)
          .gte("recorded_at", startOfDay.toISOString())
          .lte("recorded_at", endOfDay.toISOString())
          .gt("wattage", 0)
          .limit(2);
        
        if (data && data.length >= 2) {
          usedIds.add(room.id);
        }
      }));
      setUsedRoomIds(usedIds);

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

  // ฟังก์ชันเช็คสถานะออฟไลน์ (เกิน 15 นาที) (เฉพาะดูของวันนี้)
  const isOnline = (lastActive: string | null) => {
    if (dateOffset < 0) return false; // ถ้าย้อนอดีต ให้ข้ามสถานะออนไลน์
    if (!lastActive) return false;
    const diff = new Date().getTime() - new Date(lastActive).getTime();
    return diff <= 900000;
  };

  const displayDate = new Date();
  displayDate.setDate(displayDate.getDate() + dateOffset);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      {/* Date Slider / Timeline */}
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between overflow-x-auto gap-2">
        <button 
          onClick={() => setDateOffset(prev => Math.max(-10, prev - 1))}
          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 flex-shrink-0"
          disabled={dateOffset <= -10}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>

        <div className="flex-1 flex justify-center items-center">
          <div className="text-center">
            <h2 className="text-xl font-black text-slate-800">
              {dateOffset === 0 ? "วันนี้ (Today)" : displayDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' })}
            </h2>
            <p className="text-xs text-slate-500">
              {dateOffset < 0 ? `ย้อนหลัง ${Math.abs(dateOffset)} วัน` : "สถานะปัจจุบันแบบ Real-time"}
            </p>
          </div>
        </div>

        <button 
          onClick={() => setDateOffset(prev => Math.min(0, prev + 1))}
          className={`p-2 rounded-full flex-shrink-0 transition-colors ${dateOffset >= 0 ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
          disabled={dateOffset >= 0}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
      </div>

      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">ระบบติดตามค่าไฟฟ้า (Energy)</h1>
          <p className="text-slate-500 mt-2">ตรวจสอบการใช้พลังงานย้อนหลังได้ 10 วัน</p>
        </div>
        {dateOffset === 0 && (
          <button onClick={fetchIoTData} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-all active:scale-95">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            รีเฟรชข้อมูล
          </button>
        )}
      </header>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === "active" ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          ⚡ อุปกรณ์ที่กำลังใช้ไฟ
        </button>
        <button
          onClick={() => setActiveTab("offline")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === "offline" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          🔌 อุปกรณ์ออฟไลน์
        </button>
      </div>

      {activeTab === "offline" ? (
        <OfflineSensors dateOffset={dateOffset} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading && rooms.length === 0 ? (
            <div className="col-span-full text-center py-10 text-slate-500">กำลังโหลดข้อมูล...</div>
          ) : rooms.length === 0 ? (
            <div className="col-span-full text-center py-10 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-500">
              ยังไม่มีห้องพักใดติดตั้งระบบ IoT
            </div>
          ) : (
            rooms.map((room) => {
              const online = isOnline(room.last_active_at);
              const wattage = room.latest_wattage || 0;
              const isAcOn = online && wattage > 100;

              // กรองอุปกรณ์ที่สแตนด์บายและไม่มีการใช้ไฟเลยทั้งวัน หรือออฟไลน์ออกไป
              if (!usedRoomIds.has(room.id)) {
                return null;
              }

              return (
              <div key={room.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow relative">
                
                {dateOffset === 0 && (
                  <div className={`h-1.5 w-full ${online ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                )}
                {dateOffset < 0 && (
                  <div className="h-1.5 w-full bg-slate-300"></div>
                )}
                
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col">
                      <span className="text-2xl font-black text-slate-800">{room.room_no}</span>
                      {room.location && (
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{room.location}</span>
                      )}
                    </div>
                    
                    {dateOffset === 0 && (
                      online ? (
                         <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-100">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                           ออนไลน์
                         </div>
                      ) : (
                         <div className="flex items-center gap-1.5 bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold border border-red-100">
                           <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                           ออฟไลน์
                         </div>
                      )
                    )}
                    {dateOffset < 0 && (
                      <div className="flex items-center gap-1.5 bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-200">
                        ประวัติย้อนหลัง
                      </div>
                    )}
                  </div>

                  {dateOffset === 0 && (
                    <div className="space-y-3">
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
                  )}
                  
                  {/* แสดงกราฟการใช้ไฟ (ส่ง dateOffset ไปด้วย) */}
                  <EnergyGraph roomId={room.id} dateOffset={dateOffset} />
                </div>
                
                {dateOffset === 0 && (
                  <div className="bg-slate-50 px-5 py-2 text-[10px] text-slate-400 font-medium text-center border-t border-slate-100">
                    อัปเดตล่าสุด: {room.last_active_at ? new Date(room.last_active_at).toLocaleTimeString('th-TH') : "ไม่เคย"}
                  </div>
                )}
              </div>
            );
          })
          )}
        </div>
      )}
    </div>
  );
}
