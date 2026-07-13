"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  room_no: string;
  floor: string;
  room_type: string;
  price_night: number;
  price_temp: number;
  tuya_device_id: string | null;
  tuya_local_key: string | null;
  tuya_ip: string | null;
  current_status: string;
  location: string | null;
};

export default function SettingsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    room_no: "",
    floor: "1",
    room_type: "Standard",
    price_night: 750,
    price_temp: 350,
    location: "สถานที่หลัก",
    tuya_device_id: "",
    tuya_local_key: "",
    tuya_ip: "",
  });

  useEffect(() => {
    fetchRooms();
  }, []);

  async function fetchRooms() {
    setLoading(true);
    
    // Fetch locations order
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .single();
      
    // Fetch rooms ordered by their individual sort_order
    const { data: roomsData, error } = await supabase
      .from("rooms")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error fetching rooms:", error);
    } else {
      let fetchedRooms = roomsData || [];
      
      // Apply location-based grouping/sorting if available
      if (settingsData && settingsData.value) {
        const locationsOrder = settingsData.value as string[];
        
        // Sort rooms based on the index of their location in the locationsOrder array
        fetchedRooms.sort((a, b) => {
          const locA = a.location || "ไม่มีสถานที่";
          const locB = b.location || "ไม่มีสถานที่";
          
          let indexA = locationsOrder.indexOf(locA);
          let indexB = locationsOrder.indexOf(locB);
          
          // If location is not in the array, put it at the end
          if (indexA === -1) indexA = 999;
          if (indexB === -1) indexB = 999;
          
          if (indexA !== indexB) {
            return indexA - indexB;
          }
          
          // If in the same location, fallback to sort_order (which is already done by the DB query, 
          // but Array.prototype.sort in JS might not be stable, so we explicitly compare sort_order)
          return (a.sort_order || 0) - (b.sort_order || 0);
        });
      }
      
      setRooms(fetchedRooms);
    }
    setLoading(false);
  }

  function openModal(room: Room | null = null) {
    if (room) {
      setEditingRoom(room);
      setFormData({
        room_no: room.room_no,
        floor: room.floor,
        room_type: room.room_type,
        price_night: room.price_night,
        price_temp: room.price_temp,
        location: room.location || "สถานที่หลัก",
        tuya_device_id: room.tuya_device_id || "",
        tuya_local_key: room.tuya_local_key || "",
        tuya_ip: room.tuya_ip || "",
      });
    } else {
      setEditingRoom(null);
      setFormData({
        room_no: "",
        floor: "1",
        room_type: "Standard",
        price_night: 750,
        price_temp: 350,
        location: "สถานที่หลัก",
        tuya_device_id: "",
        tuya_local_key: "",
        tuya_ip: "",
      });
    }
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingRoom(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    const payload = {
      ...formData,
      tuya_device_id: formData.tuya_device_id || null,
      tuya_local_key: formData.tuya_local_key || null,
      tuya_ip: formData.tuya_ip || null,
    };

    if (editingRoom) {
      // Update
      const { error } = await supabase.from("rooms").update(payload).eq("id", editingRoom.id);
      if (error) alert("Error updating room: " + error.message);
    } else {
      // Insert
      const { error } = await supabase.from("rooms").insert([payload]);
      if (error) alert("Error adding room: " + error.message);
    }

    closeModal();
    fetchRooms();
  }

  async function handleDelete(id: string, roomNo: string) {
    if (confirm(`คุณต้องการลบห้อง ${roomNo} ใช่หรือไม่?`)) {
      const { error } = await supabase.from("rooms").delete().eq("id", id);
      if (error) alert("Error deleting room");
      else fetchRooms();
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">ตั้งค่าและจัดการห้องพัก</h1>
        <p className="text-slate-500 mt-2">เพิ่ม ลบ หรือแก้ไขข้อมูลห้องพักในระบบ Hotel PMS</p>
      </header>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <button
          onClick={() => openModal()}
          className="w-full sm:w-auto bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold py-3 px-6 rounded-xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          เพิ่มห้องพักใหม่ในสาขานี้
        </button>
        
        <a
          href="/settings/sorting"
          className="w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-3 px-6 rounded-xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>
          จัดการการจัดเรียงสถานที่ (Sorting)
        </a>
      </div>

      {/* Room List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-10 text-slate-500">กำลังโหลดข้อมูล...</div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-500">
            ยังไม่มีข้อมูลห้องพัก
          </div>
        ) : (
          rooms.map((room) => (
            <div key={room.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="bg-slate-100 text-slate-800 text-xl font-bold py-2 px-4 rounded-xl">
                  {room.room_no}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700">{room.location || "ไม่มีสถานที่"}</div>
                  <div className="text-xs text-slate-500 font-medium mb-1">สถานะอุปกรณ์ (IoT)</div>
                  {room.tuya_device_id ? (
                    <div className="flex items-center gap-1.5 text-emerald-500 font-semibold text-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      ออนไลน์ (Online)
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-400 font-medium text-sm">
                      <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                      ไม่มีระบบ IoT
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={() => openModal(room)}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors"
                >
                  ✏️ แก้ไข
                </button>
                <button 
                  onClick={() => handleDelete(room.id, room.room_no)}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 text-red-500 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors"
                >
                  🗑️ ลบ
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800">
                  {editingRoom ? `✏️ แก้ไขข้อมูลห้อง ${editingRoom.room_no}` : '➕ เพิ่มห้องพักใหม่'}
                </h2>
                <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">เลขห้อง *</label>
                    <input 
                      type="text" required
                      value={formData.room_no} onChange={e => setFormData({...formData, room_no: e.target.value})}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">ชั้น</label>
                    <input 
                      type="text"
                      value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>



                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">สถานที่ (Location) *</label>
                    <input 
                      type="text" required
                      value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      placeholder="เช่น ซอย 1, ตึก A"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">ประเภทห้อง *</label>
                    <input 
                      type="text" required
                      value={formData.room_type} onChange={e => setFormData({...formData, room_type: e.target.value})}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">ราคาค้างคืน (บาท)</label>
                    <input 
                      type="number"
                      value={formData.price_night} onChange={e => setFormData({...formData, price_night: Number(e.target.value)})}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">ราคาชั่วคราว (บาท)</label>
                    <input 
                      type="number"
                      value={formData.price_temp} onChange={e => setFormData({...formData, price_temp: Number(e.target.value)})}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-600 mb-4 flex items-center gap-2">
                    ⚙️ ตั้งค่าระบบ Local Tuya Automation (ไม่บังคับ)
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Tuya Device ID</label>
                      <input 
                        type="text"
                        value={formData.tuya_device_id} onChange={e => setFormData({...formData, tuya_device_id: e.target.value})}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        placeholder="e.g. vdevo160981c72902hiuf"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Local Key</label>
                        <input 
                          type="text"
                          value={formData.tuya_local_key} onChange={e => setFormData({...formData, tuya_local_key: e.target.value})}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Device IP (LAN)</label>
                        <input 
                          type="text"
                          value={formData.tuya_ip} onChange={e => setFormData({...formData, tuya_ip: e.target.value})}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex gap-3 justify-end">
                  <button type="button" onClick={closeModal} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors">
                    ยกเลิก
                  </button>
                  <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                    บันทึกข้อมูล
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
