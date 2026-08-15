"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  room_no: string;
  room_type: string;
  location: string | null;
  status: 'available' | 'occupied' | 'dirty' | 'reserved' | 'cleaning' | null;
};

export default function HousekeepingPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  
  // สำหรับจับเวลา Double Tap
  const lastTapRef = useRef<{ [key: string]: number }>({});
  const tapTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    fetchRooms();

    // ตั้งค่า Supabase Realtime ให้หน้าจอเปลี่ยนทันทีที่ Font Desk เช็คเอาท์
    const roomSubscription = supabase
      .channel('housekeeping-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, (payload) => {
        fetchRooms();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomSubscription);
    };
  }, []);

  async function fetchRooms() {
    setLoading(true);
    // ดึงมาเฉพาะห้องที่ต้องการทำความสะอาด หรือ กำลังทำความสะอาด
    const { data, error } = await supabase
      .from('rooms')
      .select('id, room_no, room_type, location, status')
      .in('status', ['dirty', 'cleaning'])
      .order('room_no', { ascending: true });

    if (!error && data) {
      setRooms(data as Room[]);
    }
    setLoading(false);
  }

  const updateStatus = async (id: string, newStatus: string) => {
    // อัปเดตใน UI ก่อนเพื่อให้ตอบสนองทันที (Optimistic UI)
    setRooms(prev => prev.filter(r => {
      if (r.id === id) {
        if (newStatus === 'available') return false; // หายไปจากจอแม่บ้าน
        return true;
      }
      return true;
    }).map(r => r.id === id ? { ...r, status: newStatus as Room['status'] } : r));

    // ส่งไปอัปเดตบน Database
    await supabase.from('rooms').update({ status: newStatus }).eq('id', id);
  };

  const handleTap = (room: Room) => {
    const now = Date.now();
    const lastTap = lastTapRef.current[room.id] || 0;
    const timeSinceLastTap = now - lastTap;
    
    // อัปเดตเวลาแตะล่าสุด
    lastTapRef.current[room.id] = now;

    if (timeSinceLastTap < 400 && timeSinceLastTap > 0) {
      // ===== DOUBLE TAP =====
      // ยกเลิก Single Tap Timer
      if (tapTimeoutRef.current[room.id]) {
        clearTimeout(tapTimeoutRef.current[room.id]);
      }
      
      // ถ้าห้องกำลังทำความสะอาด (เหลือง) ให้เปลี่ยนเป็น ว่าง (เขียว)
      if (room.status === 'cleaning') {
        updateStatus(room.id, 'available');
      }
      
      // รีเซ็ตเพื่อไม่ให้ทริกเกอร์ซ้ำ
      lastTapRef.current[room.id] = 0;
      
    } else {
      // ===== SINGLE TAP =====
      // ตั้งเวลาหน่วงเพื่อรอดูว่าจะเป็น Double Tap หรือไม่
      if (tapTimeoutRef.current[room.id]) {
        clearTimeout(tapTimeoutRef.current[room.id]);
      }
      
      tapTimeoutRef.current[room.id] = setTimeout(() => {
        // ถ้าเวลาผ่านไป 400ms และไม่มีการแตะครั้งที่ 2 -> ถือว่าเป็น Single Tap
        if (room.status === 'dirty') {
          updateStatus(room.id, 'cleaning'); // เปลี่ยนเป็นเหลือง
        } else if (room.status === 'cleaning') {
          updateStatus(room.id, 'dirty'); // เปลี่ยนกลับเป็นส้ม
        }
      }, 400);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-slate-50"><p className="text-slate-500 font-bold">กำลังโหลดห้องพัก...</p></div>;
  }

  // จัดกลุ่มตามสถานที่
  const groupedRooms: { [key: string]: Room[] } = {};
  rooms.forEach((room) => {
    const loc = room.location || "ไม่มีสถานที่";
    if (!groupedRooms[loc]) groupedRooms[loc] = [];
    groupedRooms[loc].push(room);
  });

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans touch-manipulation pb-20">
      <div className="max-w-md mx-auto">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-black text-slate-800">จัดการทำความสะอาด 🧹</h1>
          <p className="text-sm text-slate-500 mt-1">
            แตะ 1 ครั้ง: เริ่มทำความสะอาด / ยกเลิก<br/>
            แตะ 2 ครั้งติดกัน (เฉพาะห้องสีเหลือง): พร้อมขาย
          </p>
        </header>

        {rooms.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-200">
            <div className="text-5xl mb-4">✨</div>
            <h3 className="text-xl font-bold text-slate-700">ไม่มีห้องต้องทำความสะอาด</h3>
            <p className="text-slate-500 mt-2">ทุกห้องสะอาดเรียบร้อยแล้ว!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.keys(groupedRooms).map(location => (
              <div key={location} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">{location}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {groupedRooms[location].map(room => (
                    <button
                      key={room.id}
                      onClick={() => handleTap(room)}
                      className={`
                        relative w-full aspect-square flex flex-col items-center justify-center rounded-2xl border-4 transition-all active:scale-95 select-none
                        ${room.status === 'dirty' 
                          ? 'bg-orange-50 border-orange-400 text-orange-700 shadow-md' 
                          : 'bg-yellow-100 border-yellow-400 text-yellow-800 shadow-md animate-pulse'
                        }
                      `}
                    >
                      <span className="text-4xl font-black tracking-tighter mb-1">
                        {room.room_no}
                      </span>
                      <span className="text-sm font-bold opacity-80">
                        {room.status === 'dirty' ? 'รอทำความสะอาด' : 'กำลังทำความสะอาด'}
                      </span>
                      {room.status === 'cleaning' && (
                        <div className="absolute top-2 right-2 flex gap-1">
                           <span className="w-2 h-2 rounded-full bg-yellow-500 animate-ping"></span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
