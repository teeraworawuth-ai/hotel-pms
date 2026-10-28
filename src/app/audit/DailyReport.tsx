"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Shift, useShift } from "@/contexts/ShiftContext";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";
import { computeKeyDepositParts, fetchActiveKeyDeposits, HeldKeyDepositRoom } from "@/lib/keyDeposit";
import {
  addDaysStr,
  atLocalTime,
  CashHandover,
  computeDrawerFromRows,
  fetchHandoversByDate,
  fetchShiftBusinessDates,
  saveHandover,
  ShiftDrawer,
  verifyManagerPin,
} from "@/lib/cashHandover";
import { logActivity } from "@/lib/activityLog";
import SignaturePad, { SignaturePadHandle } from "@/app/components/SignaturePad";
import { parseBillUrls } from "@/app/components/ShiftExpenseModal";

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
  cancelledAt?: string;
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

type BoxRoomBreakdownItem = {
  bookingId: string;
  roomNo: string;
  guestName: string;
  checkInDateStr: string;
  broughtForward: number;
  addedToday: number;
  usedToday: number;
  carriedForward: number;
  note?: string;
};

type HeldDepositRoomItem = {
  bookingId: string;
  roomNo: string;
  guestName: string;
  amount: number;
};

export default function DailyReport({
  dateOffset,
  onChangeDateOffset,
}: {
  dateOffset: number;
  onChangeDateOffset?: (offset: number) => void;
}) {
  const { getNow } = useSimulatedTime();
  const { getActiveBusinessDate, currentBusinessDate } = useShift();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [isDayClosed, setIsDayClosed] = useState(false);
  const [reportDateLabel, setReportDateLabel] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

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
  const [advanceBreakdown, setAdvanceBreakdown] = useState<BoxRoomBreakdownItem[]>([]);
  const [reservationBreakdown, setReservationBreakdown] = useState<BoxRoomBreakdownItem[]>([]);
  const [showAdvanceChangeDetails, setShowAdvanceChangeDetails] = useState(false);
  const [showReservationChangeDetails, setShowReservationChangeDetails] = useState(false);
  const [showAdvanceDetails, setShowAdvanceDetails] = useState(false);
  const [showReservationDetails, setShowReservationDetails] = useState(false);

  // Separate Key Deposit Box (แยกจากหมวดบัญชีรายได้ตามข้อ 6)
  const [keyDepositBox, setKeyDepositBox] = useState({
    broughtForward: 0, // มัดจำกุญแจที่ถืออยู่ต้นวัน
    placedToday: 0, // กันเป็นมัดจำกุญแจสุทธิวันนี้ (+)
    refundedToday: 0, // คืนมัดจำเป็นเงินสดวันนี้
    forfeitedToday: 0, // ริบมัดจำเป็นค่าปรับวันนี้
    activeHeldTotal: 0, // มัดจำกุญแจที่ถืออยู่สิ้นวัน
  });
  const [heldDepositRooms, setHeldDepositRooms] = useState<HeldDepositRoomItem[]>([]);
  const [showHeldDepositRooms, setShowHeldDepositRooms] = useState(false);
  const [receivableBox, setReceivableBox] = useState({ start: 0, end: 0 });

  // กล่องเงินสดสำหรับเซ็นรับ-เก็บเงินประจำวัน
  const [dayShifts, setDayShifts] = useState<Shift[]>([]);
  const [handovers, setHandovers] = useState<CashHandover[]>([]);
  const [dayExpenses, setDayExpenses] = useState<LedgerTransaction[]>([]);
  const [shiftDrawers, setShiftDrawers] = useState<Record<string, ShiftDrawer>>({});
  const [liveReserve, setLiveReserve] = useState<{ total: number; rooms: HeldKeyDepositRoom[] }>({ total: 0, rooms: [] });
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);
  const [showPreliminary, setShowPreliminary] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [signTarget, setSignTarget] = useState<CashHandover | null>(null);
  const [signPin, setSignPin] = useState("");
  const [signError, setSignError] = useState("");
  const [signSaving, setSignSaving] = useState(false);
  const managerSigRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    async function fetchDailyData() {
      setLoading(true);

      const now = getNow();
      // วันของรายงาน (อิงวันธุรกิจปัจจุบัน — หากปิดกะสุดท้ายตั้งแต่ 05:30 น. แล้ว จะเริ่มวันใหม่ทันที + dateOffset)
      const baseDay = getActiveBusinessDate();
      baseDay.setDate(baseDay.getDate() + dateOffset);

      // ตัดรอบวันธุรกิจค่าเริ่มต้น 06:45 น. ถึง 06:44:59 น. ของวันถัดไป (หากมีการปิดกะสุดท้าย EOD ตั้งแต่ 05:30 น. จะใช้เวลาปิดกะจริงเป็นจุดตัดวัน)
      let start0645 = new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate(), 6, 45, 0, 0);
      let end0645 = new Date(start0645);
      end0645.setDate(end0645.getDate() + 1);
      const queryEndBound = new Date(end0645.getTime() + 6 * 3600 * 1000);

      const reportDateStr = `${start0645.getFullYear()}-${String(start0645.getMonth() + 1).padStart(2, "0")}-${String(start0645.getDate()).padStart(2, "0")}`;
      setReportDateLabel(
        start0645.toLocaleDateString("th-TH", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      );

      // จำกัดขอบเขตการดึงข้อมูลย้อนหลัง 180 วัน + limit 10,000 แถว เพื่อไม่ให้ติดเพดานเริ่มต้น 1,000 แถวของ Supabase เมื่อข้อมูลสะสมหลายเดือน
      const windowStart = new Date(start0645);
      windowStart.setDate(windowStart.getDate() - 180);
      const windowStartDateStr = `${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, "0")}-${String(windowStart.getDate()).padStart(2, "0")}`;

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
          .gte("created_at", windowStart.toISOString())
          .lt("created_at", queryEndBound.toISOString())
          .order("created_at", { ascending: true })
          .limit(10000),
        supabase
          .from("bookings")
          .select("id, room_id, guest_name, status, check_in_time, check_out_time, actual_check_in_time, actual_price, created_at")
          .or(`check_out_time.gte.${windowStart.toISOString()},status.in.(reserved,checked_in)`)
          .limit(10000),
        supabase
          .from("booking_daily_rates")
          .select("id, booking_id, target_date, amount, is_manual_override")
          .gte("target_date", windowStartDateStr)
          .limit(10000),
        supabase
          .from("booking_daily_extras")
          .select("id, booking_id, target_date, category, description, amount")
          .gte("target_date", windowStartDateStr)
          .limit(10000),
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
          .select("key, value")
          .not("key", "like", "cash_handover_%")
          .not("key", "like", "shift_bd_%")
          .limit(10000),
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
      const prevDateStr = addDaysStr(reportDateStr, -1);
      const nextDateStr = addDaysStr(reportDateStr, 1);
      const prevEodKey = `eod_shift_${prevDateStr}`;
      const eodKey = `eod_shift_${reportDateStr}`;
      let prevEodClosedAt: string | null = null;
      let currEodClosedAt: string | null = null;

      (settingsRes.data || []).forEach((row: any) => {
        if (row.key === "bank_accounts" && Array.isArray(row.value) && row.value.length > 0) {
          configuredBanks = row.value;
        } else if (row.key === "pos_category_map" && row.value && typeof row.value === "object") {
          posCategoryMap = row.value;
        } else if (row.key === prevEodKey) {
          if (row.value?.closed_at) prevEodClosedAt = String(row.value.closed_at);
        } else if (row.key === eodKey) {
          dayClosed = true;
          if (row.value?.closed_at) currEodClosedAt = String(row.value.closed_at);
        } else if (typeof row.key === "string" && row.key.startsWith("booking_meta_")) {
          const bId = row.key.replace("booking_meta_", "");
          bookingMetaMap[bId] = row.value as BookingMeta;
        }
      });

      // หากเมื่อวานปิดกะสุดท้ายตั้งแต่ 05:30 น. เป็นต้นไป ให้เริ่มนับวันใหม่ทันทีตั้งแต่เวลาที่ปิดกะสุดท้ายนั้น
      if (prevEodClosedAt) {
        const dt = new Date(prevEodClosedAt);
        const minStart = atLocalTime(reportDateStr, 5, 30);
        const maxStart = atLocalTime(reportDateStr, 12, 0);
        if (dt.getTime() >= minStart.getTime() && dt.getTime() <= maxStart.getTime()) {
          start0645 = dt;
        }
      }
      // หากวันนี้ปิดกะสุดท้ายตั้งแต่ 05:30 น. ของเช้าวันถัดไป ให้ตัดจบวัน ณ เวลาที่ปิดกะสุดท้ายนั้นพอดี
      if (currEodClosedAt) {
        const dt = new Date(currEodClosedAt);
        const minEnd = atLocalTime(nextDateStr, 5, 30);
        const maxEnd = atLocalTime(nextDateStr, 12, 0);
        if (dt.getTime() >= minEnd.getTime() && dt.getTime() <= maxEnd.getTime()) {
          end0645 = dt;
        }
      }

      setBankAccounts(configuredBanks);
      setIsDayClosed(dayClosed);

      // รายการที่เกิดในรอบวันธุรกิจ 06:45 น. ถึง 06:44:59 น. ของวันถัดไป (นับเป็น 1 วันเดียวกันทุกหมวด)
      const txsIn0645Window = allLedger.filter((tx) => {
        const t = new Date(tx.created_at).getTime();
        return t >= start0645.getTime() && t < end0645.getTime();
      });
      setTransactions(txsIn0645Window);

      const isInTodayRoomWindow = (tx: LedgerTransaction) => {
        const t = new Date(tx.created_at).getTime();
        return t >= start0645.getTime() && t < end0645.getTime();
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
          // และบิลค้างคืนที่มีตารางราคารายคืน (booking_daily_rates) จะรับรู้ค่าห้องตาม target_date ใน 1A เท่านั้น
          // (ป้องกันกรณีจองล่วงหน้าที่ลงแถว room_charge ไว้ตั้งแต่วันจอง ถูกนับเป็นรายได้ของวันจองซ้ำ)
          if (
            (tx.category === "room_charge" || tx.category === "ค่าห้องพัก") &&
            tx.booking_id &&
            (processedOvernightBookingIdsToday.has(tx.booking_id) ||
              (dailyRatesByBooking[tx.booking_id]?.length || 0) > 0)
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

      // Helper: จัดหมวดหมู่รายได้ที่ไม่ใช่ค่าห้องพักตามการตั้งค่า
      const addCategorizedRevenue = (rawCategory: string, amt: number) => {
        const cleanCat = rawCategory.replace(" (Voided)", "").trim();
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
      };

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

        // หากเป็นบริการเสริมรายวันที่มีระบุวันที่ใน notes ชัดเจน แต่ไม่ใช่วันรายงานนี้ ให้ข้าม (ไปรับรู้ในวันที่ตรงกับ target_date)
        const noteDateMatch = String(tx.notes || "").match(/ประจำวันที่\s*(\d{4}-\d{2}-\d{2})/);
        if (noteDateMatch && noteDateMatch[1] !== reportDateStr) return;

        const amt = Number(tx.amount || 0);
        if (tx.category.includes("(Voided)")) {
          revVoid += Math.abs(amt);
          return;
        }

        addCategorizedRevenue(tx.category, amt);
      });

      // 1D. บริการเสริมรายวัน (booking_daily_extras) ของวันนี้ที่ยังไม่ได้ถูกสร้างเป็นแถวใน ledger_transactions วันนี้
      allDailyExtras.forEach((de) => {
        if (de.target_date !== reportDateStr) return;
        const b = bookingMap[de.booking_id];
        if (!b || b.status === "cancelled" || b.status === "reserved") return;
        const isVoid = String(de.category || "").includes("(Voided)");
        const baseCat = String(de.category || "").replace(" (Voided)", "").trim();
        const ratesForBooking = dailyRatesByBooking[de.booking_id] || [];
        const extrasForBooking = dailyExtrasByBooking[de.booking_id] || [];
        const firstDate = ratesForBooking[0]?.target_date || extrasForBooking[0]?.target_date || "";

        const alreadyInLedgerToday = txsIn0645Window.some((tx) => {
          if (tx.booking_id !== de.booking_id || tx.transaction_type !== "revenue") return false;
          if (String(tx.category || "").replace(" (Voided)", "").trim() !== baseCat) return false;
          const noteDateMatch = String(tx.notes || "").match(/ประจำวันที่\s*(\d{4}-\d{2}-\d{2})/);
          if (noteDateMatch) return noteDateMatch[1] === de.target_date;
          return de.target_date === firstDate;
        });
        if (alreadyInLedgerToday) return;

        const amt = Number(de.amount || 0);
        if (isVoid) {
          revVoid += Math.abs(amt);
        } else {
          // ใช้หมวดที่ตั้งค่าไว้ หากไม่พบใน posCategoryMap ให้ถือเป็นค่าส่วนเสริม (addon) ตามค่าเริ่มต้นของบริการเสริมรายวัน
          if (posCategoryMap[baseCat]) {
            addCategorizedRevenue(baseCat, amt);
          } else {
            revAddon += amt;
          }
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

      // แปลงเวลา ISO/UTC เป็นวันธุรกิจตามเขตเวลาไทย (Asia/Bangkok, +07:00, ตัดรอบ 06:45 - 06:44 ของอีกวัน)
      const toThaiDateStr = (isoStr?: string | null): string => {
        if (!isoStr) return "";
        const trimmed = String(isoStr).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const d = new Date(trimmed);
        if (isNaN(d.getTime())) return trimmed.slice(0, 10);
        const thaiBizTime = new Date(d.getTime() + 7 * 3600 * 1000 - (6 * 60 + 45) * 60 * 1000);
        return thaiBizTime.toISOString().slice(0, 10);
      };

      // =========================================================================
      // 2. หลักการเครื่องหมายเพื่อให้เกิดความสมดุล (Balance = 0)
      //    - ฝั่งรายได้: ธรรมชาติเป็นบวก (+)
      //    - ฝั่งรับชำระเงิน: รับเงินเป็นลบ (-) / คืนเงินสด และกันเงินมัดจำกุญแจไว้คืนลูกค้าเป็นบวก (+)
      //    - กล่องจ่ายล่วงหน้า/รับจอง: รับเพิ่มเป็นบวก (+) / ดึงมาใช้เป็นลบ (-)
      //    รายได้ + รับชำระ + จ่ายล่วงหน้า + รับจอง (+ ค้างชำระ) = 0
      // =========================================================================
      const txsByBooking: Record<string, LedgerTransaction[]> = {};
      allLedger.forEach((tx) => {
        if (!tx.booking_id) return;
        if (!txsByBooking[tx.booking_id]) txsByBooking[tx.booking_id] = [];
        txsByBooking[tx.booking_id].push(tx);
      });

      const isRoomTypeCategory = (cat: string) =>
        cat === "room_charge" ||
        cat.includes("ค่าห้องพัก") ||
        cat === "early_in_fee" ||
        cat === "late_out_fee" ||
        cat.includes("ค่าปรับออกช้า") ||
        cat.includes("ออกช้า") ||
        cat.includes("เข้าก่อน");
      const isDepositRelated = (cat: string) => cat.includes("มัดจำกุญแจ") || cat === "key_deposit";

      // ตรวจสอบว่าบริการเสริมรายวัน (booking_daily_extras) ถูกสร้างเป็นแถวใน ledger_transactions ของบิลนั้นแล้วหรือยัง
      const isDailyExtraPostedInLedger = (
        de: any,
        validBookingTxs: LedgerTransaction[],
        firstStayDate: string
      ) => {
        const baseCat = String(de.category || "").replace(" (Voided)", "").trim();
        return validBookingTxs.some((tx) => {
          if (tx.transaction_type !== "revenue" || tx.category.includes("(Voided)")) return false;
          if (String(tx.category || "").replace(" (Voided)", "").trim() !== baseCat) return false;
          const noteDateMatch = String(tx.notes || "").match(/ประจำวันที่\s*(\d{4}-\d{2}-\d{2})/);
          if (noteDateMatch) return noteDateMatch[1] === de.target_date;
          return de.target_date === firstStayDate;
        });
      };

      type BookingSnapshot = {
        paid: number; // เงินที่ลูกค้าจ่ายสุทธิ (หักคืนเงินทอนแล้ว)
        placed: number; // ยอดที่ถูกกันเป็นมัดจำกุญแจสะสม (ถือ + คืน + ริบ)
        active: number; // มัดจำกุญแจที่ยังถืออยู่
        refunded: number;
        forfeited: number;
        charges: number; // ค่าใช้จ่ายที่รับรู้เป็นรายได้แล้ว (ไม่รวมมัดจำ/ริบมัดจำ)
        inHouse: boolean; // เช็คอินแล้ว ณ จุดตัดรอบ
        checkInDateStr: string;
      };

      // คำนวณสถานะทางการเงินของแต่ละบิล ณ ต้นวัน (start) และสิ้นวัน (end)
      const snapshotBooking = (b: BookingRow, boundary: "start" | "end"): BookingSnapshot => {
        const cutTime = boundary === "start" ? start0645.getTime() : end0645.getTime();
        const dayIncluded = (d: string) => (boundary === "start" ? d < reportDateStr : d <= reportDateStr);
        const bTxs = (txsByBooking[b.id] || []).filter((t) => !t.category.includes("(Voided)"));
        const bRates = dailyRatesByBooking[b.id] || [];
        const rawExtras = dailyExtrasByBooking[b.id] || [];
        const bExtras = rawExtras.filter((de) => !String(de.category || "").includes("(Voided)"));
        const firstStayDate = bRates[0]?.target_date || (rawExtras[0]?.target_date ? String(rawExtras[0].target_date) : "");
        const checkInDateStr = bRates[0]?.target_date || toThaiDateStr(b.actual_check_in_time || b.check_in_time);
        const inHouse =
          b.status !== "reserved" &&
          Boolean(b.actual_check_in_time || b.status === "checked_in" || b.status === "checked_out") &&
          (boundary === "start" ? checkInDateStr < reportDateStr : checkInDateStr <= reportDateStr);

        const txBefore = bTxs.filter((t) => new Date(t.created_at).getTime() < cutTime);
        const paidGross = txBefore
          .filter((t) => t.transaction_type === "payment")
          .reduce((s, t) => s - Number(t.amount || 0), 0);
        const changeRefunded = txBefore
          .filter((t) => t.category.includes("คืนเงินทอน") && Number(t.amount) < 0)
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

        const futureUnpostedRates = bRates
          .filter((dr) => !dayIncluded(dr.target_date))
          .reduce((s, dr) => s + Number(dr.amount || 0), 0);
        const futureUnpostedExtras = bExtras
          .filter((de) => !dayIncluded(String(de.target_date)))
          .reduce((s, de) => s + Number(de.amount || 0), 0);
        const parts = inHouse ? computeKeyDepositParts(txBefore, futureUnpostedRates + futureUnpostedExtras) : null;

        let charges = 0;
        // ค่าห้องพักรายคืน (ตาม target_date) — รับรู้เฉพาะเมื่อเข้าพักแล้ว
        if (bRates.length > 0 && inHouse) {
          const singleNightRoomTx =
            bRates.length === 1
              ? bTxs.find((t) => t.category === "room_charge" || t.category === "ค่าห้องพัก")
              : undefined;
          bRates.forEach((dr) => {
            if (!dayIncluded(dr.target_date)) return;
            charges += singleNightRoomTx ? Number(singleNightRoomTx.amount || 0) : Number(dr.amount || 0);
          });
        }
        bTxs.forEach((t) => {
          if (t.transaction_type !== "revenue") return;
          const cat = t.category;
          if (isRoomTypeCategory(cat)) {
            if (b.status === "reserved") return;
            if ((cat === "room_charge" || cat === "ค่าห้องพัก") && bRates.length > 0) return;
            const tt = new Date(t.created_at).getTime();
            if (tt < cutTime) charges += Number(t.amount || 0);
            return;
          }
          if (isDepositRelated(cat)) return; // มัดจำ/ริบมัดจำ แยกคำนวณผ่านกองมัดจำกุญแจ
          const noteDate = String(t.notes || "").match(/ประจำวันที่\s*(\d{4}-\d{2}-\d{2})/);
          const included = noteDate ? dayIncluded(noteDate[1]) : new Date(t.created_at).getTime() < cutTime;
          if (included) charges += Number(t.amount || 0);
        });
        if (inHouse) {
          bExtras.forEach((de) => {
            if (!dayIncluded(String(de.target_date))) return;
            if (isDailyExtraPostedInLedger(de, bTxs, firstStayDate)) return;
            charges += Number(de.amount || 0);
          });
        }

        return {
          paid: paidGross - changeRefunded,
          placed: parts?.placed || 0,
          active: parts?.active || 0,
          refunded: parts?.refunded || 0,
          forfeited: parts?.forfeited || 0,
          charges,
          inHouse,
          checkInDateStr,
        };
      };

      let advBF = 0,
        advAdd = 0,
        advUsed = 0;
      let resBF = 0,
        resAdd = 0,
        resUsed = 0;
      let arStart = 0,
        arEnd = 0;
      let keyPlacedToday = 0,
        keyActiveStart = 0,
        keyActiveEnd = 0;
      const advItems: BoxRoomBreakdownItem[] = [];
      const resItems: BoxRoomBreakdownItem[] = [];
      const heldRooms: HeldDepositRoomItem[] = [];

      allBookings.forEach((b) => {
        if (b.status === "cancelled" && !bookingMetaMap[b.id]?.cancelledAt) return;
        if (!(txsByBooking[b.id]?.length || dailyRatesByBooking[b.id]?.length)) return;
        const s = snapshotBooking(b, "start");
        const eRaw = snapshotBooking(b, "end");
        // เมื่อกันมัดจำกุญแจไว้ตั้งแต่วันเช็คอินแล้ว จะไม่ลดยอด placed ลงหากวันถัดมามีค่าห้องใหม่ที่ยังไม่ได้ชำระ (ให้ขึ้นเป็นค้างชำระแทน)
        const ePlaced = s.inHouse && eRaw.inHouse ? Math.max(s.placed, eRaw.placed) : eRaw.placed;
        const eActive = Math.max(0, ePlaced - eRaw.refunded - eRaw.forfeited);
        const e: BookingSnapshot = { ...eRaw, placed: ePlaced, active: eActive };
        const balS = s.paid - s.placed - s.charges;
        const balE = e.paid - e.placed - e.charges;
        const roomNo = roomMap[b.room_id]?.room_no || "-";

        keyPlacedToday += e.placed - s.placed;
        keyActiveStart += s.active;
        keyActiveEnd += e.active;
        if (e.active > 0) {
          heldRooms.push({ bookingId: b.id, roomNo, guestName: b.guest_name || "ผู้เข้าพัก", amount: e.active });
        }

        arStart += Math.max(0, -balS);
        arEnd += Math.max(0, -balE);
        const posS = Math.max(0, balS);
        const posE = Math.max(0, balE);
        const rS = s.inHouse ? 0 : posS;
        const rE = e.inHouse ? 0 : posE;
        const aS = s.inHouse ? posS : 0;
        const aE = e.inHouse ? posE : 0;

        // กล่องรับจอง: ยังไม่เช็คอิน = เงินทั้งก้อนเป็นเงินจอง / เช็คอินวันนี้ = ดึงเงินจองมาใช้ทั้งหมด (-)
        let bResAdd = 0;
        let bResUsed = 0;
        if (!e.inHouse) {
          bResAdd = Math.max(0, rE - rS);
          bResUsed = Math.max(0, rS - rE);
        } else {
          bResUsed = rS;
        }

        // กล่องจ่ายล่วงหน้า: เข้าพักแล้ว เงินที่จ่ายเกินค่าใช้จ่ายถึงวันนี้ / ถูกดึงมาตัดค่าห้องรายวัน (-)
        let bAdvAdd = 0;
        let bAdvUsed = 0;
        if (e.inHouse) {
          if (!s.inHouse) {
            bAdvAdd = aE;
          } else {
            const consumption = Math.max(0, e.charges - s.charges + (e.placed - s.placed));
            bAdvUsed = Math.min(aS, consumption);
            bAdvAdd = aE - aS + bAdvUsed;
            if (bAdvAdd < 0) {
              bAdvUsed = aS - aE;
              bAdvAdd = 0;
            }
          }
        }

        if (rS > 0 || bResAdd > 0 || bResUsed > 0) {
          resBF += rS;
          resAdd += bResAdd;
          resUsed += bResUsed;
          resItems.push({
            bookingId: b.id,
            roomNo,
            guestName: b.guest_name || "ลูกค้าจอง",
            checkInDateStr: e.checkInDateStr,
            broughtForward: rS,
            addedToday: bResAdd,
            usedToday: bResUsed,
            carriedForward: Math.max(0, rS + bResAdd - bResUsed),
            note: e.inHouse
              ? "เช็คอินเข้าพักวันนี้ (ดึงเงินจองมาใช้)"
              : e.checkInDateStr
              ? `กำหนดเข้าพัก ${e.checkInDateStr}`
              : "รอเช็คอิน",
          });
        }

        if (aS > 0 || bAdvAdd > 0 || bAdvUsed > 0) {
          advBF += aS;
          advAdd += bAdvAdd;
          advUsed += bAdvUsed;
          const chargeToday = e.charges - s.charges;
          const noteParts: string[] = [];
          if (chargeToday > 0) noteParts.push(`ค่าใช้จ่ายวันนี้ ฿${chargeToday.toLocaleString()}`);
          if (e.placed - s.placed > 0) noteParts.push(`กันมัดจำกุญแจ ฿${(e.placed - s.placed).toLocaleString()}`);
          if (!s.inHouse) noteParts.push("เช็คอินวันนี้");
          advItems.push({
            bookingId: b.id,
            roomNo,
            guestName: b.guest_name || "ผู้เข้าพัก",
            checkInDateStr: e.checkInDateStr,
            broughtForward: aS,
            addedToday: bAdvAdd,
            usedToday: bAdvUsed,
            carriedForward: Math.max(0, aS + bAdvAdd - bAdvUsed),
            note: noteParts.join(" • "),
          });
        }
      });

      advItems.sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
      resItems.sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
      heldRooms.sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));

      setAdvanceBreakdown(advItems);
      setReservationBreakdown(resItems);
      setHeldDepositRooms(heldRooms);
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
      setReceivableBox({ start: arStart, end: arEnd });

      // =========================================================================
      // 3. ฝั่งรับชำระเงิน (คอลัมน์กลาง) — ไม่รวมค่าใช้จ่ายเงินสด (ค่าใช้จ่ายแสดงในกล่องเงินสดเท่านั้น)
      // =========================================================================
      let cashToday = 0;
      let transferToday = 0;
      const transferByBank: Record<string, number> = {};
      configuredBanks.forEach((bk) => {
        transferByBank[bk] = 0;
      });
      let creditToday = 0;
      let refundToday = 0;
      let keyRefundToday = 0;
      let forfeitToday = 0;

      txsIn0645Window.forEach((tx) => {
        if (tx.category.includes("(Voided)")) return;
        const amt = Number(tx.amount || 0);
        const absAmt = Math.abs(amt);
        if (tx.transaction_type === "payment") {
          if (amt > 0) {
            refundToday += amt;
            return;
          }
          if (tx.category === "cash") {
            cashToday += absAmt;
          } else if (tx.category === "transfer") {
            transferToday += absAmt;
            const bankMatch = tx.notes?.match(/\[BANK:([^\]]+)\]/);
            const bankName = bankMatch ? bankMatch[1].trim() : configuredBanks[0] || "SCB";
            transferByBank[bankName] = (transferByBank[bankName] || 0) + absAmt;
          } else if (tx.category === "credit_card") {
            creditToday += absAmt;
          } else {
            cashToday += absAmt;
          }
        } else if (tx.transaction_type === "deposit" && amt < 0) {
          if (tx.category.includes("คืนเงินทอน")) refundToday += absAmt;
          else if (tx.category.includes("คืนมัดจำ")) keyRefundToday += absAmt;
        } else if (tx.transaction_type === "revenue" && tx.category.includes("ริบมัดจำ")) {
          forfeitToday += absAmt;
        }
      });

      setPayCash(cashToday);
      setPayTransferTotal(transferToday);
      setPayTransferByBank(transferByBank);
      setPayCredit(creditToday);
      setPayVoidRefund(refundToday);

      setKeyDepositBox({
        broughtForward: keyActiveStart,
        placedToday: keyPlacedToday,
        refundedToday: keyRefundToday,
        forfeitedToday: forfeitToday,
        activeHeldTotal: keyActiveEnd,
      });

      // =========================================================================
      // 4. กล่องเงินสดสำหรับเซ็นรับ-เก็บเงินประจำวัน (อิงกะของวันนั้น)
      // =========================================================================
      // ดึงกะช่วงกว้าง แล้วคัดตาม "วันธุรกิจที่ผูกกับกะ" (กะเก่าไม่มีข้อมูล → ใช้เวลาเปิดกะ +1 ชม.)
      const dayShiftFrom = new Date(start0645.getTime() - 3 * 3600 * 1000);
      const dayShiftTo = new Date(end0645.getTime());
      const [dayShiftsRes, handoverList] = await Promise.all([
        supabase
          .from("shifts")
          .select("*")
          .gte("start_time", dayShiftFrom.toISOString())
          .lt("start_time", dayShiftTo.toISOString())
          .order("start_time", { ascending: true }),
        fetchHandoversByDate(reportDateStr),
      ]);
      const candidateShifts: Shift[] = (dayShiftsRes.data as Shift[]) || [];
      const shiftBdMap = await fetchShiftBusinessDates(candidateShifts);
      const dayShiftList: Shift[] = candidateShifts.filter((s) => shiftBdMap[s.id] === reportDateStr);
      const dayShiftIds = dayShiftList.map((s) => s.id);
      let shiftLedgerRows: LedgerTransaction[] = [];
      if (dayShiftIds.length > 0) {
        const { data: shiftRows } = await supabase
          .from("ledger_transactions")
          .select("id, shift_id, staff_name, room_id, booking_id, transaction_type, category, amount, notes, created_at")
          .in("shift_id", dayShiftIds)
          .order("created_at", { ascending: true });
        shiftLedgerRows = (shiftRows as LedgerTransaction[]) || [];
      }
      const drawers: Record<string, ShiftDrawer> = {};
      dayShiftList.forEach((s) => {
        const handedOut = handoverList
          .filter((h) => h.shift_id === s.id)
          .reduce(
            (sum, h) => sum + Number(h.method === "fixed" ? h.actual_amount || 0 : h.required_amount || 0),
            0
          );
        drawers[s.id] = computeDrawerFromRows(
          Number(s.initial_cash || 0),
          shiftLedgerRows.filter((r) => r.shift_id === s.id),
          handedOut
        );
      });
      const expenseRows = shiftLedgerRows.filter(
        (r) => r.transaction_type === "expense" && !r.category.includes("(Voided)")
      );
      let reserveNow = { total: 0, rooms: [] as HeldKeyDepositRoom[] };
      if (dayShiftList.some((s) => s.status === "open")) {
        reserveNow = await fetchActiveKeyDeposits(now);
      }
      setDayShifts(dayShiftList);
      setHandovers(handoverList);
      setDayExpenses(expenseRows);
      setTotalExpense(expenseRows.reduce((sum, r) => sum + Math.abs(Number(r.amount || 0)), 0));
      setShiftDrawers(drawers);
      setLiveReserve(reserveNow);

      setLoading(false);
    }

    fetchDailyData();
  }, [dateOffset, getNow, getActiveBusinessDate, currentBusinessDate, refreshKey]);


  if (loading) {
    return (
      <div className="text-center py-12 text-slate-500 animate-pulse font-bold">
        กำลังประมวลผลรายงานเงินสดประจำวัน...
      </div>
    );
  }

  // สรุปตัวเลขคอลัมน์ซ้าย (ฝั่งรายได้) — ธรรมชาติเป็นบวก (+)
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

  // สรุปตัวเลขคอลัมน์กลาง (ฝั่งรับชำระเงิน) — รับเงินเป็นลบ (-) / คืนเงิน & กันมัดจำกุญแจเป็นบวก (+)
  const grossPaymentsReceived = payCash + payTransferTotal + payCredit;
  const netPaymentSide =
    -grossPaymentsReceived + payVoidRefund + keyDepositBox.placedToday - keyDepositBox.forfeitedToday;
  // เงินสดแท้จริงประจำวัน (ก่อนหักค่าใช้จ่ายเงินสด) = เงินสดรับ - คืนเงินสด - กันมัดจำกุญแจสุทธิ
  const netAdvanceToday = advanceBox.addedToday - advanceBox.usedToday;
  const netReservationToday = reservationBox.addedToday - reservationBox.usedToday;
  const receivableChange = receivableBox.end - receivableBox.start; // ค้างชำระเพิ่มขึ้น (+) / ลดลง (-)
  const balanceTotal = netTotalRevenue + netPaymentSide + netAdvanceToday + netReservationToday - receivableChange;
  const isBalanced = Math.abs(balanceTotal) < 0.5;

  // ===================== กล่องเงินสดสำหรับเซ็นรับ-เก็บเงินประจำวัน =====================
  const openShifts = dayShifts.filter((s) => s.status === "open");
  const handoverRequiredTotal = handovers.reduce((s, h) => s + Number(h.required_amount || 0), 0);
  const liveRequiredTotal = openShifts.reduce(
    (s, sh) => s + ((shiftDrawers[sh.id]?.drawer || 0) - liveReserve.total),
    0
  );
  const totalRequiredToSend = handoverRequiredTotal + liveRequiredTotal;
  const cashReceivedNet = totalRequiredToSend + totalExpense;
  const cashOverTotal = handovers.reduce(
    (s, h) => s + Math.max(0, Number(h.actual_amount || 0) - Number(h.required_amount || 0)),
    0
  );
  const cashShortTotal = handovers.reduce(
    (s, h) => s + Math.min(0, Number(h.actual_amount || 0) - Number(h.required_amount || 0)),
    0
  );
  const cashCollectedTotal = handovers.reduce((s, h) => s + Number(h.actual_amount || 0), 0);
  const pendingManagerSign = handovers.filter((h) => !h.manager_signature);
  const closedShiftsWithoutHandover = dayShifts.filter(
    (s) => s.status === "closed" && !handovers.some((h) => h.shift_id === s.id && h.kind === "shift_close")
  );
  const isCashComplete =
    dayShifts.length > 0 &&
    openShifts.length === 0 &&
    isDayClosed &&
    handovers.length > 0 &&
    pendingManagerSign.length === 0;
  const incompleteReasons: string[] = [];
  if (dayShifts.length === 0) incompleteReasons.push("ยังไม่มีการเปิดกะของวันนี้");
  if (openShifts.length > 0)
    incompleteReasons.push(`ยังมีกะที่ยังไม่ปิด ${openShifts.length} กะ (${openShifts.map((s) => s.staff_name).join(", ")})`);
  if (!isDayClosed) incompleteReasons.push("ยังไม่ได้ปิดกะสุดท้ายของวัน (ติ๊ก “กะสุดท้ายของวัน” ตอนปิดกะ)");
  if (handovers.length === 0 && dayShifts.length > 0) incompleteReasons.push("ยังไม่มีรายการส่งเงินของวันนี้");
  if (pendingManagerSign.length > 0)
    incompleteReasons.push(`รอผู้จัดการเซ็นรับเงิน ${pendingManagerSign.length} รายการ`);

  const shiftNameOf = (shiftId: string) => dayShifts.find((s) => s.id === shiftId)?.staff_name || "-";
  const fmtTime = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "-";

  const fmt = (n: number) => `฿${Number(n || 0).toLocaleString()}`;
  const fmtSigned = (n: number) =>
    n > 0
      ? `+฿${Number(n).toLocaleString()}`
      : n < 0
      ? `-฿${Math.abs(Number(n)).toLocaleString()}`
      : "฿0";

  const canGoPrev = dateOffset > -15;
  const canGoNext = dateOffset < 0;
  const changeDate = (delta: number) => {
    if (!onChangeDateOffset) return;
    const next = Math.min(0, Math.max(-15, dateOffset + delta));
    onChangeDateOffset(next);
  };

  const handleManagerSign = async () => {
    if (!signTarget) return;
    setSignError("");
    const sig = managerSigRef.current?.toDataURL() || null;
    if (!sig) {
      setSignError("กรุณาเซ็นชื่อก่อนยืนยัน");
      return;
    }
    setSignSaving(true);
    const manager = await verifyManagerPin(signPin);
    if (!manager) {
      setSignSaving(false);
      setSignError("รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็นผู้จัดการ/แอดมิน)");
      return;
    }
    const nowIso = new Date().toISOString();
    const updated: CashHandover = {
      ...signTarget,
      manager_name: manager.name,
      manager_signature: sig,
      manager_signed_at: nowIso,
    };
    const { error } = await saveHandover(updated);
    setSignSaving(false);
    if (error) {
      setSignError("บันทึกลายเซ็นไม่สำเร็จ: " + error.message);
      return;
    }
    await logActivity({
      category: "shift",
      action: "update",
      staffName: manager.name,
      shiftName: signTarget.shift_staff_name,
      target: `ผู้จัดการเซ็นรับเงิน กะ ${signTarget.shift_staff_name}`,
      details: `ผู้จัดการ ${manager.name} เซ็นรับ-ส่งเงินกะ ${signTarget.shift_staff_name} (ต้องส่ง ${fmt(
        signTarget.required_amount
      )}, ส่งจริง ${fmt(signTarget.actual_amount)})`,
    });
    setSignTarget(null);
    setSignPin("");
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-6">
      {/* แถบสถานะประจำวันและเวลาตัดรอบ */}
      <div
        className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isCashComplete ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200 shadow-xs"
        }`}
      >
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={`text-lg font-black ${isCashComplete ? "text-indigo-900" : "text-slate-800"}`}>
              📊 รายงานเงินสดประจำวัน ({reportDateLabel})
            </h2>
            <span
              className={`px-3 py-0.5 rounded-full font-bold text-xs ${
                isCashComplete ? "bg-indigo-600 text-white" : "bg-amber-100 text-amber-800"
              }`}
            >
              {isCashComplete ? "✅ ส่งเงินครบ สรุปยอดแล้ว" : "⚠️ ยังไม่เสร็จสิ้น"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ⏱️ รอบวันรายงาน: <b>06:45 น. ถึง 06:44 น. ของวันถัดไป</b> (ตัดค่าห้องพักค้างคืนอัตโนมัติเวลา 09:45 น.)
          </p>
        </div>
        {onChangeDateOffset && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={() => changeDate(-1)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black disabled:opacity-40"
            >
              ◀
            </button>
            <button
              type="button"
              disabled={dateOffset === 0}
              onClick={() => onChangeDateOffset(0)}
              className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold disabled:opacity-40"
            >
              วันนี้
            </button>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => changeDate(1)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black disabled:opacity-40"
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {!isCashComplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-900 space-y-1">
          <div className="font-black text-sm">
            ⚠️ ยังไม่เสร็จสิ้น — แสดงข้อมูลตามที่มี ณ ปัจจุบัน (จะเปลี่ยนเป็นเสร็จสิ้นเมื่อครบ 3 ข้อด้านล่าง)
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-semibold text-amber-800">
            <span>
              {dayShifts.length > 0 && openShifts.length === 0 ? "✅" : "⏳"} 1. ปิดกะครบทุกกะ
              {openShifts.length > 0 ? ` (ยังเปิดอยู่: ${openShifts.map((s) => s.staff_name).join(", ")})` : dayShifts.length === 0 ? " (ยังไม่เปิดกะ)" : ""}
            </span>
            <span>
              {isDayClosed ? "✅" : "⏳"} 2. ติ๊ก “กะสุดท้ายของวัน” ตอนปิดกะสุดท้าย
            </span>
            <span>
              {handovers.length > 0 && pendingManagerSign.length === 0 ? "✅" : "⏳"} 3. ผู้จัดการเซ็นรับครบทุกรายการ
              {pendingManagerSign.length > 0 ? ` (รอเซ็น ${pendingManagerSign.length} รายการ)` : handovers.length === 0 ? " (ยังไม่มีรายการส่งเงิน)" : ""}
            </span>
          </div>
        </div>
      )}

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

        {/* ==================== คอลัมน์กลาง: ฝั่งรับชำระเงิน (รับเงิน = ลบ / คืนเงิน & กันมัดจำ = บวก) ==================== */}
        <div className="lg:col-span-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 bg-emerald-800 text-white flex justify-between items-center">
            <h3 className="font-black text-base tracking-wide">ฝั่งรับชำระเงิน (Payments)</h3>
            <span className="text-[11px] bg-emerald-700 text-emerald-100 px-2.5 py-0.5 rounded-full font-bold">
              รับเงิน = ลบ (−)
            </span>
          </div>

          <div className="p-5 flex-1 space-y-3 text-sm">
            {/* เงินสด */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <span className="font-black text-emerald-950 flex items-center gap-2">
                <span>💵</span> เงินสด
              </span>
              <span className="font-black text-base text-emerald-700">{fmtSigned(-payCash)}</span>
            </div>

            {/* โอน (พร้อมแจกแจงรายบัญชีธนาคาร) */}
            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-2">
              <div className="flex justify-between items-center border-b border-blue-200/60 pb-1.5">
                <span className="font-black text-blue-950 flex items-center gap-2">
                  <span>📱</span> โอนเงิน (รวมทุกบัญชี)
                </span>
                <span className="font-black text-base text-blue-700">{fmtSigned(-payTransferTotal)}</span>
              </div>
              <div className="space-y-1 pl-3">
                {Array.from(new Set([...bankAccounts, ...Object.keys(payTransferByBank)])).map((bank) => (
                  <div key={bank} className="flex justify-between items-center text-xs text-slate-600">
                    <span className="font-bold text-blue-900">• บัญชี {bank}</span>
                    <span className="font-black text-slate-800">{fmtSigned(-(payTransferByBank[bank] || 0))}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* บัตรเครดิต */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-purple-50/60 border border-purple-200/80">
              <span className="font-black text-purple-950 flex items-center gap-2">
                <span>💳</span> บัตรเครดิต
              </span>
              <span className="font-black text-base text-purple-700">{fmtSigned(-payCredit)}</span>
            </div>

            {/* คืนเงินสดให้ลูกค้า */}
            <div className="flex justify-between items-center px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
              <span className="font-bold">↩️ คืนเงินสด / คืนเงินทอน</span>
              <span className="font-bold text-slate-800">{fmtSigned(payVoidRefund)}</span>
            </div>

            {/* กันเงินมัดจำกุญแจ */}
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
              <div className="flex justify-between items-center text-amber-900">
                <span className="font-bold">🔑 กันเงินมัดจำกุญแจ (ห้องเช็คอิน/วางมัดจำวันนี้)</span>
                <span className="font-black">{fmtSigned(keyDepositBox.placedToday)}</span>
              </div>
              {keyDepositBox.forfeitedToday > 0 && (
                <div className="flex justify-between items-center text-rose-700 text-xs">
                  <span className="font-bold">🔑 ริบมัดจำกุญแจเป็นค่าปรับ (โอนเข้ารายได้หมวด 4)</span>
                  <span className="font-black">{fmtSigned(-keyDepositBox.forfeitedToday)}</span>
                </div>
              )}
              <div className="text-[10px] text-amber-700">
                แยกเงินมัดจำออกจากเงินรับชำระ เพื่อกันเป็นเงินสดไว้คืนลูกค้าตอนเช็คเอาท์
              </div>
            </div>
          </div>

          {/* สรุปท้ายคอลัมน์กลาง */}
          <div className="p-4 bg-slate-50 border-t-2 border-slate-200 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-700 font-bold">
              <span>รวมรับชำระ (ก่อนหักคืน/กันมัดจำ)</span>
              <span>{fmtSigned(-grossPaymentsReceived)}</span>
            </div>
            <div className="flex justify-between text-amber-700 font-semibold">
              <span>คืนเงิน + กันมัดจำกุญแจสุทธิ</span>
              <span>{fmtSigned(payVoidRefund + keyDepositBox.placedToday - keyDepositBox.forfeitedToday)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-black text-base text-slate-900">
              <span>รวมรับชำระสุทธิ</span>
              <span className="text-xl text-emerald-700">{fmtSigned(netPaymentSide)}</span>
            </div>
            <div className="text-[10px] text-slate-500">* ค่าใช้จ่ายเงินสดแสดงแยกในกล่องเงินสดด้านล่างเท่านั้น</div>
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
            <div className="p-4 flex-1 flex flex-col justify-between text-sm space-y-2.5">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-slate-600">
                  <span>ยอดยกมา</span>
                  <span className="font-bold text-slate-800">{fmt(advanceBox.broughtForward)}</span>
                </div>

                {/* แถวสรุปยอดรวมรับ-ใช้วันนี้ (คลิกเพื่อกางดู +รับ / -ใช้ และรายชื่อห้อง) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanceChangeDetails((prev) => !prev)}
                    className="w-full py-2 px-2.5 rounded-xl bg-sky-50/80 hover:bg-sky-100/80 border border-sky-200 flex justify-between items-center transition-colors text-left"
                  >
                    <span className="font-bold text-sky-950 text-xs flex items-center gap-1">
                      <span>{showAdvanceChangeDetails ? "▾" : "▸"}</span>
                      <span>ยอดรวมรับ-ใช้วันนี้</span>
                      <span className="text-[10px] font-semibold text-sky-600 underline">
                        (คลิกดู)
                      </span>
                    </span>
                    <span
                      className={`font-black text-sm ${
                        netAdvanceToday > 0
                          ? "text-emerald-700"
                          : netAdvanceToday < 0
                          ? "text-rose-600"
                          : "text-slate-700"
                      }`}
                    >
                      {fmtSigned(netAdvanceToday)}
                    </span>
                  </button>

                  {showAdvanceChangeDetails && (
                    <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                      <div className="flex justify-between text-emerald-700">
                        <span>+ ยอดที่รับเพิ่มวันนี้</span>
                        <span className="font-bold">+{fmt(advanceBox.addedToday)}</span>
                      </div>
                      <div className="flex justify-between text-rose-600">
                        <span>- ยอดที่ใช้ไปวันนี้ (ตัดค่าห้อง/บริการ)</span>
                        <span className="font-bold">-{fmt(advanceBox.usedToday)}</span>
                      </div>

                      <div className="pt-1.5 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setShowAdvanceDetails((prev) => !prev)}
                          className="w-full py-1 px-2 rounded-lg bg-white hover:bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-bold flex items-center justify-between transition-colors"
                        >
                          <span>🔍 ดูรายชื่อห้อง ({advanceBreakdown.length} ห้อง)</span>
                          <span>{showAdvanceDetails ? "▲ ซ่อนรายชื่อ" : "▼ แสดงรายชื่อ"}</span>
                        </button>

                        {showAdvanceDetails && (
                          <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {advanceBreakdown.length === 0 ? (
                              <div className="text-[11px] text-slate-400 text-center py-2 bg-white rounded-lg">
                                ไม่มีรายการจ่ายล่วงหน้าในวันนี้
                              </div>
                            ) : (
                              advanceBreakdown.map((item) => (
                                <div
                                  key={item.bookingId}
                                  className="p-2 rounded-lg bg-white border border-slate-200 text-[11px] space-y-1"
                                >
                                  <div className="flex justify-between items-center font-bold text-slate-800">
                                    <span>
                                      ห้อง {item.roomNo} • {item.guestName}
                                    </span>
                                    <span className="text-sky-700 font-black">
                                      ยกไป {fmt(item.carriedForward)}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-600">
                                    <span>ยกมา: {fmt(item.broughtForward)}</span>
                                    <span className="text-emerald-700">+เพิ่ม: {fmt(item.addedToday)}</span>
                                    <span className="text-rose-600">-ใช้ไป: {fmt(item.usedToday)}</span>
                                  </div>
                                  {item.note && (
                                    <div className="text-[10px] text-slate-500 italic">{item.note}</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2.5 border-t-2 border-slate-100 flex justify-between items-center font-black text-slate-900">
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
            <div className="p-4 flex-1 flex flex-col justify-between text-sm space-y-2.5">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-slate-600">
                  <span>ยอดยกมา</span>
                  <span className="font-bold text-slate-800">{fmt(reservationBox.broughtForward)}</span>
                </div>

                {/* แถวสรุปยอดรวมรับ-ใช้วันนี้ (คลิกเพื่อกางดู +รับจอง / -ใช้ไป และรายชื่อห้อง) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowReservationChangeDetails((prev) => !prev)}
                    className="w-full py-2 px-2.5 rounded-xl bg-purple-50/80 hover:bg-purple-100/80 border border-purple-200 flex justify-between items-center transition-colors text-left"
                  >
                    <span className="font-bold text-purple-950 text-xs flex items-center gap-1">
                      <span>{showReservationChangeDetails ? "▾" : "▸"}</span>
                      <span>ยอดรวมรับ-ใช้วันนี้</span>
                      <span className="text-[10px] font-semibold text-purple-600 underline">
                        (คลิกดู)
                      </span>
                    </span>
                    <span
                      className={`font-black text-sm ${
                        netReservationToday > 0
                          ? "text-emerald-700"
                          : netReservationToday < 0
                          ? "text-rose-600"
                          : "text-slate-700"
                      }`}
                    >
                      {fmtSigned(netReservationToday)}
                    </span>
                  </button>

                  {showReservationChangeDetails && (
                    <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                      <div className="flex justify-between text-emerald-700">
                        <span>+ ยอดที่รับจองเพิ่มวันนี้</span>
                        <span className="font-bold">+{fmt(reservationBox.addedToday)}</span>
                      </div>
                      <div className="flex justify-between text-rose-600">
                        <span>- ยอดที่ใช้ไปวันนี้ (เข้าพักวันนี้)</span>
                        <span className="font-bold">-{fmt(reservationBox.usedToday)}</span>
                      </div>

                      <div className="pt-1.5 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setShowReservationDetails((prev) => !prev)}
                          className="w-full py-1 px-2 rounded-lg bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-bold flex items-center justify-between transition-colors"
                        >
                          <span>🔍 ดูรายชื่อห้อง ({reservationBreakdown.length} ห้อง)</span>
                          <span>{showReservationDetails ? "▲ ซ่อนรายชื่อ" : "▼ แสดงรายชื่อ"}</span>
                        </button>

                        {showReservationDetails && (
                          <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {reservationBreakdown.length === 0 ? (
                              <div className="text-[11px] text-slate-400 text-center py-2 bg-white rounded-lg">
                                ไม่มีรายการเงินรับจองล่วงหน้าในวันนี้
                              </div>
                            ) : (
                              reservationBreakdown.map((item) => (
                                <div
                                  key={item.bookingId}
                                  className="p-2 rounded-lg bg-white border border-slate-200 text-[11px] space-y-1"
                                >
                                  <div className="flex justify-between items-center font-bold text-slate-800">
                                    <span>
                                      ห้อง {item.roomNo} • {item.guestName}
                                    </span>
                                    <span className="text-purple-700 font-black">
                                      ยกไป {fmt(item.carriedForward)}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-600">
                                    <span>ยกมา: {fmt(item.broughtForward)}</span>
                                    <span className="text-emerald-700">+เพิ่ม: {fmt(item.addedToday)}</span>
                                    <span className="text-rose-600">-ใช้ไป: {fmt(item.usedToday)}</span>
                                  </div>
                                  {item.note && (
                                    <div className="text-[10px] text-slate-500 italic">{item.note}</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2.5 border-t-2 border-slate-100 flex justify-between items-center font-black text-slate-900">
                <span>ยอดคงเหลือยกไป</span>
                <span className="text-base text-purple-700">{fmt(reservationBox.carriedForward)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== แถบสรุปความสมดุล (Balance) ด้านล่าง ==================== */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md border-t-4 border-indigo-500 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black text-sm tracking-wide">⚖️ ตรวจสอบความสมดุล: รายได้ (+) + รับชำระ (−) + จ่ายล่วงหน้า (±) + รับจอง (±) = 0</h3>
          <span
            className={`text-xs font-black px-3 py-1 rounded-full ${
              isBalanced ? "bg-emerald-900/70 text-emerald-300" : "bg-amber-900/70 text-amber-300"
            }`}
          >
            {isBalanced ? "✅ สมดุล ยอดตรงกัน" : `⚠️ ไม่สมดุล ต่าง ${fmtSigned(balanceTotal)}`}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 font-bold">รายได้สุทธิ (ฝั่งซ้าย)</div>
            <div className="text-xl font-black text-indigo-300 mt-0.5">{fmtSigned(netTotalRevenue)}</div>
          </div>
          <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 font-bold">รับชำระสุทธิ (ฝั่งกลาง)</div>
            <div className="text-xl font-black text-emerald-400 mt-0.5">{fmtSigned(netPaymentSide)}</div>
          </div>
          <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 font-bold">จ่ายล่วงหน้าวันนี้ (+รับ −ใช้)</div>
            <div className="text-xl font-black text-sky-300 mt-0.5">{fmtSigned(netAdvanceToday)}</div>
          </div>
          <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 font-bold">รับจองวันนี้ (+รับ −ใช้)</div>
            <div className="text-xl font-black text-purple-300 mt-0.5">{fmtSigned(netReservationToday)}</div>
          </div>
          <div
            className={`p-3 rounded-xl border ${
              isBalanced ? "bg-emerald-950/60 border-emerald-700" : "bg-amber-950/60 border-amber-600"
            }`}
          >
            <div className="text-[11px] text-slate-300 font-bold">ผลรวมทุกฝั่ง (ต้องเท่ากับ 0)</div>
            <div className={`text-xl font-black mt-0.5 ${isBalanced ? "text-emerald-400" : "text-amber-300"}`}>
              {fmtSigned(isBalanced ? 0 : balanceTotal)}
            </div>
          </div>
        </div>
        {Math.abs(receivableChange) >= 0.5 && (
          <div className="text-xs text-amber-200 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2">
            ℹ️ มียอดค้างชำระ (ลูกหนี้) {receivableChange > 0 ? "เพิ่มขึ้น" : "ลดลง"} {fmt(Math.abs(receivableChange))} วันนี้
            (คงเหลือค้างชำระ {fmt(receivableBox.end)}) — นำมาปรับในผลรวมแล้ว
          </div>
        )}
      </div>

      {/* ==================== กล่องเงินสดสำหรับเซ็นรับ-เก็บเงินประจำวัน ==================== */}
      <div className="bg-white border-2 border-emerald-300 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-emerald-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-base">💵 กล่องเงินสด — เซ็นรับ/เก็บเงินประจำวัน</h3>
            <p className="text-xs text-emerald-100 mt-0.5">ส่งเงินสดของวันที่ {reportDateLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onChangeDateOffset && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!canGoPrev}
                  onClick={() => changeDate(-1)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 font-black disabled:opacity-40"
                >
                  ◀
                </button>
                <button
                  type="button"
                  disabled={dateOffset === 0}
                  onClick={() => onChangeDateOffset(0)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-bold disabled:opacity-40"
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => changeDate(1)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 font-black disabled:opacity-40"
                >
                  ▶
                </button>
              </div>
            )}
            <span
              className={`text-xs font-black px-3 py-1 rounded-full ${
                isCashComplete ? "bg-white text-emerald-800" : "bg-amber-300 text-amber-950"
              }`}
              title={incompleteReasons.join("\n")}
            >
              {isCashComplete ? "✅ ส่งเงินครบถ้วน" : "⚠️ ยังไม่เสร็จสิ้น"}
            </span>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* สรุปตัวเลขเงินสด */}
          <div className="lg:col-span-2 space-y-2 text-sm">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
              <span className="font-bold text-slate-700">เงินสดรับสุทธิ (หลังกันมัดจำกุญแจ)</span>
              <span className="font-black text-slate-900">{fmt(cashReceivedNet)}</span>
            </div>
            <div className="py-1.5 border-b border-slate-100">
              <div className="flex justify-between items-center">
                <span className="font-bold text-orange-700">หัก ค่าใช้จ่ายเงินสด (ทุกกะ)</span>
                <span className="font-black text-orange-700">-{fmt(totalExpense)}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowExpenseDetails((p) => !p)}
                className="mt-1 text-xs font-bold text-orange-700 underline"
              >
                🔍 {showExpenseDetails ? "ซ่อนรายละเอียดค่าใช้จ่าย" : `ดูรายละเอียดค่าใช้จ่ายแต่ละกะ (${dayExpenses.length} รายการ)`}
              </button>
              {showExpenseDetails && (
                <div className="mt-2 space-y-2">
                  {dayShifts.length === 0 || dayExpenses.length === 0 ? (
                    <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2 text-center">ไม่มีค่าใช้จ่ายเงินสด</div>
                  ) : (
                    dayShifts
                      .filter((s) => dayExpenses.some((e) => e.shift_id === s.id))
                      .map((s, idx) => {
                        const items = dayExpenses.filter((e) => e.shift_id === s.id);
                        const sub = items.reduce((sum, e) => sum + Math.abs(Number(e.amount || 0)), 0);
                        return (
                          <div key={s.id} className="bg-orange-50/70 border border-orange-200 rounded-lg p-2">
                            <div className="flex justify-between text-xs font-black text-orange-900 mb-1">
                              <span>
                                กะ {idx + 1}: {s.staff_name}
                              </span>
                              <span>-{fmt(sub)}</span>
                            </div>
                            <ul className="space-y-1">
                              {items.map((e) => {
                                const bills = parseBillUrls(e.notes);
                                return (
                                  <li key={e.id} className="flex justify-between items-center gap-2 text-[11px] bg-white rounded px-2 py-1">
                                    <span className="min-w-0">
                                      <b className="text-slate-800">{e.category}</b>
                                      <span className="text-slate-500">
                                        {" "}
                                        • {new Date(e.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น. • {e.staff_name}
                                      </span>
                                    </span>
                                    <span className="flex items-center gap-1 shrink-0">
                                      {bills.map((u) => (
                                        <button key={u} type="button" onClick={() => setViewPhoto(u)} title="ดูรูปบิล">
                                          <img src={u} alt="bill" className="w-7 h-7 object-cover rounded border border-slate-300" />
                                        </button>
                                      ))}
                                      <b className="text-orange-700">-{fmt(Math.abs(Number(e.amount || 0)))}</b>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-between items-center py-1.5 px-2 rounded-lg bg-slate-100 font-black text-slate-900">
              <span>= ยอดเงินสดที่ต้องส่ง (ตามระบบ)</span>
              <span>{fmt(totalRequiredToSend)}</span>
            </div>
            {openShifts.length > 0 && (
              <div className="text-[11px] text-amber-700 font-bold">
                * รวมยอดประมาณการของกะที่ยังเปิดอยู่ (เงินในลิ้นชักขณะนี้ − มัดจำกุญแจคงเหลือ {fmt(liveReserve.total)})
              </div>
            )}
            <div className="flex justify-between items-center py-1 text-emerald-700 font-bold">
              <span>เงินสดเกิน (+)</span>
              <span>{fmtSigned(cashOverTotal)}</span>
            </div>
            <div className="flex justify-between items-center py-1 text-rose-600 font-bold border-b border-slate-100">
              <span>เงินสดขาด (−)</span>
              <span>{fmtSigned(cashShortTotal)}</span>
            </div>
            <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-emerald-50 border-2 border-emerald-300 font-black text-emerald-900">
              <span>💰 เงินสดเก็บรวม (ส่งจริงทุกกะ)</span>
              <span className="text-xl">{fmt(cashCollectedTotal)}</span>
            </div>

            <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex justify-between items-center text-amber-900 font-bold">
                <span>🔑 มัดจำกุญแจคงเหลือ (กันไว้ในลิ้นชัก)</span>
                <span className="font-black">{fmt(keyDepositBox.activeHeldTotal)}</span>
              </div>
              <div className="text-[11px] text-amber-800 mt-0.5">
                ต้นวัน {fmt(keyDepositBox.broughtForward)} • กันเพิ่ม {fmt(keyDepositBox.placedToday)} • คืนสด{" "}
                {fmt(keyDepositBox.refundedToday)}
                {keyDepositBox.forfeitedToday > 0 ? ` • ริบ ${fmt(keyDepositBox.forfeitedToday)}` : ""}
              </div>
              <button
                type="button"
                onClick={() => setShowHeldDepositRooms((p) => !p)}
                className="mt-1 text-[11px] font-bold text-amber-800 underline"
              >
                {showHeldDepositRooms ? "ซ่อนรายชื่อห้อง" : `ดูห้องที่ถือมัดจำ (${heldDepositRooms.length} ห้อง)`}
              </button>
              {showHeldDepositRooms && (
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  {heldDepositRooms.length === 0 ? (
                    <span className="text-[11px] text-slate-500">ไม่มีห้องที่ถือมัดจำ</span>
                  ) : (
                    heldDepositRooms.map((r) => (
                      <span key={r.bookingId} className="text-[11px] bg-white border border-amber-200 rounded px-1.5 py-0.5 flex justify-between">
                        <span>ห้อง {r.roomNo}</span>
                        <b className="text-amber-800">{fmt(r.amount)}</b>
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ตารางรายละเอียดการส่งเงิน */}
          <div className="lg:col-span-3">
            <div className="font-black text-slate-800 text-sm mb-2">🧾 รายละเอียดการส่งเงิน (เรียงตามลำดับ)</div>
            {handovers.length === 0 && openShifts.length === 0 && closedShiftsWithoutHandover.length === 0 ? (
              <div className="text-sm text-slate-400 bg-slate-50 rounded-xl p-6 text-center">ยังไม่มีการส่งเงินในวันนี้</div>
            ) : (
              <div className="space-y-2">
                {handovers.map((h, idx) => {
                  const diff = Number(h.actual_amount || 0) - Number(h.required_amount || 0);
                  const neg = (h.kind === "mid_shift" ? h.actual_amount : h.required_amount) < 0;
                  type SigCell = { role: string; name: string | null; sig: string | null; at: string | null };
                  const staffCell: SigCell = { role: "พนักงาน", name: h.staff_name, sig: h.staff_signature, at: h.staff_signed_at };
                  const mgrCell: SigCell = { role: "ผู้จัดการ", name: h.manager_name, sig: h.manager_signature, at: h.manager_signed_at };
                  const sender = neg ? mgrCell : staffCell;
                  const receiver = neg ? staffCell : mgrCell;
                  const renderSigCell = (title: string, cell: SigCell) => (
                    <div className="flex-1 min-w-[140px] bg-slate-50 border border-slate-200 rounded-lg p-2">
                      <div className="text-[10px] font-bold text-slate-500">
                        {title} ({cell.role})
                      </div>
                      {cell.sig ? (
                        <>
                          <img src={cell.sig} alt="signature" className="h-12 w-full object-contain bg-white rounded border border-slate-200 my-1" />
                          <div className="text-[11px] font-bold text-slate-800">{cell.name}</div>
                          <div className="text-[10px] text-slate-500">{fmtTime(cell.at)}</div>
                        </>
                      ) : cell.role === "ผู้จัดการ" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSignTarget(h);
                            setSignPin("");
                            setSignError("");
                          }}
                          className="mt-1 w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-black"
                        >
                          ✍️ ผู้จัดการเซ็น{neg ? "ส่งเงิน" : "รับเงิน"}
                        </button>
                      ) : (
                        <div className="text-[11px] text-slate-400 mt-1">ยังไม่ได้เซ็น</div>
                      )}
                    </div>
                  );
                  return (
                    <div key={h.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-black text-slate-800 text-sm">กะ {h.shift_staff_name || shiftNameOf(h.shift_id)}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              h.kind === "shift_close" ? "bg-slate-800 text-white" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {h.kind === "shift_close" ? "ส่งตอนปิดกะ" : h.method === "fixed" ? "เก็บระหว่างกะ (ระบุจำนวน)" : "เก็บระหว่างกะ"}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">{fmtTime(h.created_at)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-slate-50 rounded-lg p-2">
                          <div className="text-slate-500 font-bold">ต้องส่ง</div>
                          <div className="font-black text-slate-900">{fmtSigned(h.required_amount)}</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2">
                          <div className="text-slate-500 font-bold">ส่งจริง</div>
                          <div className="font-black text-emerald-700">{fmtSigned(h.actual_amount)}</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2">
                          <div className="text-slate-500 font-bold">เกิน/ขาด</div>
                          <div className={`font-black ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-slate-500"}`}>
                            {fmtSigned(diff)}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        เงินในลิ้นชักตามระบบ {fmt(h.drawer_cash)} • กันมัดจำกุญแจ {fmt(h.key_reserve)}
                        {h.key_reserve_rooms !== undefined ? ` (${h.key_reserve_rooms} ห้อง)` : ""}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {renderSigCell("ผู้ส่งเงิน", sender)}
                        {renderSigCell("ผู้รับเงิน", receiver)}
                      </div>
                    </div>
                  );
                })}

                {openShifts.map((s) => {
                  const live = (shiftDrawers[s.id]?.drawer || 0) - liveReserve.total;
                  return (
                    <div key={s.id} className="border-2 border-dashed border-amber-300 bg-amber-50/60 rounded-xl p-3 text-sm">
                      <div className="flex justify-between items-center font-black text-amber-900">
                        <span>⏳ กะ {s.staff_name} (ยังไม่ปิดกะ)</span>
                        <span>ประมาณการต้องส่ง {fmtSigned(live)}</span>
                      </div>
                      <div className="text-[11px] text-amber-800 mt-0.5">
                        เงินในลิ้นชักขณะนี้ {fmt(shiftDrawers[s.id]?.drawer || 0)} − มัดจำกุญแจคงเหลือ {fmt(liveReserve.total)}
                      </div>
                    </div>
                  );
                })}

                {closedShiftsWithoutHandover.map((s) => (
                  <div key={s.id} className="border border-slate-200 bg-slate-50 rounded-xl p-3 text-xs text-slate-600">
                    กะ {s.staff_name} ปิดกะก่อนเริ่มใช้ระบบส่งเงินใหม่ (ไม่มีข้อมูลลายเซ็น) • นับเงินได้ {fmt(Number(s.final_cash || 0))}
                  </div>
                ))}

                {handovers.length > 0 && (
                  <div className="flex justify-between items-center px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-black text-emerald-900">
                    <span>รวมส่งจริงทุกรายการ (= เงินสดเก็บรวม)</span>
                    <span>{fmt(cashCollectedTotal)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ประวัติกะของวันนี้ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">ประวัติกะของวันนี้ (Shift Logs)</h3>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {dayShifts.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4 md:col-span-3">ไม่มีการเปิดกะในวันนี้</p>
          ) : (
            dayShifts.map((shift, idx) => {
              const d = shiftDrawers[shift.id];
              return (
                <div key={shift.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">
                      กะ {idx + 1}: {shift.staff_name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        shift.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {shift.status === "open" ? "กำลังเปิด" : "ปิดแล้ว"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(shift.start_time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} –{" "}
                    {shift.end_time
                      ? new Date(shift.end_time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                      : "..."}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">เงินสดตั้งต้น</span>
                    <b>{fmt(Number(shift.initial_cash || 0))}</b>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">รับเงินสด / ค่าใช้จ่าย / คืนเงิน</span>
                    <b>
                      {fmt(d?.cashIn || 0)} / {fmt(d?.expenses || 0)} / {fmt(d?.refunds || 0)}
                    </b>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">ส่งเงินแล้ว</span>
                    <b>{fmt(d?.handedOut || 0)}</b>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">เงินในลิ้นชักคงเหลือตามระบบ</span>
                    <b className="text-emerald-700">{fmt(d?.drawer || 0)}</b>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* หน้าต่างผู้จัดการเซ็นรับ/ส่งเงิน */}
      {signTarget && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-amber-500 text-white">
              <h3 className="font-black text-lg">✍️ ผู้จัดการเซ็น{(signTarget.kind === "mid_shift" ? signTarget.actual_amount : signTarget.required_amount) < 0 ? "ส่งเงิน" : "รับเงิน"}</h3>
              <p className="text-xs text-amber-50 mt-0.5">
                กะ {signTarget.shift_staff_name} • ต้องส่ง {fmtSigned(signTarget.required_amount)} • ส่งจริง{" "}
                {fmtSigned(signTarget.actual_amount)}
              </p>
            </div>
            <div className="p-5 space-y-3">
              {signError && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg font-bold">{signError}</div>}
              <SignaturePad ref={managerSigRef} label="ลายเซ็นผู้จัดการ" />
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={signPin}
                  onChange={(e) => setSignPin(e.target.value.replace(/\D/g, ""))}
                  className="w-full text-center tracking-[0.5em] text-xl p-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none"
                  placeholder="••••"
                />
              </div>
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex gap-3">
              <button
                type="button"
                onClick={() => setSignTarget(null)}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleManagerSign}
                disabled={signSaving || !signPin}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl disabled:opacity-50"
              >
                {signSaving ? "กำลังบันทึก..." : "ยืนยันลายเซ็น"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewPhoto && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={() => setViewPhoto(null)}>
          <img src={viewPhoto} alt="bill" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
