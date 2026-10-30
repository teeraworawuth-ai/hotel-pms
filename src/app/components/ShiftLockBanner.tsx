"use client";

import { useShift } from "@/contexts/ShiftContext";

/** แถบแจ้งเตือนช่วงปิดรอบวัน: 05:30 ใกล้ล็อก / 06:30 ล็อกกะข้ามวัน (พร้อมปุ่มปลดล็อกชั่วคราว 30 นาที) */
export default function ShiftLockBanner() {
  const { activeShift, shiftLock, unlockShiftTemporarily, relockShift } = useShift();
  if (!activeShift || (!shiftLock.locked && !shiftLock.nearLock && !shiftLock.tempUnlocked)) return null;

  if (shiftLock.tempUnlocked) {
    return (
      <div className="w-full bg-indigo-700 text-white text-xs sm:text-sm font-bold px-3 py-1.5 flex flex-wrap items-center justify-center gap-2 shadow-sm">
        <span>
          🔓 ปลดล็อกชั่วคราวอยู่ (เหลือเวลา <b>{shiftLock.tempUnlockRemainingMin} นาที</b>) — ทำรายการเช็คอิน/รับเงินของกะ{" "}
          {activeShift.staff_name} ได้ตามปกติ เมื่อเสร็จแล้วกรุณากด “ปิดกะ”
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => unlockShiftTemporarily(30)}
            className="px-2.5 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-black transition-colors cursor-pointer"
          >
            🔄 ต่อเวลา 30 นาที
          </button>
          <button
            type="button"
            onClick={relockShift}
            className="px-2.5 py-0.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-black transition-colors cursor-pointer"
          >
            🔒 ล็อกกลับ
          </button>
        </div>
      </div>
    );
  }

  if (shiftLock.locked) {
    return (
      <div className="w-full bg-rose-600 text-white text-xs sm:text-sm font-bold px-3 py-2 flex flex-wrap items-center justify-center gap-2.5 shadow-sm">
        <span>
          🔒 เลยเวลาตัดรอบวันใหม่ (06:30 น.) — กะของ {activeShift.staff_name} ถูกล็อกการทำรายการชั่วคราวก่อนปิดกะ (Close Day)
        </span>
        <button
          type="button"
          onClick={() => unlockShiftTemporarily(30)}
          className="px-3 py-1 rounded-xl bg-amber-300 hover:bg-amber-200 text-slate-950 text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          🔓 ปลดล็อกทำรายการ 30 นาที
        </button>
      </div>
    );
  }
  return (
    <div className="w-full bg-amber-100 text-amber-900 border-b border-amber-200 text-xs sm:text-sm font-bold px-3 py-1.5 text-center">
      ⏰ ถึงเวลาปิดกะสุดท้ายของวันแล้ว (ตั้งแต่ 05:30 น.) — ระบบจะล็อกการทำรายการเวลา 06:30 น. กรุณาปิดกะให้ทันก่อน 06:45 น.
    </div>
  );
}
