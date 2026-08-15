"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoomStatus } from "../checkin/page";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";
import BillingModal from "./BillingModal";
import { useShift } from "@/contexts/ShiftContext";

interface ModalProps {
  room: RoomStatus;
  dateOffset: number;
  onClose: () => void;
  onUpdate: () => void;
}

export default function RoomCheckinModal({ room, dateOffset, onClose, onUpdate }: ModalProps) {
  const { getNow } = useSimulatedTime();
  const { activeShift } = useShift();
  const [showBilling, setShowBilling] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestCount, setGuestCount] = useState<number | ''>(room.guest_count || 2);
  const [guestName, setGuestName] = useState<string>(room.guest_name || "");
  const [guestPhone, setGuestPhone] = useState<string>(room.guest_phone || "");
  const [nights, setNights] = useState<number | ''>(() => {
    if (dateOffset === 0) {
      const h = getNow().getHours();
      if (h >= 0 && h < 7) return 0; // Late night defaults to 0 nights (checkout today noon)
    }
    return 1;
  });
  const [hours, setHours] = useState<number | ''>(3);
  const [extendHours, setExtendHours] = useState<number | ''>(1);
  const [extendNights, setExtendNights] = useState<number | ''>(1);
  const [activeTab, setActiveTab] = useState<'overnight' | 'short_stay'>('overnight');
  const [actualPrice, setActualPrice] = useState<number | ''>(room.actual_price || room.price_night || '');
  const [staffName, setStaffName] = useState<string>(room.staff_name || '');
  
  // สถานะสำหรับการย้ายห้อง
  const [isChangingRoom, setIsChangingRoom] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<{id: string, room_no: string, price_night: number, price_temp: number, location?: string, sort_order?: number}[]>([]);
  const [targetRoomId, setTargetRoomId] = useState<string>('');
  const [oldRoomStatus, setOldRoomStatus] = useState<'dirty' | 'available'>('dirty');
  const [priceDecision, setPriceDecision] = useState<'keep' | 'update'>('keep');

  // สำหรับเลื่อนวัน/ย้ายห้อง (Reschedule)
  const [isReschedulingBooking, setIsReschedulingBooking] = useState(false);
  const [rescheduleCheckIn, setRescheduleCheckIn] = useState<string>('');
  const [rescheduleCheckOut, setRescheduleCheckOut] = useState<string>('');
  const [availableRoomsForReschedule, setAvailableRoomsForReschedule] = useState<{id: string, room_no: string, price_night: number, price_temp: number, location?: string}[]>([]);
  const [rescheduleTargetRoomId, setRescheduleTargetRoomId] = useState<string>('');

  const [dynamicPricingDetails, setDynamicPricingDetails] = useState<{
    base: number;
    weekendSurcharge: number;
    holidaySurcharge: number;
    lowOccupancySurcharge: number;
    total: number;
    isSurgeDisabled: boolean;
    surgeDisableTimeString?: string;
  } | null>(null);

  useEffect(() => {
    async function calculateDynamicPrice() {
      if (room.status && room.status !== 'available') {
        // สำหรับห้องที่มีแขกแล้ว แค่เซ็ตราคาเดิม หรือปล่อยผ่าน
        return;
      }
      
      const base = activeTab === 'overnight' ? (room.price_night || 0) : (room.price_temp || 0);
      
      // ดึงกฎราคาแปรผัน
      const { data: rulesData } = await supabase.from('system_settings').select('value').eq('key', 'smart_pricing_rules').maybeSingle();
      const rules = rulesData?.value || { weekend_surcharge: 0, holiday_surcharge: 0, holiday_mode_active: false, low_occupancy_surcharge: 0, low_occupancy_threshold_percent: 0, disable_surge_after_2130: false, surge_disable_time: "21:30" };
      
      let weekendSurcharge = 0;
      let holidaySurcharge = 0;
      let lowOccupancySurcharge = 0;
      let isSurgeDisabled = false;
      let surgeDisableTimeString = rules.surge_disable_time || "21:30";

      // 1. ตรวจสอบวันศุกร์-เสาร์
      const now = getNow();
      const currentDay = now.getDay(); // 0 = อาทิตย์, 5 = ศุกร์, 6 = เสาร์
      if (currentDay === 5 || currentDay === 6) {
        weekendSurcharge = Number(rules.weekend_surcharge) || 0;
      }
      
      // 2. ตรวจสอบเทศกาล
      if (rules.holiday_mode_active) {
        holidaySurcharge = Number(rules.holiday_surcharge) || 0;
      }

      // 3. ตรวจสอบห้องว่าง (ยกเว้นบ้าน)
      if (Number(rules.low_occupancy_threshold_percent) > 0) {
        const { data: rooms } = await supabase.from('rooms').select('status, room_type').neq('room_type', 'บ้าน');
        if (rooms && rooms.length > 0) {
          const totalRooms = rooms.length;
          const availableCount = rooms.filter(r => r.status === 'available' || !r.status || r.status === 'dirty').length;
          const availablePercent = (availableCount / totalRooms) * 100;
          
          if (availablePercent < Number(rules.low_occupancy_threshold_percent)) {
            // เช็คเวลาหลังที่กำหนด
            const [disableHour, disableMin] = surgeDisableTimeString.split(':').map(Number);
            const isLateNight = now.getHours() > disableHour || (now.getHours() === disableHour && now.getMinutes() >= disableMin);
            if (rules.disable_surge_after_2130 && isLateNight) {
              isSurgeDisabled = true;
            } else {
              lowOccupancySurcharge = Number(rules.low_occupancy_surcharge) || 0;
            }
          }
        }
      }

      const total = base + weekendSurcharge + holidaySurcharge + lowOccupancySurcharge;
      
      setDynamicPricingDetails({
        base,
        weekendSurcharge,
        holidaySurcharge,
        lowOccupancySurcharge,
        total,
        isSurgeDisabled,
        surgeDisableTimeString
      });
      
      setActualPrice(total);
    }
    
    calculateDynamicPrice();
  }, [activeTab, room.price_night, room.price_temp, room.status, getNow]);

  const displayDate = getNow();
  displayDate.setDate(displayDate.getDate() + dateOffset);

  // คำนวณ Time Band
  const now = getNow();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  let timeBand = 'normal';
  if (dateOffset === 0) {
    const totalMinutes = currentHour * 60 + currentMinute;
    if (totalMinutes < 6 * 60 + 45) { // 00:00 ถึง 06:44
      timeBand = 'late_night';
    } else if (totalMinutes < 9 * 60 + 45) { // 06:45 ถึง 09:44
      timeBand = 'early_in';
    }
  }

  const getNextNoon = (startDate: Date, nightsCount: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + nightsCount);
    d.setHours(12, 0, 0, 0);
    return d;
  };

  const handleCheckIn = async (type: 'overnight' | 'short_stay', isReservationForToday: boolean = false) => {
    if (!activeShift) {
      alert('กรุณาเปิดกะก่อนทำการจองหรือ Check-in');
      return;
    }
    if (!guestPhone.trim() || guestPhone.length !== 10 || !/^\d+$/.test(guestPhone)) {
      alert('กรุณากรอกเบอร์โทรศัพท์ลูกค้า (ตัวเลข 10 หลัก) ให้ถูกต้อง');
      return;
    }
    setLoading(true);
    const startDate = new Date(displayDate);
    if (dateOffset > 0 || isReservationForToday) {
      // ถ้าจองล่วงหน้า หรือจองของวันนี้ที่ยังไม่มาถึง ให้เวลาเริ่มคือ 14:00 น. ของวันนั้น
      startDate.setHours(14, 0, 0, 0);
    }

    let checkoutDate = new Date(startDate);

    if (type === 'overnight') {
      checkoutDate = getNextNoon(startDate, Number(nights) || 0);
    } else {
      checkoutDate = new Date(startDate.getTime() + (Number(hours) || 1) * 60 * 60 * 1000);
    }

    // 1. บันทึกลงตาราง Bookings (ประวัติ/สมุดจอง)
    const { data: insertedBooking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        room_id: room.id,
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim(),
        check_in_time: startDate.toISOString(),
        check_out_time: checkoutDate.toISOString(),
        status: (dateOffset === 0 && !isReservationForToday) ? 'checked_in' : 'reserved',
        guest_count: Number(guestCount) || 1,
        actual_price: actualPrice === '' ? null : Number(actualPrice),
        staff_name: staffName || null
      })
      .select('id')
      .single();

    // 1.5 บันทึกรายได้ค่าห้อง (Revenue) อัตโนมัติ (เฉพาะครั้งแรก)
    if (insertedBooking && actualPrice !== '') {
      await supabase.from('ledger_transactions').insert({
        shift_id: activeShift.id,
        staff_name: activeShift.staff_name,
        room_id: room.id,
        booking_id: insertedBooking.id,
        transaction_type: 'revenue',
        category: 'room_charge',
        amount: Number(actualPrice)
      });
    }

    // 2. ถ้าเป็นการ Check-in จริงๆ ใน "วันนี้" (ไม่ใช่แค่จอง) ให้บันทึกลงตาราง Rooms ด้วย
    if (dateOffset === 0 && !isReservationForToday && !bookingError) {
      await supabase
        .from('rooms')
        .update({
          status: 'occupied',
          stay_type: type,
          check_in_time: startDate.toISOString(),
          check_out_time: checkoutDate.toISOString(),
          guest_count: Number(guestCount) || 1,
          current_status: `มีแขก (${type === 'overnight' ? 'ค้างคืน' : 'ชั่วคราว'})`,
          actual_price: actualPrice === '' ? null : Number(actualPrice),
          staff_name: staffName || null
        })
        .eq('id', room.id);
    }

    setLoading(false);
    onUpdate();
  };

  const handleCheckInReserved = async () => {
    if (!room.booking_id) {
      alert('ไม่พบข้อมูลการจอง');
      return;
    }
    setLoading(true);
    
    // 1. Update Booking Status
    const { error: bookingError } = await supabase
      .from('bookings')
      .update({ status: 'checked_in' })
      .eq('id', room.booking_id);

    // 2. Update Rooms Table (To activate IoT)
    if (!bookingError) {
      await supabase
        .from('rooms')
        .update({
          status: 'occupied',
          stay_type: 'overnight',
          check_in_time: getNow().toISOString(), // actual check-in time instead of booked time
          check_out_time: room.check_out_time, // original checkout time
          guest_count: room.guest_count,
          current_status: `มีแขก (ค้างคืน)`,
          actual_price: room.actual_price,
          staff_name: room.staff_name || null
        })
        .eq('id', room.id);
    }
    
    setLoading(false);
    onUpdate();
  };

  const handleCheckOut = async () => {
    if (room.unpaid_balance && room.unpaid_balance > 0) {
      alert(`ลูกค้ามียอดค้างชำระ ${room.unpaid_balance.toLocaleString()} บาท กรุณากด "จัดการบิล / ชำระเงิน" เพื่อรับชำระให้ครบก่อน Check-out`);
      return;
    }
    
    setLoading(true);
    
    const isCancelling = room.status === 'reserved';

    // 1. อัปเดตตาราง Rooms (เคลียร์ห้อง)
    if (dateOffset === 0) {
      await supabase
        .from('rooms')
        .update({
          status: isCancelling ? 'available' : 'dirty',
          stay_type: null,
          check_in_time: null,
          check_out_time: null,
          guest_count: 0,
          actual_price: null,
          staff_name: null,
          current_status: isCancelling ? 'ว่าง' : 'รอทำความสะอาด'
        })
        .eq('id', room.id);
    }

    // 2. อัปเดตตาราง Bookings (ตั้งสถานะเป็น checked_out หรือ cancelled ถ้าเป็นอนาคตหรือการยกเลิก)
    const startOfDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate(), 23, 59, 59);
    
    await supabase
      .from('bookings')
      .update({ status: dateOffset > 0 || isCancelling ? 'cancelled' : 'checked_out' })
      .eq('room_id', room.id)
      .eq('status', dateOffset > 0 || isCancelling ? 'reserved' : 'checked_in')
      .lte('check_in_time', endOfDay.toISOString())
      .gt('check_out_time', startOfDay.toISOString());
    
    setLoading(false);
    onUpdate();
  };

  const fetchAvailableRooms = async () => {
    setLoading(true);
    
    // 1. Fetch system_settings for location order
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .single();

    const savedOrder = settingsData?.value as string[] || [];

    // 2. Fetch available rooms
    const { data: roomsData } = await supabase
      .from('rooms')
      .select('id, room_no, price_night, price_temp, location, sort_order')
      .eq('status', 'available');
    
    if (roomsData) {
      // 3. Sort rooms based on location order then room sort_order
      const sortedRooms = roomsData.sort((a, b) => {
        const locA = a.location || "ไม่มีสถานที่";
        const locB = b.location || "ไม่มีสถานที่";
        
        let locIndexA = savedOrder.indexOf(locA);
        let locIndexB = savedOrder.indexOf(locB);
        
        // If location is not in savedOrder, put it at the end
        if (locIndexA === -1) locIndexA = 9999;
        if (locIndexB === -1) locIndexB = 9999;

        if (locIndexA !== locIndexB) {
          return locIndexA - locIndexB;
        }
        
        // Same location, sort by sort_order
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      setAvailableRooms(sortedRooms);
      if (sortedRooms.length > 0) setTargetRoomId(sortedRooms[0].id);
    }
    setLoading(false);
  };

  const fetchAvailableRoomsForDate = async (inDateStr: string, outDateStr: string) => {
    setLoading(true);
    const inDate = new Date(inDateStr);
    const outDate = new Date(outDateStr);
    
    const { data: settingsData } = await supabase.from("system_settings").select("value").eq("key", "locations_order").single();
    const savedOrder = settingsData?.value as string[] || [];

    const { data: roomsData } = await supabase.from('rooms').select('id, room_no, price_night, price_temp, location, sort_order');
    
    const { data: overlappingBookings } = await supabase.from('bookings')
      .select('room_id, id')
      .neq('status', 'cancelled')
      .lt('check_in_time', outDate.toISOString())
      .gt('check_out_time', inDate.toISOString());

    if (roomsData) {
      const bookedRoomIds = (overlappingBookings || []).filter(b => b.id !== room.booking_id).map(b => b.room_id);
      
      const available = roomsData.filter(r => !bookedRoomIds.includes(r.id));
      
      const sortedRooms = available.sort((a, b) => {
        const locA = a.location || "ไม่มีสถานที่";
        const locB = b.location || "ไม่มีสถานที่";
        let locIndexA = savedOrder.indexOf(locA);
        let locIndexB = savedOrder.indexOf(locB);
        if (locIndexA === -1) locIndexA = 9999;
        if (locIndexB === -1) locIndexB = 9999;
        if (locIndexA !== locIndexB) return locIndexA - locIndexB;
        return (a.sort_order || 999) - (b.sort_order || 999);
      });

      setAvailableRoomsForReschedule(sortedRooms);
      if (sortedRooms.length > 0) {
        const currentRoomAvailable = sortedRooms.find(r => r.id === room.id);
        setRescheduleTargetRoomId(currentRoomAvailable ? currentRoomAvailable.id : sortedRooms[0].id);
      } else {
        setRescheduleTargetRoomId('');
      }
    }
    setLoading(false);
  };

  const handleCheckInChange = (newDateStr: string) => {
    if (!newDateStr) return;
    const oldIn = new Date(rescheduleCheckIn);
    const newIn = new Date(newDateStr);
    
    if (!isNaN(oldIn.getTime()) && rescheduleCheckOut) {
      const outDate = new Date(rescheduleCheckOut);
      const diffMs = newIn.getTime() - oldIn.getTime();
      outDate.setTime(outDate.getTime() + diffMs);
      
      const yyyy = outDate.getFullYear();
      const mm = String(outDate.getMonth() + 1).padStart(2, '0');
      const dd = String(outDate.getDate()).padStart(2, '0');
      setRescheduleCheckOut(`${yyyy}-${mm}-${dd}`);
    }
    setRescheduleCheckIn(newDateStr);
  };

  useEffect(() => {
    if (isReschedulingBooking && rescheduleCheckIn && rescheduleCheckOut) {
      fetchAvailableRoomsForDate(rescheduleCheckIn, rescheduleCheckOut);
    }
  }, [rescheduleCheckIn, rescheduleCheckOut, isReschedulingBooking]);

  const handleRescheduleBooking = async () => {
    if (!room.booking_id) {
      alert("ไม่พบรหัสการจอง");
      return;
    }
    if (!rescheduleCheckIn || !rescheduleCheckOut) {
      alert("กรุณาเลือกวันที่เช็คอินและเช็คเอาท์");
      return;
    }
    setLoading(true);

    const targetRoom = availableRoomsForReschedule.find(r => r.id === rescheduleTargetRoomId);
    if (!targetRoom) {
      setLoading(false);
      return;
    }

    let newActualPrice = room.actual_price;
    if (priceDecision === 'update') {
      newActualPrice = room.stay_type === 'overnight' ? targetRoom.price_night : targetRoom.price_temp;
    }

    const newCheckInDate = new Date(rescheduleCheckIn);
    newCheckInDate.setHours(14, 0, 0, 0);
    const newCheckOutDate = new Date(rescheduleCheckOut);
    newCheckOutDate.setHours(12, 0, 0, 0);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        room_id: targetRoom.id,
        check_in_time: newCheckInDate.toISOString(),
        check_out_time: newCheckOutDate.toISOString(),
        actual_price: newActualPrice
      })
      .eq('id', room.booking_id);

    setLoading(false);
    if (!updateError) {
      alert("ย้ายการจองสำเร็จ");
      onUpdate();
    } else {
      alert("เกิดข้อผิดพลาดในการย้ายการจอง");
    }
  };

  const handleChangeRoom = async () => {
    if (!targetRoomId) return;
    setLoading(true);

    const targetRoom = availableRooms.find(r => r.id === targetRoomId);
    if (!targetRoom) return;

    // หา booking ปัจจุบันของห้องเก่า (ห้องเดิม)
    const startOfDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate(), 23, 59, 59);

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, guest_name, check_in_time, check_out_time, guest_count')
      .eq('room_id', room.id)
      .eq('status', 'checked_in')
      .lte('check_in_time', endOfDay.toISOString())
      .gt('check_out_time', startOfDay.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    const booking = bookings?.[0];

    // คำนวณราคาใหม่ (ถ้าเลือกอัปเดต) หรือ คงราคาเดิม
    let newActualPrice = room.actual_price;
    if (priceDecision === 'update') {
      newActualPrice = room.stay_type === 'overnight' ? targetRoom.price_night : targetRoom.price_temp;
    }

    // 1. อัปเดตตาราง Rooms (ห้องใหม่)
    const { error: err1 } = await supabase
      .from('rooms')
      .update({
        status: 'occupied',
        stay_type: room.stay_type,
        check_in_time: room.check_in_time,
        check_out_time: room.check_out_time,
        guest_count: room.guest_count,
        actual_price: newActualPrice,
        staff_name: room.staff_name,
        current_status: `ย้ายมาจาก ${room.room_no}`
      })
      .eq('id', targetRoomId);
    
    if (err1) {
      alert('Error updating new room: ' + err1.message);
      setLoading(false);
      return;
    }

    // 2. อัปเดตตาราง Rooms (ห้องเก่า)
    const { error: err2 } = await supabase
      .from('rooms')
      .update({
        status: oldRoomStatus,
        stay_type: null,
        check_in_time: null,
        check_out_time: null,
        guest_count: 0,
        actual_price: null,
        staff_name: null,
        current_status: oldRoomStatus === 'dirty' ? 'รอทำความสะอาด (หลังย้าย)' : 'ว่าง (สะอาดย้ายห้อง)'
      })
      .eq('id', room.id);

    if (err2) {
      alert('Error updating old room: ' + err2.message);
      setLoading(false);
      return;
    }

    // 3. อัปเดตตาราง Bookings (ย้ายบิลไปห้องใหม่)
    if (booking) {
      await supabase
        .from('bookings')
        .update({ room_id: targetRoomId })
        .eq('id', booking.id);
    }

    setLoading(false);
    onUpdate();
  };

  const handleClean = async () => {
    setLoading(true);
    await supabase
      .from('rooms')
      .update({
        status: 'available',
        current_status: 'ว่าง (สะอาด)'
      })
      .eq('id', room.id);
    
    setLoading(false);
    onUpdate();
  };

  const handleExtend = async (type: 'nights' | 'hours') => {
    if (!room.check_out_time) return;
    setLoading(true);
    
    const currentCheckout = new Date(room.check_out_time);
    if (type === 'nights') {
      currentCheckout.setDate(currentCheckout.getDate() + (Number(extendNights) || 1));
    } else {
      currentCheckout.setHours(currentCheckout.getHours() + (Number(extendHours) || 1));
    }

    // อัปเดตเวลาออกในตาราง rooms (ถ้าเป็นวันนี้)
    if (dateOffset === 0) {
      await supabase
        .from('rooms')
        .update({
          check_out_time: currentCheckout.toISOString(),
          stay_type: type === 'nights' ? 'overnight' : room.stay_type
        })
        .eq('id', room.id);
    }

    // อัปเดตเวลาออกในตาราง bookings
    const startOfDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate(), 23, 59, 59);
    
    await supabase
      .from('bookings')
      .update({ check_out_time: currentCheckout.toISOString() })
      .eq('room_id', room.id)
      .lte('check_in_time', endOfDay.toISOString())
      .gt('check_out_time', startOfDay.toISOString());

    setLoading(false);
    onUpdate();
  };

  // ถ้าย้อนอดีต ให้ดูได้อย่างเดียว
  if (dateOffset < 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
          <h2 className="text-xl font-black text-slate-800 mb-4">ประวัติห้อง {room.room_no}</h2>
          {room.status === 'occupied' ? (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
              <p className="text-sm font-medium">แขกเข้าพัก: {room.guest_count} คน</p>
              <p className="text-sm text-slate-500">ชื่อ: {room.guest_name}</p>
              <p className="text-sm text-slate-500">เข้า: {new Date(room.check_in_time!).toLocaleString('th-TH')}</p>
              <p className="text-sm text-slate-500">ออก: {new Date(room.check_out_time!).toLocaleString('th-TH')}</p>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-4">ไม่มีประวัติการเข้าพักในวันนี้</div>
          )}
          <button onClick={onClose} className="mt-6 w-full py-3 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold transition-colors">ปิด</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-full flex flex-col overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <div>
            <h2 className="text-xl font-black text-slate-800">ห้อง {room.room_no}</h2>
            {dateOffset > 0 && <p className="text-xs text-purple-600 font-bold">โหมดจองล่วงหน้า (วันที่ {displayDate.toLocaleDateString('th-TH')})</p>}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          
          {/* 1. ห้องว่าง -> รอการเข้าพัก หรือ เพิ่มการจองล่วงหน้า */}
          {(!room.status || room.status === 'available') && (
            <div className="space-y-6">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setActiveTab('overnight')}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'overnight' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  🌙 ค้างคืน
                </button>
                {dateOffset === 0 && ( // โหมดชั่วคราว มีเฉพาะเช็คอินวันนี้
                  <button 
                    onClick={() => setActiveTab('short_stay')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'short_stay' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    ⏳ ชั่วคราว
                  </button>
                )}
              </div>

              {timeBand === 'early_in' && activeTab === 'overnight' && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-sm font-medium">
                  ⚠️ <b>เตือน:</b> เข้าพักก่อนเวลา (06:45-09:44) ต้องเรียกเก็บเงินค่าเข้าพักก่อนเวลาเพิ่มเติม (ราคาชั่วคราว + ราคาปกติ)
                </div>
              )}

              {timeBand === 'late_night' && activeTab === 'overnight' && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg text-sm font-medium">
                  ℹ️ <b>รอบดึก:</b> เช็คอินรอบนี้ถือเป็นของเมื่อวาน ค่าเริ่มต้นคือ 0 คืน (ออก 12:00 น. วันนี้) 
                  หากต้องการให้ออกพรุ่งนี้ กรุณาเปลี่ยนเป็น 1 หรือ 2 คืน
                </div>
              )}

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อลูกค้า</label>
                    <input 
                      type="text" 
                      value={guestName} onChange={(e) => setGuestName(e.target.value)}
                      placeholder="ชื่อ-นามสกุล"
                      className="w-full border-slate-200 rounded-xl px-4 py-3 font-medium focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">เบอร์โทรศัพท์ <span className="text-red-500">*</span></label>
                    <input 
                      type="tel" maxLength={10}
                      value={guestPhone} onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="ตัวเลข 10 หลัก"
                      className="w-full border-slate-200 rounded-xl px-4 py-3 font-medium focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนผู้เข้าพัก (คน)</label>
                  <input 
                    type="number" min="1" 
                    value={guestCount} onChange={(e) => setGuestCount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                  />
                </div>
                {dynamicPricingDetails && (dynamicPricingDetails.weekendSurcharge > 0 || dynamicPricingDetails.holidaySurcharge > 0 || dynamicPricingDetails.lowOccupancySurcharge > 0 || dynamicPricingDetails.isSurgeDisabled) && (
                  <div className="bg-slate-100 rounded-xl p-3 text-sm flex flex-col gap-1 border border-slate-200">
                    <p className="font-bold text-slate-700">⚡ การคำนวณราคาอัตโนมัติ:</p>
                    <ul className="text-slate-600 space-y-1 ml-4 list-disc">
                      {dynamicPricingDetails.weekendSurcharge > 0 && <li>บวกเพิ่มวันหยุดสุดสัปดาห์: +{dynamicPricingDetails.weekendSurcharge} บ.</li>}
                      {dynamicPricingDetails.holidaySurcharge > 0 && <li>บวกเพิ่มเทศกาล: +{dynamicPricingDetails.holidaySurcharge} บ.</li>}
                      {dynamicPricingDetails.lowOccupancySurcharge > 0 && <li>บวกเพิ่มห้องเหลือน้อย: +{dynamicPricingDetails.lowOccupancySurcharge} บ.</li>}
                      {dynamicPricingDetails.isSurgeDisabled && <li className="text-orange-600">ห้องเหลือน้อย แต่ยกเลิกบวกราคา (หลัง {dynamicPricingDetails.surgeDisableTimeString} น.)</li>}
                    </ul>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ราคาห้อง (Price)</label>
                  <input 
                    type="number" min="0" 
                    value={actualPrice} onChange={(e) => setActualPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-emerald-500 focus:border-emerald-500 bg-emerald-50 text-emerald-700"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">พนักงานที่รับเช็คอิน</label>
                  <input 
                    type="text" 
                    value={staffName} onChange={(e) => setStaffName(e.target.value)}
                    placeholder="ใส่ชื่อพนักงาน"
                    className="w-full border-slate-200 rounded-xl px-4 py-3 font-medium focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                  />
                </div>
                
                {activeTab === 'overnight' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนคืน 🌙</label>
                    <input 
                      type="number" min="0" 
                      value={nights} onChange={(e) => setNights(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      ออกวันที่: {getNextNoon(displayDate, Number(nights) || 0).toLocaleString('th-TH')}
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนชั่วโมง ⏳</label>
                    <input 
                      type="number" min="1" 
                      value={hours} onChange={(e) => setHours(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-amber-500 focus:border-amber-500 bg-slate-50"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2 w-full mt-6">
                {dateOffset === 0 && activeTab === 'overnight' && (
                  <button 
                    onClick={() => handleCheckIn(activeTab, true)} disabled={loading}
                    className="w-1/2 py-4 text-white font-bold rounded-xl text-lg transition-all active:scale-95 bg-purple-600 hover:bg-purple-700 shadow-purple-600/20 shadow-lg"
                  >
                    📝 จองไว้ก่อน
                  </button>
                )}
                <button 
                  onClick={() => handleCheckIn(activeTab)} disabled={loading}
                  className={`${dateOffset === 0 && activeTab === 'overnight' ? 'w-1/2' : 'w-full'} py-4 text-white font-bold rounded-xl text-lg transition-all active:scale-95 ${dateOffset > 0 ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20 shadow-lg' : activeTab === 'overnight' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 shadow-lg' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 shadow-lg'}`}
                >
                  {loading ? 'กำลังบันทึก...' : dateOffset > 0 ? '📅 บันทึกการจองล่วงหน้า' : activeTab === 'overnight' ? (timeBand === 'late_night' ? `✅ check-in (เมื่อวานนี้) = ${nights} คืน` : timeBand === 'early_in' ? `✅ early+check-in = ${nights} คืน` : `✅ check-in = ${nights} คืน`) : `✅ Check-in ชั่วคราว`}
                </button>
              </div>
            </div>
          )}

          {/* 2. ห้องมีแขกพัก หรือ จองแล้ว -> Check-out หรือ ยกเลิก */}
          {(room.status === 'occupied' || room.status === 'reserved') && (
            <div className="space-y-6">
              <div className={`${room.status === 'reserved' ? 'bg-purple-50 border-purple-100' : 'bg-blue-50 border-blue-100'} p-4 rounded-xl border mb-6`}>
                <div className="flex justify-between items-start mb-3 gap-2">
                  <span className="text-sm font-medium text-slate-700 shrink-0 pt-1">{room.status === 'reserved' ? 'จองโดย:' : 'ผู้เข้าพัก:'}</span>
                  <div className="flex flex-wrap justify-end items-center gap-x-2 gap-y-1 text-right">
                    <span className="text-lg font-bold text-slate-900">{room.guest_name || `👤 ${room.guest_count} คน`}</span>
                    {room.guest_phone && <span className="text-sm font-medium text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-sm">📞 {room.guest_phone}</span>}
                    {room.staff_name && <span className="text-sm font-medium text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-sm">🤵 {room.staff_name}</span>}
                  </div>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-700">เวลาออก:</span>
                  <span className="text-sm font-bold text-slate-900 bg-white px-2 py-1 rounded shadow-sm">
                    {room.check_out_time ? new Date(room.check_out_time).toLocaleString('th-TH') : '-'}
                  </span>
                </div>
                {room.status === 'occupied' && dateOffset === 0 && !isChangingRoom && (
                  <button 
                    onClick={() => { setIsChangingRoom(true); fetchAvailableRooms(); }}
                    className="w-full mt-2 py-2 text-blue-600 bg-white border border-blue-200 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-50 transition-colors"
                  >
                    🔄 ต้องการย้ายห้อง?
                  </button>
                )}
                {room.status === 'reserved' && !isReschedulingBooking && (
                  <button 
                    onClick={() => { 
                      setIsReschedulingBooking(true);
                      if (room.check_in_time) setRescheduleCheckIn(room.check_in_time.split('T')[0]);
                      if (room.check_out_time) setRescheduleCheckOut(room.check_out_time.split('T')[0]);
                    }}
                    className="w-full mt-2 py-2 text-purple-600 bg-white border border-purple-200 rounded-lg text-sm font-bold shadow-sm hover:bg-purple-50 transition-colors"
                  >
                    📅 เลื่อนวัน / ย้ายห้อง
                  </button>
                )}
                {room.status === 'reserved' && dateOffset === 0 && !isReschedulingBooking && (
                  <button 
                    onClick={handleCheckInReserved} disabled={loading}
                    className="w-full py-4 mt-4 text-white font-bold rounded-xl text-lg bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {timeBand === 'early_in' ? '🚪 Early Check-in (เข้าพักก่อนเวลา)' : '🚪 Check-in (เข้าพักเลย)'}
                  </button>
                )}
              </div>

              {isReschedulingBooking && room.status === 'reserved' && (
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl mb-6 space-y-4">
                  <h3 className="font-bold text-purple-800 flex justify-between items-center">
                    <span>📅 เลื่อนวัน / ย้ายห้อง</span>
                    <button onClick={() => setIsReschedulingBooking(false)} className="text-slate-400 hover:text-slate-600">✖</button>
                  </h3>
                  
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">วันเช็คอินใหม่</label>
                      <input type="date" value={rescheduleCheckIn} onChange={(e) => {
                        handleCheckInChange(e.target.value);
                      }} className="w-full border-slate-200 rounded-lg px-2 py-2 text-sm bg-white" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">วันเช็คเอาท์ใหม่</label>
                      <input type="date" value={rescheduleCheckOut} onChange={(e) => {
                        setRescheduleCheckOut(e.target.value);
                      }} className="w-full border-slate-200 rounded-lg px-2 py-2 text-sm bg-white" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">เลือกห้องว่าง</label>
                    <select 
                      value={rescheduleTargetRoomId} onChange={e => setRescheduleTargetRoomId(e.target.value)}
                      className="w-full border-slate-200 rounded-lg px-3 py-2 bg-white"
                      disabled={loading || availableRoomsForReschedule.length === 0}
                    >
                      {availableRoomsForReschedule.length === 0 && <option value="">-- กรุณาเลือกวันที่ / ไม่มีห้องว่าง --</option>}
                      {availableRoomsForReschedule.map(r => (
                        <option key={r.id} value={r.id}>{r.location || 'ไม่มีสถานที่'} - ห้อง {r.room_no} (฿{r.price_night})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ราคาส่วนต่าง</label>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="priceDecision" checked={priceDecision === 'keep'} onChange={() => setPriceDecision('keep')} className="text-purple-600" />
                        <span className="text-xs font-medium">คงราคาเดิม (฿{room.actual_price})</span>
                      </label>
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="priceDecision" checked={priceDecision === 'update'} onChange={() => setPriceDecision('update')} className="text-purple-600" />
                        <span className="text-xs font-medium">อัปเดตราคาตามห้องใหม่</span>
                      </label>
                    </div>
                  </div>

                  <button 
                    onClick={handleRescheduleBooking} disabled={loading || !rescheduleTargetRoomId}
                    className="w-full py-3 text-white font-bold rounded-lg text-sm bg-purple-600 hover:bg-purple-700 shadow-purple-600/20 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? 'กำลังบันทึก...' : '👉 ยืนยันการเปลี่ยนแปลง'}
                  </button>
                </div>
              )}


              {isChangingRoom && room.status === 'occupied' && (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mb-6 space-y-4">
                  <h3 className="font-bold text-yellow-800 flex justify-between items-center">
                    <span>🔄 ย้ายลูกค้าไปห้องอื่น</span>
                    <button onClick={() => setIsChangingRoom(false)} className="text-slate-400 hover:text-slate-600">✖</button>
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">เลือกห้องปลายทาง (ที่ว่างอยู่)</label>
                    <select 
                      value={targetRoomId} onChange={e => setTargetRoomId(e.target.value)}
                      className="w-full border-slate-200 rounded-lg px-3 py-2 bg-white"
                      disabled={loading || availableRooms.length === 0}
                    >
                      {availableRooms.length === 0 && <option value="">-- ไม่มีห้องว่าง --</option>}
                      {availableRooms.map(r => (
                        <option key={r.id} value={r.id}>{r.location || 'ไม่มีสถานที่'} - ห้อง {r.room_no} (ค้างคืน: ฿{r.price_night} / ชั่วคราว: ฿{r.price_temp})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ส่วนต่างราคาห้อง</label>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="priceDecision" checked={priceDecision === 'keep'} onChange={() => setPriceDecision('keep')} className="text-blue-600" />
                        <span className="text-xs font-medium">คงราคาเดิมไว้ (฿{room.actual_price})</span>
                      </label>
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="priceDecision" checked={priceDecision === 'update'} onChange={() => setPriceDecision('update')} className="text-blue-600" />
                        <span className="text-xs font-medium">อัปเดตราคาตามห้องใหม่</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">สภาพห้อง {room.room_no} (ห้องเก่า)</label>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="oldRoomStatus" checked={oldRoomStatus === 'dirty'} onChange={() => setOldRoomStatus('dirty')} className="text-red-500" />
                        <span className="text-xs font-medium text-red-700">ใช้งานไปแล้ว (รอทำความสะอาด)</span>
                      </label>
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="oldRoomStatus" checked={oldRoomStatus === 'available'} onChange={() => setOldRoomStatus('available')} className="text-emerald-500" />
                        <span className="text-xs font-medium text-emerald-700">ยังไม่เลอะ (เปลี่ยนเป็นว่าง)</span>
                      </label>
                    </div>
                  </div>

                  <button 
                    onClick={handleChangeRoom} disabled={loading || !targetRoomId}
                    className="w-full py-3 text-white font-bold rounded-lg text-sm bg-yellow-600 hover:bg-yellow-700 shadow-yellow-600/20 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? 'กำลังย้าย...' : '👉 ยืนยันการย้ายห้อง'}
                  </button>
                </div>
              )}

              {/* ต่อเวลาเป็นคืน (แสดงเฉพาะเมื่อดูของวันนี้ และสถานะเข้าพักแล้ว) */}
              {dateOffset === 0 && room.status === 'occupied' && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-3.5 text-slate-400">🌙</span>
                      <input 
                        type="number" min="1" 
                        value={extendNights} onChange={(e) => setExtendNights(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full border-slate-200 rounded-xl pl-9 pr-4 py-3 font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 placeholder-slate-300"
                      />
                    </div>
                    <button 
                      onClick={() => handleExtend('nights')} disabled={loading}
                      className="bg-slate-800 text-white px-4 rounded-xl font-bold hover:bg-slate-900 active:scale-95"
                    >
                      ต่อเวลาพัก (+คืน)
                    </button>
                  </div>

                  {/* ต่อเวลาเป็นชั่วโมง */}
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-3.5 text-slate-400">⏳</span>
                      <input 
                        type="number" min="1" 
                        value={extendHours} onChange={(e) => setExtendHours(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full border-slate-200 rounded-xl pl-9 pr-4 py-3 font-bold focus:ring-amber-500 focus:border-amber-500 bg-slate-50 placeholder-slate-300"
                      />
                    </div>
                    <button 
                      onClick={() => handleExtend('hours')} disabled={loading}
                      className="bg-amber-100 text-amber-800 px-4 rounded-xl font-bold hover:bg-amber-200 active:scale-95 border border-amber-200"
                    >
                      ออกช้า (+ชม.)
                    </button>
                  </div>
                </>
              )}

              <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                {room.status === 'occupied' && (
                  <button 
                    onClick={() => setShowBilling(true)} disabled={loading || !room.booking_id}
                    className="w-full py-4 text-emerald-700 font-bold rounded-xl text-lg bg-emerald-100 hover:bg-emerald-200 shadow-emerald-500/10 shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    💳 จัดการบิล / ชำระเงิน / POS
                  </button>
                )}
                <button 
                  onClick={handleCheckOut} disabled={loading}
                  className="w-full py-4 text-white font-bold rounded-xl text-lg bg-red-500 hover:bg-red-600 shadow-red-500/20 shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {room.status === 'reserved' ? '❌ ยกเลิกการจอง' : '👋 Check-out ทันที'}
                </button>
              </div>
            </div>
          )}

          {/* 3. ห้องรอทำความสะอาด / กำลังทำความสะอาด (เฉพาะวันนี้) */}
          {(room.status === 'dirty' || room.status === 'cleaning') && dateOffset === 0 && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4 animate-bounce">🧹</div>
              <h3 className="text-lg font-bold text-slate-700 mb-6">
                {room.status === 'dirty' ? 'ห้องนี้กำลังรอทำความสะอาด' : 'กำลังทำความสะอาด...'}
              </h3>
              
              {room.status === 'dirty' ? (
                <button 
                  onClick={async () => {
                    setLoading(true);
                    await supabase.from('rooms').update({ status: 'cleaning', current_status: 'กำลังทำความสะอาด' }).eq('id', room.id);
                    setLoading(false);
                    onUpdate();
                  }}
                  disabled={loading}
                  className="w-full py-4 text-white font-bold rounded-xl text-lg bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20 shadow-lg transition-all active:scale-95 mb-3"
                >
                  {loading ? 'กำลังบันทึก...' : '▶️ เริ่มทำความสะอาด'}
                </button>
              ) : (
                <button 
                  onClick={handleClean} disabled={loading}
                  className="w-full py-4 text-white font-bold rounded-xl text-lg bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20 shadow-lg transition-all active:scale-95"
                >
                  {loading ? 'กำลังบันทึก...' : '✅ ทำความสะอาดเรียบร้อย'}
                </button>
              )}
            </div>
          )}

        </div>
      </div>
      
      {showBilling && room.booking_id && (
        <BillingModal 
          roomId={room.id}
          roomNo={room.room_no}
          bookingId={room.booking_id}
          onClose={() => setShowBilling(false)}
          onSuccess={() => { setShowBilling(false); onUpdate(); }}
        />
      )}
    </div>
  );
}


