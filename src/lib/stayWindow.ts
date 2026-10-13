// Shared helpers for the audit reports (guest report + anomaly report).

export interface StayWindow {
  checkIn: Date;
  checkOut: Date;
  ended: boolean;
  scheduledOut: Date;
}

// ช่วงเวลาเข้าพักจริง:
// - เข้า: actual_check_in_time ถ้ามี ไม่เช่นนั้นใช้ check_in_time
// - ออก: ถ้าเช็คเอาท์แล้วใช้ actual_check_out_time (ข้อมูลเก่าใช้ check_out_time) / ถ้ายังพักอยู่ใช้เวลาปัจจุบัน
export function getStayWindow(b: any, now: Date): StayWindow {
  const checkIn = new Date(b.actual_check_in_time || b.check_in_time);
  const scheduledOut = new Date(b.check_out_time);
  const ended = b.status === 'checked_out';
  const checkOut = ended ? new Date(b.actual_check_out_time || b.check_out_time) : now;
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
