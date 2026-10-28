/**
 * ระบบส่งเงินสด (Cash Handover) ระหว่างกะ / ตอนปิดกะ
 *
 * - เก็บข้อมูลใน system_settings (key: cash_handover_<วันที่ธุรกิจ>_<id>) เพื่อไม่ต้องสร้างตารางใหม่
 * - ยอดที่ต้องส่ง = เงินสดในลิ้นชักตามระบบ - เงินมัดจำกุญแจคงเหลือปัจจุบัน (ต้องกันไว้คืนลูกค้าเป็นเงินสด)
 * - ยอดเป็นบวก: พนักงาน = ผู้ส่งเงิน, ผู้จัดการ = ผู้รับเงิน
 * - ยอดติดลบ: ผู้จัดการ = ผู้ส่งเงิน (เติมเงินสดเข้าลิ้นชัก), พนักงาน = ผู้รับเงิน
 */
import { supabase } from "@/lib/supabase";

export const HANDOVER_KEY_PREFIX = "cash_handover_";

export type CashHandover = {
  id: string;
  business_date: string; // YYYY-MM-DD (วันธุรกิจ ตัดรอบ 06:45)
  shift_id: string;
  shift_staff_name: string;
  kind: "mid_shift" | "shift_close";
  method?: "all_except_reserve" | "fixed";
  drawer_cash: number; // เงินสดในลิ้นชักตามระบบก่อนส่ง
  key_reserve: number; // เงินมัดจำกุญแจคงเหลือที่ต้องกันไว้ในลิ้นชัก
  key_reserve_rooms?: number;
  required_amount: number; // ยอดที่ต้องส่งตามระบบ
  actual_amount: number; // ยอดที่ส่งจริง
  staff_name: string;
  staff_signature: string | null;
  staff_signed_at: string | null;
  manager_name: string | null;
  manager_signature: string | null;
  manager_signed_at: string | null;
  note?: string | null;
  created_at: string;
};

export const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** วันธุรกิจ (ก่อน 06:45 ถือเป็นของเมื่อวาน) */
export function getBusinessDateStr(date: Date): string {
  const d = new Date(date);
  if (d.getHours() < 6 || (d.getHours() === 6 && d.getMinutes() < 45)) {
    d.setDate(d.getDate() - 1);
  }
  return toLocalDateStr(d);
}

/** วันธุรกิจของกะ: อิงเวลาเปิดกะ (+1 ชม. เผื่อกรณีเปิดกะก่อนเวลาตัดรอบเล็กน้อย) — ใช้เป็นค่าสำรองเมื่อไม่มีวันธุรกิจที่ผูกไว้กับกะ */
export function getShiftBusinessDateStr(shiftStartIso: string): string {
  const t = new Date(shiftStartIso).getTime() + 60 * 60 * 1000;
  return getBusinessDateStr(new Date(t));
}

// =============================================================================
// วันธุรกิจที่ผูกกับกะโดยตรง + กติกาปิดรอบวัน / ล็อกกะข้ามวัน
//  - ปิด "กะสุดท้ายของวัน" ได้ตั้งแต่ 05:30 น. ของวันถัดไป (นับจากวันธุรกิจของกะ)
//  - ตั้งแต่ 06:30 น. ของวันถัดไป กะเก่าที่ยังไม่ปิดจะถูกล็อกการรับเงิน/เช็คอิน/เพิ่มค่าบริการ/ค่าใช้จ่าย
//    (ยังปิดกะได้ตามปกติ)
//  - กะที่เปิดหลังวันก่อนหน้าถูกปิดรอบวันแล้ว (05:30–06:44) นับเป็นกะแรกของวันใหม่ทันที
// =============================================================================
export const SHIFT_BD_KEY_PREFIX = "shift_bd_";
export const EOD_KEY_PREFIX = "eod_shift_";
export const EOD_ALLOWED_FROM = { h: 5, m: 30 };
export const SHIFT_LOCK_FROM = { h: 6, m: 30 };

export function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toLocalDateStr(dt);
}

export function atLocalTime(dateStr: string, h: number, m: number): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

/** เวลาที่เริ่มปิดกะสุดท้ายได้ / เวลาที่เริ่มล็อกกะ ของวันธุรกิจ bd */
export function getShiftCutoffs(bd: string) {
  const next = addDaysStr(bd, 1);
  return {
    eodAllowedFrom: atLocalTime(next, EOD_ALLOWED_FROM.h, EOD_ALLOWED_FROM.m),
    lockFrom: atLocalTime(next, SHIFT_LOCK_FROM.h, SHIFT_LOCK_FROM.m),
  };
}

/** วันธุรกิจที่ควรผูกให้กะใหม่ที่เปิด ณ เวลา now */
export async function resolveBusinessDateForNewShift(now: Date): Promise<string> {
  const clockBD = getBusinessDateStr(now);
  // ช่วง 05:30–06:44 ของเช้าวันใหม่: ถ้าวันก่อนหน้า (clockBD) ปิดรอบวันแล้ว → กะนี้เป็นกะแรกของวันใหม่
  const { eodAllowedFrom } = getShiftCutoffs(clockBD);
  if (now.getTime() >= eodAllowedFrom.getTime()) {
    const { data } = await supabase
      .from("system_settings")
      .select("key")
      .eq("key", `${EOD_KEY_PREFIX}${clockBD}`)
      .maybeSingle();
    if (data) return addDaysStr(clockBD, 1);
  }
  return clockBD;
}

