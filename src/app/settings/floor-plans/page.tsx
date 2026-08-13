"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  room_no: string;
  location: string | null;
  map_x: number;
  map_y: number;
  map_width: number;
  map_height: number;
};

export default function FloorPlansPage() {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<string[]>([]);
  const [activeLocation, setActiveLocation] = useState<string>("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floorPlans, setFloorPlans] = useState<Record<string, string>>({});
  
  const [uploading, setUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag & Resize state
  const [interaction, setInteraction] = useState<{
    roomId: string;
    type: "move" | "resize";
    startX: number;
    startY: number;
    startValX: number;
    startValY: number;
    startValW: number;
    startValH: number;
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    
    // Fetch locations order for sorting
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .single();

    // Fetch floor plan images from system_settings
    const { data: planData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "floor_plans")
      .single();
      
    if (planData && planData.value) {
      setFloorPlans(planData.value as Record<string, string>);
    }

    // Fetch rooms
    const { data: roomsData } = await supabase
      .from("rooms")
      .select("id, room_no, location, map_x, map_y, map_width, map_height");

    if (roomsData) {
      // Provide default values if null
      const formattedRooms = roomsData.map(r => ({
        ...r,
        map_x: r.map_x || 0,
        map_y: r.map_y || 0,
        map_width: r.map_width || 10,
        map_height: r.map_height || 10,
      }));

      // Extract and sort locations
      const uniqueLocs = Array.from(new Set(formattedRooms.map(r => r.location || "ไม่มีสถานที่")));
      let sortedLocs = uniqueLocs;
      
      if (settingsData && settingsData.value) {
        const locationsOrder = settingsData.value as string[];
        sortedLocs = [
          ...locationsOrder.filter(loc => uniqueLocs.includes(loc)),
          ...uniqueLocs.filter(loc => !locationsOrder.includes(loc))
        ];
      }
      
      setLocations(sortedLocs);
      if (sortedLocs.length > 0) setActiveLocation(sortedLocs[0]);
      setRooms(formattedRooms);
    }
    setLoading(false);
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0 || !activeLocation) return;
    
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${activeLocation}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    setUploading(true);

    try {
      const { error: uploadError } = await supabase.storage
        .from('floor-plans')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('floor-plans').getPublicUrl(filePath);
      
      const newPlans = { ...floorPlans, [activeLocation]: data.publicUrl };
      setFloorPlans(newPlans);

      // Save to system_settings
      const { error: settingsError } = await supabase
        .from("system_settings")
        .upsert({ key: "floor_plans", value: newPlans });
        
      if (settingsError) throw settingsError;
      
      alert("อัปโหลดสำเร็จ!");
    } catch (error: any) {
      alert("Error uploading image: " + error.message);
    } finally {
      setUploading(false);
    }
  }

  // Interaction Handlers
  const handlePointerDown = (e: React.PointerEvent, roomId: string, type: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault(); // prevent text selection
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    setInteraction({
      roomId,
      type,
      startX: e.clientX,
      startY: e.clientY,
      startValX: room.map_x,
      startValY: room.map_y,
      startValW: room.map_width,
      startValH: room.map_height,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!interaction || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - interaction.startX) / rect.width) * 100;
    const dy = ((e.clientY - interaction.startY) / rect.height) * 100;

    setRooms(prev => prev.map(room => {
      if (room.id !== interaction.roomId) return room;

      if (interaction.type === "move") {
        return {
          ...room,
          map_x: Math.max(0, Math.min(100 - room.map_width, interaction.startValX + dx)),
          map_y: Math.max(0, Math.min(100 - room.map_height, interaction.startValY + dy)),
        };
      } else if (interaction.type === "resize") {
        return {
          ...room,
          map_width: Math.max(2, Math.min(100 - room.map_x, interaction.startValW + dx)),
          map_height: Math.max(2, Math.min(100 - room.map_y, interaction.startValH + dy)),
        };
      }
      return room;
    }));
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (!interaction) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    // Auto-save coordinate when dragging ends
    const room = rooms.find(r => r.id === interaction.roomId);
    if (room) {
      await supabase
        .from("rooms")
        .update({
          map_x: room.map_x,
          map_y: room.map_y,
          map_width: room.map_width,
          map_height: room.map_height,
        })
        .eq("id", room.id);
    }
    
    setInteraction(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">จัดการแผนผังห้องพัก</h1>
          <p className="text-slate-500 mt-2">อัปโหลดรูปภาพและจัดวางตำแหน่งห้องพักสำหรับ Map View</p>
        </div>
        <a href="/settings" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
          &larr; กลับไปตั้งค่าห้อง
        </a>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col items-center justify-center p-12" style={{ minHeight: '400px' }}>
        <svg className="w-20 h-20 text-slate-300 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        <h2 className="text-2xl font-bold text-slate-700 mb-2">อยู่ระหว่างการพัฒนา</h2>
        <p className="text-slate-500 text-center max-w-md">ระบบจัดการแผนผังห้องพักกำลังอยู่ในขั้นตอนการพัฒนา เพื่อประสบการณ์การตั้งค่าและการใช้งานที่สมบูรณ์ที่สุด</p>
      </div>
    </div>
  );
}
