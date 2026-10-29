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
export const LAST_CLOSED_DRAWER_PREFIX = "last_closed_drawer_";

export type CashHandover = {
  id: string;
  business_date: string; // YYYY-MM-DD (วันธุรกิจ ตัดรอบ 06:45)
  shift_id: string;
  shift_staff_name: string;
  shift_location?: string | null; // สถานที่ประจำกะ เช่น ซอย1, ซอย2, ซามีญ่า
  kind: "mid_shift" | "shift_close";
  method?: "all_except_reserve" | "fixed";
  drawer_cash: number; // เงินสดในลิ้นชักตามระบบก่อนส่ง
  key_reserve: number; // เงินมัดจำกุญแจคงเหลือที่ต้องกันไว้ในลิ้นชัก
  key_reserve_rooms?: number;
  carried_to_next_shift?: number; // เงินสด/เงินทอนที่เหลือติดลิ้นชักส่งต่อให้กะถัดไป (นอกเหนือจากมัดจำกุญแจ)
  next_shift_drawer_total?: number; // รวมเงินสดในลิ้นชักที่ส่งต่อให้กะถัดไป = key_reserve + carried_to_next_shift
  required_amount: number; // ยอดที่ต้องนำส่งผู้จัดการตามระบบ
  actual_amount: number; // ยอดที่นำส่งผู้จัดการจริง
  staff_name: string;
  staff_signature: string | null;
  staff_signed_at: string | null;
  manager_name: string | null;
  manager_signature: string | null;
  manager_signed_at: string | null;
  note?: string | null;
  created_at: string;
};

export type LastClosedDrawerInfo = {
  shift_id: string;
  staff_name: string;
  shift_location: string;
  closed_at: string;
  business_date: string;
  key_reserve: number;
  key_reserve_rooms?: number;
  carried_cash: number; // เงินทอน/เงินสดที่เหลือติดลิ้นชักส่งต่อให้กะถัดไป
  total_in_drawer: number; // รวมเงินสดที่ทิ้งไว้ในลิ้นชักตอนปิดกะ = key_reserve + carried_cash
  sent_to_manager: number; // ยอดที่นำส่งผู้จัดการตอนปิดกะ
  consumed_by_shift_id?: string | null;
  consumed_at?: string | null;
  confirmed_initial_cash?: number | null;
};

/** อนุมานสถานที่ของกะจากค่าที่บันทึกไว้ หรือจากชื่อพนักงาน/สิทธิ์สถานที่ */
export function inferShiftLocation(
  staffName?: string | null,
  savedLocation?: string | null,
  allowedLocations?: string[]
): string | null {
  if (savedLocation && String(savedLocation).trim()) return String(savedLocation).trim();
  const name = String(staffName || "").trim();
  if (name.includes("ซอย1") || name.includes("ซอย 1") || name.includes("โอลีฟ")) return "ซอย1";
  if (name.includes("ซอย2") || name.includes("ซอย 2")) return "ซอย2";
  if (name.includes("ซามิญา") || name.includes("ซามีญ่า")) return "ซามีญ่า";
  if (allowedLocations && allowedLocations.length === 1) return allowedLocations[0];
  return null;
}

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
export const EOD_LOC_KEY_PREFIX = "eod_loc_shift_";
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

/** วันธุรกิจที่ควรผูกให้กะใหม่ที่เปิด ณ เวลา now (แยกอิสระตามสถานที่หากระบุ shiftLocation) */
export async function resolveBusinessDateForNewShift(now: Date, shiftLocation?: string | null): Promise<string> {
  const clockBD = getBusinessDateStr(now);
  // ช่วง 05:30–06:44 ของเช้าวันใหม่: ถ้าวันก่อนหน้า (clockBD) ของสถานที่นี้ปิดรอบวันแล้ว → กะนี้เป็นกะแรกของวันใหม่ทันที
  const { eodAllowedFrom } = getShiftCutoffs(clockBD);
  if (now.getTime() >= eodAllowedFrom.getTime()) {
    const locTrimmed = shiftLocation ? String(shiftLocation).trim() : "";
    const keysToCheck = locTrimmed
      ? [`${EOD_LOC_KEY_PREFIX}${locTrimmed}_${clockBD}`, `${EOD_KEY_PREFIX}${clockBD}`]
      : [`${EOD_KEY_PREFIX}${clockBD}`];
    const { data } = await supabase
      .from("system_settings")
      .select("key")
      .in("key", keysToCheck);
    if (data && data.length > 0) {
      if (locTrimmed) {
        const hasLocKey = data.some((r) => r.key === `${EOD_LOC_KEY_PREFIX}${locTrimmed}_${clockBD}`);
        if (hasLocKey) return addDaysStr(clockBD, 1);
      } else {
        return addDaysStr(clockBD, 1);
      }
    }
  }
  return clockBD;
}