export async function saveShiftBusinessDate(shiftId: string, bd: string) {
  return supabase
    .from("system_settings")
    .upsert({ key: `${SHIFT_BD_KEY_PREFIX}${shiftId}`, value: { business_date: bd } }, { onConflict: "key" });
}

/** ดึงวันธุรกิจที่ผูกไว้ของหลายกะ (กะเก่าที่ไม่มีข้อมูลจะใช้ค่าสำรองจากเวลาเปิดกะ) */
export async function fetchShiftBusinessDates(
  shifts: { id: string; start_time: string }[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  shifts.forEach((s) => (out[s.id] = getShiftBusinessDateStr(s.start_time)));
  if (shifts.length === 0) return out;
  const { data } = await supabase
    .from("system_settings")
    .select("key, value")
    .in(
      "key",
      shifts.map((s) => `${SHIFT_BD_KEY_PREFIX}${s.id}`)
    );
  (data || []).forEach((r: any) => {
    const id = String(r.key).slice(SHIFT_BD_KEY_PREFIX.length);
    if (r.value?.business_date) out[id] = r.value.business_date;
  });
  return out;
}

/** ยอดเงินสดในลิ้นชักของกะตามระบบ */
export type ShiftDrawer = {
  initialCash: number;
  cashIn: number; // รับเงินสด (รวมมัดจำกุญแจที่จ่ายสด)
  expenses: number; // ค่าใช้จ่ายเงินสด
  refunds: number; // คืนเงินสด (คืนมัดจำกุญแจ / คืนเงินทอน)
  handedOut: number; // ยอดที่ส่งเงินไปแล้วในกะนี้ (ติดลบ = ผู้จัดการเติมเงินเข้า)
  drawer: number; // เงินสดที่ควรมีในลิ้นชักตอนนี้
};

export function computeDrawerFromRows(
  initialCash: number,
  ledgers: { amount: number | string; category: string; transaction_type: string }[],
  handedOut: number
): ShiftDrawer {
  let cashIn = 0;
  let expenses = 0;
  let refunds = 0;
  ledgers.forEach((txn) => {
    const cat = String(txn.category || "");
    if (cat.includes("(Voided)")) return;
    const amt = Number(txn.amount || 0);
    if (txn.transaction_type === "payment" && cat === "cash" && amt < 0) {
      cashIn += Math.abs(amt);
    } else if (txn.transaction_type === "expense") {
      expenses += Math.abs(amt);
    } else if (
      txn.transaction_type === "deposit" &&
      amt < 0 &&
      (cat.includes("คืนมัดจำ") || cat.includes("คืนเงินทอน"))
    ) {
      refunds += Math.abs(amt);
    }
  });
  const initial = Number(initialCash || 0);
  return {
    initialCash: initial,
    cashIn,
    expenses,
    refunds,
    handedOut,
    drawer: initial + cashIn - expenses - refunds - handedOut,
  };
}

/** ยอดที่ส่งเงินไปแล้วของกะ (ดึงเฉพาะตัวเลข ไม่ดึงรูปลายเซ็น) */
export async function fetchShiftHandedOut(shiftId: string): Promise<number> {
  const { data } = await supabase
    .from("system_settings")
    .select("actual_amt:value->>actual_amount,req_amt:value->>required_amount,method:value->>method")
    .like("key", `${HANDOVER_KEY_PREFIX}%`)
    .eq("value->>shift_id", shiftId);
  return (data || []).reduce(
    (s: number, r: any) => s + Number(r.method === "fixed" ? r.actual_amt || 0 : r.req_amt ?? r.actual_amt ?? 0),
    0
  );
}

export async function computeShiftDrawer(shift: { id: string; initial_cash: number }): Promise<ShiftDrawer> {
  const [{ data: ledgers }, handedOut] = await Promise.all([
    supabase
      .from("ledger_transactions")
      .select("amount, category, transaction_type")
      .eq("shift_id", shift.id),
    fetchShiftHandedOut(shift.id),
  ]);
  return computeDrawerFromRows(shift.initial_cash, (ledgers as any[]) || [], handedOut);
}

export async function saveHandover(h: CashHandover) {
  return supabase
    .from("system_settings")
    .upsert({ key: `${HANDOVER_KEY_PREFIX}${h.business_date}_${h.id}`, value: h }, { onConflict: "key" });
}

export async function fetchHandoversByDate(businessDate: string): Promise<CashHandover[]> {
  const { data } = await supabase
    .from("system_settings")
    .select("key, value")
    .like("key", `${HANDOVER_KEY_PREFIX}${businessDate}_%`);
  return ((data || []).map((r: any) => r.value as CashHandover) || []).sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at))
  );
}

export function newHandoverId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** ตรวจ PIN ผู้จัดการ/แอดมิน */
export async function verifyManagerPin(pin: string): Promise<{ name: string; role: string } | null> {
  if (!pin) return null;
  const { data } = await supabase.from("staff").select("name, role").eq("pin", pin).maybeSingle();
  if (!data || (data.role !== "admin" && data.role !== "manager")) return null;
  return { name: data.name, role: data.role };
}
