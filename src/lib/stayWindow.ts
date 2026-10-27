// Shared helpers for the audit reports (guest report + anomaly report).

export interface StayWindow {
  checkIn: Date;
  checkOut: Date;
  ended: boolean;
  scheduledOut: Date;
}

// ช่วงเวลาเข้าพักจริง:
// - เข้า: actual_check_in_time ถ้ามี ไม่เช่นนั้นใช้ check_in_time
// - ออก: ถ้าเช็คเอาท์แล้ว (หรือห้องไม่ได้มีสถานะ occupied แล้วและเลยกำหนดออก) ใช้ actual_check_out_time / check_out_time
//        ถ้ายังพักอยู่จริง ใช้เวลาปัจจุบัน
export function getStayWindow(b: any, now: Date, room?: any): StayWindow {
  const checkIn = new Date(b.actual_check_in_time || b.check_in_time);
  const scheduledOut = new Date(b.check_out_time);
  const roomObj = room ?? (Array.isArray(b.rooms) ? b.rooms[0] : b.rooms);
  const isRoomStillOccupiedByThisBooking =
    roomObj && roomObj.status
      ? roomObj.status === 'occupied' &&
        (!roomObj.check_in_time || Math.abs(new Date(roomObj.check_in_time).getTime() - new Date(b.check_in_time).getTime()) < 24 * 3600000)
      : now.getTime() <= scheduledOut.getTime() + 6 * 3600000;

  const ended = b.status === 'checked_out' || (b.status === 'checked_in' && !isRoomStillOccupiedByThisBooking && now.getTime() > scheduledOut.getTime());
  const rawCheckOut = ended ? new Date(b.actual_check_out_time || b.check_out_time) : now;
  const checkOut = rawCheckOut.getTime() < checkIn.getTime() ? scheduledOut : rawCheckOut;
  return { checkIn, checkOut, ended, scheduledOut };
}

export const STAY_STATUSES = ['checked_in', 'checked_out'];

// หน้าต่าง "วันธุรกิจ" 06:45 - 06:44:59 (เวลาไทย UTC+7) ของวันที่ออฟเซ็ตจากวันธุรกิจปัจจุบัน
// คำนวณด้วย UTC+7 เสมอ เพื่อไม่ให้ผลต่างตามเขตเวลาของเซิร์ฟเวอร์ (Vercel เป็น UTC)
export function businessWindow(dateOffset: number, nowMs: number = Date.now()) {
  const BKK = 7 * 3600000;
  const biz = new Date(nowMs + BKK - (6 * 60 + 45) * 60000);
  const y = biz.getUTCFullYear();
  const m = biz.getUTCMonth();
  const d = biz.getUTCDate() + dateOffset;
  const start = new Date(Date.UTC(y, m, d, 6, 45, 0) - BKK);
  const end = new Date(Date.UTC(y, m, d + 1, 6, 44, 59) - BKK);
  const dateStr = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); // YYYY-MM-DD ของวันธุรกิจ
  return { start, end, dateStr };
}
