"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Shift } from "@/contexts/ShiftContext";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";

type LedgerTransaction = {
  id: string;
  shift_id: string;
  staff_name: string;
  room_id?: string;
  booking_id?: string;
  transaction_type: string;
  category: string;
  amount: number;
  notes?: string;
  created_at: string;
};

type BookingRow = {
  id: string;
  room_id: string;
  guest_name: string;
  status: string;
  check_in_time: string;
  check_out_time: string;
  actual_check_in_time?: string | null;
  actual_price?: number | null;
  created_at?: string;
};

type DailyRateRow = {
  id: string;
  booking_id: string;
  target_date: string;
  amount: number;
  is_manual_override?: boolean;
};

type RoomRow = {
  id: string;
  room_no: string;
  price_night: number;
  price_temp: number;
};

type BookingMeta = {
  targetPrices?: {
    totalTargetPrice: number;
    dailyTargets?: Record<string, number>;
    timeBand?: string;
    stayType?: "overnight" | "short_stay";
  };
};

type BalanceBox = {
  broughtForward: number;
  addedToday: number;
  usedToday: number;
  carriedForward: number;
};

export default function DailyReport({ dateOffset }: { dateOffset: number }) {
  const { getNow } = useSimulatedTime();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [isDayClosed, setIsDayClosed] = useState(false);
  const [reportDateLabel, setReportDateLabel] = useState("");

  // Left Column: Revenue Breakdown
  const [roomTargetTotal, setRoomTargetTotal] = useState(0); // 1.1 รายได้ค่าห้อง (ตามราคาเป้าหมาย)
  const [roomTargetOvernight, setRoomTargetOvernight] = useState(0); // 1.1.1 ค้างคืน
  const [roomTargetShortStay, setRoomTargetShortStay] = useState(0); // 1.1.2 ชั่วคราว
  const [earlyLateTotal, setEarlyLateTotal] = useState(0);   // 1.2.1 เข้าก่อน/ออกช้า (Early-Late)
  const [upsellTotal, setUpsellTotal] = useState(0);         // 1.2.2 ส่วนต่างปรับเพิ่มราคา (ขายสูงกว่าราคาเป้าหมาย)
  const [roomDiscountTotal, setRoomDiscountTotal] = useState(0); // 1.3 ส่วนลด (ขายต่ำกว่าราคาเป้าหมาย)
  const [addonRevenue, setAddonRevenue] = useState(0);       // 2. ค่าส่วนเสริม
  const [minibarRevenue, setMinibarRevenue] = useState(0);   // 3. ค่ามินิบาร์
  const [fineRevenue, setFineRevenue] = useState(0);         // 4. ค่าปรับ
  const [otherRevenue, setOtherRevenue] = useState(0);       // 5. ค่าบริการอื่นๆ
  const [voidedRevenue, setVoidedRevenue] = useState(0);     // 6. ยกเลิก (แสดงเพื่อตรวจสอบ)

  // Middle Column: Payment Breakdown (ไม่รวมเงินมัดจำกุญแจ)
  const [payCash, setPayCash] = useState(0);
  const [payTransferTotal, setPayTransferTotal] = useState(0);
  const [payTransferByBank, setPayTransferByBank] = useState<Record<string, number>>({});
  const [bankAccounts, setBankAccounts] = useState<string[]>(["SCB", "KBANK"]);
  const [payCredit, setPayCredit] = useState(0);
  const [payVoidRefund, setPayVoidRefund] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);

  // Right Column: Advance Payment & Reservation Balances
  const [advanceBox, setAdvanceBox] = useState<BalanceBox>({
    broughtForward: 0,
    addedToday: 0,
    usedToday: 0,
    carriedForward: 0,
  });
  const [reservationBox, setReservationBox] = useState<BalanceBox>({
    broughtForward: 0,
    addedToday: 0,
    usedToday: 0,
    carriedForward: 0,
  });

  // Separate Key Deposit Box (แยกจากหมวดบัญชีรายได้ตามข้อ 6)
  const [keyDepositBox, setKeyDepositBox] = useState({
    receivedToday: 0,
    receivedCashToday: 0,
    receivedTransferToday: 0,
    refundedToday: 0,
    forfeitedToday: 0,
    activeHeldTotal: 0,
  });

  useEffect(() => {
    async function fetchDailyData() {
      setLoading(true);

      const now = getNow();
      // วันของรายงาน (อิงจากเวลาปัจจุบัน + dateOffset)
      const baseDay = new Date(now);
      baseDay.setDate(baseDay.getDate() + dateOffset);

      // ตัดรอบทั่วไป 06:45 น. ของวันรายงาน ถึง 06:44:59 น. ของวันถัดไป
      const start0645 = new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate(), 6, 45, 0, 0);
      const end0645 = new Date(start0645);
      end0645.setDate(end0645.getDate() + 1);

      // ตัดรอบค่าห้องพักปกติ 09:45 น. ของวันรายงาน ถึง 09:44:59 น. ของวันถัดไป
      const start0945 = new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate(), 9, 45, 0, 0);
      const end0945 = new Date(start0945);
      end0945.setDate(end0945.getDate() + 1);

      const reportDateStr = `${start0645.getFullYear()}-${String(start0645.getMonth() + 1).padStart(2, "0")}-${String(start0645.getDate()).padStart(2, "0")}`;
      setReportDateLabel(
        start0645.toLocaleDateString("th-TH", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      );

      // ดึงข้อมูลทั้งหมดที่จำเป็นแบบขนาน
      const [
        shiftRes,
        allLedgerRes,
        bookingsRes,
        dailyRatesRes,
        dailyExtrasRes,
        roomsRes,
        extraSettingsRes,
        posItemsRes,
        settingsRes,
      ] = await Promise.all([
        supabase
          .from("shifts")
          .select("*")
          .lt("start_time", end0645.toISOString())
          .or(`end_time.gte.${start0645.toISOString()},end_time.is.null`)
          .order("start_time", { ascending: true }),
        supabase
          .from("ledger_transactions")
          .select("*")
          .lt("created_at", end0945.toISOString())
          .order("created_at", { ascending: true }),
        supabase
          .from("bookings")
          .select("id, room_id, guest_name, status, check_in_time, check_out_time, actual_check_in_time, actual_price, created_at"),
        supabase
          .from("booking_daily_rates")
          .select("id, booking_id, target_date, amount, is_manual_override"),
        supabase
          .from("booking_daily_extras")
          .select("id, booking_id, target_date, category, description, amount"),
        supabase
          .from("rooms")
          .select("id, room_no, price_night, price_temp"),
        supabase
          .from("extra_charge_settings")
          .select("name"),
        supabase
          .from("pos_items")
          .select("name"),
        supabase
          .from("system_settings")
          .select("key, value"),
      ]);

      if (shiftRes.data) setShifts(shiftRes.data);

      const allLedger: LedgerTransaction[] = (allLedgerRes.data as LedgerTransaction[]) || [];
      const allBookings: BookingRow[] = (bookingsRes.data as BookingRow[]) || [];
      const allDailyRates: DailyRateRow[] = (dailyRatesRes.data as DailyRateRow[]) || [];
      const allDailyExtras: any[] = (dailyExtrasRes.data as any[]) || [];
      const allRooms: RoomRow[] = (roomsRes.data as RoomRow[]) || [];
      const extraNames = new Set((extraSettingsRes.data || []).map((e: any) => e.name));
      const posNames = new Set((posItemsRes.data || []).map((p: any) => p.name));

      const bookingMap: Record<string, BookingRow> = {};
      allBookings.forEach((b) => {
        bookingMap[b.id] = b;
      });

      const roomMap: Record<string, RoomRow> = {};
      allRooms.forEach((r) => {
        roomMap[r.id] = r;
      });

      const dailyRatesByBooking: Record<string, DailyRateRow[]> = {};
      allDailyRates.forEach((dr) => {
        if (!dailyRatesByBooking[dr.booking_id]) dailyRatesByBooking[dr.booking_id] = [];
        dailyRatesByBooking[dr.booking_id].push(dr);
      });
      Object.values(dailyRatesByBooking).forEach((arr) =>
        arr.sort((a, b) => a.target_date.localeCompare(b.target_date))
      );

      const dailyExtrasByBooking: Record<string, any[]> = {};
      allDailyExtras.forEach((de) => {
        if (!dailyExtrasByBooking[de.booking_id]) dailyExtrasByBooking[de.booking_id] = [];
        dailyExtrasByBooking[de.booking_id].push(de);
      });
      Object.values(dailyExtrasByBooking).forEach((arr) =>
        arr.sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)))
      );

      let configuredBanks = ["SCB", "KBANK"];
      let posCategoryMap: Record<string, "minibar" | "addon" | "fine" | "other"> = {};
      const bookingMetaMap: Record<string, BookingMeta> = {};
      let dayClosed = false;
      const eodKey = `eod_shift_${reportDateStr}`;

      (settingsRes.data || []).forEach((row: any) => {
        if (row.key === "bank_accounts" && Array.isArray(row.value) && row.value.length > 0) {
          configuredBanks = row.value;
        } else if (row.key === "pos_category_map" && row.value && typeof row.value === "object") {
          posCategoryMap = row.value;
        } else if (row.key === eodKey) {
          dayClosed = true;
        } else if (typeof row.key === "string" && row.key.startsWith("booking_meta_")) {
          const bId = row.key.replace("booking_meta_", "");
          bookingMetaMap[bId] = row.value as BookingMeta;
        }
      });

      setBankAccounts(configuredBanks);
      setIsDayClosed(dayClosed);

      // รายการที่เกิดในรอบ 06:45 - 06:45 สำหรับแสดง Petty Cash ฯลฯ
      const txsIn0645Window = allLedger.filter((tx) => {
        const t = new Date(tx.created_at).getTime();
        return t >= start0645.getTime() && t < end0645.getTime();
      });
      setTransactions(txsIn0645Window);

      // Helper: ตรวจสอบว่ารายการค่าห้องพักอยู่ในรอบเวลา 09:45 ของวันรายงานหรือไม่
      // กฎข้อ 8: รอบค่าห้องคือ 09:45 - 09:44:59 วันถัดไป แต่ถ้ามีรายได้เข้าก่อนเวลา (Early Check-in 06:45 - 09:44)
      // ของวันนั้น ให้นับเป็นรายได้ของรอบ 09:45 วันนั้นทันที (ไม่ไปนับเป็นของเมื่อวาน)
      const isEarlyCheckInForDay = (tx: LedgerTransaction, dayStart0645: Date, dayStart0945: Date) => {
        const t = new Date(tx.created_at).getTime();
        if (t < dayStart0645.getTime() || t >= dayStart0945.getTime()) return false;
        const meta = tx.booking_id ? bookingMetaMap[tx.booking_id] : undefined;
        if (meta?.targetPrices?.timeBand === "early_in") return true;
        if (tx.category === "early_in_fee" || tx.category.includes("เข้าก่อน")) return true;
        const b = tx.booking_id ? bookingMap[tx.booking_id] : undefined;
        if (b) {
          const cin = new Date(b.actual_check_in_time || b.check_in_time).getTime();
          if (cin >= dayStart0645.getTime() && cin < dayStart0945.getTime()) return true;
        }
        return false;
      };

      const isInTodayRoomWindow = (tx: LedgerTransaction) => {
        const t = new Date(tx.created_at).getTime();
        // กรณี Early check-in ช่วง 06:45 - 09:44 ของวันนี้ -> นับเป็นรอบ 09:45 ของวันนี้
        if (isEarlyCheckInForDay(tx, start0645, start0945)) return true;
        // กรณีอยู่ในช่วง 09:45 วันนี้ ถึง 09:44 วันพรุ่งนี้
        if (t >= start0945.getTime() && t < end0945.getTime()) {
          // ยกเว้นกรณีที่เป็น Early check-in ของเช้าวันพรุ่งนี้ (06:45 - 09:44 วันถัดไป) -> ต้องไปนับเป็นของวันพรุ่งนี้
          const nextDayStart0945 = new Date(end0645);
          nextDayStart0945.setHours(9, 45, 0, 0);
          if (isEarlyCheckInForDay(tx, end0645, nextDayStart0945)) return false;
          return true;
        }
        return false;
      };

      // =========================================================================
      // 1. คำนวณฝั่งรายได้ (Left Column)
      // =========================================================================
      let rTarget = 0;          // 1.1 รายได้ค่าห้อง (ตามราคาเป้าหมาย)
      let rTargetOvernight = 0; // 1.1.1 ค้างคืน
      let rTargetShortStay = 0; // 1.1.2 ชั่วคราว
      let rEarlyLate = 0;       // 1.2.1 early-late
      let rUpsell = 0;    // 1.2.2 ส่วนต่างปรับเพิ่มราคา
      let rDiscount = 0;  // 1.3 ส่วนลด
      let revAddon = 0;   // 2. ค่าส่วนเสริม
      let revMinibar = 0; // 3. ค่ามินิบาร์
      let revFine = 0;    // 4. ค่าปรับ
      let revOther = 0;   // 5. ค่าบริการอื่นๆ
      let revVoid = 0;    // 6. ยกเลิก

      const processedOvernightBookingIdsToday = new Set<string>();

      // 1A. รับรู้รายได้ค่าห้องค้างคืนแบบรายคืน (Night-by-Night) ตาม target_date === reportDateStr
      allDailyRates.forEach((dr) => {
        if (dr.target_date !== reportDateStr) return;
        const b = bookingMap[dr.booking_id];
        if (!b || b.status === "cancelled" || b.status === "reserved") return;

        processedOvernightBookingIdsToday.add(dr.booking_id);
        const room = roomMap[b.room_id];
        const meta = bookingMetaMap[dr.booking_id];
        const ratesForBooking = dailyRatesByBooking[dr.booking_id] || [];
        const isFirstNight = ratesForBooking.length > 0 && ratesForBooking[0].target_date === reportDateStr;

        // สำหรับคืนแรก หากมีแก้ไขค่าห้องใน ledger_transactions ให้ใช้ยอดล่าสุดจาก ledger
        let actualNightPrice = Number(dr.amount || 0);
        if (isFirstNight) {
          const activeRoomTx = allLedger.find(
            (t) =>
              t.booking_id === dr.booking_id &&
              !t.category.includes("Voided") &&
              (t.category === "room_charge" || t.category === "ค่าห้องพัก")
          );
          if (activeRoomTx && ratesForBooking.length === 1) {
            actualNightPrice = Number(activeRoomTx.amount || 0);
          }
        }

        const storedTarget = meta?.targetPrices?.dailyTargets?.[reportDateStr];
        const targetNightPrice =
          storedTarget !== undefined
            ? Number(storedTarget)
            : Number(room?.price_night || actualNightPrice);

        const diff = actualNightPrice - targetNightPrice;
        rTarget += targetNightPrice;
        rTargetOvernight += targetNightPrice;
        if (diff >= 0) {
          if (diff > 0) {
            if (isFirstNight && meta?.targetPrices?.timeBand === "early_in") {
              // กรณีเข้าพักก่อนเวลา (06:45 - 09:44) ส่วนที่บวกเพิ่มจากราคาเป้าหมายเป็นค่า early-in
              const earlyCap = Number(room?.price_temp || diff);
              const earlyPart = Math.min(diff, earlyCap);
              const upsellPart = Math.max(0, diff - earlyPart);
              rEarlyLate += earlyPart;
              rUpsell += upsellPart;
            } else {
              rUpsell += diff;
            }
          }
        } else {
          rDiscount += Math.abs(diff);
        }
      });

      // 1B. รับรู้รายได้ค่าห้องจาก ledger_transactions ที่ไม่อยู่ใน booking_daily_rates ของวันนี้
      // เช่น ชั่วคราว (short_stay), รอบดึก 0 คืน (late_night), พักต่อ (+คืน), บังคับพักต่อ, และค่าเข้าก่อน/ออกช้า
      allLedger.forEach((tx) => {
        if (tx.transaction_type !== "revenue") return;
        const isVoid = tx.category.includes("(Voided)");
        const isRoomOrEarlyLate =
          tx.category === "room_charge" ||
          tx.category.includes("ค่าห้องพัก") ||
          tx.category === "early_in_fee" ||
          tx.category === "late_out_fee" ||
          tx.category.includes("ค่าปรับออกช้า") ||
          tx.category.includes("ออกช้า") ||
          tx.category.includes("เข้าก่อน");

        if (isRoomOrEarlyLate) {
          if (!isInTodayRoomWindow(tx)) return;
          if (isVoid) {
            revVoid += Math.abs(Number(tx.amount || 0));
            return;
          }

          // รายการ Early / Late โดยตรง -> เข้า 1.2.1 early-late
          if (
            tx.category === "early_in_fee" ||
            tx.category === "late_out_fee" ||
            tx.category.includes("ค่าปรับออกช้า") ||
            tx.category.includes("ออกช้า") ||
            tx.category.includes("เข้าก่อน")
          ) {
            rEarlyLate += Number(tx.amount || 0);
            return;
          }

          // รายการค่าห้องพักหลัก (ถ้าคืนแรกถูกคำนวณใน 1A ไปแล้ว ให้ข้ามเพื่อไม่ให้ซ้ำ)
          if (
            (tx.category === "room_charge" || tx.category === "ค่าห้องพัก") &&
            tx.booking_id &&
            processedOvernightBookingIdsToday.has(tx.booking_id)
          ) {
            return;
          }

          // ถ้าเป็นการจองล่วงหน้า (status === 'reserved') ยังไม่รับรู้เป็นรายได้ค่าห้องจนกว่าจะเข้าพัก
          const b = tx.booking_id ? bookingMap[tx.booking_id] : undefined;
          if (b && b.status === "reserved") {
            return;
          }

          const room = (tx.room_id && roomMap[tx.room_id]) || (b && roomMap[b.room_id]);
          const meta = tx.booking_id ? bookingMetaMap[tx.booking_id] : undefined;
          const actualAmt = Number(tx.amount || 0);

          const isShortStay =
            meta?.targetPrices?.stayType === "short_stay" ||
            (!tx.category.includes("พักต่อ") &&
              !tx.category.includes("บังคับพักต่อ") &&
              !!b &&
              !(dailyRatesByBooking[b.id]?.length) &&
              new Date(b.check_out_time).getTime() - new Date(b.check_in_time).getTime() <= 10 * 3600 * 1000 &&
              new Date(b.check_out_time).getHours() !== 12);

          let targetAmt = actualAmt;
          if (tx.category.includes("พักต่อ") || tx.category.includes("บังคับพักต่อ")) {
            const matchNights = tx.category.match(/(\d+)\s*คืน/);
            const extNights = matchNights ? Number(matchNights[1]) : 1;
            targetAmt = Number(room?.price_night || actualAmt) * extNights;
          } else if (meta?.targetPrices?.totalTargetPrice && meta.targetPrices.totalTargetPrice > 0) {
            targetAmt = Number(meta.targetPrices.totalTargetPrice);
          } else if (isShortStay) {
            targetAmt = Number(room?.price_temp || actualAmt);
          } else if (room?.price_night && actualAmt >= room.price_night * 0.5) {
            targetAmt = Number(room.price_night);
          }

          const diff = actualAmt - targetAmt;
          rTarget += targetAmt;
          if (isShortStay) {
            rTargetShortStay += targetAmt;
          } else {
            rTargetOvernight += targetAmt;
          }

          if (diff >= 0) {
            if (diff > 0) {
              if (!isShortStay && meta?.targetPrices?.timeBand === "early_in") {
                const earlyCap = Number(room?.price_temp || diff);
                const earlyPart = Math.min(diff, earlyCap);
                const upsellPart = Math.max(0, diff - earlyPart);
                rEarlyLate += earlyPart;
                rUpsell += upsellPart;
              } else {
                rUpsell += diff;
              }
            }
          } else {
            rDiscount += Math.abs(diff);
          }
        }
      });

      // 1C. รายได้ที่ไม่ใช่ค่าห้องพัก (ตัดรอบ 06:45 - 06:44:59 วันถัดไป ตามกฎข้อ 8)
      txsIn0645Window.forEach((tx) => {
        if (tx.transaction_type !== "revenue") return;
        if (tx.category === "key_deposit" || tx.category === "ค่ามัดจำกุญแจ" || tx.category === "คืนมัดจำกุญแจ") return;

        const isRoomOrEarlyLate =
          tx.category === "room_charge" ||
          tx.category.includes("ค่าห้องพัก") ||
          tx.category === "early_in_fee" ||
          tx.category === "late_out_fee" ||
          tx.category.includes("ค่าปรับออกช้า") ||
          tx.category.includes("ออกช้า") ||
          tx.category.includes("เข้าก่อน");
        if (isRoomOrEarlyLate) return;

        const amt = Number(tx.amount || 0);
        if (tx.category.includes("(Voided)")) {
          revVoid += Math.abs(amt);
          return;
        }

        const cleanCat = tx.category.trim();
        const mappedCat = posCategoryMap[cleanCat];

        if (mappedCat === "addon") {
          revAddon += amt;
        } else if (mappedCat === "minibar") {
          revMinibar += amt;
        } else if (mappedCat === "fine") {
          revFine += amt;
        } else if (mappedCat === "other") {
          revOther += amt;
        } else if (
          extraNames.has(cleanCat) ||
          cleanCat.includes("เสริม") ||
          cleanCat.includes("ผ้าห่ม") ||
          cleanCat.includes("หมอน") ||
          cleanCat.includes("ผ้าเช็ดตัว")
        ) {
          revAddon += amt;
        } else if (
          cleanCat.includes("ปรับ") ||
          cleanCat.includes("ริบมัดจำ") ||
          cleanCat.includes("เสียหาย") ||
          cleanCat.includes("กุญแจหาย") ||
          cleanCat.includes("บุหรี่")
        ) {
          revFine += amt;
        } else if (posNames.has(cleanCat)) {
          revMinibar += amt;
        } else {
          revOther += amt;
        }
      });

      // 1D. บริการเสริมรายวัน (booking_daily_extras) ของวันนี้ที่ยังไม่ได้ถูกสร้างเป็นแถวใน ledger_transactions
      allDailyExtras.forEach((de) => {
        if (de.target_date !== reportDateStr) return;
        const b = bookingMap[de.booking_id];
        if (!b || b.status === "cancelled" || b.status === "reserved") return;
        const isVoid = String(de.category || "").includes("(Voided)");
        const baseCat = String(de.category || "").replace(" (Voided)", "").trim();
        const ratesForBooking = dailyRatesByBooking[de.booking_id] || [];
        const extrasForBooking = dailyExtrasByBooking[de.booking_id] || [];
        const firstDate = ratesForBooking[0]?.target_date || extrasForBooking[0]?.target_date || "";

        const alreadyInLedgerToday = txsIn0645Window.some(
          (tx) =>
            tx.booking_id === de.booking_id &&
            tx.transaction_type === "revenue" &&
            String(tx.category || "").replace(" (Voided)", "").trim() === baseCat &&
            (String(tx.notes || "").includes(de.target_date) ||
              (de.target_date === firstDate && !String(tx.notes || "").includes("ประจำวันที่ ")))
        );
        if (alreadyInLedgerToday) return;

        const amt = Number(de.amount || 0);
        if (isVoid) {
          revVoid += Math.abs(amt);
        } else {
          revAddon += amt;
        }
      });

      setRoomTargetTotal(rTarget);
      setRoomTargetOvernight(rTargetOvernight);
      setRoomTargetShortStay(rTargetShortStay);
      setEarlyLateTotal(rEarlyLate);
      setUpsellTotal(rUpsell);
      setRoomDiscountTotal(rDiscount);
      setAddonRevenue(revAddon);
      setMinibarRevenue(revMinibar);
      setFineRevenue(revFine);
      setOtherRevenue(revOther);
      setVoidedRevenue(revVoid);

      // =========================================================================
      // 2. คำนวณเงินมัดจำกุญแจ (Key Deposit Box) และแยกออกจากยอดรับชำระค่าห้อง/บริการ
      // =========================================================================
      // สำหรับแต่ละ booking คำนวณว่าเงินที่รับชำระในวันนี้เป็นส่วนของ "มัดจำกุญแจ" เท่าไหร่
      // (ตามหลัก depositMath: ค่าใช้จ่ายทั้งหมดของบิลต้องได้รับชำระก่อน ส่วนเกินจึงนับเป็นมัดจำกุญแจ)
      const depositPortionByPaymentTxId: Record<string, number> = {};
      const txsByBooking: Record<string, LedgerTransaction[]> = {};
      allLedger.forEach((tx) => {
        if (!tx.booking_id) return;
        if (!txsByBooking[tx.booking_id]) txsByBooking[tx.booking_id] = [];
        txsByBooking[tx.booking_id].push(tx);
      });

      let totalActiveHeldDeposit = 0;

      Object.entries(txsByBooking).forEach(([bId, bTxs]) => {
        const validTxs = bTxs.filter((t) => !t.category.includes("(Voided)"));
        const depTarget = validTxs
          .filter(
            (t) =>
              Number(t.amount) > 0 &&
              (t.transaction_type === "deposit" ||
                t.category === "ค่ามัดจำกุญแจ" ||
                t.category === "key_deposit")
          )
          .reduce((s, t) => s + Number(t.amount), 0);

        const rates = dailyRatesByBooking[bId] || [];
        const totalRatesAmt = rates.reduce((s, r) => s + Number(r.amount || 0), 0);
        const extrasForB = dailyExtrasByBooking[bId] || [];
        const firstStayDate = rates[0]?.target_date || extrasForB[0]?.target_date || "";
        const unpostedExtrasAmt = extrasForB
          .filter((de) => {
            if (String(de.category || "").includes("(Voided)")) return false;
            const baseCat = String(de.category || "").replace(" (Voided)", "").trim();
            const isPosted = validTxs.some(
              (t) =>
                t.transaction_type === "revenue" &&
                String(t.category || "").trim() === baseCat &&
                (String(t.notes || "").includes(de.target_date) ||
                  (de.target_date === firstStayDate && !String(t.notes || "").includes("ประจำวันที่ ")))
            );
            return !isPosted;
          })
          .reduce((s, de) => s + Number(de.amount || 0), 0);

        const postedNonRoomCharges = validTxs
          .filter(
            (t) =>
              t.transaction_type === "revenue" &&
              Number(t.amount) > 0 &&
              t.category !== "room_charge" &&
              t.category !== "ค่าห้องพัก" &&
              !t.category.includes("มัดจำกุญแจ")
          )
          .reduce((s, t) => s + Number(t.amount), 0);
        const postedRoomCharges = validTxs
          .filter(
            (t) =>
              t.transaction_type === "revenue" &&
              Number(t.amount) > 0 &&
              (t.category === "room_charge" || t.category === "ค่าห้องพัก")
          )
          .reduce((s, t) => s + Number(t.amount), 0);

        const totalBookingCharges =
          (totalRatesAmt > 0 ? totalRatesAmt : postedRoomCharges) + postedNonRoomCharges + unpostedExtrasAmt;

        let cumulativePaid = 0;
        let cumulativeDepHeld = 0;
        validTxs
          .filter((t) => t.transaction_type === "payment" && Number(t.amount) < 0)
          .forEach((pTx) => {
            const pAmt = Math.abs(Number(pTx.amount));
            cumulativePaid += pAmt;
            const newHeld = Math.min(depTarget, Math.max(0, cumulativePaid - totalBookingCharges));
            const depAddedByThisTx = Math.max(0, newHeld - cumulativeDepHeld);
            cumulativeDepHeld = newHeld;
            depositPortionByPaymentTxId[pTx.id] = depAddedByThisTx;
          });

        const refundedAll = validTxs
          .filter((t) => t.category.includes("คืนมัดจำกุญแจ"))
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        const forfeitedAll = validTxs
          .filter((t) => t.category.includes("ริบมัดจำ"))
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

        const b = bookingMap[bId];
        if (b && b.status === "checked_in") {
          totalActiveHeldDeposit += Math.max(0, cumulativeDepHeld - refundedAll - forfeitedAll);
        }
      });

      // =========================================================================
      // 3. คำนวณฝั่งรับชำระเงิน (Middle Column) และกล่องมัดจำกุญแจวันนี้
      // =========================================================================
      let cashToday = 0;
      let transferToday = 0;
      const transferByBank: Record<string, number> = {};
      configuredBanks.forEach((b) => {
        transferByBank[b] = 0;
      });
      let creditToday = 0;
      let voidRefundToday = 0;
      let expenseToday = 0;

      let depReceivedToday = 0;
      let depReceivedCashToday = 0;
      let depReceivedTransferToday = 0;
      let depRefundedToday = 0;
      let depForfeitedToday = 0;

      txsIn0645Window.forEach((tx) => {
        const isVoid = tx.category.includes("(Voided)");
        const absAmt = Math.abs(Number(tx.amount || 0));

        if (tx.transaction_type === "payment") {
          if (isVoid) {
            voidRefundToday += absAmt;
            return;
          }
          const depPortion = depositPortionByPaymentTxId[tx.id] || 0;
          const netRevenuePayment = Math.max(0, absAmt - depPortion);

          if (depPortion > 0) {
            depReceivedToday += depPortion;
            if (tx.category === "cash") depReceivedCashToday += depPortion;
            else if (tx.category === "transfer") depReceivedTransferToday += depPortion;
          }

          if (tx.category === "cash") {
            cashToday += netRevenuePayment;
          } else if (tx.category === "transfer") {
            transferToday += netRevenuePayment;
            const bankMatch = tx.notes?.match(/\[BANK:([^\]]+)\]/);
            const bankName = bankMatch ? bankMatch[1].trim() : configuredBanks[0] || "SCB";
            transferByBank[bankName] = (transferByBank[bankName] || 0) + netRevenuePayment;
          } else if (tx.category === "credit_card") {
            creditToday += netRevenuePayment;
          }
        } else if (tx.transaction_type === "expense" && !isVoid) {
          expenseToday += absAmt;
        } else if (tx.transaction_type === "deposit" && !isVoid) {
          if (Number(tx.amount) < 0 && tx.category.includes("คืนมัดจำ")) {
            depRefundedToday += absAmt;
          } else if (Number(tx.amount) < 0 && tx.category.includes("คืนเงินทอน")) {
            voidRefundToday += absAmt;
          }
        } else if (tx.transaction_type === "revenue" && !isVoid && tx.category.includes("ริบมัดจำ")) {
          depForfeitedToday += absAmt;
        }
      });

      setPayCash(cashToday);
      setPayTransferTotal(transferToday);
      setPayTransferByBank(transferByBank);
      setPayCredit(creditToday);
      setPayVoidRefund(voidRefundToday);
      setTotalExpense(expenseToday);

      setKeyDepositBox({
        receivedToday: depReceivedToday,
        receivedCashToday: depReceivedCashToday,
        receivedTransferToday: depReceivedTransferToday,
        refundedToday: depRefundedToday,
        forfeitedToday: depForfeitedToday,
        activeHeldTotal: totalActiveHeldDeposit,
      });

      // =========================================================================
      // 4. คำนวณฝั่งขวา: จ่ายล่วงหน้า (Advance Payment) และ รับจอง (Reservation)
      // =========================================================================
      // แยกตามสถานะการเข้าพัก:
      // - "รับจอง": ลูกค้าที่จองล่วงหน้าและจ่ายเงินไว้ แต่ยังไม่ได้เช็คอิน ณ วันนั้น
      // - "จ่ายล่วงหน้า": ลูกค้าที่เช็คอินแล้ว และชำระเงินล่วงหน้าสำหรับคืนถัดๆ ไป
      let advBF = 0,
        advAdd = 0,
        advUsed = 0;
      let resBF = 0,
        resAdd = 0,
        resUsed = 0;

      allBookings.forEach((b) => {
        if (b.status === "cancelled") return;
        const bTxs = (txsByBooking[b.id] || []).filter((t) => !t.category.includes("(Voided)"));
        const bRates = dailyRatesByBooking[b.id] || [];

        // ยอดรับชำระสะสม (หักส่วนที่เป็นมัดจำกุญแจ และหักส่วนที่คืนเงินทอนทันทีออก)
        const rawPaidBeforeToday = bTxs
          .filter(
            (t) =>
              t.transaction_type === "payment" &&
              Number(t.amount) < 0 &&
              new Date(t.created_at).getTime() < start0645.getTime()
          )
          .reduce((s, t) => s + Math.max(0, Math.abs(Number(t.amount)) - (depositPortionByPaymentTxId[t.id] || 0)), 0);
        const refundedChangeBeforeToday = bTxs
          .filter(
            (t) =>
              t.category.includes("คืนเงินทอน") &&
              Number(t.amount) < 0 &&
              new Date(t.created_at).getTime() < start0645.getTime()
          )
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        const paidBeforeToday = Math.max(0, rawPaidBeforeToday - refundedChangeBeforeToday);

        const rawPaidToday = bTxs
          .filter(
            (t) =>
              t.transaction_type === "payment" &&
              Number(t.amount) < 0 &&
              new Date(t.created_at).getTime() >= start0645.getTime() &&
              new Date(t.created_at).getTime() < end0645.getTime()
          )
          .reduce((s, t) => s + Math.max(0, Math.abs(Number(t.amount)) - (depositPortionByPaymentTxId[t.id] || 0)), 0);
        const refundedChangeToday = bTxs
          .filter(
            (t) =>
              t.category.includes("คืนเงินทอน") &&
              Number(t.amount) < 0 &&
              new Date(t.created_at).getTime() >= start0645.getTime() &&
              new Date(t.created_at).getTime() < end0645.getTime()
          )
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        const paidToday = Math.max(0, rawPaidToday - refundedChangeToday);

        if (paidBeforeToday === 0 && paidToday === 0) return;

        // ตรวจสอบว่าเช็คอินเมื่อไหร่
        const checkInDateStr = (b.actual_check_in_time || b.check_in_time || "").slice(0, 10);
        const isStillReservedAfterToday =
          b.status === "reserved" || checkInDateStr > reportDateStr;
        const wasReservedBeforeToday =
          b.status === "reserved" || checkInDateStr >= reportDateStr;

        // กรณีเป็นรายการ "รับจอง" (ยังไม่เข้าพักก่อนวันนี้)
        if (wasReservedBeforeToday && (b.status === "reserved" || (b.created_at && new Date(b.created_at).getTime() < start0645.getTime()) || checkInDateStr > reportDateStr)) {
          if (paidBeforeToday > 0) {
            resBF += paidBeforeToday;
          }
          if (isStillReservedAfterToday) {
            if (paidToday > 0) resAdd += paidToday;
          } else if (checkInDateStr === reportDateStr && paidBeforeToday > 0) {
            // วันนี้ลูกค้ารายการจองเข้ามาเช็คอินแล้ว -> ยอดจองถูกดึงไปใช้ (หรือโอนไปเป็นค่าห้องวันนี้/จ่ายล่วงหน้า)
            resUsed += paidBeforeToday;
          }
        }

        // กรณีเช็คอินแล้ว และมีหลายคืน (จ่ายล่วงหน้าสำหรับคืนถัดไป)
        if (!isStillReservedAfterToday && bRates.length > 1) {
          const chargesBeforeToday = bRates
            .filter((r) => r.target_date < reportDateStr)
            .reduce((s, r) => s + Number(r.amount || 0), 0);
          const nonRoomBeforeToday = bTxs
            .filter(
              (t) =>
                t.transaction_type === "revenue" &&
                Number(t.amount) > 0 &&
                t.category !== "room_charge" &&
                t.category !== "ค่าห้องพัก" &&
                !t.category.includes("มัดจำกุญแจ") &&
                new Date(t.created_at).getTime() < start0645.getTime()
            )
            .reduce((s, t) => s + Number(t.amount), 0);

          const chargeToday = bRates
            .filter((r) => r.target_date === reportDateStr)
            .reduce((s, r) => s + Number(r.amount || 0), 0);
          const nonRoomToday = bTxs
            .filter(
              (t) =>
                t.transaction_type === "revenue" &&
                Number(t.amount) > 0 &&
                t.category !== "room_charge" &&
                t.category !== "ค่าห้องพัก" &&
                !t.category.includes("มัดจำกุญแจ") &&
                new Date(t.created_at).getTime() >= start0645.getTime() &&
                new Date(t.created_at).getTime() < end0645.getTime()
            )
            .reduce((s, t) => s + Number(t.amount), 0);

          const totalChargesBeforeToday = chargesBeforeToday + nonRoomBeforeToday;
          const totalChargesToday = chargeToday + nonRoomToday;

          // ยอดจ่ายล่วงหน้ายกมาจากเมื่อวาน (เฉพาะคนที่เช็คอินก่อนวันนี้)
          const bAdvBF =
            checkInDateStr < reportDateStr
              ? Math.max(0, paidBeforeToday - totalChargesBeforeToday)
              : 0;
          // หากเพิ่งเช็คอินวันนี้แต่มีเงินจองยกมา ให้นับรวมในยอดที่นำมาจัดสรรวันนี้
          const transferredFromRes =
            checkInDateStr === reportDateStr ? paidBeforeToday : 0;
          const totalAvailableToday = paidToday + transferredFromRes;

          // เงินที่รับเพิ่มในวันนี้และเกินกว่าค่าใช้จ่ายของวันนี้ = รับจ่ายล่วงหน้าเพิ่มวันนี้
          const advAddedForBooking = Math.max(0, totalAvailableToday - totalChargesToday);
          // ยอดจ่ายล่วงหน้าที่ถูกตัดมาใช้เป็นค่าห้องพักของวันนี้
          const advUsedForBooking = Math.min(
            bAdvBF,
            Math.max(0, totalChargesToday - totalAvailableToday)
          );

          advBF += bAdvBF;
          advAdd += advAddedForBooking;
          advUsed += advUsedForBooking;
        }
      });

      setAdvanceBox({
        broughtForward: advBF,
        addedToday: advAdd,
        usedToday: advUsed,
        carriedForward: Math.max(0, advBF + advAdd - advUsed),
      });

      setReservationBox({
        broughtForward: resBF,
        addedToday: resAdd,
        usedToday: resUsed,
        carriedForward: Math.max(0, resBF + resAdd - resUsed),
      });

      setLoading(false);
    }

    fetchDailyData();
  }, [dateOffset, getNow]);

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-500 animate-pulse font-bold">
        กำลังประมวลผลรายงานเงินสดประจำวัน...
      </div>
    );
  }

  // สรุปตัวเลขคอลัมน์ซ้าย (ฝั่งรายได้)
  const roomExtraTotal = earlyLateTotal + upsellTotal; // 1.2 รายได้ส่วนเพิ่ม (1.2.1 + 1.2.2)
  const netRoomRevenue = roomTargetTotal + roomExtraTotal - roomDiscountTotal; // 1. รายได้ค่าห้อง (สุทธิ)
  const grossTotalRevenue =
    roomTargetTotal +
    roomExtraTotal +
    addonRevenue +
    minibarRevenue +
    fineRevenue +
    otherRevenue;
  const netTotalRevenue = grossTotalRevenue - roomDiscountTotal;

  // สรุปตัวเลขคอลัมน์กลาง (ฝั่งรับชำระเงิน)
  const totalPaymentReceived = payCash + payTransferTotal + payCredit - payVoidRefund;
  const netPaymentReceived = totalPaymentReceived - totalExpense;

  // ส่วนต่างกระทบยอด (Reconciliation)
  const reconciliationDiff = netPaymentReceived - netTotalRevenue;
  const netAdvanceMovement =
    advanceBox.addedToday -
    advanceBox.usedToday +
    (reservationBox.addedToday - reservationBox.usedToday);

  // ยอดเงินสดในลิ้นชักจริง (รวมรับ/คืนมัดจำกุญแจเงินสด)
  const physicalCashInDrawer =
    payCash -
    totalExpense +
    keyDepositBox.receivedCashToday -
    keyDepositBox.refundedToday;

  const fmt = (n: number) => `฿${Number(n || 0).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* แถบสถานะประจำวันและเวลาตัดรอบ */}
      <div
        className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isDayClosed ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200 shadow-xs"
        }`}
      >
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={`text-lg font-black ${isDayClosed ? "text-indigo-900" : "text-slate-800"}`}>
              📊 รายงานเงินสดประจำวัน ({reportDateLabel})
            </h2>
            <span
              className={`px-3 py-0.5 rounded-full font-bold text-xs ${
                isDayClosed ? "bg-indigo-600 text-white" : "bg-amber-100 text-amber-800"
              }`}
            >
              {isDayClosed ? "✅ สรุปยอดแล้ว (Closed)" : "🔄 กำลังดำเนินการ (Open)"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ⏱️ ตัดรอบค่าห้องพัก: <b>09:45 น.</b> (นับรวม Early Check-in 06:45–09:44 น. เป็นของวันนี้) • ตัดรอบรายการอื่น/กะดึก: <b>06:45 น.</b>
          </p>
        </div>
      </div>

      {/* โครงสร้างหลัก 3 คอลัมน์ตามต้นฉบับ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* ==================== คอลัมน์ซ้าย: ฝั่งรายได้ (5 ส่วน) ==================== */}
        <div className="lg:col-span-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-800 text-white flex justify-between items-center">
            <h3 className="font-black text-base tracking-wide">ฝั่งรายได้ (Revenue)</h3>
            <span className="text-[11px] bg-slate-700 text-slate-200 px-2.5 py-0.5 rounded-full font-bold">
              ไม่รวมมัดจำกุญแจ
            </span>
          </div>

          <div className="p-5 flex-1 space-y-3 text-sm">
            {/* 1. รายได้ค่าห้อง */}
            <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-3.5 space-y-2">
              <div className="flex justify-between items-center font-black text-slate-900 text-base border-b border-slate-200 pb-2">
                <span>1. รายได้ค่าห้อง</span>
                <span className="text-indigo-700">{fmt(netRoomRevenue)}</span>
              </div>

              {/* 1.1 รายได้ค่าห้อง (ตามราคาเป้าหมาย) */}
              <div className="pl-3 space-y-1">
                <div className="flex justify-between items-center text-slate-700 font-semibold">
                  <span>1.1 รายได้ค่าห้อง (ตามราคาเป้าหมาย)</span>
                  <span className="font-bold text-slate-900">{fmt(roomTargetTotal)}</span>
                </div>
                <div className="flex justify-between items-center pl-4 text-xs text-slate-600">
                  <span>1.1.1 ค้างคืน</span>
                  <span className="font-bold text-slate-700">{fmt(roomTargetOvernight)}</span>
                </div>
                <div className="flex justify-between items-center pl-4 text-xs text-slate-600">
                  <span>1.1.2 ชั่วคราว</span>
                  <span className="font-bold text-slate-700">{fmt(roomTargetShortStay)}</span>
                </div>
              </div>

              {/* 1.2 รายได้ส่วนเพิ่ม */}
              <div className="pl-3 space-y-1">
                <div className="flex justify-between items-center text-slate-700 font-semibold">
                  <span>1.2 รายได้ส่วนเพิ่ม</span>
                  <span className="font-bold text-emerald-700">+{fmt(roomExtraTotal)}</span>
                </div>
                <div className="flex justify-between items-center pl-4 text-xs text-slate-600">
                  <span>1.2.1 เข้าก่อน/ออกช้า (Early-Late)</span>
                  <span className="font-bold text-slate-700">{fmt(earlyLateTotal)}</span>
                </div>
                <div className="flex justify-between items-center pl-4 text-xs text-slate-600">
                  <span>1.2.2 ส่วนเพิ่มค่าห้อง</span>
                  <span className="font-bold text-slate-700">{fmt(upsellTotal)}</span>
                </div>
              </div>

              {/* 1.3 ส่วนลด */}
              <div className="flex justify-between items-center pl-3 text-rose-600 font-semibold pt-1 border-t border-slate-200/60">
                <span>1.3 ส่วนลด (ต่ำกว่าราคาเป้าหมาย)</span>
                <span className="font-bold">-{fmt(roomDiscountTotal)}</span>
              </div>
            </div>

            {/* 2 - 6 หมวดรายได้อื่นๆ */}
            <div className="space-y-2.5 pt-1 px-1">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="font-bold text-slate-700">2. ค่าส่วนเสริม (เตียงเสริม/ผ้าห่ม/หมอน)</span>
                <span className="font-black text-slate-900">{fmt(addonRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="font-bold text-slate-700">3. ค่ามินิบาร์ (อาหาร/เครื่องดื่ม)</span>
                <span className="font-black text-slate-900">{fmt(minibarRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="font-bold text-slate-700">4. ค่าปรับ (เสียหาย/สูบบุหรี่/ริบมัดจำ)</span>
                <span className="font-black text-slate-900">{fmt(fineRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="font-bold text-slate-700">5. ค่าบริการอื่นๆ</span>
                <span className="font-black text-slate-900">{fmt(otherRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 text-slate-400">
                <span className="font-semibold">6. ยกเลิก (Voided)</span>
                <span className="font-bold">{fmt(voidedRevenue)}</span>
              </div>
            </div>
          </div>

          {/* สรุปท้ายคอลัมน์ซ้าย */}
          <div className="p-4 bg-slate-50 border-t-2 border-slate-200 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600 font-semibold">
              <span>รวมรายได้ทั้งหมด (ก่อนหักส่วนลด)</span>
              <span>{fmt(grossTotalRevenue)}</span>
            </div>
            <div className="flex justify-between text-rose-600 font-semibold">
              <span>หัก ส่วนลดค่าห้อง</span>
              <span>-{fmt(roomDiscountTotal)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-black text-base text-slate-900">
              <span>รวมรายได้สุทธิ</span>
              <span className="text-xl text-indigo-700">{fmt(netTotalRevenue)}</span>
            </div>
          </div>
        </div>

        {/* ==================== คอลัมน์กลาง: ฝั่งรับชำระเงิน (4 ส่วน) ==================== */}
        <div className="lg:col-span-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 bg-emerald-800 text-white flex justify-between items-center">
            <h3 className="font-black text-base tracking-wide">ฝั่งรับชำระเงิน (Payments)</h3>
            <span className="text-[11px] bg-emerald-700 text-emerald-100 px-2.5 py-0.5 rounded-full font-bold">
              แยกตามช่องทาง
            </span>
          </div>

          <div className="p-5 flex-1 space-y-3 text-sm">
            {/* เงินสด */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <span className="font-black text-emerald-950 flex items-center gap-2">
                <span>💵</span> เงินสด
              </span>
              <span className="font-black text-base text-emerald-700">{fmt(payCash)}</span>
            </div>

            {/* โอน (พร้อมแจกแจงรายบัญชีธนาคาร) */}
            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-2">
              <div className="flex justify-between items-center border-b border-blue-200/60 pb-1.5">
                <span className="font-black text-blue-950 flex items-center gap-2">
                  <span>📱</span> โอนเงิน (รวมทุกบัญชี)
                </span>
                <span className="font-black text-base text-blue-700">{fmt(payTransferTotal)}</span>
              </div>
              <div className="space-y-1 pl-3">
                {Array.from(new Set([...bankAccounts, ...Object.keys(payTransferByBank)])).map((bank) => (
                  <div key={bank} className="flex justify-between items-center text-xs text-slate-600">
                    <span className="font-bold text-blue-900">• บัญชี {bank}</span>
                    <span className="font-black text-slate-800">{fmt(payTransferByBank[bank] || 0)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* บัตรเครดิต */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-purple-50/60 border border-purple-200/80">
              <span className="font-black text-purple-950 flex items-center gap-2">
                <span>💳</span> บัตรเครดิต
              </span>
              <span className="font-black text-base text-purple-700">{fmt(payCredit)}</span>
            </div>

            {/* ยกเลิก / คืนเงิน */}
            <div className="flex justify-between items-center px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
              <span className="font-bold">ยกเลิก / คืนเงินทอน</span>
              <span className="font-bold text-rose-600">-{fmt(payVoidRefund)}</span>
            </div>
          </div>

          {/* สรุปท้ายคอลัมน์กลาง */}
          <div className="p-4 bg-slate-50 border-t-2 border-slate-200 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-700 font-bold">
              <span>รวมรับชำระ</span>
              <span>{fmt(totalPaymentReceived)}</span>
            </div>
            <div className="flex justify-between text-orange-600 font-semibold">
              <span>หัก ค่าใช้จ่ายหน้าร้าน (Petty Cash)</span>
              <span>-{fmt(totalExpense)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-black text-base text-slate-900">
              <span>รวมรับชำระสุทธิ</span>
              <span className="text-xl text-emerald-700">{fmt(netPaymentReceived)}</span>
            </div>
          </div>
        </div>

        {/* ==================== คอลัมน์ขวา: จ่ายล่วงหน้า & รับจอง (3 ส่วน) ==================== */}
        <div className="lg:col-span-3 flex flex-col gap-5">
          {/* กล่องที่ 1: จ่ายล่วงหน้า (Advance Payment - ลูกค้าเช็คอินแล้วจ่ายหลายคืน) */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
            <div className="px-4 py-3 bg-sky-800 text-white">
              <h3 className="font-black text-sm">🏨 จ่ายล่วงหน้า (พักหลายคืน)</h3>
              <p className="text-[11px] text-sky-200">ลูกค้าเช็คอินแล้ว ชำระล่วงหน้าสำหรับคืนถัดไป</p>
            </div>
            <div className="p-4 flex-1 flex flex-col justify-between text-sm space-y-2">
              <div className="space-y-2">
                <div className="flex justify-between text-slate-600">
                  <span>ยอดยกมา</span>
                  <span className="font-bold text-slate-800">{fmt(advanceBox.broughtForward)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>+ รับเพิ่มวันนี้</span>
                  <span className="font-bold">+{fmt(advanceBox.addedToday)}</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>- ใช้ไปวันนี้ (ตัดเป็นค่าห้อง)</span>
                  <span className="font-bold">-{fmt(advanceBox.usedToday)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-2.5 border-t-2 border-slate-100 font-black text-slate-900">
                <span>ยอดคงเหลือยกไป</span>
                <span className="text-base text-sky-700">{fmt(advanceBox.carriedForward)}</span>
              </div>
            </div>
          </div>

          {/* กล่องที่ 2: รับจอง (Reservation Deposits - ลูกค้าจองล่วงหน้ายังไม่เช็คอิน) */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
            <div className="px-4 py-3 bg-purple-800 text-white">
              <h3 className="font-black text-sm">📅 เงินรับจองล่วงหน้า</h3>
              <p className="text-[11px] text-purple-200">ลูกค้าโอนจองล่วงหน้า ยังไม่เช็คอินเข้าพัก</p>
            </div>
            <div className="p-4 flex-1 flex flex-col justify-between text-sm space-y-2">
              <div className="space-y-2">
                <div className="flex justify-between text-slate-600">
                  <span>ยอดยกมา</span>
                  <span className="font-bold text-slate-800">{fmt(reservationBox.broughtForward)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>+ รับจองเพิ่มวันนี้</span>
                  <span className="font-bold">+{fmt(reservationBox.addedToday)}</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>- ใช้ไปวันนี้ (เข้าพักวันนี้)</span>
                  <span className="font-bold">-{fmt(reservationBox.usedToday)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-2.5 border-t-2 border-slate-100 font-black text-slate-900">
                <span>ยอดคงเหลือยกไป</span>
                <span className="text-base text-purple-700">{fmt(reservationBox.carriedForward)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== แถบสรุปกระทบยอดด้านล่าง (Bottom Reconciliation Bar) ==================== */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md border-t-4 border-indigo-500">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700">
            <div className="text-xs text-slate-400 font-bold">รวมรายได้สุทธิ (ฝั่งซ้าย)</div>
            <div className="text-2xl font-black text-indigo-300 mt-0.5">{fmt(netTotalRevenue)}</div>
          </div>
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700">
            <div className="text-xs text-slate-400 font-bold">รวมรับชำระสุทธิ (ฝั่งกลาง)</div>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{fmt(netPaymentReceived)}</div>
          </div>
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700">
            <div className="text-xs text-slate-400 font-bold">การเคลื่อนไหวเงินล่วงหน้า/รับจอง</div>
            <div className="text-xl font-black text-sky-300 mt-0.5">
              {netAdvanceMovement >= 0 ? `+${fmt(netAdvanceMovement)}` : `-${fmt(Math.abs(netAdvanceMovement))}`}
            </div>
          </div>
          <div
            className={`p-3.5 rounded-xl border ${
              reconciliationDiff === 0
                ? "bg-emerald-950/60 border-emerald-700"
                : "bg-amber-950/60 border-amber-600"
            }`}
          >
            <div className="text-xs text-slate-300 font-bold">
              ส่วนต่าง (รับชำระสุทธิ - รายได้สุทธิ)
            </div>
            <div
              className={`text-2xl font-black mt-0.5 ${
                reconciliationDiff === 0
                  ? "text-emerald-400"
                  : reconciliationDiff > 0
                  ? "text-amber-300"
                  : "text-rose-400"
              }`}
            >
              {reconciliationDiff > 0 ? "+" : ""}
              {fmt(reconciliationDiff)}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== กล่องแยกต่างหาก: สรุปเงินมัดจำกุญแจ (ตามข้อ 6) ==================== */}
      <div className="bg-amber-50/90 border-2 border-amber-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-amber-200">
          <div>
            <h3 className="font-black text-amber-950 text-base flex items-center gap-2">
              <span>🔑</span> กล่องแยกบัญชี: สรุปเงินมัดจำกุญแจ (ไม่รวมในรายได้ค่าห้อง)
            </h3>
            <p className="text-xs text-amber-800 mt-0.5">
              เงินมัดจำกุญแจเป็นเงินพักรอคืนลูกค้า จะถูกนับเป็นรายได้หมวด &quot;4. ค่าปรับ&quot; เฉพาะเมื่อมีการสั่งริบมัดจำตอนเช็คเอาท์เท่านั้น
            </p>
          </div>
          <div className="bg-white border border-amber-300 px-3.5 py-2 rounded-xl text-right shrink-0">
            <div className="text-[11px] font-bold text-slate-500">💵 เงินสดในลิ้นชักจริงวันนี้ (รวมมัดจำเงินสดสุทธิ)</div>
            <div className="text-lg font-black text-emerald-700">{fmt(physicalCashInDrawer)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-white p-3.5 rounded-xl border border-amber-200/80">
            <div className="text-xs font-bold text-slate-500">รับมัดจำกุญแจวันนี้</div>
            <div className="text-xl font-black text-amber-800 mt-1">+{fmt(keyDepositBox.receivedToday)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              สด {fmt(keyDepositBox.receivedCashToday)} • โอน {fmt(keyDepositBox.receivedTransferToday)}
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-amber-200/80">
            <div className="text-xs font-bold text-slate-500">คืนมัดจำกุญแจวันนี้</div>
            <div className="text-xl font-black text-emerald-700 mt-1">-{fmt(keyDepositBox.refundedToday)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">คืนให้ลูกค้าตอนเช็คเอาท์</div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-amber-200/80">
            <div className="text-xs font-bold text-slate-500">หัก/ริบเป็นค่าปรับวันนี้</div>
            <div className="text-xl font-black text-rose-600 mt-1">{fmt(keyDepositBox.forfeitedToday)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">โอนเข้าหมวด 4. ค่าปรับแล้ว</div>
          </div>
          <div className="bg-amber-100/70 p-3.5 rounded-xl border border-amber-300">
            <div className="text-xs font-bold text-amber-900">มัดจำกุญแจที่ถืออยู่ (ห้องพักปัจจุบัน)</div>
            <div className="text-xl font-black text-amber-950 mt-1">{fmt(keyDepositBox.activeHeldTotal)}</div>
            <div className="text-[11px] text-amber-800 mt-0.5">ยอดมัดจำที่รอคืนของห้องที่ยังไม่เช็คเอาท์</div>
          </div>
        </div>
      </div>

      {/* รายละเอียดค่าใช้จ่ายหน้าร้าน (Petty Cash) และ ประวัติการปิดกะ (Shift Logs) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* สรุปรายจ่าย / เงินสดย่อย */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800">รายละเอียดค่าใช้จ่าย / เงินสดย่อย (Petty Cash)</h3>
          </div>
          <div className="p-4 flex-1">
            {transactions.filter((t) => t.transaction_type === "expense" && !t.category.includes("(Voided)")).length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">ไม่มีรายการใช้จ่ายในวันนี้</p>
            ) : (
              <ul className="space-y-3">
                {transactions
                  .filter((t) => t.transaction_type === "expense" && !t.category.includes("(Voided)"))
                  .map((txn) => (
                    <li
                      key={txn.id}
                      className="flex justify-between items-center text-sm border-b border-slate-50 pb-2 last:border-0"
                    >
                      <div>
                        <div className="font-bold text-slate-700">{txn.category}</div>
                        <div className="text-xs text-slate-400">โดย: {txn.staff_name}</div>
                      </div>
                      <div className="font-bold text-orange-600">-฿{Math.abs(txn.amount).toLocaleString()}</div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div className="p-4 border-t border-slate-100 bg-orange-50 flex justify-between items-center font-bold text-orange-800">
            <span>รวมค่าใช้จ่าย:</span>
            <span>฿{totalExpense.toLocaleString()}</span>
          </div>
        </div>

        {/* สรุปกะ (Shift Logs) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800">ประวัติการปิดกะ (Shift Logs)</h3>
          </div>
          <div className="p-4 space-y-4">
            {shifts.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">ไม่มีการเปิดกะในช่วงเวลานี้</p>
            ) : (
              shifts.map((shift) => (
                <div key={shift.id} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-800">{shift.staff_name}</span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-bold ${
                        shift.status === "open"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {shift.status === "open" ? "กำลังเปิด" : "ปิดแล้ว"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mb-4">
                    เวลา: {new Date(shift.start_time).toLocaleTimeString("th-TH")} -{" "}
                    {shift.end_time ? new Date(shift.end_time).toLocaleTimeString("th-TH") : "..."}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-slate-600">เงินทอนตั้งต้น:</div>
                    <div className="font-bold text-right">฿{shift.initial_cash.toLocaleString()}</div>

                    <div className="text-slate-600">ยอดที่ควรมี:</div>
                    <div className="font-bold text-right text-emerald-600">
                      ฿{shift.expected_cash.toLocaleString()}
                    </div>

                    {shift.status === "closed" && (
                      <>
                        <div className="text-slate-600">ยอดนับได้จริง:</div>
                        <div className="font-bold text-right">฿{(shift.final_cash || 0).toLocaleString()}</div>

                        <div className="text-slate-600">ส่วนต่าง:</div>
                        <div
                          className={`font-bold text-right ${
                            (shift.discrepancy || 0) < 0
                              ? "text-red-500"
                              : (shift.discrepancy || 0) > 0
                              ? "text-blue-500"
                              : "text-slate-500"
                          }`}
                        >
                          ฿{(shift.discrepancy || 0).toLocaleString()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
