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
          <div className="col-span-
