"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import RoomCheckinModal from "@/app/components/RoomCheckinModal";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";

export type RoomStatus = {
  id: string;
  room_no: string;
  room_type: string;
  location: string | null;
  sort_order: number;
  status: 'available' | 'occupied' | 'dirty' | 'cleaning' | 'reserved' | null;
  stay_type: 'overnight' | 'short_stay' | null;
  check_in_time: string | null;
  check_out_time: string | null;
  guest_count: number | null;
  guest_name?: string | null; // For future bookings
  has_upcoming?: boolean; // True if there's any booking in the next 5 days
  upcoming_days?: number[]; // Stores dates that are booked in the next 7 days
  incoming_today?: boolean; // True if there is a new booking arriving today
  price_night?: number;
  price_temp?: number;
  actual_price?: number;
  staff_name?: string | null;
  guest_phone?: string | null;
  booking_id?: string;
  booking_created_at?: string; // Time the booking was made
  unpaid_balance?: number;
  total_charges?: number;
  total_payments?: number;
  map_x?: number;
  map_y?: number;
  map_width?: number;
  map_height?: number;
};

export default function CheckinPage() {
  const { getNow, simulatedTime } = useSimulatedTime();
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationsOrder, setLocationsOrder] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<RoomStatus | null>(null);
  
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [floorPlans, setFloorPlans] = useState<Record<string, string>>({});

  // สำหรับจับเวลา Double Tap ของแม่บ้านบนหน้ากระดานหลัก
  const lastTapRef = useRef<{ [key: string]: number }>({});
  const tapTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const handleRoomClick = async (room: RoomStatus) => {
    if (room.status === 'dirty' || room.status === 'cleaning') {
      const now = Date.now();
      const lastTap = lastTapRef.current[room.id] || 0;
      const timeSinceLastTap = now - lastTap;
      
      lastTapRef.current[room.id] = now;

      if (timeSinceLastTap < 400 && timeSinceLastTap > 0) {
        // DOUBLE TAP
        if (tapTimeoutRef.current[room.id]) {
          clearTimeout(tapTimeoutRef.current[room.id]);
        }
        
        if (room.status === 'cleaning') {
          // อัปเดต UI ชั่วคราวให้เร็วขึ้น
          setRooms(prev => prev.map(r => r.id === room.id ? { ...r, status: 'available', current_status: 'ว่าง' } : r));
          await supabase.from('rooms').update({ status: 'available', current_status: 'ว่าง' }).eq('id', room.id);
        }
        lastTapRef.current[room.id] = 0;
      } else {
        // SINGLE TAP
        if (tapTimeoutRef.current[room.id]) {
          clearTimeout(tapTimeoutRef.current[room.id]);
        }
        
        tapTimeoutRef.current[room.id] = setTimeout(async () => {
          if (room.status === 'dirty') {
            const location = room.location;
            const concurrentCount = rooms.filter(r => r.location === location && r.status === 'cleaning').length;
            if (concurrentCount >= 3) {
              alert(`พื้นที่ ${location || 'โซนนี้'} มีแม่บ้านกำลังทำความสะอาดครบ 2 ห้องแล้ว (โปรดกดเสร็จสิ้นห้องที่ทำเสร็จก่อน)`);
              return;
            }
            
            setRooms(prev => prev.map(r => r.id === room.id ? { ...r, status: 'cleaning', current_status: 'กำลังทำความสะอาด' } : r));
            await supabase.from('rooms').update({ status: 'cleaning', current_status: 'กำลังทำความสะอาด' }).eq('id', room.id);
          } else if (room.status === 'cleaning') {
            setRooms(prev => prev.map(r => r.id === room.id ? { ...r, status: 'dirty', current_status: 'รอทำความสะอาด' } : r));
            await supabase.from('rooms').update({ status: 'dirty', current_status: 'รอทำความสะอาด' }).eq('id', room.id);
          }
        }, 400);
      }
    } else {
      // สำหรับห้องสถานะอื่นๆ ให้เปิด Modal ปกติ
      setSelectedRoom(room);
    }
  };

  // 0 = Today, -1 = Yesterday, 1 = Tomorrow
  const [dateOffset, setDateOffset] = useState<number>(0);

  const fetchData = async (silentRefresh = false) => {
    if (!silentRefresh) setLoading(true);
    // ดึง Location Order
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .single();
    
    if (settingsData && settingsData.value) {
      setLocationsOrder(settingsData.value as string[]);
    }

    // ดึงแผนผัง
    const { data: planData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "floor_plans")
      .single();
      
    if (planData && planData.value) {
      setFloorPlans(planData.value as Record<string, string>);
    }

    // ดึงโครงสร้างห้องทั้งหมด
    const { data: roomsData, error } = await supabase
      .from("rooms")
      .select("id, room_no, room_type, location, sort_order, status, stay_type, check_in_time, check_out_time, guest_count, price_night, price_temp, actual_price, staff_name");
    
    if (error) {
      console.error("Error fetching rooms:", error);
      setLoading(false);
      return;
    }

    const allRooms = roomsData as RoomStatus[];

    // Business Day Logic: ก่อน 06:45 ถือเป็นของเมื่อวาน
    const targetDate = getBusinessDate(getNow());
    targetDate.setDate(targetDate.getDate() + dateOffset);
    
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);
    
    const startOfNext7Days = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 0, 0, 0);
    const endOfNext7Days = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 7, 23, 59, 59);

    // ดึง Bookings ที่ครอบคลุมตั้งแต่วันนี้ (Target Date) จนถึง 7 วันข้างหน้า
    const { data: allTargetBookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("*")
      .neq("status", "cancelled")
      .neq("status", "checked_out") // สำคัญ! ข้าม booking ที่เช็คเอาท์ไปแล้ว เพื่อไม่ให้ห้องกลับไปเป็น reserved
      .lte("check_in_time", endOfNext7Days.toISOString())
      .gt("check_out_time", startOfDay.toISOString());

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
    }

    // [NEW] Fetch ledger transactions for active bookings to calculate unpaid balances
    const activeBookingIds = allTargetBookings?.map(b => b.id) || [];
    const financialSummary: Record<string, { charges: number, payments: number, balance: number }> = {};
    
    if (activeBookingIds.length > 0) {
      const { data: ledgers, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('booking_id, amount')
        .in('booking_id', activeBookingIds);
        
      if (!ledgerError && ledgers) {
        ledgers.forEach(tx => {
          if (tx.booking_id) {
            if (!financialSummary[tx.booking_id]) {
              financialSummary[tx.booking_id] = { charges: 0, payments: 0, balance: 0 };
            }
            const amt = Number(tx.amount);
            financialSummary[tx.booking_id].balance += amt;
            if (amt > 0) {
              financialSummary[tx.booking_id].charges += amt;
            } else {
              financialSummary[tx.booking_id].payments += Math.abs(amt);
            }
          }
        });
      }
    }

    const mergedRooms = allRooms.map(room => {
      const roomBookings = allTargetBookings?.filter(b => b.room_id === room.id) || [];
      
      // หาคิวสำหรับหน้าปัจจุบัน (Target Date) โดยใช้จุดตัดที่ 14:00 น. (เวลา Check-in มาตรฐาน)
      const targetDayBooking = roomBookings.find(b => {
        const bStart = new Date(b.check_in_time).getTime();
        const bEnd = new Date(b.check_out_time).getTime();
        const targetReference = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 14, 0, 0).getTime();
        
        return bStart <= targetReference && bEnd > targetReference;
      });

      // คิวจองล่วงหน้า 7 วัน (เก็บเฉพาะวันที่ติดจอง)
      const upcoming_days: number[] = [];
      let has_upcoming = false;
      
      for (let i = 0; i < 7; i++) {
        const currentDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1 + i);
        
        const isBooked = roomBookings.some(b => {
          if (b.status !== 'reserved') return false;
          const bStartDate = new Date(b.check_in_time).setHours(0,0,0,0);
          const bEndDate = new Date(b.check_out_time).setHours(0,0,0,0);
          const currentDayDate = currentDay.setHours(0,0,0,0);
          
          if (bStartDate === bEndDate) {
            return currentDayDate === bStartDate;
          } else {
            return currentDayDate >= bStartDate && currentDayDate < bEndDate;
          }
        });
        
        if (isBooked) {
          upcoming_days.push(currentDay.getDate());
          has_upcoming = true;
        }
      }
      
      // ตรวจสอบว่ามีคิวจองเข้าใหม่ของวันนี้รออยู่หรือไม่ (กรณีห้องยังมีคนพักหรือรอทำความสะอาด)
      const incomingBookingToday = roomBookings.find(b => {
        const bStart = new Date(b.check_in_time);
        return bStart.getDate() === targetDate.getDate() && 
               bStart.getMonth() === targetDate.getMonth() && 
               bStart.getFullYear() === targetDate.getFullYear() &&
               b.status === 'reserved'; // ใช้ status แทนการเทียบเวลา เพราะเวลาเช็คอินจริงอาจไม่ตรงกับเวลาจอง
      });
      const incoming_today = !!incomingBookingToday;

      let finalRoom: RoomStatus = { ...room, has_upcoming, upcoming_days, incoming_today };

      if (dateOffset === 0) {
        // วันนี้ (Today) -> ใช้ข้อมูล Live Status เป็นหลัก
        
        if (incomingBookingToday) {
          if (finalRoom.status === 'available' || !finalRoom.status) {
            // ถ้าห้องว่าง (ทำความสะอาดเสร็จแล้ว) ให้เอาคิวจองวันนี้มาทับเป็นสถานะ reserved
              finalRoom = {
                ...finalRoom,
                status: 'reserved',
                stay_type: 'overnight',
                check_in_time: incomingBookingToday.check_in_time,
                check_out_time: incomingBookingToday.check_out_time,
                guest_count: incomingBookingToday.guest_count,
                guest_name: incomingBookingToday.guest_name,
                guest_phone: incomingBookingToday.guest_phone,
                actual_price: incomingBookingToday.actual_price,
                staff_name: incomingBookingToday.staff_name,
                booking_id: incomingBookingToday.id,
                booking_created_at: incomingBookingToday.created_at,
                unpaid_balance: financialSummary[incomingBookingToday.id]?.balance || 0,
                total_charges: financialSummary[incomingBookingToday.id]?.charges || 0,
                total_payments: financialSummary[incomingBookingToday.id]?.payments || 0
              };
          } else if (finalRoom.status === 'reserved') {
            finalRoom.booking_created_at = incomingBookingToday.created_at;
            finalRoom.unpaid_balance = financialSummary[incomingBookingToday.id]?.balance || 0;
            finalRoom.total_charges = financialSummary[incomingBookingToday.id]?.charges || 0;
            finalRoom.total_payments = financialSummary[incomingBookingToday.id]?.payments || 0;
          }
        }
        
        // ถ้าสถานะเป็น occupied ให้ดึง booking_id จากการจองของวันนี้ที่เป็น checked_in
        if (finalRoom.status === 'occupied') {
          const activeBooking = roomBookings.find(b => b.status === 'checked_in');
          if (activeBooking) {
            finalRoom.booking_id = activeBooking.id;
            finalRoom.unpaid_balance = financialSummary[activeBooking.id]?.balance || 0;
            finalRoom.total_charges = financialSummary[activeBooking.id]?.charges || 0;
            finalRoom.total_payments = financialSummary[activeBooking.id]?.payments || 0;
          }
        }
        
        return finalRoom;
      } else {
        // อดีต/อนาคต -> ใช้ข้อมูลจาก Target Day Booking
        if (targetDayBooking) {
          finalRoom = {
            ...finalRoom,
            status: dateOffset > 0 ? 'reserved' : 'occupied',
            stay_type: 'overnight',
            check_in_time: targetDayBooking.check_in_time,
            check_out_time: targetDayBooking.check_out_time,
            guest_count: targetDayBooking.guest_count,
            guest_name: targetDayBooking.guest_name,
            guest_phone: targetDayBooking.guest_phone,
            actual_price: targetDayBooking.actual_price,
            staff_name: targetDayBooking.staff_name,
            booking_id: targetDayBooking.id,
            booking_created_at: targetDayBooking.created_at,
            unpaid_balance: unpaidBalances[targetDayBooking.id] || 0
          };
        } else {
          finalRoom = {
            ...finalRoom,
            status: 'available',
            stay_type: null,
            check_in_time: null,
            check_out_time: null,
            guest_count: 0
          };
        }
        return finalRoom;
      }
    });

    setRooms(mergedRooms);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    
    // ตั้งค่า Supabase Realtime ให้ดึงข้อมูลทันทีเมื่อมีการอัปเดตตาราง rooms
    const roomSubscription = supabase
      .channel('rooms-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, (payload) => {
        fetchData(true);
      })
      .subscribe();

    // ตั้งค่า Supabase Realtime สำหรับตาราง bookings
    const bookingSubscription = supabase
      .channel('bookings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        fetchData(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomSubscription);
      supabase.removeChannel(bookingSubscription);
    };
  }, [dateOffset, simulatedTime]);

  const handleCleanAllDirtyRooms = async () => {
    const dirtyRooms = rooms.filter(r => r.status === 'dirty');
    if (dirtyRooms.length === 0) return;
    
    if (!window.confirm(`ยืนยันการทำความสะอาด ${dirtyRooms.length} ห้อง พร้อมกันหรือไม่?`)) return;

    setLoading(true);
    const { error } = await supabase
      .from('rooms')
      .update({ status: 'available' })
      .in('id', dirtyRooms.map(r => r.id));
      
    if (!error) {
      fetchData();
    } else {
      console.error(error);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะห้อง');
      setLoading(false);
    }
  };

  const handleClearAllOccupiedRooms = async () => {
    const occupiedRooms = rooms.filter(r => r.status === 'occupied');
    if (occupiedRooms.length === 0) return;
    
    if (!window.confirm(`[สำหรับทดสอบ] ยืนยันการเคลียร์แขกออกจากห้องที่มีคนพักอยู่จำนวน ${occupiedRooms.length} ห้องหรือไม่? (สถานะห้องจะกลายเป็น รอทำความสะอาด)`)) return;

    setLoading(true);

    // อัปเดตตาราง bookings ให้เป็น checked_out ด้วย จะได้ไม่เด้งกลับมาเป็น reserved อีก
    await supabase
      .from('bookings')
      .update({ status: 'checked_out' })
      .in('room_id', occupiedRooms.map(r => r.id))
      .eq('status', 'checked_in');

    const { error } = await supabase
      .from('rooms')
      .update({ 
        status: 'dirty', 
        check_in_time: null, 
        check_out_time: null, 
        stay_type: null, 
        guest_count: null, 
        price_night: null, 
        price_temp: null, 
        actual_price: null, 
        staff_name: null 
      })
      .in('id', occupiedRooms.map(r => r.id));
      
    if (!error) {
      fetchData();
    } else {
      console.error(error);
      alert('เกิดข้อผิดพลาดในการเคลียร์ห้อง');
      setLoading(false);
    }
  };

  // จัดเรียงและจัดกลุ่มตามสถานที่
  const groupedRooms: { [key: string]: RoomStatus[] } = {};
  rooms.forEach((room) => {
    const loc = room.location || "ไม่มีสถานที่";
    if (!groupedRooms[loc]) groupedRooms[loc] = [];
    groupedRooms[loc].push(room);
  });

  const sortedLocations = Object.keys(groupedRooms).sort((a, b) => {
    let indexA = locationsOrder.indexOf(a);
    let indexB = locationsOrder.indexOf(b);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    return indexA - indexB;
  });

  const getStayDetails = (room: RoomStatus) => {
    if (room.status !== 'occupied' || !room.check_out_time) return null;
    
    if (dateOffset !== 0) return null;

    const now = getNow();
    const checkoutTime = new Date(room.check_out_time);
    const diffMs = checkoutTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffMins = diffMs / (1000 * 60);
    
    // เตือนก่อนหมดเวลา 15 นาที สำหรับทั้งค้างคืนและชั่วคราว
    const isWarning = diffMins <= 15;
    
    if (room.stay_type === 'overnight') {
      const nightsLeft = Math.max(0, Math.round(diffHours / 24));
      return { text: `${nightsLeft}`, type: 'overnight', warning: isWarning };
    } else {
      if (diffMs <= 0) return { text: "0", type: 'short_stay', warning: true };
      const hoursLeft = Math.max(0, Math.floor(diffHours));
      return { text: `${hoursLeft}`, type: 'short_stay', warning: isWarning };
    }
  };

  const getStatusClasses = (status: string | null) => {
    switch (status) {
      case 'occupied': return "bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200 hover:border-blue-400 shadow-sm";
      case 'dirty': return "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-300";
      case 'cleaning': return "bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200 hover:border-yellow-400 shadow-sm"; // สำหรับแม่บ้าน
      case 'reserved': return "bg-purple-100 border-purple-300 text-purple-800 hover:bg-purple-200 hover:border-purple-400 shadow-sm"; // อนาคต (จอง)
      default: return "bg-white border-emerald-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.05)]";
    }
  };

  const getBusinessDate = (date: Date) => {
    const d = new Date(date);
    if (d.getHours() < 6 || (d.getHours() === 6 && d.getMinutes() < 45)) {
      d.setDate(d.getDate() - 1);
    }
    return d;
  };

  const displayDate = getBusinessDate(getNow());
  displayDate.setDate(displayDate.getDate() + dateOffset);

  const formatTimeStr = (isoString: string | null) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateStr = (isoString: string | null) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    const isToday = d.getDate() === displayDate.getDate() && 
                    d.getMonth() === displayDate.getMonth() && 
                    d.getFullYear() === displayDate.getFullYear();
    return isToday ? "" : `${d.getDate()}/${d.getMonth() + 1}`;
  };

  const tomorrowDate = new Date(displayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowDayNum = tomorrowDate.getDate();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* Date Slider / Timeline */}
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between overflow-x-auto gap-2">
        <button 
          onClick={() => setDateOffset(prev => Math.max(-10, prev - 1))}
          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>

        <div className="flex-1 flex flex-col md:flex-row justify-center items-center gap-4">
          <div className="text-center hidden md:block">
            <h2 className="text-xl font-black text-slate-800">
              {dateOffset === 0 ? `วันนี้ (Today) ${displayDate.toLocaleDateString('th-TH', { weekday: 'long' })} ที่ ${displayDate.getDate()}/${displayDate.getMonth() + 1}/${displayDate.getFullYear()}` : displayDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' })}
            </h2>
            <p className="text-xs text-slate-500">
              {dateOffset < 0 ? `ย้อนหลัง ${Math.abs(dateOffset)} วัน` : dateOffset > 0 ? `ล่วงหน้า ${dateOffset} วัน` : "สถานะปัจจุบันแบบ Real-time"}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <input 
              type="date"
              value={`${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, '0')}-${String(displayDate.getDate()).padStart(2, '0')}`}
              onChange={(e) => {
                if (e.target.value) {
                  const selectedDate = new Date(e.target.value);
                  const today = getBusinessDate(getNow());
                  selectedDate.setHours(0, 0, 0, 0);
                  today.setHours(0, 0, 0, 0);
                  const diffTime = selectedDate.getTime() - today.getTime();
                  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                  setDateOffset(diffDays);
                }
              }}
              className="border-slate-200 rounded-xl px-4 py-2 font-medium focus:ring-blue-500 focus:border-blue-500 bg-slate-50 text-slate-700 h-11 outline-none border"
            />
            {dateOffset !== 0 && (
              <button 
                onClick={() => setDateOffset(0)}
                className="px-4 py-2 bg-blue-100 text-blue-700 text-sm font-bold rounded-xl hover:bg-blue-200 transition-colors h-11 flex items-center"
              >
                วันนี้
              </button>
            )}
          </div>
        </div>

        <button 
          onClick={() => setDateOffset(prev => Math.min(7, prev + 1))}
          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
      </div>

      {/* Header & Legend */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">สมุดจอง & สถานะห้อง <span className="text-xs text-slate-400 font-normal ml-2">(v2)</span></h1>
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
            <button 
              onClick={() => setViewMode('grid')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              มุมมองตาราง
            </button>
            <button 
              onClick={() => setViewMode('map')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'map' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              มุมมองแผนผัง
            </button>
          </div>
        </div>
        
        {/* Legend & Actions */}
        <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center">
          <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-600 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-emerald-300 bg-white"></span>ว่าง</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-blue-300 bg-blue-100"></span>มีแขกพัก</div>
            {dateOffset === 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-orange-300 bg-orange-100"></span>รอทำความสะอาด</div>}
            {dateOffset > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-purple-300 bg-purple-100"></span>จองแล้ว</div>}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 border-l border-slate-200 pl-4">12 13 = วันที่ติดจอง (ใน 7 วัน)</div>
          </div>
          
          {dateOffset === 0 && rooms.some(r => r.status === 'dirty') && (
            <button 
              onClick={handleCleanAllDirtyRooms}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 text-sm font-bold rounded-xl shadow-sm transition-colors active:scale-95"
            >
              🧹 ทำความสะอาดทุกห้อง
            </button>
          )}

          {dateOffset === 0 && rooms.some(r => r.status === 'occupied') && (
            <button 
              onClick={handleClearAllOccupiedRooms}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 hover:border-orange-300 text-sm font-bold rounded-xl shadow-sm transition-colors active:scale-95"
            >
              🚪 เคลียร์แขก (สำหรับทดสอบ)
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">กำลังโหลดข้อมูล...</div>
      ) : (
        <div className="space-y-8">
          {sortedLocations.map(loc => {
            const locRooms = groupedRooms[loc].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            return (
              <div key={loc} className="bg-slate-50/50 p-4 sm:p-6 rounded-2xl border border-slate-100">
                <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <span className="w-2 h-6 bg-slate-300 rounded-full"></span>
                  {loc}
                  <span className="text-sm font-normal text-slate-400">({locRooms.length} ห้อง)</span>
                </h2>
                
                {viewMode === 'grid' ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1.5 sm:gap-2 lg:gap-2.5">
                  {locRooms.map(room => {
                    const statusClass = getStatusClasses(room.status);
                    const details = getStayDetails(room);
                    
                    return (
                      <button
                        key={room.id}
                        onClick={() => handleRoomClick(room)}
                        className={`relative aspect-[16/15] w-full flex items-center justify-center rounded-xl border-2 transition-all active:scale-95 group overflow-hidden ${statusClass}`}
                      >
                        {/* Left Section (Details) */}
                        {(room.status === 'occupied' || room.status === 'reserved' || room.status === 'dirty') && (
                          <div className="absolute top-0.5 left-0 bottom-[24px] w-[30%] flex flex-col justify-between items-start text-[8.5px] sm:text-[9.5px] leading-none font-semibold opacity-90 pl-0.5 py-0.5">
                            {room.status === 'reserved' && room.booking_created_at ? (
                              <div className="flex flex-col items-start gap-[1px] w-full text-purple-600">
                                <div className="text-purple-400 h-[10px] flex items-center">
                                  {formatDateStr(room.booking_created_at) === formatDateStr(displayDate.toISOString()) ? (
                                    <span>&nbsp;</span>
                                  ) : (
                                    <>{formatDateStr(room.booking_created_at)}</>
                                  )}
                                </div>
                                <div className="font-bold text-purple-700">{formatTimeStr(room.booking_created_at)}</div>
                              </div>
                            ) : room.check_in_time && (
                              <div className="flex flex-col items-start gap-[1px] w-full">
                                <div className="text-slate-500 h-[10px] flex items-center">
                                  {formatDateStr(room.check_in_time) ? (
                                    <>{formatDateStr(room.check_in_time)}</>
                                  ) : (
                                    <span>&nbsp;</span>
                                  )}
                                </div>
                                <div className="font-bold text-slate-700">{formatTimeStr(room.check_in_time)}</div>
                              </div>
                            )}
                            
                            {room.status === 'occupied' || room.status === 'reserved' ? (
                              <div className="flex flex-row items-center gap-0 self-start -space-x-[3px] -ml-[2px]">
                                <div className="relative inline-flex items-center justify-center">
                                  <span className="text-[11.5px] leading-none opacity-40 grayscale">👤</span>
                                  <span className="absolute top-[1.5px] w-full text-center text-[8px] text-slate-900 font-black drop-shadow-sm">
                                    {room.guest_count || 1}
                                  </span>
                                </div>
                                {details && (
                                  <div className="relative inline-flex items-center justify-center">
                                    <span className="text-[11.5px] leading-none opacity-40 grayscale">{details.type === 'overnight' ? '🌙' : '⏳'}</span>
                                    {details.type === 'overnight' ? (
                                      <span className="absolute top-[1px] right-[1px] text-[8px] text-slate-900 font-black drop-shadow-sm">
                                        {details.text}
                                      </span>
                                    ) : (
                                      <span className="absolute bottom-[1px] w-full text-center text-[8px] text-slate-900 font-black drop-shadow-sm">
                                        {details.text}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {room.check_out_time && (
                              <div className="flex flex-col items-start gap-[1px] w-full">
                                <div className="font-bold text-slate-700">{formatTimeStr(room.check_out_time)}</div>
                                <div className="text-slate-500 h-[10px] flex items-center">
                                  {formatDateStr(room.check_out_time) ? (
                                    <>{formatDateStr(room.check_out_time)}</>
                                  ) : (
                                    <span>&nbsp;</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Center Section (Room No & Price) */}
                        <div className="flex-1 w-full h-full relative flex flex-col items-center justify-start pt-[22px] sm:pt-6 pb-[24px] z-10">
                          {(() => {
                            let isOverdue = false;
                            let overdueMinutes = 0;
                            if (room.status === 'occupied' && room.check_out_time) {
                              const coTime = new Date(room.check_out_time).getTime();
                              const nowTime = getNow().getTime();
                              if (nowTime >= coTime) {
                                overdueMinutes = (nowTime - coTime) / (1000 * 60);
                                if (overdueMinutes >= 45 && overdueMinutes < 225) {
                                  isOverdue = true;
                                }
                              }
                            }
                            
                            let roomNoColor = 'text-slate-700';
                            if (room.status === 'occupied' || room.status === 'reserved') {
                              const unpaid = room.unpaid_balance || 0;
                              const total = room.actual_price || 0;
                              if (unpaid > 0) {
                                if (total > 0 && unpaid < total) {
                                  roomNoColor = 'text-orange-500';
                                } else {
                                  roomNoColor = 'text-rose-600';
                                }
                              } else {
                                roomNoColor = 'text-emerald-500';
                              }
                            }

                            const isDouble = room.room_type?.includes('คู่');
                            const isHouse = room.room_type?.includes('บ้าน');
                            const isSeaBalcony = room.room_type?.includes('ระเบียงทะเล');
                            const isBalcony = !isSeaBalcony && room.room_type?.includes('ระเบียง');
                            const isWindow = room.room_type?.includes('หน้าต่าง');

                            return (
                              <div className={`absolute top-0 text-lg sm:text-xl font-black ${roomNoColor} transition-all leading-none flex items-center justify-center gap-0`}>
                                <span>{room.room_no}</span>
                                <div className="flex items-center text-[13px] leading-none -space-x-1 -ml-0.5 opacity-90">
                                  {isDouble ? (
                                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-[15px] h-[15px] sm:w-[17px] sm:h-[17px] opacity-90 drop-shadow-sm">
                                      <rect x="2" y="3" width="5" height="11" rx="1" fill="#cbd5e1"/>
                                      <rect x="2.5" y="4" width="4" height="2" rx="0.5" fill="#ffffff"/>
                                      <rect x="2" y="7" width="5" height="7" rx="1" fill="#64748b"/>
                                      <rect x="9" y="3" width="5" height="11" rx="1" fill="#cbd5e1"/>
                                      <rect x="9.5" y="4" width="4" height="2" rx="0.5" fill="#ffffff"/>
                                      <rect x="9" y="7" width="5" height="7" rx="1" fill="#64748b"/>
                                    </svg>
                                  ) : isHouse ? (
                                    <span className="text-slate-700 grayscale text-[15px] sm:text-base drop-shadow-sm">🏠</span>
                                  ) : null}
                                  {isSeaBalcony && <span className="text-slate-700 grayscale text-[13px] sm:text-[14px] drop-shadow-sm opacity-60">⛱️</span>}
                                  {isBalcony && <img src="/balcony.png" className="w-[20px] h-[20px] sm:w-[22px] sm:h-[22px] object-contain mix-blend-multiply opacity-80 translate-y-[1.5px]" alt="ระเบียง" />}
                                  {isWindow && <span className="text-slate-700 grayscale text-[15px] sm:text-base drop-shadow-sm">🪟</span>}
                                </div>

                                {isOverdue && (
                                  <span className="absolute -right-[14px] sm:-right-[18px] top-1/2 -translate-y-1/2 flex items-center justify-center">
                                    {overdueMinutes >= 195 ? (
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1e293b" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-[18px] sm:h-[18px]">
                                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                        <line x1="12" y1="9" x2="12" y2="13" stroke="#ffffff"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17" stroke="#ffffff"/>
                                      </svg>
                                    ) : (
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fee2e2" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-[18px] sm:h-[18px]">
                                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                      </svg>
                                    )}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          
                          {(room.status === 'dirty' || room.status === 'cleaning') && (
                            <div className="absolute bottom-1 sm:bottom-1.5 text-base sm:text-lg opacity-80 flex items-center justify-center">
                              <span className={room.status === 'cleaning' ? 'animate-broom-swing inline-block' : ''}>🧹</span>
                            </div>
                          )}

                          <div className="text-[11px] sm:text-xs font-bold text-slate-500 w-full z-20 flex flex-col items-center">
                            {(() => {
                              let basePriceText: string | number | null = null;
                              let diffText: string | null = null;
                              let diffColor = '';
                              let staffNameText: string | null = null;
                              
                              const defPrice = room.stay_type === 'short_stay' ? room.price_temp : room.price_night;

                              if (!room.status || room.status === 'available' || room.status === 'dirty') {
                                basePriceText = defPrice || room.price_night || null;
                              } else {
                                const defaultPrice = defPrice || null;
                                if (room.actual_price !== undefined && room.actual_price !== null) {
                                  if (defaultPrice && room.actual_price !== defaultPrice) {
                                    basePriceText = defaultPrice;
                                    const diff = room.actual_price - defaultPrice;
                                    diffText = diff > 0 ? `+${diff}` : `${diff}`;
                                    diffColor = diff > 0 ? 'text-emerald-500' : 'text-red-500';
                                  } else {
                                    basePriceText = room.actual_price;
                                  }
                                  staffNameText = room.staff_name || null;
                                } else if (defaultPrice) {
                                  basePriceText = defaultPrice;
                                }
                              }

                              return (
                                <div className="w-full flex flex-col items-center gap-1 sm:gap-1.5">
                                  {/* Line 1: Base Price */}
                                  <div className="h-[12px] sm:h-[14px] flex items-center justify-center">
                                    {basePriceText !== null && (
                                      <span className="opacity-40 text-[12px] sm:text-[13px] leading-none">{basePriceText}</span>
                                    )}
                                  </div>
                                  
                                  {/* Line 2: Difference */}
                                  <div className="h-[10px] sm:h-[12px] flex items-center justify-center">
                                    {diffText && (
                                      <span className={`${diffColor} leading-none`}>({diffText})</span>
                                    )}
                                  </div>
                                  
                                  {/* Line 3: Staff Name */}
                                  <div className="h-[10px] sm:h-[12px] flex items-center justify-center">
                                    {staffNameText && (
                                      <span className="text-[8px] sm:text-[9px] text-slate-400 font-medium leading-none">{staffNameText}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Right Section (7-Day Availability Indicator) */}
                        {((room.has_upcoming && room.upcoming_days && room.upcoming_days.length > 0) || (room.incoming_today && (room.status === 'occupied' || room.status === 'dirty'))) && (
                          <div className={`absolute top-0 right-1 bottom-[24px] flex flex-col items-end ${((room.upcoming_days?.length || 0) + (room.incoming_today && (room.status === 'occupied' || room.status === 'dirty') ? 1 : 0)) >= 6 ? 'justify-between py-1 gap-0' : 'gap-[2px] pt-1'} text-slate-400 overflow-hidden pr-0.5`}>
                            {room.incoming_today && (room.status === 'occupied' || room.status === 'dirty') && (
                              <span className="font-black leading-none text-[11px] text-emerald-500 animate-[pulse_1s_ease-in-out_infinite]">
                                {displayDate.getDate()}
                              </span>
                            )}
                            {room.upcoming_days?.map((dateNum, i) => {
                              const isUrgent = dateNum === tomorrowDayNum;
                              const totalItems = (room.upcoming_days?.length || 0) + (room.incoming_today && (room.status === 'occupied' || room.status === 'dirty') ? 1 : 0);
                              const textSize = totalItems >= 6 ? (isUrgent ? 'text-[9px]' : 'text-[8px]') : (isUrgent ? 'text-[11px]' : 'text-[10px]');
                              return (
                                <span 
                                  key={i} 
                                  className={`font-black leading-none ${textSize} ${isUrgent ? "text-emerald-500 animate-[pulse_2s_ease-in-out_infinite]" : ""}`}
                                >
                                  {dateNum}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      
                                                {/* Financial Summary for Occupied Rooms */}
                        {room.status === 'occupied' && (
                          <div className="absolute bottom-0 left-0 right-0 w-full h-[24px] flex items-center justify-center gap-0.5 sm:gap-1 text-[9px] sm:text-[9.5px] font-black z-30 whitespace-nowrap bg-white/60 backdrop-blur-[1px] border-t border-slate-300/40 text-slate-500 tracking-tight overflow-hidden px-0.5">
                            <span>{room.total_charges || 0}</span>
                            <span className="text-slate-300 font-bold">-</span>
                            <span>{room.total_payments || 0}</span>
                            <span className="text-slate-300 font-bold">=</span>
                            <span className={((room.unpaid_balance || 0) < 0) ? 'text-blue-400' : (room.unpaid_balance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                              {room.unpaid_balance || 0}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="relative w-full max-w-5xl mx-auto bg-slate-200 rounded-xl shadow-inner border border-slate-200 overflow-hidden flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
                    <svg className="w-16 h-16 text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    <h3 className="text-xl font-bold text-slate-700">อยู่ระหว่างการพัฒนา</h3>
                    <p className="text-slate-500 mt-2 text-center max-w-md">ฟีเจอร์แผนผังห้องพักกำลังอยู่ในขั้นตอนการพัฒนา เพื่อประสบการณ์ใช้งานที่ดีที่สุด</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedRoom && (
        <RoomCheckinModal
          room={selectedRoom}
          dateOffset={dateOffset}
          onClose={() => setSelectedRoom(null)}
          onUpdate={() => {
            fetchData();
            setSelectedRoom(null);
          }}
        />
      )}
    </div>
  );
}


