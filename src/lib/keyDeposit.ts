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

export type HeldKeyDepositRoom = {
  bookingId: string;
  roomId: string;
  roomNo: string;
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

export function computeKeyDepositParts(txs: LedgerLike[]): KeyDepositParts {
  const summary = computeDeposit(txs);
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

export function computeActiveHeldDeposit(txs: LedgerLike[]): number {
  return computeKeyDepositParts(txs).active;
}

/** ดึงยอดมัดจำกุญแจคงเหลือปัจจุบันของทุกห้องที่เช็คอินอยู่ (ยังไม่เช็คเอาท์) */
export async function fetchActiveKeyDeposits(): Promise<{ total: number; rooms: HeldKeyDepositRoom[] }> {
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, room_id, guest_name")
    .eq("status", "checked_in");
  if (!bookings || bookings.length === 0) return { total: 0, rooms: [] };

  const ids = bookings.map((b) => b.id);
  const [{ data: ledgers }, { data: rooms }] = await Promise.all([
    supabase
      .from("ledger_transactions")
      .select("booking_id, amount, category, transaction_type")
      .in("booking_id", ids),
    supabase.from("rooms").select("id, room_no"),
  ]);

  const txsByBooking: Record<string, LedgerLike[]> = {};
  (ledgers || []).forEach((tx: any) => {
    if (!tx.booking_id) return;
    if (!txsByBooking[tx.booking_id]) txsByBooking[tx.booking_id] = [];
    txsByBooking[tx.booking_id].push(tx);
  });
  const roomNoMap: Record<string, string> = {};
  (rooms || []).forEach((r: any) => {
    roomNoMap[r.id] = r.room_no;
  });

  const list: HeldKeyDepositRoom[] = [];
  bookings.forEach((b: any) => {
    const amount = computeActiveHeldDeposit(txsByBooking[b.id] || []);
    if (amount > 0) {
      list.push({
        bookingId: b.id,
        roomId: b.room_id,
        roomNo: roomNoMap[b.room_id] || "-",
        guestName: b.guest_name || "ผู้เข้าพัก",
        amount,
      });
    }
  });
  list.sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
  return { total: list.reduce((s, r) => s + r.amount, 0), rooms: list };
}
