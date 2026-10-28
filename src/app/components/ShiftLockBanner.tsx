"use client";

import { useShift } from "@/contexts/ShiftContext";

/** แถบแจ้งเตือนช่วงปิดรอบวัน: 05:30 ใกล้ล็อก / 06:30 ล็อกกะข้ามวัน */
export default function ShiftLockBanner() {
  const { activeShift, shiftLock } = useShift();
  if (!activeShift || (!shiftLock.locked && !shiftLock.nearLock)) return null;

  if (shiftLock.locked) {
    return (
      <div className="w-full bg-rose-600 text-white text-xs sm:text-sm font-bold px-3 py-2 text-center shadow-sm">
        🔒 เลยเวลาตัดรอบวันใหม่ (06:30 น.) — กะของ {activeShift.staff_name} ถูกล็อกการรับเงิน / เช็คอิน / เพิ่มค่าบริการ-มินิบาร์ / ค่าใช้จ่าย
        <span className="font-black underline ml-1">กรุณากด “ปิดกะ” แล้วเปิดกะของวันใหม่</span>
      </div>
    );
  }
  return (
    <div className="w-full bg-amber-100 text-amber-900 border-b border-amber-200 text-xs sm:text-sm font-bold px-3 py-1.5 text-center">
      ⏰ ถึงเวลาปิดกะสุดท้ายของวันแล้ว (ตั้งแต่ 05:30 น.) — ระบบจะล็อกการทำรายการเวลา 06:30 น. กรุณาปิดกะให้ทันก่อน 06:45 น.
    </div>
  );
}