export async function saveShiftBusinessDate(shiftId: string, bd: string, shiftLocation?: string | null) {
  return supabase
    .from("system_settings")
    .upsert(
      {
        key: `${SHIFT_BD_KEY_PREFIX}${shiftId}`,
        value: { business_date: bd, ...(shiftLocation ? { shift_location: shiftLocation } : {}) },
      },
      { onConflict: "key" }
    );
}

/** ดึงวันธุรกิจและสถานที่ที่ผูกไว้ของหลายกะ (กะเก่าที่ไม่มีข้อมูลจะใช้ค่าสำรองจากเวลาเปิดกะและชื่อพนักงาน) */
export async function fetchShiftMetadata(
  shifts: { id: string; start_time: string; staff_name?: string }[]
): Promise<Record<string, { business_date: string; shift_location: string | null }>> {
  const out: Record<string, { business_date: string; shift_location: string | null }> = {};
  shifts.forEach((s) => {
    out[s.id] = {
      business_date: getShiftBusinessDateStr(s.start_time),
      shift_location: inferShiftLocation(s.staff_name, null),
    };
  });
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
    const shiftObj = shifts.find((s) => s.id === id);
    const prev = out[id] || {
      business_date: shiftObj ? getShiftBusinessDateStr(shiftObj.start_time) : "",
      shift_location: inferShiftLocation(shiftObj?.staff_name, null),
    };
    out[id] = {
      business_date: r.value?.business_date || prev.business_date,
      shift_location: inferShiftLocation(shiftObj?.staff_name, r.value?.shift_location) || prev.shift_location,
    };
  });
  return out;
}

/** ดึงวันธุรกิจที่ผูกไว้ของหลายกะ (กะเก่าที่ไม่มีข้อมูลจะใช้ค่าสำรองจากเวลาเปิดกะ) */
export async function fetchShiftBusinessDates(
  shifts: { id: string; start_time: string; staff_name?: string }[]
): Promise<Record<string, string>> {
  const meta = await fetchShiftMetadata(shifts);
  const out: Record<string, string> = {};
  Object.entries(meta).forEach(([id, v]) => {
    out[id] = v.business_date;
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

/** บันทึกยอดเงินสดคงเหลือในลิ้นชักจากกะที่เพิ่งปิดไปของสถานที่นั้น เพื่อให้กะถัดไปตรวจสอบและกดยืนยันตอนเปิดกะ */
export async function saveLastClosedDrawer(info: LastClosedDrawerInfo) {
  const loc = (info.shift_location || "ซอย1").trim();
  return supabase
    .from("system_settings")
    .upsert(
      {
        key: `${LAST_CLOSED_DRAWER_PREFIX}${loc}`,
        value: { ...info, shift_location: loc },
      },
      { onConflict: "key" }
    );
}

/** ดึงข้อมูลเงินสดคงเหลือในลิ้นชักจากกะล่าสุดที่เพิ่งปิดไปของสถานที่นั้น */
export async function fetchLastClosedDrawer(location?: string | null): Promise<LastClosedDrawerInfo | null> {
  const loc = (location || "ซอย1").trim();
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", `${LAST_CLOSED_DRAWER_PREFIX}${loc}`)
    .maybeSingle();
  if (!data || !data.value) return null;
  return data.value as LastClosedDrawerInfo;
}

/** บันทึกว่ากะใหม่ได้เปิดรับช่วงต่อเงินในลิ้นชักจากกะก่อนหน้าเรียบร้อยแล้ว */
export async function markLastClosedDrawerConsumed(
  location: string | null | undefined,
  consumedByShiftId: string,
  confirmedInitialCash: number,
  nowIso: string
) {
  const existing = await fetchLastClosedDrawer(location);
  if (!existing) return;
  const loc = (location || existing.shift_location || "ซอย1").trim();
  await supabase
    .from("system_settings")
    .upsert(
      {
        key: `${LAST_CLOSED_DRAWER_PREFIX}${loc}`,
        value: {
          ...existing,
          consumed_by_shift_id: consumedByShiftId,
          consumed_at: nowIso,
          confirmed_initial_cash: confirmedInitialCash,
        },
      },
      { onConflict: "key" }
    );
}

/** ตรวจ PIN ผู้จัดการ/แอดมิน */
export async function verifyManagerPin(pin: string): Promise<{ name: string; role: string } | null> {
  if (!pin) return null;
  const { data } = await supabase.from("staff").select("name, role").eq("pin", pin).maybeSingle();
  if (!data || (data.role !== "admin" && data.role !== "manager")) return null;
  return { name: data.name, role: data.role };
}
