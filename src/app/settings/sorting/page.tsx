"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  room_no: string;
  location: string | null;
  sort_order: number;
};

export default function SortingPage() {
  const [locations, setLocations] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // UI State
  const [activeLocation, setActiveLocation] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    
    // 1. Fetch system_settings for location order
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .single();
      
    // 2. Fetch all rooms
    const { data: roomsData } = await supabase
      .from("rooms")
      .select("id, room_no, location, sort_order")
      .order("sort_order", { ascending: true });

    let fetchedRooms = roomsData || [];
    
    // Extract unique locations from rooms
    const uniqueLocations = Array.from(new Set(fetchedRooms.map(r => r.location || "ไม่มีสถานที่")));
    
    // Apply saved order if exists, otherwise use natural order
    let orderedLocations = uniqueLocations;
    if (settingsData && settingsData.value) {
      const savedOrder = settingsData.value as string[];
      // Keep only locations that still exist, append new ones at the end
      orderedLocations = [
        ...savedOrder.filter(loc => uniqueLocations.includes(loc)),
        ...uniqueLocations.filter(loc => !savedOrder.includes(loc))
      ];
    }

    setLocations(orderedLocations);
    setRooms(fetchedRooms);
    
    if (orderedLocations.length > 0) {
      setActiveLocation(orderedLocations[0]);
    }
    
    setLoading(false);
  }

  // --- Location Sorting ---
  function moveLocationUp(index: number) {
    if (index === 0) return;
    const newLocs = [...locations];
    [newLocs[index - 1], newLocs[index]] = [newLocs[index], newLocs[index - 1]];
    setLocations(newLocs);
  }

  function moveLocationDown(index: number) {
    if (index === locations.length - 1) return;
    const newLocs = [...locations];
    [newLocs[index + 1], newLocs[index]] = [newLocs[index], newLocs[index + 1]];
    setLocations(newLocs);
  }

  // --- Room Sorting (within active location) ---
  function moveRoomUp(index: number, locationRooms: Room[]) {
    if (index === 0) return;
    const roomToMove = locationRooms[index];
    const roomAbove = locationRooms[index - 1];
    
    // Swap in the main array
    const newRooms = [...rooms];
    const idx1 = newRooms.findIndex(r => r.id === roomToMove.id);
    const idx2 = newRooms.findIndex(r => r.id === roomAbove.id);
    
    [newRooms[idx1], newRooms[idx2]] = [newRooms[idx2], newRooms[idx1]];
    setRooms(newRooms);
  }

  function moveRoomDown(index: number, locationRooms: Room[]) {
    if (index === locationRooms.length - 1) return;
    const roomToMove = locationRooms[index];
    const roomBelow = locationRooms[index + 1];
    
    // Swap in the main array
    const newRooms = [...rooms];
    const idx1 = newRooms.findIndex(r => r.id === roomToMove.id);
    const idx2 = newRooms.findIndex(r => r.id === roomBelow.id);
    
    [newRooms[idx1], newRooms[idx2]] = [newRooms[idx2], newRooms[idx1]];
    setRooms(newRooms);
  }

  async function handleSave() {
    setSaving(true);
    
    // 1. Save locations order
    const { error: settingsError } = await supabase
      .from("system_settings")
      .upsert({ key: "locations_order", value: locations });

    if (settingsError) {
      alert("เกิดข้อผิดพลาดในการบันทึกลำดับสถานที่");
      setSaving(false);
      return;
    }

    // 2. Save rooms order
    const updates = rooms.map((room, index) => ({
      id: room.id,
      room_no: room.room_no,
      location: room.location,
      sort_order: index
    }));

    const { error: roomsError } = await supabase
      .from("rooms")
      .upsert(updates);

    if (roomsError) {
      alert("เกิดข้อผิดพลาดในการบันทึกลำดับห้อง");
    } else {
      alert("บันทึกการจัดเรียงเรียบร้อยแล้ว!");
    }
    
    setSaving(false);
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">กำลังโหลดข้อมูล...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="flex justify-between items-center bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">จัดเรียงลำดับการแสดงผล</h1>
          <p className="text-slate-500 text-sm mt-1">ตั้งค่าลำดับสถานที่และเบอร์ห้องให้ตรงกับความเป็นจริง</p>
        </div>
        <a href="/settings" className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200">
          กลับ
        </a>
      </header>

      {/* Step 1: Sort Locations */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm">1</span> 
          จัดเรียง "สถานที่"
        </h2>
        
        {locations.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-4 bg-slate-50 rounded-xl">ยังไม่มีสถานที่ (กรุณาเพิ่มห้องก่อน)</div>
        ) : (
          <div className="space-y-2">
            {locations.map((loc, index) => (
              <div key={loc} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-semibold text-slate-700">{loc}</span>
                <div className="flex gap-1">
                  <button 
                    onClick={() => moveLocationUp(index)}
                    disabled={index === 0}
                    className="p-2 bg-white rounded-lg shadow-sm text-slate-500 disabled:opacity-30 active:scale-95"
                  >
                    ⬆️
                  </button>
                  <button 
                    onClick={() => moveLocationDown(index)}
                    disabled={index === locations.length - 1}
                    className="p-2 bg-white rounded-lg shadow-sm text-slate-500 disabled:opacity-30 active:scale-95"
                  >
                    ⬇️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 2: Sort Rooms per Location */}
      {locations.length > 0 && (
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm">2</span> 
            จัดเรียง "เบอร์ห้อง" ตามสถานที่
          </h2>
          
          <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar">
            {locations.map(loc => (
              <button
                key={loc}
                onClick={() => setActiveLocation(loc)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeLocation === loc 
                    ? "bg-slate-800 text-white shadow-md" 
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {loc}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {rooms
              .filter(r => (r.location || "ไม่มีสถานที่") === activeLocation)
              .map((room, index, filteredArray) => (
              <div key={room.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-slate-200 rounded-lg text-slate-600 text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="font-bold text-slate-800">ห้อง {room.room_no}</span>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => moveRoomUp(index, filteredArray)}
                    disabled={index === 0}
                    className="p-2 bg-white rounded-lg shadow-sm text-slate-500 disabled:opacity-30 active:scale-95"
                  >
                    ⬆️
                  </button>
                  <button 
                    onClick={() => moveRoomDown(index, filteredArray)}
                    disabled={index === filteredArray.length - 1}
                    className="p-2 bg-white rounded-lg shadow-sm text-slate-500 disabled:opacity-30 active:scale-95"
                  >
                    ⬇️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 flex justify-center z-50">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full max-w-md bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {saving ? "กำลังบันทึก..." : "💾 บันทึกการจัดเรียงทั้งหมด"}
        </button>
      </div>
    </div>
  );
}
