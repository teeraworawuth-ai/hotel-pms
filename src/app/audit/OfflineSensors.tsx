"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import EnergyGraph from "@/app/components/EnergyGraph";

export default function OfflineSensors({ dateOffset = 0 }: { dateOffset?: number }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, room_no, location, last_active_at, tuya_device_id, sort_order")
      .not("tuya_device_id", "is", null)
      .neq("tuya_device_id", "");

    if (rooms && rooms.length > 0) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dateOffset);
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);

      // ดึง log ทั้งหมดของวันนี้เพื่อหาช่องโหว่ > 10 นาที
      let logs = [];
      let from = 0;
      const limit = 1000;
      while (true) {
        const { data } = await supabase
          .from("energy_logs")
          .select("room_id, recorded_at")
          .gte("recorded_at", startOfDay.toISOString())
          .lte("recorded_at", endOfDay.toISOString())
          .order("recorded_at", { ascending: true })
          .range(from, from + limit - 1);
          
        if (data) {
          logs = logs.concat(data);
          if (data.length < limit) break;
        } else {
          break;
        }
        from += limit;
      }

      const offlineRooms = [];
      const now = new Date();
      const checkEndTime = dateOffset === 0 ? Math.min(now.getTime(), endOfDay.getTime()) : endOfDay.getTime();

      for (const room of rooms) {
        const roomLogs = logs?.filter(l => l.room_id === room.id) || [];
        let hasGap = false;

        if (roomLogs.length === 0) {
          // ไม่มี log เลยทั้งวัน ถือว่าออฟไลน์ทั้งวัน
          hasGap = true;
        } else {
          // เช็ค gap ระหว่าง log
          for (let i = 1; i < roomLogs.length; i++) {
            const prev = new Date(roomLogs[i-1].recorded_at).getTime();
            const curr = new Date(roomLogs[i].recorded_at).getTime();
            if (curr - prev > 10 * 60 * 1000) {
              hasGap = true;
              break;
            }
          }
          // เช็ค gap ระหว่าง log สุดท้ายกับเวลาปัจจุบัน (หรือสิ้นวัน)
          if (!hasGap) {
            const lastLogTime = new Date(roomLogs[roomLogs.length - 1].recorded_at).getTime();
            if (checkEndTime - lastLogTime > 10 * 60 * 1000) {
              hasGap = true;
            }
          }
        }

        if (hasGap) {
          offlineRooms.push(room);
        }
      }

      offlineRooms.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setData(offlineRooms);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    let interval: any;
    if (dateOffset === 0) {
      interval = setInterval(fetchData, 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    }
  }, [dateOffset]);

  if (loading && data.length === 0) return <div className="py-10 text-center text-slate-500">กำลังตรวจสอบสถานะอุปกรณ์...</div>;

  if (data.length === 0) return (
    <div className="py-20 text-center bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
      <div className="text-4xl mb-3">🟢</div>
      <h3 className="text-lg font-bold text-slate-700">ไม่มีอุปกรณ์ออฟไลน์</h3>
      <p className="text-slate-500 text-sm mt-1">ทุกห้องเชื่อมต่อปกติและไม่มีประวัติการออฟไลน์เกิน 10 นาที</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {data.map(room => (
        <div key={room.id} className="bg-white rounded-2xl shadow-sm border-slate-200 overflow-hidden flex flex-col h-full border">
          <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-slate-800">{room.room_no}</span>
              {room.location && <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{room.location}</span>}
            </div>
            <div className="bg-red-50 text-red-600 px-2 py-1 rounded text-xs font-bold border border-red-200">
              พบปัญหาการเชื่อมต่อ
            </div>
          </div>
          <div className="p-4 flex-1">
            <EnergyGraph roomId={room.id} dateOffset={dateOffset} />
          </div>
        </div>
      ))}
    </div>
  );
}
