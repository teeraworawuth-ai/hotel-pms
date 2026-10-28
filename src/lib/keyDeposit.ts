/**
 * เงินมัดจำกุญแจที่ "ถืออยู่จริง" ของห้องที่เช็คอินแล้ว (ใช้ร่วมกันทุกหน้าจอ)
 *
 * หลักการ:
 * - ห้องที่ยังเป็นสถานะ "จอง" (reserved) จะยังไม่แยกเงินมัดจำกุญแจออกมา (เงินทั้งก้อนยังเป็นเงินรับจอง)
 * - เมื่อเช็คอินแล้ว: มัดจำที่ถืออยู่ = min(ยอดมัดจำที่ตกลง, max(0, เงินที่จ่าย - ค่าใช้จ่ายที่ลงบิลแล้ว))
 *   แล้วหักส่วนที่คืนลูกค้าไปแล้ว และส่วนที่ริบเป็นค่าปรับแล้ว
 * - เงินมัดจำกุญแจต้องคืนลูกค้าเป็น "เงินสด" เสมอ จึงต้องกันเงินสดจำนวนนี้ไว้ในลิ้นชักตลอดเวลา
 */
import { supabase } from "@/lib/supabase";
import { computeDeposit, LedgerLike } from "@/lib/depositMath";
import { getBusinessDateStr } from "@/lib/cashHandover";

export type HeldKeyDepositRoom = {
  bookingId: string;
  roomId: string;
  roomNo: string;
  location?: string;
  guestName: string;
  amount: number;
};

export type KeyDepositParts = {
  heldRaw: number; // มัดจำที่ถือ (ก่อนหักคืน/ริบ)
  refunded: number; // คืนลูกค้าแล้ว
  forfeited: number; // ริบเป็นค่าปรับแล้ว
  active: number; // มัดจำที่ยังถืออยู่จริง (ต้องกันเงินสดไว้)
  placed: number; // ยอดที่เคยกันเป็นมัดจำทั้งหมด (= active + refunded + forfeited)
};

export function computeKeyDepositParts(txs: LedgerLike[], futureUnpostedAmount = 0): KeyDepositParts {
  const effectiveTxs: LedgerLike[] =
    futureUnpostedAmount > 0
      ? [...txs, { transaction_type: "revenue", category: "future_scheduled", amount: futureUnpostedAmount }]
      : txs;
  const summary = computeDeposit(effectiveTxs);
  const valid = txs.filter((t) => !String(t.category || "").includes("Voided"));
  const forfeited = valid
    .filter((t) => String(t.category || "").includes("ริบมัดจำ"))
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const refunded = summary.refunded;
  const active = Math.max(0, summary.held - refunded - forfeited);
  return {
    heldRaw: summary.held,
    refunded,
    forfeited,
    active,
    placed: active + refunded + forfeited,
  };
}

export function computeActiveHeldDeposit(txs: LedgerLike[], futureUnpostedAmount = 0): number {
  return computeKeyDepositParts(txs, futureUnpostedAmount).active;
}

/** ดึงยอดมัดจำกุญแจคงเหลือปัจจุบันของทุกห้องที่เช็คอินอยู่ (ยังไม่เช็คเอาท์) สามารถกรองเฉพาะสถานที่ได้ */
export async function fetchActiveKeyDeposits(
  nowDate?: Date,
  filterLocation?: string | null
): Promise<{ total: number; rooms: HeldKeyDepositRoom[] }> {
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, room_id, guest_name")
    .eq("status", "checked_in");
  if (!bookings || bookings.length === 0) return { total: 0, rooms: [] };

  const todayStr = getBusinessDateStr(nowDate || new Date());
  const ids = bookings.map((b) => b.id);
  const [{ data: ledgers }, { data: rooms }, { data: dailyRates }, { data: dailyExtras }] = await Promise.all([
    supabase
      .from("ledger_transactions")
      .select("booking_id, amount, category, transaction_type")
      .in("booking_id", ids),
    supabase.from("rooms").select("id, room_no, location"),
    supabase
      .from("booking_daily_rates")
      .select("booking_id, target_date, amount")
      .in("booking_id", ids)
      .gt("target_date", todayStr),
    supabase
      .from("booking_daily_extras")
      .select("booking_id, target_date, amount, category")
      .in("booking_id", ids)
      .gt("target_date", todayStr),
  ]);

  const txsByBooking: Record<string, LedgerLike[]> = {};
  (ledgers || []).forEach((tx: any) => {
    if (!tx.booking_id) return;
    if (!txsByBooking[tx.booking_id]) txsByBooking[tx.booking_id] = [];
    txsByBooking[tx.booking_id].push(tx);
  });

  const futureByBooking: Record<string, number> = {};
  (dailyRates || []).forEach((r: any) => {
    if (!r.booking_id) return;
    futureByBooking[r.booking_id] = (futureByBooking[r.booking_id] || 0) + Number(r.amount || 0);
  });
  (dailyExtras || []).forEach((e: any) => {
    if (!e.booking_id || String(e.category || "").includes("(Voided)")) return;
    futureByBooking[e.booking_id] = (futureByBooking[e.booking_id] || 0) + Number(e.amount || 0);
  });

  const roomNoMap: Record<string, string> = {};
  const roomLocMap: Record<string, string> = {};
  (rooms || []).forEach((r: any) => {
    roomNoMap[r.id] = r.room_no;
    roomLocMap[r.id] = r.location || "";
  });

  const list: HeldKeyDepositRoom[] = [];
  bookings.forEach((b: any) => {
    const loc = roomLocMap[b.room_id] || "";
    if (filterLocation && filterLocation !== "ALL" && loc !== filterLocation) return;
    const amount = computeActiveHeldDeposit(txsByBooking[b.id] || [], futureByBooking[b.id] || 0);
    if (amount > 0) {
      list.push({
        bookingId: b.id,
        roomId: b.room_id,
        roomNo: roomNoMap[b.room_id] || "-",
        location: loc,
        guestName: b.guest_name || "ผู้เข้าพัก",
        amount,
      });
    }
  });
  list.sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
  return { total: list.reduce((s, r) => s + r.amount, 0), rooms: list };
}
