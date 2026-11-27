"use client";

import FinancialReportType2View, {
  AuditEditEntry,
  AuditLogRowItem,
  ManagerBoxEditTarget,
  RowEditMeta,
  ShiftSectionData,
  ShiftSummaryEditTarget,
} from "./FinancialReportType2View";

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
  EOD_LOC_KEY_PREFIX,
  fetchAllHandovers,
  fetchHandoversByDate,
  fetchShiftMetadata,
  inferShiftLocation,
  saveHandover,
  ShiftDrawer,
  verifyManagerPin,
} from "@/lib/cashHandover";
import { logActivity } from "@/lib/activityLog";
import SignaturePad, { SignaturePadHandle } from "@/app/components/SignaturePad";
import { parseBillUrls } from "@/app/components/ShiftExpenseModal";
import TransferCardReportModal, { TransferCardReportItem } from "./TransferCardReportModal";

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
  guest_phone?: string | null;
  staff_name?: string | null;
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
  location?: string | null;
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

type ReceivableChargeItem = {
  label: string;
  amount: number;
  isDeposit?: boolean;
};

type ReceivablePaymentItem = {
  label: string;
  amount: number;
};

type ReceivableRoomBreakdownItem = {
  bookingId: string;
  roomNo: string;
  location: string;
  guestName: string;
  guestPhone?: string;
  staffName?: string;
  status: string;
  checkInDateStr: string;
  unpaidStart: number;
  unpaidAddedToday: number;
  unpaidPaidToday: number;
  unpaidEnd: number;
  totalCharges: number;
  depositPlaced: number;
  totalPaid: number;
  chargeItems: ReceivableChargeItem[];
  paymentItems: ReceivablePaymentItem[];
};

type LocationReportSnapshot = {
  location: string;
  isDayClosed: boolean;
  roomTargetTotal: number;
  roomTargetOvernight: number;
  roomTargetShortStay: number;
  earlyLateTotal: number;
  upsellTotal: number;
  roomDiscountTotal: number;
  addonRevenue: number;
  minibarRevenue: number;
  fineRevenue: number;
  otherRevenue: number;
  voidedRevenue: number;
  payCash: number;
  payTransferTotal: number;
  payTransferByBank: Record<string, number>;
  payCredit: number;
  payVoidRefund: number;
  totalExpense: number;
  advanceBox: BalanceBox;
  reservationBox: BalanceBox;
  advanceBreakdown: BoxRoomBreakdownItem[];
  reservationBreakdown: BoxRoomBreakdownItem[];
  keyDepositBox: {
    broughtForward: number;
    placedToday: number;
    refundedToday: number;
    forfeitedToday: number;
    activeHeldTotal: number;
  };
  heldDepositRooms: HeldDepositRoomItem[];
  receivableBox: { start: number; end: number };
  receivableBreakdown: ReceivableRoomBreakdownItem[];
  dayShifts: Shift[];
  handovers: CashHandover[];
  dayExpenses: LedgerTransaction[];
  liveReserve: { total: number; rooms: HeldKeyDepositRoom[] };
  liveRequiredTotal: number;
  crossLocCollectedForHere: TransferCardReportItem[];
  crossLocCollectedByHere: TransferCardReportItem[];
  liveShiftSections?: ShiftSectionData[];
  mgrBroughtForward?: number;
  mgrOutExpenseOverride?: number;
  mgrBankDeposit?: number;
};

const PROTOTYPE_TRANSFER_CARD_ITEMS: TransferCardReportItem[] = [
  { id: "pt-1", category: "transfer", bank: "SCB", amount: 360, roomNo: "103", roomLocation: "ซอย1", staffName: "เมย์", shiftLocation: "ซอย1", createdAt: "2026-11-08T11:40:00", slipTimeStr: "08/11 11:40 น.", sortTimestamp: 1, hasExplicitSlipTime: true, allocationLabel: "ชำระตอนเช็คอิน (3 ชม.)" },
  { id: "pt-2", category: "transfer", bank: "KBANK", amount: 1000, roomNo: "106", roomLocation: "ซอย1", staffName: "เมย์", shiftLocation: "ซอย1", createdAt: "2026-11-08T12:20:00", slipTimeStr: "08/11 12:20 น.", sortTimestamp: 2, hasExplicitSlipTime: true, allocationLabel: "ค่าห้อง 800 + มัดจำ 200" },
  { id: "pt-3", category: "credit_card", bank: "CREDIT_CARD", amount: 600, roomNo: "110", roomLocation: "ซอย1", staffName: "เมย์", shiftLocation: "ซอย1", createdAt: "2026-11-08T13:10:00", slipTimeStr: "08/11 13:10 น.", sortTimestamp: 3, hasExplicitSlipTime: true, allocationLabel: "ชำระตอนเช็คอิน" },
  { id: "pt-4", category: "transfer", bank: "KBANK", amount: 900, roomNo: "112", roomLocation: "ซอย1", staffName: "เมย์", shiftLocation: "ซอย1", createdAt: "2026-11-08T13:55:00", slipTimeStr: "08/11 13:55 น.", sortTimestamp: 4, hasExplicitSlipTime: true, allocationLabel: "ค่าห้อง 700 + มัดจำ 200" },
  { id: "pt-5", category: "transfer", bank: "KBANK", amount: 500, roomNo: "201", roomLocation: "ซอย1", staffName: "เมย์", shiftLocation: "ซอย1", createdAt: "2026-11-08T14:45:00", slipTimeStr: "08/11 14:45 น.", sortTimestamp: 5, hasExplicitSlipTime: true, allocationLabel: "เงินรับจองล่วงหน้า (R1)" },
  { id: "pt-6", category: "transfer", bank: "SCB", amount: 900, roomNo: "203", roomLocation: "ซอย1", staffName: "แอน", shiftLocation: "ซอย1", createdAt: "2026-11-08T16:10:00", slipTimeStr: "08/11 16:10 น.", sortTimestamp: 6, hasExplicitSlipTime: true, allocationLabel: "ค่าห้อง 700 + มัดจำ 200" },
  { id: "pt-7", category: "transfer", bank: "KBANK", amount: 900, roomNo: "113", roomLocation: "ซอย1", staffName: "แอน", shiftLocation: "ซอย1", createdAt: "2026-11-08T16:50:00", slipTimeStr: "08/11 16:50 น.", sortTimestamp: 7, hasExplicitSlipTime: true, allocationLabel: "ค่าห้อง 700 + มัดจำ 200" },
  { id: "pt-8", category: "transfer", bank: "SCB", amount: 900, roomNo: "118", roomLocation: "ซอย1", staffName: "แอน", shiftLocation: "ซอย1", createdAt: "2026-11-08T18:00:00", slipTimeStr: "08/11 18:00 น.", sortTimestamp: 8, hasExplicitSlipTime: true, allocationLabel: "ค่าห้อง 700 + มัดจำ 200" },
  { id: "pt-9", category: "credit_card", bank: "CREDIT_CARD", amount: 700, roomNo: "120", roomLocation: "ซอย1", staffName: "แอน", shiftLocation: "ซอย1", createdAt: "2026-11-08T18:45:00", slipTimeStr: "08/11 18:45 น.", sortTimestamp: 9, hasExplicitSlipTime: true, allocationLabel: "ชำระตอนเช็คอิน" },
  { id: "pt-10", category: "transfer", bank: "KBANK", amount: 800, roomNo: "206", roomLocation: "ซอย1", staffName: "แอน", shiftLocation: "ซอย1", createdAt: "2026-11-08T19:25:00", slipTimeStr: "08/11 19:25 น.", sortTimestamp: 10, hasExplicitSlipTime: true, allocationLabel: "ค่าห้อง 600 + มัดจำ 200" },
  { id: "pt-11", category: "transfer", bank: "SCB", amount: 880, roomNo: "208", roomLocation: "ซอย1", staffName: "แอน", shiftLocation: "ซอย1", createdAt: "2026-11-08T20:10:00", slipTimeStr: "08/11 20:10 น.", sortTimestamp: 11, hasExplicitSlipTime: true, allocationLabel: "ค่าห้อง 600 + ผ้าเช็ดตัว 80 + มัดจำ 200" },
  { id: "pt-12", category: "transfer", bank: "KBANK", amount: 900, roomNo: "211", roomLocation: "ซอย1", staffName: "แอน", shiftLocation: "ซอย1", createdAt: "2026-11-08T21:10:00", slipTimeStr: "08/11 21:10 น.", sortTimestamp: 12, hasExplicitSlipTime: true, allocationLabel: "ค่าห้อง 700 + มัดจำ 200" },
  { id: "pt-13", category: "transfer", bank: "SCB", amount: 300, roomNo: "208", roomLocation: "ซอย1", staffName: "แอน", shiftLocation: "ซอย1", createdAt: "2026-11-08T22:52:00", slipTimeStr: "08/11 22:52 น.", sortTimestamp: 13, hasExplicitSlipTime: true, allocationLabel: "เงินรับจองล่วงหน้า (R2-1)" },
  { id: "pt-14", category: "transfer", bank: "SCB", amount: 300, roomNo: "209", roomLocation: "ซอย1", staffName: "แอน", shiftLocation: "ซอย1", createdAt: "2026-11-08T22:52:30", slipTimeStr: "08/11 22:52 น.", sortTimestamp: 14, hasExplicitSlipTime: true, allocationLabel: "เงินรับจองล่วงหน้า (R2-2)" },
  { id: "pt-15", category: "transfer", bank: "KBANK", amount: 2300, roomNo: "219", roomLocation: "ซอย1", staffName: "บี", shiftLocation: "ซอย1", createdAt: "2026-11-08T23:30:00", slipTimeStr: "08/11 23:30 น.", sortTimestamp: 15, hasExplicitSlipTime: true, allocationLabel: "โอนชำระกะดึก" },
];

