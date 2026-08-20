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
  const [roomUsage, setRoomUsage] = useState<Record<string, { kwh: number, cost: number }>>({});
  const [loading, setLoading] = useState(true);
  const [dateOffset, setDateOffset] = useState<number>(0);

  useEffect(() => {
    fetchIoTData();
    let interval: NodeJS.Timeout;
    if (dateOffset === 0) {
      interval = setInterval(fetchIoTData, 30000);
    }
    return () => {
      if (interval) clearInterval(interval);
    }
  }, [dateOffset]);

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
      triggerTuyaSync();
      const syncInterval = setInterval(triggerTuyaSync, 300000);
      return () => clearInterval(syncInterval);
    }
  }, [dateOffset]);

  async function fetchIoTData() {
    setLoading(true);
    
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["locations_order", "energy_unit_cost"]);

    const locOrderStr = settingsData?.find(s => s.key === "locations_order")?.value as string[] | undefined;
    const unitCost = Number(settingsData?.find(s => s.key === "energy_unit_cost")?.value) || 5;

    const { data: roomsData, error } = await supabase
      .from("rooms")
      .select("*")
      .not("tuya_device_id", "is", null)
      .neq("tuya_device_id", "");

    if (error) {
      console.error("Error fetching IoT rooms:", error);
    } else {
      let fetchedRooms = (roomsData as Room[]) || [];
      
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dateOffset);
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);

      const usedIds = new Set<string>();
      const usageMap: Record<string, { kwh: number, cost: number }> = {};

      await Promise.all(fetchedRooms.map(async (room) => {
        const { data } = await supabase
          .from("energy_logs")
          .select("wattage, recorded_at")
          .eq("room_id", room.id)
          .gte("recorded_at", startOfDay.toISOString())
          .lte("recorded_at", endOfDay.toISOString())
          .gt("wattage", 0)
          .order("recorded_at", { ascending: true });
        
        if (data && data.length > 0) {
          // กรองข้อมูลที่ใช้งานไม่ต่อเนื่อง (ตีว่า 1 ping โดดๆ = ขยะ/เปิดไม่ถึง 5 นาที)
          const validLogs = data.filter((log, i, arr) => {
            const t = new Date(log.recorded_at).getTime();
            const prevT = i > 0 ? new Date(arr[i-1].recorded_at).getTime() : -Infinity;
            const nextT = i < arr.length - 1 ? new Date(arr[i+1].recorded_at).getTime() : Infinity;
            // ต้องมี ping ที่ >0W ติดกันภายใน 6 นาที (360,000 ms) ถึงจะถือว่าเป็นการใช้งานต่อเนื่อง
            return (t - prevT <= 360000) || (nextT - t <= 360000);
          });

          if (validLogs.length > 0) {
            usedIds.add(room.id);
            
            const totalWattIntervals = validLogs.reduce((acc, log) => acc + (log.wattage || 0), 0);
            const kwh = totalWattIntervals / 12000;
            const cost = kwh * unitCost;
            
            usageMap[room.id] = { kwh, cost };
          }
        }
      }));
      setUsedRoomIds(usedIds);
      setRoomUsage(usageMap);

      if (locOrderStr) {
        fetchedRooms.sort((a, b) => {
          const locA = a.location || "ไม่มีสถานที่";
          const locB = b.location || "ไม่มีสถานที่";
          let indexA = locOrderStr.indexOf(locA);
          let indexB = locOrderStr.indexOf(locB);
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

  const isOnline = (lastActive: string | null) => {
    if (dateOffset !== 0) return true;
    if (!lastActive) return false;
    const diff = new Date().getTime() - new Date(lastActive).getTime();
    return diff < 15 * 60 * 1000;
  };

  const getStatusClasses = (online: boolean, wattage: number) => {
    if (!online && dateOffset === 0) return { dot: "bg-slate-400", text: "text-slate-500", label: "ออฟไลน์" };
    if (wattage === 0) return { dot: "bg-emerald-400", text: "text-emerald-500", label: "ออนไลน์" };
    return { dot: "bg-emerald-500 animate-pulse", text: "text-emerald-600 font-bold", label: "ออนไลน์" };
  };

  const dateOptions = Array.from({ length: 15 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return {
      offset: -i,
      label: i === 0 ? "วันนี้ (Today)" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
    };
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">สถิติไฟฟ้า (Energy)</h1>
          <p className="text-slate-500 mt-2">ตรวจสอบการใช้พลังงานย้อนหลังได้ 10 วัน</p>
        </div>
        
        <div className="flex items-center gap-3">
          <label className="text-sm font-bold text-slate-700">วันที่:</label>
          <select 
            value={dateOffset} 
            onChange={(e) => setDateOffset(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {dateOptions.map(opt => (
              <option key={opt.offset} value={opt.offset}>{opt.label}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === "active" ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          ⚡ อุปกรณ์ที่มีการใช้ไฟ
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

              if (!usedRoomIds.has(room.id)) {
                return null;
              }

              const usage = roomUsage[room.id] || { kwh: 0, cost: 0 };
              const statusClasses = getStatusClasses(online, wattage);

              return (
                <div key={room.id} className="bg-white rounded-2xl shadow-sm border-slate-200 overflow-hidden flex flex-col h-[220px] border">
                  <div className="p-3 flex-1 flex flex-col">
                    {/* Header: All info in one tight row */}
                    <div className="flex justify-between items-start mb-2 gap-2">
                      {/* Left: Room & Status */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-baseline gap-1.5 truncate">
                          <span className="text-2xl font-black text-slate-800 leading-none tracking-tight">{room.room_no}</span>
                          {room.location && <span className="text-[10px] font-bold text-slate-400 truncate">{room.location}</span>}
                        </div>
                        <div className={`mt-1.5 flex items-center gap-1 text-[9px] font-bold tracking-wider whitespace-nowrap ${statusClasses.dot.includes('emerald') ? 'text-emerald-500' : 'text-slate-400'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${statusClasses.dot}`}></div>
                          <span>{statusClasses.label}</span>
                        </div>
                      </div>

                      {/* Right: Stats Grid */}
                      <div className="flex gap-2 text-right shrink-0 whitespace-nowrap">
                        <div className="flex flex-col items-end min-w-[70px]">
                          <span className="text-[9px] text-slate-400 font-bold tracking-wider">ปัจจุบัน / แอร์</span>
                          <span className="text-[11px] font-black text-slate-700 mt-0.5">
                            {(dateOffset === 0 && online ? wattage : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}W
                            <span className={`ml-1 font-bold ${isAcOn ? 'text-orange-500' : 'text-slate-400'}`}>
                              • {isAcOn ? 'ทำงาน' : 'สแตนด์บาย'}
                            </span>
                          </span>
                        </div>
                        <div className="flex flex-col items-end border-l border-slate-100 pl-2 min-w-[85px]">
                          <span className="text-[9px] text-slate-400 font-bold tracking-wider">รวมวันนี้ / ค่าไฟ</span>
                          <span className="text-[11px] font-black text-slate-700 mt-0.5">
                            {usage.kwh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[9px] font-bold text-slate-400 uppercase">kWh</span>
                            <span className="text-blue-600 ml-1">
                              • ฿{usage.cost.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Graph Area */}
                    <div className="flex-1 mt-auto relative min-h-[140px] -mx-1">
                      <EnergyGraph roomId={room.id} dateOffset={dateOffset} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