export default function DailyReport({
  dateOffset,
  onChangeDateOffset,
}: {
  dateOffset: number;
  onChangeDateOffset?: (offset: number) => void;
}) {
  const { getNow } = useSimulatedTime();
  const { getActiveBusinessDate, currentBusinessDate, currentUser } = useShift();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [reportDateLabel, setReportDateLabel] = useState("");
  const [businessDateStr, setBusinessDateStr] = useState("");
  const [windowLabelStr, setWindowLabelStr] = useState("06:45 น. - 06:44 น. ของวันถัดไป");
  const [refreshKey, setRefreshKey] = useState(0);

  // Direct In-Report Editing (Quick Audit Fix) state
  const [auditEditsMap, setAuditEditsMap] = useState<Record<string, AuditEditEntry>>({});
  const [editingRow, setEditingRow] = useState<AuditLogRowItem | null>(null);
  const [editingShiftSummary, setEditingShiftSummary] = useState<ShiftSummaryEditTarget | null>(null);
  const [editingManagerBox, setEditingManagerBox] = useState<ManagerBoxEditTarget | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editPin, setEditPin] = useState("");

  // Form states for Row Edit Modal
  const [rowEditRoomRate, setRowEditRoomRate] = useState("");
  const [rowEditExtraLabel, setRowEditExtraLabel] = useState("");
  const [rowEditExtraAmount, setRowEditExtraAmount] = useState("");
  const [rowEditCashPaid, setRowEditCashPaid] = useState("");
  const [rowEditTransferPaid, setRowEditTransferPaid] = useState("");
  const [rowEditTransferBank, setRowEditTransferBank] = useState<"SCB" | "KBANK" | "CREDIT_CARD">("SCB");

  // Form states for Shift Summary Edit Modal (Rows 6, 11, 12, 13)
  const [shiftEditCarriedIn, setShiftEditCarriedIn] = useState("");
  const [shiftEditCountedDrawer, setShiftEditCountedDrawer] = useState("");
  const [shiftEditCloseSent, setShiftEditCloseSent] = useState("");
  const [shiftEditCarriedOut, setShiftEditCarriedOut] = useState("");

  // Form states for Manager Cash Box Edit Modal (Boxes 1, 3, 4)
  const [mgrEditBrought, setMgrEditBrought] = useState("");
  const [mgrEditOutExp, setMgrEditOutExp] = useState("");
  const [mgrEditBankDep, setMgrEditBankDep] = useState("");

  // Multi-location filter & Accounting Transfer/Card Report Modal
  const [selectedLocation, setSelectedLocation] = useState<string>("ซอย1");
  const [dataMode, setDataMode] = useState<"prototype" | "live">("live");
  const prevDateOffsetRef = useRef<number>(dateOffset);
  useEffect(() => {
    if (prevDateOffsetRef.current !== dateOffset) {
      prevDateOffsetRef.current = dateOffset;
      setDataMode("live");
    }
  }, [dateOffset]);
  const [availableLocations, setAvailableLocations] = useState<string[]>(["ซอย1", "ซอย2", "ซามีญ่า"]);
  const [reportsByLocation, setReportsByLocation] = useState<Record<string, LocationReportSnapshot>>({});
  const [transferCardItems, setTransferCardItems] = useState<TransferCardReportItem[]>([]);
  const [showTransferCardModal, setShowTransferCardModal] = useState(false);

  const [bankAccounts, setBankAccounts] = useState<string[]>(["SCB", "KBANK"]);
  const [showAdvanceChangeDetails, setShowAdvanceChangeDetails] = useState(false);
  const [showReservationChangeDetails, setShowReservationChangeDetails] = useState(false);
  const [showAdvanceDetails, setShowAdvanceDetails] = useState(false);
  const [showReservationDetails, setShowReservationDetails] = useState(false);
  const [showHeldDepositRooms, setShowHeldDepositRooms] = useState(false);
  const [showReceivableDetails, setShowReceivableDetails] = useState(false);

  const [shiftDrawers, setShiftDrawers] = useState<Record<string, ShiftDrawer>>({});
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);
  const [showPreliminary, setShowPreliminary] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [signTarget, setSignTarget] = useState<CashHandover | null>(null);
  const [signPin, setSignPin] = useState("");
  const [receiverPin, setReceiverPin] = useState("");
  const [signError, setSignError] = useState("");
  const [signSaving, setSignSaving] = useState(false);
  const [showZeroRevenueItems, setShowZeroRevenueItems] = useState(false);
  const managerSigRef = useRef<SignaturePadHandle>(null);
  const receiverSigRef = useRef<SignaturePadHandle>(null);

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
      setBusinessDateStr(reportDateStr);
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

      // ดึงข้อมูลแบบแบ่งหน้า (Page ละ 1,000 แถว) เพื่อไม่ให้ติดเพดาน PostgREST max_rows = 1,000 แถวของ Supabase
      async function fetchAllRows<T = any>(
        buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
      ): Promise<T[]> {
        const pageSize = 1000;
        const all: T[] = [];
        for (let offset = 0; offset < 25000; offset += pageSize) {
          const { data, error } = await buildQuery(offset, offset + pageSize - 1);
          if (error || !data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
        }
        return all;
      }

      // ดึงข้อมูลทั้งหมดที่จำเป็นแบบขนาน
      const [
        shiftRes,
        allLedger,
        allBookings,
        allDailyRates,
        allDailyExtras,
        roomsRes,
        extraSettingsRes,
        posItemsRes,
        allSettingsRows,
      ] = await Promise.all([
        supabase
          .from("shifts")
          .select("*")
          .lt("start_time", end0645.toISOString())
          .or(`end_time.gte.${start0645.toISOString()},end_time.is.null`)
          .order("start_time", { ascending: true }),
        fetchAllRows<LedgerTransaction>((from, to) =>
          supabase
            .from("ledger_transactions")
            .select("*")
            .gte("created_at", windowStart.toISOString())
            .lt("created_at", queryEndBound.toISOString())
            .order("created_at", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<BookingRow>((from, to) =>
          supabase
            .from("bookings")
            .select("id, room_id, guest_name, guest_phone, staff_name, status, check_in_time, check_out_time, actual_check_in_time, actual_price, created_at")
            .or(`check_out_time.gte.${windowStart.toISOString()},status.in.(reserved,checked_in)`)
            .order("created_at", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<DailyRateRow>((from, to) =>
          supabase
            .from("booking_daily_rates")
            .select("id, booking_id, target_date, amount, is_manual_override")
            .gte("target_date", windowStartDateStr)
            .order("target_date", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<any>((from, to) =>
          supabase
            .from("booking_daily_extras")
            .select("id, booking_id, target_date, category, amount")
            .gte("target_date", windowStartDateStr)
            .order("target_date", { ascending: true })
            .range(from, to)
        ),
        supabase
          .from("rooms")
          .select("id, room_no, location, price_night, price_temp"),
        supabase
          .from("extra_charge_settings")
          .select("name"),
        supabase
          .from("pos_items")
          .select("name"),
        fetchAllRows<any>((from, to) =>
          supabase
            .from("system_settings")
            .select("key, value")
            .not("key", "like", "cash_handover_%")
            .not("key", "like", "shift_bd_%")
            .order("key", { ascending: true })
            .range(from, to)
        ),
      ]);

      if (shiftRes.data) setShifts(shiftRes.data);

      const settingsRes = { data: allSettingsRows };
      const allRooms: RoomRow[] = (roomsRes.data as RoomRow[]) || [];
      const extraNames = new Set((extraSettingsRes.data || []).map((e: any) => e.name));
      const posNames = new Set((posItemsRes.data || []).map((p: any) => p.name));

      const locSet = new Set<string>(["ซอย1", "ซอย2", "ซามีญ่า"]);
      allRooms.forEach((r) => {
        if (r.location && r.location.trim()) locSet.add(r.location.trim());
      });
      const orderedLocations = Array.from(locSet);
      setAvailableLocations(orderedLocations);

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
      const locDayClosedMap: Record<string, boolean> = {};
      const prevDateStr = addDaysStr(reportDateStr, -1);
      const nextDateStr = addDaysStr(reportDateStr, 1);
      const prevEodKey = `eod_shift_${prevDateStr}`;
      const eodKey = `eod_shift_${reportDateStr}`;
      let prevEodClosedAt: string | null = null;
      let currEodClosedAt: string | null = null;
      const auditEditsKey = `audit_report_edits_${reportDateStr}`;
      let loadedAuditEdits: Record<string, AuditEditEntry> = {};
      const mgrBoxSettingsMap: Record<
        string,
        Record<string, { broughtOverride?: number | null; outExpOverride?: number | null; bankDeposit?: number }>
      > = {};

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
        } else if (typeof row.key === "string" && row.key.startsWith(EOD_LOC_KEY_PREFIX) && row.key.endsWith(`_${reportDateStr}`)) {
          const mid = row.key.slice(EOD_LOC_KEY_PREFIX.length, row.key.length - (`_${reportDateStr}`).length);
          if (mid) locDayClosedMap[mid] = true;
        } else if (typeof row.key === "string" && row.key.startsWith("booking_meta_")) {
          const bId = row.key.replace("booking_meta_", "");
          bookingMetaMap[bId] = row.value as BookingMeta;
        } else if (row.key === auditEditsKey && row.value && typeof row.value === "object") {
          loadedAuditEdits = row.value as Record<string, AuditEditEntry>;
        } else if (typeof row.key === "string" && row.key.startsWith("mgr_cash_box_")) {
          // Format: mgr_cash_box_${loc}_${YYYY-MM-DD}
          const m = row.key.match(/^mgr_cash_box_(.+)_(\d{4}-\d{2}-\d{2})$/);
          if (m && row.value && typeof row.value === "object") {
            const locName = m[1];
            const dStr = m[2];
            if (!mgrBoxSettingsMap[locName]) mgrBoxSettingsMap[locName] = {};
            mgrBoxSettingsMap[locName][dStr] = row.value;
          }
        }
      });
      setAuditEditsMap(loadedAuditEdits);

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

      const fmtWindowHm = (d: Date) =>
        d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
      setWindowLabelStr(`${fmtWindowHm(start0645)} น. ถึง ${fmtWindowHm(new Date(end0645.getTime() - 1000))} น. ของวันถัดไป`);
      setBankAccounts(configuredBanks);

      // ดึงกะช่วงกว้าง แล้วคัดตาม "วันธุรกิจที่ผูกกับกะ" พร้อมตำแหน่งที่เปิดกะ (shift_location)
      const dayShiftFrom = new Date(start0645.getTime() - 3 * 3600 * 1000);
      const dayShiftTo = new Date(end0645.getTime() + 2 * 3600 * 1000);
      const [dayShiftsRes, allHandoversList] = await Promise.all([
        supabase
          .from("shifts")
          .select("*")
          .gte("start_time", dayShiftFrom.toISOString())
          .lt("start_time", dayShiftTo.toISOString())
          .order("start_time", { ascending: true }),
        fetchAllHandovers(),
      ]);
      const handoverList = allHandoversList.filter((h) => h.business_date === reportDateStr);
      const priorHandoversList = allHandoversList.filter((h) => h.business_date && h.business_date < reportDateStr);
      const candidateShifts: Shift[] = (dayShiftsRes.data as Shift[]) || [];
      const allKnownShiftsMap = new Map<string, Shift>();
      ((shiftRes.data as Shift[]) || []).forEach((s) => allKnownShiftsMap.set(s.id, s));
      candidateShifts.forEach((s) => allKnownShiftsMap.set(s.id, s));
      const shiftMetaMap = await fetchShiftMetadata(Array.from(allKnownShiftsMap.values()));

      const dayShiftListRaw: Shift[] = candidateShifts.filter(
        (s) => shiftMetaMap[s.id]?.business_date === reportDateStr
      );
      const dayShiftIds = dayShiftListRaw.map((s) => s.id);
      const dayShiftIdSet = new Set<string>(dayShiftIds);
      let shiftLedgerRows: LedgerTransaction[] = [];
      if (dayShiftIds.length > 0) {
        const { data: shiftRows } = await supabase
          .from("ledger_transactions")
          .select("id, shift_id, staff_name, room_id, booking_id, transaction_type, category, amount, notes, created_at")
          .in("shift_id", dayShiftIds)
          .order("created_at", { ascending: true });
        shiftLedgerRows = (shiftRows as LedgerTransaction[]) || [];
      }

      // รวมรายการในกะของวันนี้เข้ากับ allLedger (ป้องกันกรณีปิดกะเกิน 06:45 น. เล็กน้อย)
      const existingLedgerIds = new Set(allLedger.map((tx) => tx.id));
      shiftLedgerRows.forEach((tx) => {
        if (!existingLedgerIds.has(tx.id)) {
          allLedger.push(tx);
          existingLedgerIds.add(tx.id);
        }
      });

      // รายการที่เกิดในรอบวันธุรกิจ 06:45 น. ถึง 06:44:59 น. ของวันถัดไป หรือผูกกับกะของวันธุรกิจนี้โดยตรง
      const isTxInReportDay = (tx: LedgerTransaction) => {
        if (tx.shift_id && dayShiftIdSet.has(tx.shift_id)) return true;
        if (tx.shift_id && shiftMetaMap[tx.shift_id]?.business_date && shiftMetaMap[tx.shift_id]?.business_date !== reportDateStr) {
          return false;
        }
        const t = new Date(tx.created_at).getTime();
        return t >= start0645.getTime() && t < end0645.getTime();
      };

      const txsIn0645Window = allLedger.filter(isTxInReportDay);
      setTransactions(txsIn0645Window);

      const isInTodayRoomWindow = (tx: LedgerTransaction) => isTxInReportDay(tx);

      // Helper ระบุสถานที่ของห้องพักและรายการบัญชี
      const getBookingLoc = (b?: BookingRow | null): string => {
        if (!b) return "ซอย1";
        const r = roomMap[b.room_id];
        return (r?.location && r.location.trim()) || "ซอย1";
      };

      const getShiftLoc = (shiftId?: string | null, staffName?: string | null, notes?: string | null): string => {
        if (notes) {
          const m = String(notes).match(/\[SHIFT_LOC:([^\]]+)\]/);
          if (m && m[1].trim()) return m[1].trim();
        }
        if (shiftId && shiftMetaMap[shiftId]?.shift_location) {
          return shiftMetaMap[shiftId].shift_location!;
        }
        const inferred = inferShiftLocation(staffName);
        if (inferred) return inferred;
        if (shiftId) {
          const rowsForShift = shiftLedgerRows.filter((r) => r.shift_id === shiftId);
          for (const r of rowsForShift) {
            if (r.room_id && roomMap[r.room_id]?.location) return roomMap[r.room_id].location!.trim();
            if (r.booking_id && bookingMap[r.booking_id]) {
              const rm = roomMap[bookingMap[r.booking_id].room_id];
              if (rm?.location) return rm.location.trim();
            }
          }
        }
        return "ซอย1";
      };

      const getTxRoomLoc = (tx: LedgerTransaction): string => {
        if (tx.room_id && roomMap[tx.room_id]?.location) {
          return roomMap[tx.room_id].location!.trim();
        }
        if (tx.booking_id && bookingMap[tx.booking_id]) {
          return getBookingLoc(bookingMap[tx.booking_id]);
        }
        if (tx.notes) {
          const rmMatch = String(tx.notes).match(/\[ROOM_LOC:([^\]]+)\]/);
          if (rmMatch && rmMatch[1].trim()) return rmMatch[1].trim();
        }
        return getShiftLoc(tx.shift_id, tx.staff_name, tx.notes);
      };

      const dayShiftList: Shift[] = dayShiftListRaw.map((s) => ({
        ...s,
        shift_location: s.shift_location || getShiftLoc(s.id, s.staff_name),
      }));

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
      setShiftDrawers(drawers);

      const expenseRows = shiftLedgerRows.filter(
        (r) => r.transaction_type === "expense" && !r.category.includes("(Voided)")
      );
      let reserveNow = { total: 0, rooms: [] as HeldKeyDepositRoom[] };
      if (dayShiftList.some((s) => s.status === "open")) {
        reserveNow = await fetchActiveKeyDeposits(now);
      }

      // =========================================================================
      // สร้างรายการสำหรับ "ใบตรวจยอดเงินโอน & บัตรเครดิต (ฝ่ายบัญชี)" เรียงตามเวลาโอน/รูดบัตรจริง
      // =========================================================================
      const parsedTransferCardItems: TransferCardReportItem[] = [];
      txsIn0645Window.forEach((tx) => {
        if (tx.category.includes("(Voided)")) return;
        if (tx.transaction_type !== "payment") return;
        const amt = Number(tx.amount || 0);
        if (amt >= 0) return; // เฉพาะรายการรับชำระ (amount < 0)
        if (tx.category !== "transfer" && tx.category !== "credit_card") return;

        const absAmt = Math.abs(amt);
        const notesStr = String(tx.notes || "");
        const bankMatch = notesStr.match(/\[BANK:([^\]]+)\]/);
        const bankName =
          tx.category === "credit_card"
            ? "CREDIT_CARD"
            : bankMatch
            ? bankMatch[1].trim()
            : configuredBanks[0] || "SCB";

        const b = tx.booking_id ? bookingMap[tx.booking_id] : undefined;
        const rm = (tx.room_id && roomMap[tx.room_id]) || (b && roomMap[b.room_id]);
        const roomNo = rm?.room_no || "-";
        const roomLocation = getTxRoomLoc(tx);
        const shiftLocation = getShiftLoc(tx.shift_id, tx.staff_name, tx.notes);

        // ดึงเวลาโอน/รูดบัตรจาก [TXTIME:...] หรือ (โอนเวลา: ...) / (รูดบัตรเวลา: ...)
        let sortTimestamp = new Date(tx.created_at).getTime();
        let hasExplicitSlipTime = false;
        let slipTimeStr = "";

        const txTimeMatch = notesStr.match(/\[TXTIME:([^\]]+)\]/);
        const thaiTimeMatch = notesStr.match(/\((?:โอนเวลา|รูดบัตรเวลา):\s*([^)]+)\)/);
        if (txTimeMatch && txTimeMatch[1]) {
          const parsedDate = new Date(txTimeMatch[1].trim());
          if (!isNaN(parsedDate.getTime())) {
            sortTimestamp = parsedDate.getTime();
            hasExplicitSlipTime = true;
            slipTimeStr =
              parsedDate.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" }) +
              " " +
              parsedDate.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) +
              " น.";
          }
        } else if (thaiTimeMatch && thaiTimeMatch[1]) {
          hasExplicitSlipTime = true;
          const rawLabel = thaiTimeMatch[1].trim();
          const parsedDate = new Date(rawLabel);
          if (!isNaN(parsedDate.getTime())) {
            sortTimestamp = parsedDate.getTime();
            slipTimeStr =
              parsedDate.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" }) +
              " " +
              parsedDate.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) +
              " น.";
          } else {
            slipTimeStr = rawLabel.includes("น.") ? rawLabel : `${rawLabel} น.`;
          }
        }

        if (!slipTimeStr) {
          const cd = new Date(tx.created_at);
          slipTimeStr =
            cd.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" }) +
            " " +
            cd.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) +
            " น.";
        }

        let allocationLabel = "ค่าห้องพัก/บริการ";
        if (b && b.status === "reserved") {
          allocationLabel = "เงินรับจองล่วงหน้า";
        } else if (notesStr.includes("มัดจำ") || notesStr.includes("จอง")) {
          allocationLabel = "มัดจำ/รับจอง";
        } else if (notesStr.includes("เช็คอิน")) {
          allocationLabel = "ชำระตอนเช็คอิน";
        } else if (notesStr.includes("พักต่อ")) {
          allocationLabel = "ชำระค่าพักต่อ";
        }

        parsedTransferCardItems.push({
          id: tx.id,
          category: tx.category as "transfer" | "credit_card",
          bank: bankName,
          amount: absAmt,
          roomNo,
          roomLocation,
          staffName: tx.staff_name || "ไม่ระบุชื่อ",
          shiftLocation,
          createdAt: tx.created_at,
          slipTimeStr,
          sortTimestamp,
          hasExplicitSlipTime,
          allocationLabel,
          rawNotes: tx.notes,
        });
      });

      parsedTransferCardItems.sort((a, b) => a.sortTimestamp - b.sortTimestamp);
      setTransferCardItems(parsedTransferCardItems);

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
        paid: number;
        placed: number;
        active: number;
        refunded: number;
        forfeited: number;
        charges: number;
        inHouse: boolean;
        checkInDateStr: string;
        chargeItems: ReceivableChargeItem[];
        paymentItems: ReceivablePaymentItem[];
      };

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
        const parts = inHouse ? computeKeyDepositParts(txBefore, 0) : null;

        let charges = 0;
        const chargeItems: ReceivableChargeItem[] = [];
        if (bRates.length > 0 && inHouse) {
          const singleNightRoomTx =
            bRates.length === 1
              ? bTxs.find((t) => t.category === "room_charge" || t.category === "ค่าห้องพัก")
              : undefined;
          bRates.forEach((dr) => {
            if (!dayIncluded(dr.target_date)) return;
            const amt = singleNightRoomTx ? Number(singleNightRoomTx.amount || 0) : Number(dr.amount || 0);
            charges += amt;
            if (amt > 0) {
              chargeItems.push({ label: `🛏️ ค่าห้องพัก (คืน ${dr.target_date})`, amount: amt });
            }
          });
        }
        bTxs.forEach((t) => {
          if (t.transaction_type !== "revenue") return;
          const cat = t.category;
          const amt = Number(t.amount || 0);
          if (isRoomTypeCategory(cat)) {
            if (b.status === "reserved") return;
            if ((cat === "room_charge" || cat === "ค่าห้องพัก") && bRates.length > 0) return;
            const tt = new Date(t.created_at).getTime();
            if (tt < cutTime) {
              charges += amt;
              if (amt > 0) {
                const labelCat =
                  cat === "room_charge"
                    ? "ค่าห้องพัก"
                    : cat === "early_in_fee"
                    ? "ค่าเข้าพักก่อนเวลา"
                    : cat === "late_out_fee"
                    ? "ค่าปรับเช็คเอาท์ช้า"
                    : cat;
                chargeItems.push({ label: `🛏️ ${labelCat}`, amount: amt });
              }
            }
            return;
          }
          if (isDepositRelated(cat)) return;
          const noteDate = String(t.notes || "").match(/ประจำวันที่\s*(\d{4}-\d{2}-\d{2})/);
          const included = noteDate ? dayIncluded(noteDate[1]) : new Date(t.created_at).getTime() < cutTime;
          if (included) {
            charges += amt;
            if (amt > 0) {
              chargeItems.push({
                label: `🛎️ ${cat}${noteDate ? ` (${noteDate[1]})` : ""}`,
                amount: amt,
              });
            }
          }
        });
        if (inHouse) {
          bExtras.forEach((de) => {
            if (!dayIncluded(String(de.target_date))) return;
            if (isDailyExtraPostedInLedger(de, bTxs, firstStayDate)) return;
            const amt = Number(de.amount || 0);
            charges += amt;
            if (amt > 0) {
              chargeItems.push({
                label: `🛎️ ${de.category} (${de.target_date})`,
                amount: amt,
              });
            }
          });
        }

        const paymentItems: ReceivablePaymentItem[] = [];
        txBefore
          .filter((t) => t.transaction_type === "payment")
          .forEach((t) => {
            const rawAmt = Number(t.amount || 0);
            const absAmt = Math.abs(rawAmt);
            if (absAmt <= 0) return;
            const timeStr = new Date(t.created_at).toLocaleTimeString("th-TH", {
              hour: "2-digit",
              minute: "2-digit",
            });
            if (rawAmt < 0) {
              const bankMatch = String(t.notes || "").match(/\[BANK:([^\]]+)\]/);
              const methodLabel =
                t.category === "cash"
                  ? "💵 เงินสด"
                  : t.category === "transfer"
                  ? `📱 โอนเงิน${bankMatch ? ` (${bankMatch[1].trim()})` : ""}`
                  : t.category === "credit_card"
                  ? "💳 บัตรเครดิต"
                  : `💰 ${t.category}`;
              paymentItems.push({ label: `${methodLabel} (${timeStr} น.)`, amount: absAmt });
            } else {
              paymentItems.push({ label: `↩️ คืนเงิน (${timeStr} น.)`, amount: -absAmt });
            }
          });
        if (changeRefunded > 0) {
          paymentItems.push({ label: "↩️ คืนเงินทอน", amount: -changeRefunded });
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
          chargeItems,
          paymentItems,
        };
      };

      // Pre-compute booking snapshots once for all bookings
      const bookingSnapshotsMap: Record<string, { s: BookingSnapshot; e: BookingSnapshot }> = {};
      allBookings.forEach((b) => {
        if (b.status === "cancelled" && !bookingMetaMap[b.id]?.cancelledAt) return;
        if (!(txsByBooking[b.id]?.length || dailyRatesByBooking[b.id]?.length)) return;
        const s = snapshotBooking(b, "start");
        const eRaw = snapshotBooking(b, "end");
        const ePlaced = s.inHouse && eRaw.inHouse ? Math.max(s.placed, eRaw.placed) : eRaw.placed;
        const eActive = Math.max(0, ePlaced - eRaw.refunded - eRaw.forfeited);
        const e: BookingSnapshot = { ...eRaw, placed: ePlaced, active: eActive };
        bookingSnapshotsMap[b.id] = { s, e };
      });

      // ฟังก์ชันคำนวณข้อมูลรายงานสำหรับ "ALL" หรือแยกตามแต่ละสถานที่ ("ซอย1", "ซอย2", "ซามีญ่า")
      const buildLocationReport = (locFilter: string): LocationReportSnapshot => {
        const matchBooking = (b?: BookingRow | null) =>
          locFilter === "ALL" || getBookingLoc(b) === locFilter;
        const matchTx = (tx: LedgerTransaction) =>
          locFilter === "ALL" || getTxRoomLoc(tx) === locFilter;
        const matchShift = (s: Shift) =>
          locFilter === "ALL" || (s.shift_location || "ซอย1") === locFilter;
        const matchHandover = (h: CashHandover) => {
          const hLoc =
            h.shift_location ||
            getShiftLoc(h.shift_id, h.shift_staff_name || h.staff_name);
          return locFilter === "ALL" || hLoc === locFilter;
        };

        let rTarget = 0;
        let rTargetOvernight = 0;
        let rTargetShortStay = 0;
        let rEarlyLate = 0;
        let rUpsell = 0;
        let rDiscount = 0;
        let revAddon = 0;
        let revMinibar = 0;
        let revFine = 0;
        let revOther = 0;
        let revVoid = 0;

        const processedOvernightBookingIdsToday = new Set<string>();

        // 1A. รายได้ค่าห้องค้างคืนแบบรายคืน
        allDailyRates.forEach((dr) => {
          if (dr.target_date !== reportDateStr) return;
          const b = bookingMap[dr.booking_id];
          if (!b || b.status === "cancelled" || b.status === "reserved") return;
          if (!matchBooking(b)) return;

          processedOvernightBookingIdsToday.add(dr.booking_id);
          const room = roomMap[b.room_id];
          const meta = bookingMetaMap[dr.booking_id];
          const ratesForBooking = dailyRatesByBooking[dr.booking_id] || [];
          const isFirstNight = ratesForBooking.length > 0 && ratesForBooking[0].target_date === reportDateStr;

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
            storedTarget !== undefined && Number(storedTarget) > 0
              ? Number(storedTarget)
              : Number(room?.price_night || 0) > 0
              ? Number(room?.price_night)
              : actualNightPrice;

          const diff = actualNightPrice - targetNightPrice;
          rTarget += targetNightPrice;
          rTargetOvernight += targetNightPrice;
          if (diff >= 0) {
            if (diff > 0) {
              if (isFirstNight && meta?.targetPrices?.timeBand === "early_in") {
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

        // 1B. รายได้ค่าห้องจาก ledger_transactions ที่ไม่อยู่ใน booking_daily_rates ของวันนี้
        allLedger.forEach((tx) => {
          if (tx.transaction_type !== "revenue") return;
          if (!matchTx(tx)) return;
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

            if (
              (tx.category === "room_charge" || tx.category === "ค่าห้องพัก") &&
              tx.booking_id &&
              (processedOvernightBookingIdsToday.has(tx.booking_id) ||
                (dailyRatesByBooking[tx.booking_id]?.length || 0) > 0)
            ) {
              return;
            }

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

        // 1C. รายได้ที่ไม่ใช่ค่าห้องพัก
        txsIn0645Window.forEach((tx) => {
          if (tx.transaction_type !== "revenue") return;
          if (!matchTx(tx)) return;
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

          const noteDateMatch = String(tx.notes || "").match(/ประจำวันที่\s*(\d{4}-\d{2}-\d{2})/);
          if (noteDateMatch && noteDateMatch[1] !== reportDateStr) return;

          const amt = Number(tx.amount || 0);
          if (tx.category.includes("(Voided)")) {
            revVoid += Math.abs(amt);
            return;
          }

          addCategorizedRevenue(tx.category, amt);
        });

        // 1D. บริการเสริมรายวัน (booking_daily_extras)
        allDailyExtras.forEach((de) => {
          if (de.target_date !== reportDateStr) return;
          const b = bookingMap[de.booking_id];
          if (!b || b.status === "cancelled" || b.status === "reserved") return;
          if (!matchBooking(b)) return;
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
            if (posCategoryMap[baseCat]) {
              addCategorizedRevenue(baseCat, amt);
            } else {
              revAddon += amt;
            }
          }
        });

        // 2. จ่ายล่วงหน้า, รับจอง, มัดจำกุญแจ, ค้างชำระ
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
        const receivableItems: ReceivableRoomBreakdownItem[] = [];

        allBookings.forEach((b) => {
          if (!matchBooking(b)) return;
          const snap = bookingSnapshotsMap[b.id];
          if (!snap) return;
          const { s, e } = snap;
          const balS = s.paid - s.placed - s.charges;
          const balE = e.paid - e.placed - e.charges;
          const roomNo = roomMap[b.room_id]?.room_no || "-";
          const roomLoc = getBookingLoc(b);

          keyPlacedToday += e.placed - s.placed;
          keyActiveStart += s.active;
          keyActiveEnd += e.active;
          if (e.active > 0) {
            heldRooms.push({ bookingId: b.id, roomNo, guestName: b.guest_name || "ผู้เข้าพัก", amount: e.active });
          }

          // รีเซ็ตยอดค้างชำระเก่าจากช่วงทดลองระบบก่อนวันที่ 2026-11-24 ให้เป็น 0 เพื่อเริ่มนับระบบจริงตั้งแต่วันที่ 24 พ.ย. 2569
          const isPreLaunchTestBooking = (e.checkInDateStr || s.checkInDateStr) < "2026-11-24";
          const bUnpaidStart = isPreLaunchTestBooking ? 0 : Math.max(0, -balS);
          const bUnpaidEnd = isPreLaunchTestBooking ? 0 : Math.max(0, -balE);
          arStart += bUnpaidStart;
          arEnd += bUnpaidEnd;

          if (bUnpaidStart >= 0.5 || bUnpaidEnd >= 0.5) {
            const fullChargeItems: ReceivableChargeItem[] = [...e.chargeItems];
            if (e.placed > 0) {
              fullChargeItems.push({
                label: "🔑 ค่ามัดจำกุญแจ (กันไว้ในลิ้นชัก)",
                amount: e.placed,
                isDeposit: true,
              });
            }
            receivableItems.push({
              bookingId: b.id,
              roomNo,
              location: roomLoc,
              guestName: b.guest_name || "ไม่ระบุชื่อ",
              guestPhone: b.guest_phone || undefined,
              staffName: b.staff_name || undefined,
              status: b.status,
              checkInDateStr: e.checkInDateStr,
              unpaidStart: bUnpaidStart,
              unpaidAddedToday: Math.max(0, bUnpaidEnd - bUnpaidStart),
              unpaidPaidToday: Math.max(0, bUnpaidStart - bUnpaidEnd),
              unpaidEnd: bUnpaidEnd,
              totalCharges: e.charges,
              depositPlaced: e.placed,
              totalPaid: e.paid,
              chargeItems: fullChargeItems,
              paymentItems: e.paymentItems,
            });
          }
          const posS = Math.max(0, balS);
          const posE = Math.max(0, balE);
          const rS = s.inHouse ? 0 : posS;
          const rE = e.inHouse ? 0 : posE;
          const aS = s.inHouse ? posS : 0;
          const aE = e.inHouse ? posE : 0;

          let bResAdd = 0;
          let bResUsed = 0;
          if (!e.inHouse) {
            bResAdd = Math.max(0, rE - rS);
            bResUsed = Math.max(0, rS - rE);
          } else {
            bResUsed = rS;
          }

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
        receivableItems.sort((a, b) => {
          if (b.unpaidEnd !== a.unpaidEnd) return b.unpaidEnd - a.unpaidEnd;
          return a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true });
        });

        // 3. ฝั่งรับชำระเงิน
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
          if (!matchTx(tx)) return;
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

        // 4. กล่องเงินสดและกะของสถานที่นั้น (กรองกะที่เปิดและปิดผิดพลาดภายใน < 10 นาทีโดยไม่มีรายการเดินบัญชีและไม่มีการส่งมอบเงินออก)
        const rawLocDayShifts = dayShiftList.filter(matchShift);
        const locHandovers = handoverList.filter(matchHandover);
        const locDayShifts = rawLocDayShifts.filter((sh) => {
          if (sh.status !== "closed" || rawLocDayShifts.length <= 1) return true;
          const hasTx = txsIn0645Window.some((tx) => tx.shift_id === sh.id && !tx.category.includes("(Voided)"));
          if (hasTx) return true;
          const hasHandoverAmt = locHandovers.some(
            (h) =>
              h.shift_id === sh.id &&
              (Number(h.actual_amount || 0) !== 0 ||
                Number(h.required_amount || 0) !== 0 ||
                Number(h.carried_to_next_shift || 0) !== 0)
          );
          if (hasHandoverAmt) return true;
          const durMs =
            sh.end_time && sh.start_time
              ? new Date(sh.end_time).getTime() - new Date(sh.start_time).getTime()
              : 9999999;
          return durMs > 10 * 60 * 1000;
        });

        // ซอย 1 เริ่มใช้งานจริงตั้งแต่วันที่ 2026-11-24 (ไม่นับข้อมูลทดสอบก่อนหน้าเข้ายอดยกมา)
        const locPriorHandovers = priorHandoversList.filter(
          (h) => matchHandover(h) && h.business_date >= "2026-11-24"
        );
        const locMgrBoxByDate = mgrBoxSettingsMap[locFilter] || {};
        const todayMgrBoxSetting = locMgrBoxByDate[reportDateStr] || {};
        let mgrBroughtForward = 0;
        if (todayMgrBoxSetting.broughtOverride != null) {
          mgrBroughtForward = Number(todayMgrBoxSetting.broughtOverride);
        } else {
          // คำนวณยอดยกมาสะสมตั้งแต่วันที่ 2026-11-24 จนถึงวันก่อนหน้า (รวมผลจากการปรับแก้ ยกมา/จ่ายนอกกะ/ฝากเงิน ของวันก่อนหน้า)
          const priorDatesSet = new Set<string>();
          locPriorHandovers.forEach((h) => {
            if (h.business_date >= "2026-11-24" && h.business_date < reportDateStr) {
              priorDatesSet.add(h.business_date);
            }
          });
          Object.keys(locMgrBoxByDate).forEach((d) => {
            if (d >= "2026-11-24" && d < reportDateStr) priorDatesSet.add(d);
          });
          const sortedPriorDates = Array.from(priorDatesSet).sort();
          let runningMgrCash = 0;
          sortedPriorDates.forEach((d) => {
            const boxD = locMgrBoxByDate[d];
            if (boxD?.broughtOverride != null) {
              runningMgrCash = Number(boxD.broughtOverride);
            }
            const dayNetSent = locPriorHandovers
              .filter((h) => h.business_date === d)
              .reduce((s, h) => s + Number(h.actual_amount || 0), 0);
            const dayOutExp = Number(boxD?.outExpOverride ?? 0);
            const dayBankDep = Number(boxD?.bankDeposit ?? 0);
            runningMgrCash = runningMgrCash + dayNetSent - dayOutExp - dayBankDep;
          });
          mgrBroughtForward = runningMgrCash;
        }
        const mgrOutExpenseOverride =
          todayMgrBoxSetting.outExpOverride != null ? Number(todayMgrBoxSetting.outExpOverride) : undefined;
        const mgrBankDeposit =
          todayMgrBoxSetting.bankDeposit != null ? Number(todayMgrBoxSetting.bankDeposit) : 0;
        const locExpenses = expenseRows.filter((e) => locDayShifts.some((s) => s.id === e.shift_id));
        const locTotalExpense = locExpenses.reduce((sum, r) => sum + Math.abs(Number(r.amount || 0)), 0);

        const locReserveRooms =
          locFilter === "ALL"
            ? reserveNow.rooms
            : reserveNow.rooms.filter((r) => (r.location || "ซอย1") === locFilter);
        const locReserveTotal = locReserveRooms.reduce((sum, r) => sum + r.amount, 0);

        const locOpenShifts = locDayShifts.filter((s) => s.status === "open");
        const getReserveForShift = (sh: Shift) => {
          if (dayShiftList.filter((s) => s.status === "open").length === 1 && !shiftMetaMap[sh.id]?.shift_location) {
            return locFilter === "ALL" ? reserveNow.total : locReserveTotal;
          }
          const shLoc = sh.shift_location || "ซอย1";
          return reserveNow.rooms
            .filter((r) => (r.location || "ซอย1") === shLoc)
            .reduce((sum, r) => sum + r.amount, 0);
        };
        const locLiveRequiredTotal = locOpenShifts.reduce(
          (s, sh) => s + ((drawers[sh.id]?.drawer || 0) - getReserveForShift(sh)),
          0
        );

        const hasAnyLocEod = Object.values(locDayClosedMap).some(Boolean);
        const activeShiftLocsToday = orderedLocations.filter((l) =>
          dayShiftList.some((s) => (shiftMetaMap[s.id]?.shift_location || "ซอย1") === l)
        );
        const isLocDayClosed =
          locFilter === "ALL"
            ? hasAnyLocEod
              ? activeShiftLocsToday.length > 0 &&
                activeShiftLocsToday.every((l) => Boolean(locDayClosedMap[l])) &&
                locOpenShifts.length === 0
              : dayClosed
            : Boolean(locDayClosedMap[locFilter] || (!hasAnyLocEod && dayClosed));

        const crossLocCollectedForHere =
          locFilter === "ALL"
            ? parsedTransferCardItems.filter((it) => it.shiftLocation && it.shiftLocation !== it.roomLocation)
            : parsedTransferCardItems.filter(
                (it) => it.roomLocation === locFilter && it.shiftLocation && it.shiftLocation !== locFilter
              );
        const crossLocCollectedByHere =
          locFilter === "ALL"
            ? []
            : parsedTransferCardItems.filter(
                (it) => it.shiftLocation === locFilter && it.roomLocation !== locFilter
              );

        // สร้างข้อมูลตารางบันทึกประจำวัน 15 คอลัมน์ (Live Shift Sections 1-3)
        const fmtHmShort = (iso?: string | null) => {
          if (!iso) return "";
          const d = new Date(iso);
          if (isNaN(d.getTime())) return "";
          return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
        };

        // จัดกะลง 3 ช่อง (1. กะเช้า, 2. กะบ่าย, 3. กะดึก) — หากมี <= 2 กะ และเปิดกะหลัง 16:00 น. ให้จัดเป็นกะดึก (ช่อง 3) โดยเว้นวรรคกะบ่าย (ช่อง 2)
        const slottedShifts: [Shift | null, Shift | null, Shift | null] = [null, null, null];
        if (locDayShifts.length >= 3) {
          slottedShifts[0] = locDayShifts[0] || null;
          slottedShifts[1] = locDayShifts[1] || null;
          slottedShifts[2] = locDayShifts[2] || null;
        } else {
          locDayShifts.forEach((sh) => {
            const hr = new Date(sh.start_time).getHours();
            if ((hr >= 16 || hr < 5) && !slottedShifts[2]) {
              slottedShifts[2] = sh;
            } else if (hr >= 12 && hr < 16 && !slottedShifts[1]) {
              slottedShifts[1] = sh;
            } else if (!slottedShifts[0]) {
              slottedShifts[0] = sh;
            } else if (!slottedShifts[1]) {
              slottedShifts[1] = sh;
            } else {
              slottedShifts[2] = sh;
            }
          });
        }

        const getSlotForShiftOrTime = (shId?: string | null, isoTime?: string | null): 0 | 1 | 2 => {
          if (shId) {
            if (slottedShifts[0]?.id === shId) return 0;
            if (slottedShifts[1]?.id === shId) return 1;
            if (slottedShifts[2]?.id === shId) return 2;
            const idx = locDayShifts.findIndex((s) => s.id === shId);
            if (idx >= 2) return 2;
          }
          if (isoTime) {
            const hr = new Date(isoTime).getHours();
            if (hr >= 16 || hr < 5) {
              return slottedShifts[2] || !slottedShifts[1] ? 2 : 1;
            }
            if (hr >= 12 && hr < 16) {
              return slottedShifts[1] ? 1 : 0;
            }
            return 0;
          }
          return 0;
        };

        const slotRows: [AuditLogRowItem[], AuditLogRowItem[], AuditLogRowItem[]] = [[], [], []];
        const slotTotals = [
          { roomRate: 0, adjust: 0, extra: 0, minibar: 0, totalCharge: 0, cash: 0, transferCard: 0, reservationCredit: 0, advanceCredit: 0, checkins: 0, anomalies: 0, bookings: 0 },
          { roomRate: 0, adjust: 0, extra: 0, minibar: 0, totalCharge: 0, cash: 0, transferCard: 0, reservationCredit: 0, advanceCredit: 0, checkins: 0, anomalies: 0, bookings: 0 },
          { roomRate: 0, adjust: 0, extra: 0, minibar: 0, totalCharge: 0, cash: 0, transferCard: 0, reservationCredit: 0, advanceCredit: 0, checkins: 0, anomalies: 0, bookings: 0 },
        ];

        const activeBookingIdsToday = new Set<string>();
        allDailyRates.forEach((dr) => {
          if (dr.target_date === reportDateStr && bookingMap[dr.booking_id] && matchBooking(bookingMap[dr.booking_id])) {
            activeBookingIdsToday.add(dr.booking_id);
          }
        });
        txsIn0645Window.forEach((tx) => {
          if (!tx.category.includes("(Voided)") && tx.booking_id && bookingMap[tx.booking_id] && matchBooking(bookingMap[tx.booking_id])) {
            activeBookingIdsToday.add(tx.booking_id);
          }
        });
        // รวมรายการห้องที่มีประวัติการแก้ไข/ลบในรายงานวันนี้ด้วย เพื่อคงแถวที่ถูกลบยอดเป็น 0 ให้แสดงรอยขีดฆ่าสีจางและ (ชื่อผู้แก้ไข) บนรายงานเสมอ
        const editedSlotsByBooking = new Map<string, Set<0 | 1 | 2>>();
        Object.keys(loadedAuditEdits).forEach((editKey) => {
          const m = editKey.match(/^row_live-[cb]-([0-9a-fA-F-]+)-([012])_/);
          if (m) {
            const bId = m[1];
            const sIdx = Number(m[2]) as 0 | 1 | 2;
            if (bookingMap[bId] && matchBooking(bookingMap[bId])) {
              activeBookingIdsToday.add(bId);
              if (!editedSlotsByBooking.has(bId)) editedSlotsByBooking.set(bId, new Set());
              editedSlotsByBooking.get(bId)!.add(sIdx);
            }
          }
        });

        let seqCheckinNo = 1;
        let seqBookingNo = 1;

        Array.from(activeBookingIdsToday)
          .map((id) => bookingMap[id])
          .filter((b): b is BookingRow => Boolean(b && b.status !== "cancelled"))
          .sort((a, b) => {
            const ta = new Date(a.actual_check_in_time || a.check_in_time).getTime();
            const tb = new Date(b.actual_check_in_time || b.check_in_time).getTime();
            return ta - tb;
          })
          .forEach((b) => {
            const bTxsToday = txsIn0645Window.filter(
              (tx) => tx.booking_id === b.id && !tx.category.includes("(Voided)")
            );

            // จัดกลุ่มรายการตามกะ (0, 1, 2) เพื่อให้ยอดเงินสด/เงินโอนของแต่ละกะตรงกับลิ้นชักจริง 100%
            const txsBySlot = new Map<0 | 1 | 2, LedgerTransaction[]>();
            bTxsToday.forEach((tx) => {
              const s = getSlotForShiftOrTime(tx.shift_id, tx.created_at);
              if (!txsBySlot.has(s)) txsBySlot.set(s, []);
              txsBySlot.get(s)!.push(tx);
            });

            const editedSlots = editedSlotsByBooking.get(b.id);
            if (editedSlots) {
              editedSlots.forEach((sIdx) => {
                if (!txsBySlot.has(sIdx)) txsBySlot.set(sIdx, []);
              });
            }

            if (txsBySlot.size === 0) {
              const defaultSlot = getSlotForShiftOrTime(undefined, b.actual_check_in_time || b.check_in_time);
              txsBySlot.set(defaultSlot, []);
            }

            const primarySlot = Array.from(txsBySlot.keys())[0];

            Array.from(txsBySlot.entries()).forEach(([slot, slotTxs]) => {
              const isPrimarySlot = slot === primarySlot;
              const firstTx = slotTxs[0];
              const rm = roomMap[b.room_id];
              const roomNo = rm?.room_no || "-";
              const staffName = firstTx?.staff_name || slottedShifts[slot]?.staff_name || b.staff_name || "-";

              let cashPaid = 0;
              let keyDepPlaced = 0;
              let keyDepRefunded = 0;
              let transferPaid = 0;
              let bankPrefix = "";
              let tcColor: "purple" | "emerald" | "blue" | "slate" = "slate";
              let roomChargeTxAmt = 0;
              let extraAmt = 0;
              let extraLabel = "";
              const cashTxIds: string[] = [];
              const transferTxIds: string[] = [];
              const extraTxIds: string[] = [];
              const roomChargeTxIds: string[] = [];

              slotTxs.forEach((tx) => {
                const amt = Number(tx.amount || 0);
                if (tx.transaction_type === "payment" && amt < 0) {
                  if (tx.category === "cash") {
                    cashPaid += Math.abs(amt);
                    cashTxIds.push(tx.id);
                  } else if (tx.category === "transfer" || tx.category === "credit_card") {
                    transferPaid += Math.abs(amt);
                    transferTxIds.push(tx.id);
                    if (tx.category === "credit_card") {
                      bankPrefix = "Cr";
                      tcColor = "blue";
                    } else {
                      const bm = String(tx.notes || "").match(/\[BANK:([^\]]+)\]/);
                      const bk = bm ? bm[1].trim().toUpperCase() : "SCB";
                      bankPrefix = bk.startsWith("K") ? "K" : bk.startsWith("S") ? "S" : bk;
                      tcColor = bk.startsWith("K") ? "emerald" : "purple";
                    }
                  }
                } else if (tx.transaction_type === "deposit" && amt > 0 && (tx.category.includes("ค่ามัดจำกุญแจ") || tx.category === "key_deposit")) {
                  keyDepPlaced += amt;
                } else if (tx.transaction_type === "deposit" && amt < 0 && (tx.category.includes("คืนมัดจำ") || tx.category.includes("คืนเงินทอน"))) {
                  keyDepRefunded += Math.abs(amt);
                } else if (tx.transaction_type === "revenue") {
                  if (tx.category === "room_charge" || tx.category.includes("ค่าห้องพัก")) {
                    roomChargeTxAmt += amt;
                    roomChargeTxIds.push(tx.id);
                  } else if (!tx.category.includes("มัดจำ")) {
                    extraAmt += amt;
                    extraLabel = tx.category;
                    extraTxIds.push(tx.id);
                  }
                }
              });

              const resolvedTransferBank: "SCB" | "KBANK" | "CREDIT_CARD" =
                bankPrefix === "Cr" ? "CREDIT_CARD" : bankPrefix === "K" ? "KBANK" : "SCB";

              if (b.status === "reserved") {
                const rNo = `R${seqBookingNo++}`;
                const depTotal = cashPaid + transferPaid;
                const totPrice = Number(b.actual_price || 0);
                slotRows[slot].push({
                  id: `live-b-${b.id}-${slot}`,
                  kind: "booking",
                  rowNo: rNo,
                  checkInLabel: `จอง (${new Date(b.check_in_time).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" })})`,
                  roomNo,
                  staffName,
                  bookingRateSummary: totPrice > 0 ? `ยอดรวม ${totPrice.toLocaleString()} ฿ - มัดจำ ${depTotal.toLocaleString()} ฿ = คงเหลือ ${(totPrice - depTotal).toLocaleString()} ฿` : "จองล่วงหน้า",
                  cashDisplay: cashPaid > 0 ? cashPaid.toLocaleString() : null,
                  transferCardDisplay: transferPaid > 0 ? `${bankPrefix} ${transferPaid.toLocaleString()}` : null,
                  transferCardColor: tcColor,
                  reservationCreditDisplay: depTotal > 0 ? `+${depTotal.toLocaleString()}` : null,
                  reservationCreditPositive: true,
                  powerWindowDisplay: `เข้า ~${fmtHmShort(b.check_in_time)} น.`,
                  editMeta: {
                    bookingId: b.id,
                    roomId: b.room_id,
                    roomNo,
                    guestName: b.guest_name || "ลูกค้าจอง",
                    slotIdx: slot,
                    shiftId: firstTx?.shift_id || slottedShifts[slot]?.id || null,
                    staffName,
                    dailyRateId: null,
                    targetDate: reportDateStr,
                    roomRate: 0,
                    extraLabel: "",
                    extraAmount: 0,
                    cashPaid,
                    keyDepPlaced: 0,
                    transferPaid,
                    transferBank: resolvedTransferBank,
                    cashTxIds,
                    transferTxIds,
                    extraTxIds,
                    roomChargeTxIds,
                  },
                });
                slotTotals[slot].cash += cashPaid;
                slotTotals[slot].transferCard += transferPaid;
                slotTotals[slot].reservationCredit += depTotal;
                slotTotals[slot].bookings += 1;
                return;
              }

              const bRates = dailyRatesByBooking[b.id] || [];
              const todayRateRow = isPrimarySlot ? bRates.find((r) => r.target_date === reportDateStr) : undefined;
              const roomAmt = todayRateRow ? Number(todayRateRow.amount || 0) : roomChargeTxAmt;
              const totalRowCharge = roomAmt + extraAmt;

              // กรณีรายการทดลองกดรับมัดจำและคืนมัดจำทันทีโดยไม่มีค่าห้อง (เช่น ห้อง 2 ตอน 06:54) ให้ตัดออก
              if (totalRowCharge === 0 && keyDepPlaced > 0 && keyDepPlaced === keyDepRefunded && cashPaid === keyDepPlaced && transferPaid === 0) {
                return;
              }

              // หักค่ามัดจำกุญแจ (keyDepPlaced) ออกจากเงินสดรับในกะเสมอ (ทั้งกรณีจ่ายสด เช่น 900-200 และกรณีโอนรวมมัดจำ เช่น K 700 หักเงินสด -200 เข้ากองมัดจำ)
              const netCash = cashPaid - keyDepPlaced;

              const cashDisp =
                cashPaid > 0 && keyDepPlaced > 0
                  ? `${cashPaid.toLocaleString()}-${keyDepPlaced.toLocaleString()}`
                  : cashPaid === 0 && keyDepPlaced > 0
                  ? `-${keyDepPlaced.toLocaleString()}`
                  : cashPaid > 0
                  ? cashPaid.toLocaleString()
                  : null;

              const resBreak = isPrimarySlot ? resItems.find((it) => it.bookingId === b.id) : undefined;
              const advBreak = isPrimarySlot ? advItems.find((it) => it.bookingId === b.id) : undefined;
              const resNetRow = resBreak ? resBreak.addedToday - resBreak.usedToday : 0;
              const advNetRow = advBreak ? advBreak.addedToday - advBreak.usedToday : 0;

              const rowCandidateId = `live-c-${b.id}-${slot}`;
              const hasAuditEditOnRow = Object.keys(loadedAuditEdits).some((k) =>
                k.startsWith(`row_${rowCandidateId}_`)
              );

              // ข้ามแถวที่ไม่มีค่าห้องและไม่มีรายการรับชำระ/เครดิตในกะนี้ (ยกเว้นแถวที่มีประวัติการลบ/แก้ไขในรายงานวันนี้ เพื่อให้ยังคงแสดงรอยขีดฆ่าสีจางและชื่อผู้แก้ไข)
              if (
                !hasAuditEditOnRow &&
                totalRowCharge === 0 &&
                cashPaid === 0 &&
                keyDepPlaced === 0 &&
                transferPaid === 0 &&
                resNetRow === 0 &&
                advNetRow === 0
              ) {
                return;
              }

              const ciIso = b.actual_check_in_time || b.check_in_time;
              const ciDateStr = toThaiDateStr(ciIso);
              const ciDayMonth = ciIso
                ? new Date(ciIso).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" })
                : "";
              const hasNewCheckinOverride = slotTxs.some((tx) => String(tx.notes || "").includes("เช็คอินใหม่"));
              const hasExtendFrom23Override = slotTxs.some((tx) => String(tx.notes || "").includes("พักต่อจาก 23/11"));
              const rowCheckInLabel = hasExtendFrom23Override
                ? `23/11 ${fmtHmShort(ciIso) || "-"} (พักต่อ)`
                : !hasNewCheckinOverride && ciDateStr && ciDateStr < reportDateStr
                ? `${ciDayMonth} ${fmtHmShort(ciIso) || "-"} (พักต่อ)`
                : fmtHmShort(ciIso) || "-";

              slotRows[slot].push({
                id: `live-c-${b.id}-${slot}`,
                kind: "checkin",
                rowNo: String(seqCheckinNo++),
                checkInLabel: rowCheckInLabel,
                roomNo,
                staffName,
                roomRate: roomAmt || null,
                extraLabel: extraLabel || null,
                extraAmount: extraAmt || null,
                totalCharge: totalRowCharge || null,
                cashDisplay: cashDisp,
                cashNegative: netCash < 0,
                transferCardDisplay: transferPaid > 0 ? `${bankPrefix} ${transferPaid.toLocaleString()}` : null,
                transferCardColor: tcColor,
                reservationCreditDisplay: resNetRow !== 0 ? (resNetRow > 0 ? `+${resNetRow.toLocaleString()}` : `-${Math.abs(resNetRow).toLocaleString()}`) : null,
                reservationCreditPositive: resNetRow > 0,
                advanceCreditDisplay: advNetRow !== 0 ? (advNetRow > 0 ? `+${advNetRow.toLocaleString()}` : `-${Math.abs(advNetRow).toLocaleString()}`) : null,
                advanceCreditPositive: advNetRow > 0,
                powerWindowDisplay:
                  b.status === "checked_out"
                    ? `${fmtHmShort(b.actual_check_in_time || b.check_in_time)} - ${fmtHmShort(b.check_out_time)}`
                    : `${fmtHmShort(b.actual_check_in_time || b.check_in_time)} - ปัจจุบัน`,
                editMeta: {
                  bookingId: b.id,
                  roomId: b.room_id,
                  roomNo,
                  guestName: b.guest_name || "ผู้เข้าพัก",
                  slotIdx: slot,
                  shiftId: firstTx?.shift_id || slottedShifts[slot]?.id || null,
                  staffName,
                  dailyRateId: todayRateRow?.id || null,
                  targetDate: reportDateStr,
                  roomRate: roomAmt,
                  extraLabel,
                  extraAmount: extraAmt,
                  cashPaid,
                  keyDepPlaced,
                  transferPaid,
                  transferBank: resolvedTransferBank,
                  cashTxIds,
                  transferTxIds,
                  extraTxIds,
                  roomChargeTxIds,
                },
              });

              slotTotals[slot].roomRate += roomAmt;
              slotTotals[slot].extra += extraAmt;
              slotTotals[slot].totalCharge += totalRowCharge;
              slotTotals[slot].cash += netCash;
              slotTotals[slot].transferCard += transferPaid;
              slotTotals[slot].reservationCredit += resNetRow;
              slotTotals[slot].advanceCredit += advNetRow;
              if (totalRowCharge > 0) {
                slotTotals[slot].checkins += 1;
              }
            });
          });

        const liveShiftSections: ShiftSectionData[] = ([0, 1, 2] as const).map((idx) => {
          const sh = slottedShifts[idx];
          const t = slotTotals[idx];
          const timeText = sh
            ? `${fmtHmShort(sh.start_time)} – ${sh.end_time ? fmtHmShort(sh.end_time) + " น." : "ปัจจุบัน"}`
            : idx === 0
            ? "07:00 – 15:00 น."
            : idx === 1
            ? "15:00 – 23:00 น."
            : "23:00 – 07:00 น.";
          return {
            shiftIndex: (idx + 1) as 1 | 2 | 3,
            icon: idx === 0 ? "🌅" : idx === 1 ? "🌇" : "🌙",
            summaryTitle: `รวมกะที่ ${idx + 1} (${timeText}):`,
            rows: slotRows[idx],
            totals: {
              roomRate: t.roomRate,
              adjust: t.adjust,
              extra: t.extra,
              minibar: t.minibar,
              totalCharge: t.totalCharge,
              cash: t.cash,
              transferCard: t.transferCard,
              reservationCredit: t.reservationCredit,
              advanceCredit: t.advanceCredit,
              countSummaryText: `${t.checkins} เข้าพัก${t.anomalies > 0 ? ` + ${t.anomalies} ผิดปกติ` : ""}${t.bookings > 0 ? ` + ${t.bookings} จอง` : ""}`,
            },
          };
        });

        return {
          location: locFilter,
          isDayClosed: isLocDayClosed,
          roomTargetTotal: rTarget,
          roomTargetOvernight: rTargetOvernight,
          roomTargetShortStay: rTargetShortStay,
          earlyLateTotal: rEarlyLate,
          upsellTotal: rUpsell,
          roomDiscountTotal: rDiscount,
          addonRevenue: revAddon,
          minibarRevenue: revMinibar,
          fineRevenue: revFine,
          otherRevenue: revOther,
          voidedRevenue: revVoid,
          payCash: cashToday,
          payTransferTotal: transferToday,
          payTransferByBank: transferByBank,
          payCredit: creditToday,
          payVoidRefund: refundToday,
          totalExpense: locTotalExpense,
          advanceBox: {
            broughtForward: advBF,
            addedToday: advAdd,
            usedToday: advUsed,
            carriedForward: Math.max(0, advBF + advAdd - advUsed),
          },
          reservationBox: {
            broughtForward: resBF,
            addedToday: resAdd,
            usedToday: resUsed,
            carriedForward: Math.max(0, resBF + resAdd - resUsed),
          },
          advanceBreakdown: advItems,
          reservationBreakdown: resItems,
          keyDepositBox: {
            broughtForward: keyActiveStart,
            placedToday: keyPlacedToday,
            refundedToday: keyRefundToday,
            forfeitedToday: forfeitToday,
            activeHeldTotal: keyActiveEnd,
          },
          heldDepositRooms: heldRooms,
          receivableBox: { start: arStart, end: arEnd },
          receivableBreakdown: receivableItems,
          dayShifts: locDayShifts,
          handovers: locHandovers,
          dayExpenses: locExpenses,
          liveReserve: { total: locReserveTotal, rooms: locReserveRooms },
          liveRequiredTotal: locLiveRequiredTotal,
          crossLocCollectedForHere,
          crossLocCollectedByHere,
          liveShiftSections,
          mgrBroughtForward,
          mgrOutExpenseOverride,
          mgrBankDeposit,
        };
      };

      const computedMap: Record<string, LocationReportSnapshot> = {
        ALL: buildLocationReport("ALL"),
      };
      orderedLocations.forEach((loc) => {
        computedMap[loc] = buildLocationReport(loc);
      });
      setReportsByLocation(computedMap);

      setLoading(false);
    }

    fetchDailyData();
  }, [dateOffset, getNow, getActiveBusinessDate, currentBusinessDate, refreshKey]);

  if (loading || !reportsByLocation["ALL"]) {
    return (
      <div className="text-center py-12 text-slate-500 animate-pulse font-bold">
        กำลังประมวลผลรายงานเงินสดประจำวัน...
      </div>
    );
  }

  const activeReport = reportsByLocation[selectedLocation] || reportsByLocation["ALL"];
  const {
    isDayClosed,
    roomTargetTotal,
    roomTargetOvernight,
    roomTargetShortStay,
    earlyLateTotal,
    upsellTotal,
    roomDiscountTotal,
    addonRevenue,
    minibarRevenue,
    fineRevenue,
    otherRevenue,
    voidedRevenue,
    payCash,
    payTransferTotal,
    payTransferByBank,
    payCredit,
    payVoidRefund,
    totalExpense,
    advanceBox,
    reservationBox,
    advanceBreakdown,
    reservationBreakdown,
    keyDepositBox,
    heldDepositRooms,
    receivableBox,
    receivableBreakdown,
    dayShifts,
    handovers,
    dayExpenses,
    liveReserve,
    liveRequiredTotal,
    crossLocCollectedForHere,
    crossLocCollectedByHere,
  } = activeReport;

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
  const totalRequiredToSend = handoverRequiredTotal + liveRequiredTotal;
  const latestCarriedByLoc: Record<string, number> = {};
  handovers.forEach((h) => {
    if (h.kind === "shift_close") {
      const locKey = h.shift_location || "ซอย1";
      latestCarriedByLoc[locKey] = Number(h.carried_to_next_shift || 0);
    }
  });
  openShifts.forEach((s) => {
    const locKey = s.shift_location || "ซอย1";
    delete latestCarriedByLoc[locKey];
  });
  const unconsumedCarriedOutTotal = Object.values(latestCarriedByLoc).reduce((sum, v) => sum + v, 0);
  const cashReceivedNet = totalRequiredToSend + totalExpense + unconsumedCarriedOutTotal;
  const cashOverTotal = handovers.reduce(
    (s, h) => s + Math.max(0, Number(h.actual_amount || 0) - Number(h.required_amount || 0)),
    0
  );
  const cashShortTotal = handovers.reduce(
    (s, h) => s + Math.min(0, Number(h.actual_amount || 0) - Number(h.required_amount || 0)),
    0
  );
  const cashCollectedTotal = handovers.reduce((s, h) => s + Number(h.actual_amount || 0), 0);
  const pendingManagerSign = handovers.filter(
    (h) =>
      !h.manager_signature &&
      !(Number(h.actual_amount || 0) === 0 && Number(h.required_amount || 0) === 0)
  );
  const closedShiftsWithoutHandover = dayShifts.filter(
    (s) => s.status === "closed" && !handovers.some((h) => h.shift_id === s.id && h.kind === "shift_close")
  );
  const isCashComplete =
    dayShifts.length > 0 &&
    openShifts.length === 0 &&
    isDayClosed &&
    handovers.length > 0 &&
    pendingManagerSign.length === 0;

  const canPrintCurrentLocation =
    selectedLocation === "ALL"
      ? isCashComplete
      : Boolean(reportsByLocation[selectedLocation]?.isDayClosed);

  const handlePrintLocationFinancialReport = () => {
    if (!canPrintCurrentLocation) {
      alert(
        `⚠️ สาขา ${selectedLocation === "ALL" ? "รวมทุกสาขา" : selectedLocation} ยังไม่สามารถพิมพ์รายงานการเงินฉบับปิดวันได้\n\nเนื่องจากสถานะปัจจุบันยังไม่ปิดวัน (ต้องปิดกะสุดท้ายและส่งมอบปิดวันให้เสร็จสิ้นก่อน)`
      );
      return;
    }
    window.open(`/financial-report.html?loc=${encodeURIComponent(selectedLocation)}&date=${encodeURIComponent(businessDateStr)}`, '_blank');
  };

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
    const isNegSign = (signTarget.kind === "mid_shift" ? signTarget.actual_amount : signTarget.required_amount) < 0;
    const sig = managerSigRef.current?.toDataURL() || null;
    if (!sig) {
      setSignError("กรุณาให้ผู้จัดการเซ็นชื่อก่อนยืนยัน");
      return;
    }
    const recSig = isNegSign ? receiverSigRef.current?.toDataURL() || null : null;
    if (isNegSign && !signTarget.staff_signature && !recSig) {
      setSignError("กรุณาให้พนักงานผู้รับผิดชอบกะเซ็นรับเงินด้วย");
      return;
    }
    setSignSaving(true);
    const manager = await verifyManagerPin(signPin);
    if (!manager) {
      setSignSaving(false);
      setSignError("รหัส PIN ผู้จัดการไม่ถูกต้อง (ต้องเป็นผู้จัดการ/แอดมิน)");
      return;
    }

    let receiverStaffName = signTarget.staff_name;
    if (isNegSign && (recSig || receiverPin)) {
      if (!receiverPin) {
        setSignSaving(false);
        setSignError("กรุณากรอกรหัส PIN ของพนักงานผู้รับเงินเพื่อยืนยัน");
        return;
      }
      const { data: recStaff } = await supabase
        .from("staff")
        .select("name")
        .eq("pin", receiverPin)
        .maybeSingle();
      if (!recStaff) {
        setSignSaving(false);
        setSignError("รหัส PIN ของพนักงานผู้รับเงินไม่ถูกต้อง");
        return;
      }
      receiverStaffName = recStaff.name;
    }

    const nowIso = new Date().toISOString();
    const updated: CashHandover = {
      ...signTarget,
      manager_name: manager.name,
      manager_signature: sig,
      manager_signed_at: nowIso,
      ...(isNegSign && recSig
        ? {
            staff_name: receiverStaffName,
            staff_signature: recSig,
            staff_signed_at: nowIso,
          }
        : {}),
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
      target: `ผู้จัดการเซ็น${isNegSign ? "ส่งเงิน" : "รับเงิน"} กะ ${signTarget.shift_staff_name}`,
      details: `ผู้จัดการ ${manager.name} เซ็น${isNegSign ? `ส่งเงินเติมเข้าลิ้นชัก (ผู้รับเงิน: ${receiverStaffName})` : "รับเงิน"}กะ ${signTarget.shift_staff_name} (${fmt(
        Math.abs(signTarget.actual_amount || signTarget.required_amount)
      )})`,
    });
    setSignTarget(null);
    setSignPin("");
    setReceiverPin("");
    setRefreshKey((k) => k + 1);
  };

  const effectiveTransferCardItems =
    dataMode === "prototype" ? PROTOTYPE_TRANSFER_CARD_ITEMS : transferCardItems;

  const isManagerOrAdminLoggedIn =
    currentUser?.role === "admin" || currentUser?.role === "manager" || !currentUser;

  const resolveEditorName = async (): Promise<string | null> => {
    if (editPin.trim()) {
      const mgr = await verifyManagerPin(editPin.trim());
      if (!mgr) {
        setEditError("รหัส PIN ผู้จัดการ/แอดมิน ไม่ถูกต้อง");
        return null;
      }
      return mgr.name;
    }
    if (currentUser?.role === "admin" || currentUser?.role === "manager") {
      return currentUser.name || "ADMIN";
    }
    if (!currentUser) {
      return "ADMIN";
    }
    setEditError("กรุณากรอกรหัส PIN ผู้จัดการหรือแอดมินเพื่อยืนยันการแก้ไข");
    return null;
  };

  const persistAuditEdits = async (newEntries: Record<string, AuditEditEntry>) => {
    const merged = { ...auditEditsMap, ...newEntries };
    setAuditEditsMap(merged);
    await supabase.from("system_settings").upsert(
      {
        key: `audit_report_edits_${businessDateStr}`,
        value: merged,
      },
      { onConflict: "key" }
    );
  };

  const openRowEditModal = (row: AuditLogRowItem) => {
    if (!row.editMeta) return;
    const m = row.editMeta;
    setEditingRow(row);
    setRowEditRoomRate(String(m.roomRate || 0));
    setRowEditExtraLabel(m.extraLabel || "ค่าปรับออกช้า");
    setRowEditExtraAmount(String(m.extraAmount || 0));
    setRowEditCashPaid(String(m.cashPaid || 0));
    setRowEditTransferPaid(String(m.transferPaid || 0));
    setRowEditTransferBank(m.transferBank || "SCB");
    setEditError("");
    setEditPin("");
  };

  const handleSaveRowEdit = async (override?: {
    roomRate?: number;
    extraLabel?: string;
    extraAmount?: number;
    cashPaid?: number;
    transferPaid?: number;
    transferBank?: "SCB" | "KBANK" | "CREDIT_CARD";
  }) => {
    if (!editingRow || !editingRow.editMeta) return;
    setEditError("");
    setEditSaving(true);
    const editorName = await resolveEditorName();
    if (!editorName) {
      setEditSaving(false);
      return;
    }

    const meta = editingRow.editMeta;
    const rawExtraLabelInput =
      override?.extraLabel !== undefined ? override.extraLabel : rowEditExtraLabel;
    const rawExtraAmountInput =
      override?.extraAmount !== undefined ? override.extraAmount : Number(rowEditExtraAmount || 0);
    // หากผู้ใช้ลบชื่อรายการเสริมออกเป็นค่าว่าง หรือใส่ยอดเงินเป็น 0 ให้ถือเป็นการลบรายการค่าเสริมออก (0 ฿)
    const isClearingExtraByEmptyLabel =
      override?.extraAmount === undefined &&
      meta.extraAmount > 0 &&
      String(rawExtraLabelInput || "").trim() === "";
    const newRoomRate = Math.max(0, Number(override?.roomRate ?? (rowEditRoomRate || 0)));
    const newExtraAmount = isClearingExtraByEmptyLabel ? 0 : Math.max(0, Number(rawExtraAmountInput || 0));
    const newExtraLabel =
      newExtraAmount === 0
        ? ""
        : String(rawExtraLabelInput || meta.extraLabel || "บริการเสริม").trim();
    const newCashPaid = Math.max(0, Number(override?.cashPaid ?? (rowEditCashPaid || 0)));
    const newTransferPaid = Math.max(0, Number(override?.transferPaid ?? (rowEditTransferPaid || 0)));
    const newTransferBank = override?.transferBank ?? rowEditTransferBank;

    const targetShift =
      dayShifts.find((s) => s.id === meta.shiftId) ||
      dayShifts[meta.slotIdx] ||
      dayShifts[0] ||
      null;
    const targetShiftId = targetShift?.id || meta.shiftId || "";
    const txTimestamp = targetShift?.start_time
      ? new Date(new Date(targetShift.start_time).getTime() + 60 * 1000).toISOString()
      : atLocalTime(businessDateStr, 12, 0).toISOString();

    try {
      const nowIso = new Date().toISOString();
      const newAuditEntries: Record<string, AuditEditEntry> = {};
      const changeSummaryParts: string[] = [];

      // 1. ค่าห้อง (Room Rate)
      if (newRoomRate !== meta.roomRate && editingRow.kind !== "booking") {
        if (meta.dailyRateId) {
          await supabase
            .from("booking_daily_rates")
            .update({ amount: newRoomRate, is_manual_override: true })
            .eq("id", meta.dailyRateId);
        } else if (newRoomRate > 0) {
          await supabase.from("booking_daily_rates").insert({
            booking_id: meta.bookingId,
            target_date: meta.targetDate,
            amount: newRoomRate,
            is_manual_override: true,
          });
        }
        if (meta.roomChargeTxIds.length > 0) {
          if (newRoomRate > 0) {
            await supabase
              .from("ledger_transactions")
              .update({ amount: newRoomRate })
              .eq("id", meta.roomChargeTxIds[0]);
            if (meta.roomChargeTxIds.length > 1) {
              await supabase
                .from("ledger_transactions")
                .update({ amount: 0, category: "room_charge (Voided)" })
                .in("id", meta.roomChargeTxIds.slice(1));
            }
          } else {
            await supabase
              .from("ledger_transactions")
              .update({ amount: 0, category: "room_charge (Voided)" })
              .in("id", meta.roomChargeTxIds);
          }
        }
        newAuditEntries[`row_${editingRow.id}_roomRate`] = {
          oldDisplay: meta.roomRate.toLocaleString(),
          newDisplay: newRoomRate.toLocaleString(),
          editorName,
          editedAt: nowIso,
        };
        changeSummaryParts.push(`ค่าห้อง ${meta.roomRate.toLocaleString()} -> ${newRoomRate.toLocaleString()} ฿`);
      }

      // 2. บริการเสริม / ค่าปรับออกช้า (Extra Charge) — ใช้ UPDATE เป็น (Voided) แทน DELETE เพื่อไม่ให้ติดสิทธิ์ RLS ของ Supabase
      if ((newExtraAmount !== meta.extraAmount || (newExtraAmount > 0 && newExtraLabel !== meta.extraLabel)) && editingRow.kind !== "booking") {
        const voidCategoryName = `${meta.extraLabel || "ค่าปรับออกช้า"} (Voided)`;
        if (meta.extraTxIds.length > 0) {
          if (newExtraAmount > 0) {
            await supabase
              .from("ledger_transactions")
              .update({
                amount: newExtraAmount,
                category: newExtraLabel || "บริการเสริม",
              })
              .eq("id", meta.extraTxIds[0]);
            if (meta.extraTxIds.length > 1) {
              await supabase
                .from("ledger_transactions")
                .update({ amount: 0, category: voidCategoryName })
                .in("id", meta.extraTxIds.slice(1));
            }
          } else {
            await supabase
              .from("ledger_transactions")
              .update({
                amount: 0,
                category: voidCategoryName,
                notes: `ยกเลิกรายการจากหน้ารายงานการเงินโดย ${editorName} (${nowIso})`,
              })
              .in("id", meta.extraTxIds);
            // ยกเลิกใน booking_daily_extras ด้วยหากมี
            await supabase
              .from("booking_daily_extras")
              .update({ amount: 0, category: voidCategoryName })
              .eq("booking_id", meta.bookingId)
              .eq("target_date", meta.targetDate);
          }
        } else if (newExtraAmount > 0 && targetShiftId) {
          await supabase.from("ledger_transactions").insert({
            shift_id: targetShiftId,
            staff_name: meta.staffName || editorName,
            room_id: meta.roomId,
            booking_id: meta.bookingId,
            transaction_type: "revenue",
            category: newExtraLabel || "ค่าปรับออกช้า",
            amount: newExtraAmount,
            notes: `แก้ไขรายงานการเงินโดย ${editorName} ประจำวันที่ ${businessDateStr}`,
            created_at: txTimestamp,
          });
        }
        if (newExtraAmount !== meta.extraAmount) {
          const oldExtraDisplay =
            newExtraAmount === 0 && meta.extraLabel
              ? `${meta.extraLabel} ${meta.extraAmount.toLocaleString()}`
              : meta.extraAmount.toLocaleString();
          newAuditEntries[`row_${editingRow.id}_extra`] = {
            oldDisplay: oldExtraDisplay,
            newDisplay: newExtraAmount.toLocaleString(),
            editorName,
            editedAt: nowIso,
          };
          changeSummaryParts.push(
            newExtraAmount === 0
              ? `ลบรายการ ${meta.extraLabel || "ค่าเสริม"} ${meta.extraAmount.toLocaleString()} ฿ ออก (0 ฿)`
              : `ค่าเสริม (${newExtraLabel}) ${meta.extraAmount.toLocaleString()} -> ${newExtraAmount.toLocaleString()} ฿`
          );
        }
      }

      // 2.1 รวมเงิน (Total Charge)
      const oldTotalCharge = meta.roomRate + meta.extraAmount;
      const newTotalCharge = newRoomRate + newExtraAmount;
      if (newTotalCharge !== oldTotalCharge && editingRow.kind !== "booking") {
        newAuditEntries[`row_${editingRow.id}_totalCharge`] = {
          oldDisplay: oldTotalCharge.toLocaleString(),
          newDisplay: newTotalCharge.toLocaleString(),
          editorName,
          editedAt: nowIso,
        };
      }

      // 3. เงินสด (Cash Payment)
      if (newCashPaid !== meta.cashPaid) {
        if (meta.cashTxIds.length > 0) {
          if (newCashPaid > 0) {
            await supabase
              .from("ledger_transactions")
              .update({ amount: -Math.abs(newCashPaid) })
              .eq("id", meta.cashTxIds[0]);
            if (meta.cashTxIds.length > 1) {
              await supabase
                .from("ledger_transactions")
                .update({ amount: 0, category: "cash (Voided)" })
                .in("id", meta.cashTxIds.slice(1));
            }
          } else {
            await supabase
              .from("ledger_transactions")
              .update({ amount: 0, category: "cash (Voided)" })
              .in("id", meta.cashTxIds);
          }
        } else if (newCashPaid > 0 && targetShiftId) {
          await supabase.from("ledger_transactions").insert({
            shift_id: targetShiftId,
            staff_name: meta.staffName || editorName,
            room_id: meta.roomId,
            booking_id: meta.bookingId,
            transaction_type: "payment",
            category: "cash",
            amount: -Math.abs(newCashPaid),
            notes: `บันทึกรับชำระเงินสดจากหน้ารายงานการเงินโดย ${editorName}`,
            created_at: txTimestamp,
          });
        }
        const oldCashDisp =
          meta.cashPaid > 0 && meta.keyDepPlaced > 0
            ? `${meta.cashPaid.toLocaleString()}-${meta.keyDepPlaced.toLocaleString()}`
            : meta.cashPaid === 0 && meta.keyDepPlaced > 0
            ? `-${meta.keyDepPlaced.toLocaleString()}`
            : meta.cashPaid > 0
            ? meta.cashPaid.toLocaleString()
            : "0";
        const newCashDisp =
          newCashPaid > 0 && meta.keyDepPlaced > 0
            ? `${newCashPaid.toLocaleString()}-${meta.keyDepPlaced.toLocaleString()}`
            : newCashPaid === 0 && meta.keyDepPlaced > 0
            ? `-${meta.keyDepPlaced.toLocaleString()}`
            : newCashPaid > 0
            ? newCashPaid.toLocaleString()
            : "0";
        newAuditEntries[`row_${editingRow.id}_cash`] = {
          oldDisplay: oldCashDisp,
          newDisplay: newCashDisp,
          editorName,
          editedAt: nowIso,
        };
        changeSummaryParts.push(`เงินสด ${oldCashDisp} -> ${newCashDisp} ฿`);
      }

      // 4. โอน / บัตรเครดิต (Transfer / Credit Card Payment)
      if (newTransferPaid !== meta.transferPaid || (newTransferPaid > 0 && newTransferBank !== meta.transferBank)) {
        const txCat = newTransferBank === "CREDIT_CARD" ? "credit_card" : "transfer";
        const txNote =
          newTransferBank === "CREDIT_CARD"
            ? `ชำระบัตรเครดิต (แก้ไขจากรายงานการเงินโดย ${editorName})`
            : `[BANK:${newTransferBank}] รับโอนเงิน (แก้ไขจากรายงานการเงินโดย ${editorName})`;

        if (meta.transferTxIds.length > 0) {
          if (newTransferPaid > 0) {
            await supabase
              .from("ledger_transactions")
              .update({
                amount: -Math.abs(newTransferPaid),
                category: txCat,
                notes: txNote,
              })
              .eq("id", meta.transferTxIds[0]);
            if (meta.transferTxIds.length > 1) {
              await supabase
                .from("ledger_transactions")
                .update({ amount: 0, category: "transfer (Voided)" })
                .in("id", meta.transferTxIds.slice(1));
            }
          } else {
            await supabase
              .from("ledger_transactions")
              .update({ amount: 0, category: "transfer (Voided)" })
              .in("id", meta.transferTxIds);
          }
        } else if (newTransferPaid > 0 && targetShiftId) {
          await supabase.from("ledger_transactions").insert({
            shift_id: targetShiftId,
            staff_name: meta.staffName || editorName,
            room_id: meta.roomId,
            booking_id: meta.bookingId,
            transaction_type: "payment",
            category: txCat,
            amount: -Math.abs(newTransferPaid),
            notes: txNote,
            created_at: txTimestamp,
          });
        }
        const oldBankPref =
          meta.transferBank === "CREDIT_CARD" ? "Cr" : meta.transferBank === "KBANK" ? "K" : "S";
        const newBankPref =
          newTransferBank === "CREDIT_CARD" ? "Cr" : newTransferBank === "KBANK" ? "K" : "S";
        const oldTransDisp =
          meta.transferPaid > 0 ? `${oldBankPref} ${meta.transferPaid.toLocaleString()}` : "0";
        const newTransDisp =
          newTransferPaid > 0 ? `${newBankPref} ${newTransferPaid.toLocaleString()}` : "0";
        newAuditEntries[`row_${editingRow.id}_transfer`] = {
          oldDisplay: oldTransDisp,
          newDisplay: newTransDisp,
          editorName,
          editedAt: nowIso,
        };
        changeSummaryParts.push(`โอน/บัตร ${oldTransDisp} -> ${newTransDisp} ฿`);
      }

      if (Object.keys(newAuditEntries).length > 0) {
        await persistAuditEdits(newAuditEntries);
        await logActivity({
          category: "billing",
          action: "update",
          staffName: editorName,
          shiftName: meta.staffName,
          roomNo: meta.roomNo,
          target: `แก้ไขรายงานการเงิน ห้อง ${meta.roomNo} (${businessDateStr})`,
          details: `ผู้จัดการ/แอดมิน (${editorName}) แก้ไขรายการห้อง ${meta.roomNo} ในรายงานการเงินวันที่ ${businessDateStr}: ${changeSummaryParts.join(", ")}`,
        });
      }

      setEditingRow(null);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setEditError("บันทึกไม่สำเร็จ: " + (err?.message || String(err)));
    } finally {
      setEditSaving(false);
    }
  };

  const openShiftSummaryEditModal = (target: ShiftSummaryEditTarget) => {
    setEditingShiftSummary(target);
    setShiftEditCarriedIn(String(target.carriedIn || 0));
    setShiftEditCountedDrawer(String(target.countedDrawer || 0));
    setShiftEditCloseSent(String(target.closeSent || 0));
    setShiftEditCarriedOut(String(target.carriedOut || 0));
    setEditError("");
    setEditPin("");
  };

  const handleSaveShiftSummaryEdit = async () => {
    if (!editingShiftSummary || !editingShiftSummary.sh) return;
    setEditError("");
    setEditSaving(true);
    const editorName = await resolveEditorName();
    if (!editorName) {
      setEditSaving(false);
      return;
    }

    const t = editingShiftSummary;
    const sh = t.sh!;
    const newCarriedIn = Number(shiftEditCarriedIn || 0);
    const newCountedDrawer = Number(shiftEditCountedDrawer || 0);
    const newCloseSent = Number(shiftEditCloseSent || 0);
    const newCarriedOut = Math.max(0, Number(shiftEditCarriedOut || 0));

    try {
      const nowIso = new Date().toISOString();
      const newAuditEntries: Record<string, AuditEditEntry> = {};
      const changeParts: string[] = [];

      // คำนวณเก๊ะระบบใหม่หากมีการแก้ยอดยกมาต้นกะ
      const deltaCarriedIn = newCarriedIn - t.carriedIn;
      const newSysDrawer = t.sysDrawer + deltaCarriedIn;
      const newDiff = newCountedDrawer - newSysDrawer;

      await supabase
        .from("shifts")
        .update({
          initial_cash: newCarriedIn,
          expected_cash: newSysDrawer,
          final_cash: newCountedDrawer,
          discrepancy: newDiff,
        })
        .eq("id", sh.id);

      if (t.closeHandoverObj) {
        const updatedHandover: CashHandover = {
          ...t.closeHandoverObj,
          drawer_cash: newSysDrawer,
          required_amount: newCloseSent,
          actual_amount: newCloseSent,
          carried_to_next_shift: newCarriedOut,
        };
        await saveHandover(updatedHandover);
      } else if (sh.status === "closed") {
        const newHandover: CashHandover = {
          id: `${businessDateStr}_${Date.now()}_edit_${t.slotIdx}`,
          kind: "shift_close",
          business_date: businessDateStr,
          shift_id: sh.id,
          shift_staff_name: t.staffName,
          shift_location: sh.shift_location || selectedLocation || "ซอย1",
          drawer_cash: newSysDrawer,
          key_reserve: 0,
          required_amount: newCloseSent,
          actual_amount: newCloseSent,
          carried_to_next_shift: newCarriedOut,
          staff_name: t.staffName,
          staff_signature: sh.signature_data || null,
          staff_signed_at: sh.end_time || nowIso,
          manager_name: editorName,
          manager_signature: null,
          manager_signed_at: nowIso,
          created_at: sh.end_time || nowIso,
        };
        await saveHandover(newHandover);
      }

      if (newCarriedIn !== t.carriedIn) {
        newAuditEntries[`shift_slot_${t.slotIdx}_row6`] = {
          oldDisplay: `(ยกมา ${t.carriedIn.toLocaleString()})`,
          newDisplay: `(ยกมา ${newCarriedIn.toLocaleString()})`,
          editorName,
          editedAt: nowIso,
        };
        changeParts.push(`ข้อ 6 ยกมาต้นกะ ${t.carriedIn.toLocaleString()} -> ${newCarriedIn.toLocaleString()} ฿`);
      }
      if (newCountedDrawer !== t.countedDrawer) {
        newAuditEntries[`shift_slot_${t.slotIdx}_row11`] = {
          oldDisplay: `${t.countedDrawer.toLocaleString()}`,
          newDisplay: `${newCountedDrawer.toLocaleString()}`,
          editorName,
          editedAt: nowIso,
        };
        changeParts.push(`ข้อ 11 นับจริงในเก๊ะ ${t.countedDrawer.toLocaleString()} -> ${newCountedDrawer.toLocaleString()} ฿`);
      }
      if (newCloseSent !== t.closeSent) {
        const oldDisp12 =
          t.closeSent > 0
            ? `-${t.closeSent.toLocaleString()}`
            : t.closeSent < 0
            ? `+${Math.abs(t.closeSent).toLocaleString()}`
            : "0";
        const newDisp12 =
          newCloseSent > 0
            ? `-${newCloseSent.toLocaleString()}`
            : newCloseSent < 0
            ? `+${Math.abs(newCloseSent).toLocaleString()}`
            : "0";
        newAuditEntries[`shift_slot_${t.slotIdx}_row12`] = {
          oldDisplay: oldDisp12,
          newDisplay: newDisp12,
          editorName,
          editedAt: nowIso,
        };
        changeParts.push(`ข้อ 12 ส่งเงินปิดกะ ${oldDisp12} -> ${newDisp12} ฿`);
      }
      if (newCarriedOut !== t.carriedOut) {
        newAuditEntries[`shift_slot_${t.slotIdx}_row13`] = {
          oldDisplay: `${t.carriedOut.toLocaleString()}`,
          newDisplay: `${newCarriedOut.toLocaleString()}`,
          editorName,
          editedAt: nowIso,
        };
        changeParts.push(`ข้อ 13 ยกไปกะถัดไป ${t.carriedOut.toLocaleString()} -> ${newCarriedOut.toLocaleString()} ฿`);
      }

      if (Object.keys(newAuditEntries).length > 0) {
        await persistAuditEdits(newAuditEntries);
        await logActivity({
          category: "shift",
          action: "update",
          staffName: editorName,
          shiftName: t.staffName,
          target: `แก้ไขสรุปการเงินกะ ${t.staffName} (${businessDateStr})`,
          details: `ผู้จัดการ/แอดมิน (${editorName}) แก้ไขสรุปกะ ${t.staffName} วันที่ ${businessDateStr}: ${changeParts.join(", ")}`,
        });
      }

      setEditingShiftSummary(null);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setEditError("บันทึกไม่สำเร็จ: " + (err?.message || String(err)));
    } finally {
      setEditSaving(false);
    }
  };

  const openManagerBoxEditModal = (target: ManagerBoxEditTarget) => {
    setEditingManagerBox(target);
    setMgrEditBrought(String(target.mgrBrought || 0));
    setMgrEditOutExp(String(target.mgrOutExp || 0));
    setMgrEditBankDep(String(target.mgrBankDep || 0));
    setEditError("");
    setEditPin("");
  };

  const handleSaveManagerBoxEdit = async () => {
    if (!editingManagerBox) return;
    setEditError("");
    setEditSaving(true);
    const editorName = await resolveEditorName();
    if (!editorName) {
      setEditSaving(false);
      return;
    }

    const t = editingManagerBox;
    const newBrought = Number(mgrEditBrought || 0);
    const newOutExp = Math.max(0, Number(mgrEditOutExp || 0));
    const newBankDep = Math.max(0, Number(mgrEditBankDep || 0));

    try {
      const nowIso = new Date().toISOString();
      const newAuditEntries: Record<string, AuditEditEntry> = {};
      const changeParts: string[] = [];

      await supabase.from("system_settings").upsert(
        {
          key: `mgr_cash_box_${selectedLocation}_${businessDateStr}`,
          value: {
            broughtOverride: newBrought,
            outExpOverride: newOutExp,
            bankDeposit: newBankDep,
            updatedBy: editorName,
            updatedAt: nowIso,
          },
        },
        { onConflict: "key" }
      );

      if (newBrought !== t.mgrBrought) {
        newAuditEntries[`mgr_${selectedLocation}_box1`] = {
          oldDisplay: `${t.mgrBrought.toLocaleString()}`,
          newDisplay: `${newBrought.toLocaleString()}`,
          editorName,
          editedAt: nowIso,
        };
        changeParts.push(`1. ยกมา ${t.mgrBrought.toLocaleString()} -> ${newBrought.toLocaleString()} ฿`);
      }
      if (newOutExp !== t.mgrOutExp) {
        newAuditEntries[`mgr_${selectedLocation}_box3`] = {
          oldDisplay: `-${t.mgrOutExp.toLocaleString()}`,
          newDisplay: `-${newOutExp.toLocaleString()}`,
          editorName,
          editedAt: nowIso,
        };
        changeParts.push(`3. จ่ายนอกกะ -${t.mgrOutExp.toLocaleString()} -> -${newOutExp.toLocaleString()} ฿`);
      }
      if (newBankDep !== t.mgrBankDep) {
        newAuditEntries[`mgr_${selectedLocation}_box4`] = {
          oldDisplay: `-${t.mgrBankDep.toLocaleString()}`,
          newDisplay: `-${newBankDep.toLocaleString()}`,
          editorName,
          editedAt: nowIso,
        };
        changeParts.push(`4. ฝากเงิน -${t.mgrBankDep.toLocaleString()} -> -${newBankDep.toLocaleString()} ฿`);
      }

      if (Object.keys(newAuditEntries).length > 0) {
        await persistAuditEdits(newAuditEntries);
        await logActivity({
          category: "billing",
          action: "update",
          staffName: editorName,
          target: `แก้ไขกล่องเงินสดสะสมผู้จัดการ (${selectedLocation} • ${businessDateStr})`,
          details: `ผู้จัดการ/แอดมิน (${editorName}) แก้ไขกล่องเงินสดสะสมผู้จัดการ (${selectedLocation}) วันที่ ${businessDateStr}: ${changeParts.join(", ")}`,
        });
      }

      setEditingManagerBox(null);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setEditError("บันทึกไม่สำเร็จ: " + (err?.message || String(err)));
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div id="daily-report-root" className="space-y-4 print:space-y-0 print:m-0">
      <FinancialReportType2View
        selectedLocation={selectedLocation}
        onSelectLocation={setSelectedLocation}
        availableLocations={availableLocations}
        reportsByLocation={reportsByLocation}
        reportDateLabel={reportDateLabel}
        activeReport={activeReport}
        isDayClosed={isDayClosed}
        dayShifts={dayShifts}
        handovers={handovers}
        dayExpenses={dayExpenses}
        shiftDrawers={shiftDrawers}
        transferCardCount={effectiveTransferCardItems.length}
        dataMode={dataMode}
        onChangeDataMode={setDataMode}
        onOpenTransferModal={() => setShowTransferCardModal(true)}
        onRequestManagerSign={(h) => {
          setSignTarget(h);
          setSignPin("");
          setSignError("");
        }}
        canEditReport={true}
        auditEdits={auditEditsMap}
        onClickEditRow={openRowEditModal}
        onClickEditShiftSummary={openShiftSummaryEditModal}
        onClickEditManagerBox={openManagerBoxEditModal}
      />

      {/* ===================== Modal 1: แก้ไขรายการแถวห้องพักในตาราง 15 คอลัมน์โดยตรง ===================== */}
      {editingRow && editingRow.editMeta && (() => {
        const meta = editingRow.editMeta;
        const currRoomRate = Number(rowEditRoomRate || 0);
        const currExtraAmt = Number(rowEditExtraAmount || 0);
        const currTotalCharge = currRoomRate + currExtraAmt;
        const currCashPaid = Number(rowEditCashPaid || 0);
        const currCashNet = currCashPaid - meta.keyDepPlaced;
        const currTransPaid = Number(rowEditTransferPaid || 0);
        const currNetPaidForRoom = Math.max(0, currCashNet) + currTransPaid;
        const unpaidInRow = Math.max(0, currTotalCharge - currNetPaidForRoom);
        const totalNetPaid = Math.max(0, currCashNet) + currTransPaid;

        return (
          <div className="fixed inset-0 z-[130] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[94vh] overflow-y-auto shadow-2xl border border-slate-200">
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm sm:text-base flex items-center gap-1.5">
                    ✏️ แก้ไขรายการห้อง <span className="text-amber-300 text-base sm:text-lg">{meta.roomNo}</span> ในรายงานการเงิน
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    พนง.กะ: <b>{meta.staffName}</b> • วันที่รายงาน: <b>{businessDateStr}</b>
                    {meta.keyDepPlaced > 0 ? ` • มีมัดจำกุญแจในแถวนี้ ${meta.keyDepPlaced.toLocaleString()} ฿` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="text-slate-400 hover:text-white text-lg font-black px-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-3.5 text-xs">
                {editError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 p-2.5 rounded-xl font-bold">
                    {editError}
                  </div>
                )}

                {/* ปุ่มลัด 1-Click ด้านบนสุด: ลบรายการค่าเสริม / ค่าปรับออกช้า ที่เกิดจากความเข้าใจผิด (ตัดยอดออกจากรายงานและระบบบัญชีทันที พร้อมแสดงรอยขีดฆ่าสีจาง) */}
                {meta.extraAmount > 0 && editingRow.kind !== "booking" && (
                  <div className="bg-amber-50 border-2 border-rose-500 rounded-xl p-3 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-slate-900 text-xs">
                        🗑️ พบรายการค่าเสริม/ค่าปรับ: <b className="text-rose-700">&quot;{meta.extraLabel || "ค่าปรับออกช้า"}&quot; ({meta.extraAmount.toLocaleString()} ฿)</b>
                      </span>
                      <span className="text-[10px] font-bold text-white bg-rose-600 px-2 py-0.5 rounded-full">
                        กดลบได้ในคลิกเดียว
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={editSaving}
                      onClick={() =>
                        handleSaveRowEdit({
                          extraAmount: 0,
                          extraLabel: "",
                        })
                      }
                      className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      🗑️ กดปุ่มนี้เพื่อลบ &quot;{meta.extraLabel || "ค่าปรับออกช้า"}&quot; ({meta.extraAmount.toLocaleString()} ฿) ออกจากรายงาน &amp; บัญชีทันที
                    </button>
                  </div>
                )}

                {/* ปุ่มลัด 1-Click: กรณีมียอดค้างชำระในแถวนี้ (เช่น ห้อง 27 ค่าปรับออกช้า 150 ฿ ยังไม่ได้ลงรับชำระ) */}
                {unpaidInRow > 0 && editingRow.kind !== "booking" && (
                  <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-rose-900 text-xs">
                        ⚡ พบยอดค้างชำระในแถวนี้: <b className="text-rose-700 text-sm">{unpaidInRow.toLocaleString()} ฿</b>
                      </span>
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                        กดปุ่มเดียวบันทึกทันที
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        disabled={editSaving}
                        onClick={() =>
                          handleSaveRowEdit({
                            cashPaid: currCashPaid + unpaidInRow,
                          })
                        }
                        className="py-2 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] shadow-xs cursor-pointer"
                      >
                        💵 รับเงินสด +{unpaidInRow.toLocaleString()}
                      </button>
                      <button
                        type="button"
                        disabled={editSaving}
                        onClick={() =>
                          handleSaveRowEdit({
                            transferPaid: currTransPaid + unpaidInRow,
                            transferBank: "SCB",
                          })
                        }
                        className="py-2 px-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-black text-[11px] shadow-xs cursor-pointer"
                      >
                        🟣 รับโอน S +{unpaidInRow.toLocaleString()}
                      </button>
                      <button
                        type="button"
                        disabled={editSaving}
                        onClick={() =>
                          handleSaveRowEdit({
                            transferPaid: currTransPaid + unpaidInRow,
                            transferBank: "KBANK",
                          })
                        }
                        className="py-2 px-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-black text-[11px] shadow-xs cursor-pointer"
                      >
                        🟢 รับโอน K +{unpaidInRow.toLocaleString()}
                      </button>
                    </div>
                  </div>
                )}

                {/* ปุ่มลัด 1-Click: สลับช่องทางชำระเงินด่วน (เงินสด <-> โอน S / K / บัตร Cr) */}
                {(totalNetPaid > 0 || currTotalCharge > 0) && (
                  <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-2.5 space-y-1.5">
                    <div className="font-bold text-indigo-950 text-[11px]">
                      🔄 สลับช่องทางรับชำระทั้งก้อน ({(totalNetPaid || currTotalCharge).toLocaleString()} ฿):
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const targetAmt = totalNetPaid || currTotalCharge;
                          setRowEditCashPaid(String(targetAmt + meta.keyDepPlaced));
                          setRowEditTransferPaid("0");
                        }}
                        className="py-1.5 px-1.5 rounded-lg bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-[10.5px] cursor-pointer"
                      >
                        💵 เงินสดทั้งหมด
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetAmt = totalNetPaid || currTotalCharge;
                          setRowEditCashPaid("0");
                          setRowEditTransferPaid(String(targetAmt));
                          setRowEditTransferBank("SCB");
                        }}
                        className="py-1.5 px-1.5 rounded-lg bg-white hover:bg-purple-50 border border-purple-300 text-purple-900 font-bold text-[10.5px] cursor-pointer"
                      >
                        🟣 โอน S (SCB)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetAmt = totalNetPaid || currTotalCharge;
                          setRowEditCashPaid("0");
                          setRowEditTransferPaid(String(targetAmt));
                          setRowEditTransferBank("KBANK");
                        }}
                        className="py-1.5 px-1.5 rounded-lg bg-white hover:bg-emerald-50 border border-teal-300 text-teal-900 font-bold text-[10.5px] cursor-pointer"
                      >
                        🟢 โอน K (KBANK)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetAmt = totalNetPaid || currTotalCharge;
                          setRowEditCashPaid("0");
                          setRowEditTransferPaid(String(targetAmt));
                          setRowEditTransferBank("CREDIT_CARD");
                        }}
                        className="py-1.5 px-1.5 rounded-lg bg-white hover:bg-blue-50 border border-blue-300 text-blue-900 font-bold text-[10.5px] cursor-pointer"
                      >
                        💳 บัตรเครดิต Cr
                      </button>
                    </div>
                  </div>
                )}

                {editingRow.kind !== "booking" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">ค่าห้อง (฿)</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={rowEditRoomRate}
                        onChange={(e) => setRowEditRoomRate(e.target.value)}
                        className="w-full p-2 rounded-xl border border-slate-300 font-black text-slate-900 text-sm focus:border-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">ชื่อรายการเสริม/ค่าปรับ</label>
                      <input
                        type="text"
                        value={rowEditExtraLabel}
                        onChange={(e) => setRowEditExtraLabel(e.target.value)}
                        placeholder="เช่น ค่าปรับออกช้า"
                        className="w-full p-2 rounded-xl border border-slate-300 font-bold text-slate-900 text-sm focus:border-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-bold text-slate-700">ยอดค่าเสริม (฿)</label>
                        {Number(rowEditExtraAmount || 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setRowEditExtraAmount("0");
                              setRowEditExtraLabel("");
                            }}
                            className="text-[10.5px] font-black text-white bg-rose-600 hover:bg-rose-700 px-2 py-0.5 rounded-md cursor-pointer flex items-center gap-0.5"
                          >
                            🗑️ ลบยอดนี้
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={rowEditExtraAmount}
                        onChange={(e) => setRowEditExtraAmount(e.target.value)}
                        className="w-full p-2 rounded-xl border border-slate-300 font-black text-indigo-900 text-sm focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 border-t border-slate-200">
                  <div>
                    <label className="block font-bold text-emerald-900 mb-1">
                      💵 เงินสดรับรวม {meta.keyDepPlaced > 0 ? `(รวมมัดจำ ${meta.keyDepPlaced})` : "(฿)"}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={rowEditCashPaid}
                      onChange={(e) => setRowEditCashPaid(e.target.value)}
                      className="w-full p-2 rounded-xl border border-emerald-300 bg-emerald-50/40 font-black text-emerald-950 text-sm focus:border-emerald-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-900 mb-1">🏦 ยอดโอน / บัตร (฿)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={rowEditTransferPaid}
                      onChange={(e) => setRowEditTransferPaid(e.target.value)}
                      className="w-full p-2 rounded-xl border border-blue-300 bg-blue-50/40 font-black text-blue-950 text-sm focus:border-blue-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-900 mb-1">ธนาคาร / บัตร</label>
                    <select
                      value={rowEditTransferBank}
                      onChange={(e) => setRowEditTransferBank(e.target.value as "SCB" | "KBANK" | "CREDIT_CARD")}
                      className="w-full p-2 rounded-xl border border-blue-300 bg-white font-black text-slate-900 text-sm focus:border-blue-600 outline-none"
                    >
                      <option value="SCB">S = SCB (ไทยพาณิชย์)</option>
                      <option value="KBANK">K = KBANK (กสิกรไทย)</option>
                      <option value="CREDIT_CARD">Cr = บัตรเครดิต</option>
                    </select>
                  </div>
                </div>

                {!isManagerOrAdminLoggedIn && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ / แอดมิน</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••"
                      className="w-full text-center tracking-[0.4em] text-base p-2 rounded-xl border border-slate-300"
                    />
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                  <span>
                    ผู้บันทึกการแก้ไข: <b className="text-slate-900">{currentUser?.name || "ADMIN"}</b>
                  </span>
                  <span>แสดงรอยขีดฆ่ายอดเดิม + ({currentUser?.name || "ADMIN"}) บนรายงานอัตโนมัติ</span>
                </div>
              </div>

              <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={() => handleSaveRowEdit()}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow cursor-pointer disabled:opacity-50"
                >
                  {editSaving ? "กำลังบันทึก..." : "💾 บันทึกการแก้ไขทันที"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===================== Modal 2: แก้ไขช่องสรุปการเงินกะ (ข้อ 6, 11, 12, 13) ===================== */}
      {editingShiftSummary && (() => {
        const t = editingShiftSummary;
        const currCarriedIn = Number(shiftEditCarriedIn || 0);
        const currSysDrawer = t.sysDrawer + (currCarriedIn - t.carriedIn);
        const currCounted = Number(shiftEditCountedDrawer || 0);
        const currDiff = currCounted - currSysDrawer;

        return (
          <div className="fixed inset-0 z-[130] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[94vh] overflow-y-auto shadow-2xl border border-slate-200">
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm sm:text-base">
                    ✏️ แก้ไขสรุปการเงินกะ ({t.staffName})
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    ช่วงเวลา: {t.timeRange} • วันที่ {businessDateStr}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingShiftSummary(null)}
                  className="text-slate-400 hover:text-white text-lg font-black px-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-3 text-xs">
                {editError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 p-2.5 rounded-xl font-bold">
                    {editError}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-800">6. เงินสดยกมาต้นกะ (฿)</label>
                    <button
                      type="button"
                      onClick={() => setShiftEditCarriedIn("0")}
                      className="text-[10.5px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded cursor-pointer"
                    >
                      รีเซ็ตเป็น 0 ฿
                    </button>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={shiftEditCarriedIn}
                    onChange={(e) => setShiftEditCarriedIn(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-300 font-black text-slate-900 text-sm"
                  />
                </div>

                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="font-bold text-slate-700">10. เงินสดในเก๊ะตามระบบ (คำนวณอัตโนมัติ):</span>
                  <b className="text-sm font-black text-slate-900">{currSysDrawer.toLocaleString()} ฿</b>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-800">11. เงินสดตรวจนับจริงในเก๊ะ (฿)</label>
                    <button
                      type="button"
                      onClick={() => setShiftEditCountedDrawer(String(currSysDrawer))}
                      className="text-[10.5px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded cursor-pointer"
                    >
                      ⚡ ให้ตรงตามระบบ ({currSysDrawer.toLocaleString()} ฿)
                    </button>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={shiftEditCountedDrawer}
                    onChange={(e) => setShiftEditCountedDrawer(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-300 font-black text-slate-900 text-sm"
                  />
                  <div className="mt-1 text-[11px] font-bold">
                    สถานะเงินขาด/เกิน:{" "}
                    <span
                      className={
                        currDiff < 0
                          ? "text-rose-700"
                          : currDiff > 0
                          ? "text-emerald-700"
                          : "text-slate-600"
                      }
                    >
                      {currDiff < 0
                        ? `ขาด -${Math.abs(currDiff).toLocaleString()} ฿`
                        : currDiff > 0
                        ? `เกิน +${currDiff.toLocaleString()} ฿`
                        : "ตรงตามระบบ (0 ฿)"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-200">
                  <div>
                    <label className="block font-bold text-rose-900 mb-1">
                      12. ส่งเงินปิดกะ (+เก็บ / -เบิก)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={shiftEditCloseSent}
                      onChange={(e) => setShiftEditCloseSent(e.target.value)}
                      className="w-full p-2 rounded-xl border border-rose-300 bg-rose-50/40 font-black text-rose-950 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-900 mb-1">
                      13. เงินทอนส่งมอบยกไป (฿)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={shiftEditCarriedOut}
                      onChange={(e) => setShiftEditCarriedOut(e.target.value)}
                      className="w-full p-2 rounded-xl border border-blue-300 bg-blue-50/40 font-black text-blue-950 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShiftEditCloseSent(String(currCounted));
                      setShiftEditCarriedOut("0");
                    }}
                    className="py-1.5 px-2 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-950 font-bold text-[11px] cursor-pointer"
                  >
                    📥 เก็บส่งผู้จัดการทั้งหมด (ยกไป = 0)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShiftEditCloseSent("0");
                      setShiftEditCarriedOut(String(Math.max(0, currCounted)));
                    }}
                    className="py-1.5 px-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-950 font-bold text-[11px] cursor-pointer"
                  >
                    ➡️ ส่งต่อกะถัดไปทั้งหมด (ส่ง = 0)
                  </button>
                </div>

                {!isManagerOrAdminLoggedIn && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ / แอดมิน</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••"
                      className="w-full text-center tracking-[0.4em] text-base p-2 rounded-xl border border-slate-300"
                    />
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingShiftSummary(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={handleSaveShiftSummaryEdit}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow cursor-pointer disabled:opacity-50"
                >
                  {editSaving ? "กำลังบันทึก..." : "💾 บันทึกสรุปกะ"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===================== Modal 3: แก้ไขกล่องเงินสดสะสมผู้จัดการ (กล่อง 1, 3, 4) ===================== */}
      {editingManagerBox && (() => {
        const t = editingManagerBox;
        const currBrought = Number(mgrEditBrought || 0);
        const currOutExp = Math.max(0, Number(mgrEditOutExp || 0));
        const currBankDep = Math.max(0, Number(mgrEditBankDep || 0));
        const currCarried = currBrought + t.mgrNetShifts - currOutExp - currBankDep;

        return (
          <div className="fixed inset-0 z-[130] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[94vh] overflow-y-auto shadow-2xl border border-slate-200">
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm sm:text-base">
                    ✏️ แก้ไขกล่องเงินสดสะสมผู้จัดการ ({selectedLocation})
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    วันที่รายงาน: {businessDateStr} • อัปเดตยอดยกไปวันถัดไปอัตโนมัติ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingManagerBox(null)}
                  className="text-slate-400 hover:text-white text-lg font-black px-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-3 text-xs">
                {editError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 p-2.5 rounded-xl font-bold">
                    {editError}
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">1. ยกมา (เงินสดสะสมผู้จัดการยกมา) (฿)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={mgrEditBrought}
                    onChange={(e) => setMgrEditBrought(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-300 font-black text-slate-900 text-sm"
                  />
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="font-bold text-emerald-950">2. รับสุทธิจากกะวันนี้:</span>
                  <b className="text-sm font-black text-emerald-700">+{t.mgrNetShifts.toLocaleString()} ฿</b>
                </div>

                <div>
                  <label className="block font-bold text-rose-900 mb-1">3. จ่ายนอกกะ (฿)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={mgrEditOutExp}
                    onChange={(e) => setMgrEditOutExp(e.target.value)}
                    className="w-full p-2 rounded-xl border border-rose-300 bg-rose-50/40 font-black text-rose-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-bold text-blue-900 mb-1">4. ฝากเงินธนาคาร (฿)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={mgrEditBankDep}
                    onChange={(e) => setMgrEditBankDep(e.target.value)}
                    className="w-full p-2 rounded-xl border border-blue-300 bg-blue-50/40 font-black text-blue-900 text-sm"
                  />
                </div>

                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="font-black text-amber-950">5. ยกไปวันถัดไป (คำนวณอัตโนมัติ):</span>
                  <b className="text-base font-black text-amber-900">{currCarried.toLocaleString()} ฿</b>
                </div>

                {!isManagerOrAdminLoggedIn && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ / แอดมิน</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••"
                      className="w-full text-center tracking-[0.4em] text-base p-2 rounded-xl border border-slate-300"
                    />
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingManagerBox(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={handleSaveManagerBoxEdit}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow cursor-pointer disabled:opacity-50"
                >
                  {editSaving ? "กำลังบันทึก..." : "💾 บันทึกกล่องผู้จัดการ"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* หน้าต่างผู้จัดการเซ็นรับ/ส่งเงิน */}
      {signTarget && (() => {
        const isNegModal = (signTarget.kind === "mid_shift" ? signTarget.actual_amount : signTarget.required_amount) < 0;
        return (
          <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[95vh] overflow-y-auto shadow-2xl">
              <div className={`px-5 py-3.5 text-white ${isNegModal ? "bg-rose-600" : "bg-amber-500"}`}>
                <h3 className="font-black text-base">
                  ✍️ {isNegModal ? "ผู้จัดการเซ็นส่งเงิน & พนักงานเซ็นรับเงิน" : "ผู้จัดการเซ็นรับเงิน"}
                </h3>
                <p className="text-xs opacity-90 mt-0.5">
                  กะ {signTarget.shift_staff_name} • {isNegModal ? "ยอดเติมเงินเข้าลิ้นชัก" : "ยอดส่งจริง"}{" "}
                  <b>{fmt(Math.abs(signTarget.actual_amount || signTarget.required_amount))}</b>
                </p>
              </div>
              <div className="p-4 space-y-3">
                {signError && <div className="bg-red-50 text-red-600 text-xs p-2.5 rounded-lg font-bold">{signError}</div>}
                <SignaturePad
                  ref={managerSigRef}
                  label={isNegModal ? "1. ลายเซ็นผู้จัดการ (ผู้ส่งเงินเติมเข้าลิ้นชัก)" : "ลายเซ็นผู้จัดการ (ผู้รับเงิน)"}
                />
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={signPin}
                    onChange={(e) => setSignPin(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-center tracking-[0.5em] text-lg p-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none"
                    placeholder="••••"
                  />
                </div>

                {isNegModal && (
                  <div className="pt-2 border-t border-slate-200 space-y-2.5">
                    <SignaturePad
                      ref={receiverSigRef}
                      label={`2. ลายเซ็นพนักงานผู้รับผิดชอบกะ (ผู้รับเงินเข้าลิ้นชัก${signTarget.staff_signature ? " — เซ็นทับเพื่ออัปเดตผู้รับได้" : ""})`}
                    />
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        รหัส PIN พนักงานผู้รับเงิน {signTarget.staff_signature ? `(เว้นว่างได้หาก ${signTarget.staff_name} เซ็นรับไว้แล้ว)` : ""}
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={receiverPin}
                        onChange={(e) => setReceiverPin(e.target.value.replace(/\D/g, ""))}
                        className="w-full text-center tracking-[0.5em] text-lg p-2.5 rounded-xl border border-slate-200 focus:border-rose-500 outline-none"
                        placeholder="••••"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSignTarget(null);
                    setReceiverPin("");
                  }}
                  className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleManagerSign}
                  disabled={signSaving || !signPin}
                  className={`flex-1 py-3 text-white font-black rounded-xl disabled:opacity-50 ${
                    isNegModal ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-500 hover:bg-amber-600"
                  }`}
                >
                  {signSaving ? "กำลังบันทึก..." : "ยืนยันลายเซ็น"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {viewPhoto && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={() => setViewPhoto(null)}>
          <img src={viewPhoto} alt="bill" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}

      {/* หน้าต่างใบตรวจยอดเงินโอน & บัตรเครดิต (ฝ่ายบัญชี) + พิมพ์กระดาษ A4 อัจฉริยะ */}
      <TransferCardReportModal
        isOpen={showTransferCardModal}
        onClose={() => setShowTransferCardModal(false)}
        businessDate={reportDateLabel || businessDateStr}
        windowLabel={windowLabelStr}
        items={effectiveTransferCardItems}
        locations={availableLocations}
        bankAccounts={bankAccounts}
      />
    </div>
  );
}