"use client";

import React, { useState, useEffect, useRef } from "react";
import { Shift } from "@/contexts/ShiftContext";
import { CashHandover, ShiftDrawer } from "@/lib/cashHandover";

export type AuditEditEntry = {
  key?: string;
  oldDisplay: string;
  newDisplay: string;
  editorName: string;
  editedAt: string;
  note?: string;
};

export type RowEditMeta = {
  bookingId: string;
  roomId: string;
  roomNo: string;
  guestName: string;
  slotIdx: 0 | 1 | 2;
  shiftId: string | null;
  staffName: string;
  dailyRateId: string | null;
  targetDate: string;
  roomRate: number;
  extraLabel: string;
  extraAmount: number;
  cashPaid: number;
  keyDepPlaced: number;
  transferPaid: number;
  transferBank: "SCB" | "KBANK" | "CREDIT_CARD";
  cashTxIds: string[];
  transferTxIds: string[];
  extraTxIds: string[];
  roomChargeTxIds: string[];
};

export type AuditLogRowItem = {
  id: string;
  kind: "checkin" | "anomaly" | "booking";
  rowNo: string;
  checkInLabel: React.ReactNode;
  roomNo: string;
  staffName: string;
  // For checkin / anomaly rows (5 charge columns)
  roomRate?: number | null;
  isShortStay?: boolean;
  adjust?: number | null;
  adjustBy?: string | null;
  extraLabel?: string | null;
  extraAmount?: number | null;
  minibarAmount?: number | null;
  totalCharge?: number | null;
  // For booking rows (merged colSpan=5 string)
  bookingRateSummary?: React.ReactNode;
  // Payments
  cashDisplay?: string | null;
  cashNegative?: boolean;
  cashHighlight?: boolean;
  transferCardDisplay?: string | null;
  transferCardColor?: "purple" | "emerald" | "blue" | "slate";
  // Credits
  reservationCreditDisplay?: string | null;
  reservationCreditPositive?: boolean;
  advanceCreditDisplay?: string | null;
  advanceCreditPositive?: boolean;
  // Electricity usage / note
  powerWindowDisplay?: string | null;
  isDebtCollection?: boolean;
  editMeta?: RowEditMeta;
};

export type ShiftSectionData = {
  shiftIndex: 1 | 2 | 3;
  icon: string;
  summaryTitle: string;
  rows: AuditLogRowItem[];
  totals: {
    roomRate: number;
    adjust: number;
    extra: number;
    minibar: number;
    totalCharge: number;
    cash: number;
    transferCard: number;
    reservationCredit: number;
    advanceCredit: number;
    countSummaryText: string;
  };
};

type BalanceBox = {
  broughtForward: number;
  addedToday: number;
  usedToday: number;
  carriedForward?: number;
  end?: number;
};

export type LocationReportSnapshot = {
  location?: string;
  isDayClosed?: boolean;
  roomTargetTotal?: number;
  roomTargetOvernight?: number;
  roomTargetShortStay?: number;
  earlyLateTotal?: number;
  upsellTotal?: number;
  roomDiscountTotal?: number;
  addonRevenue?: number;
  minibarRevenue?: number;
  fineRevenue?: number;
  otherRevenue?: number;
  voidedRevenue?: number;
  payCash?: number;
  payTransferTotal?: number;
  payTransferByBank?: Record<string, number>;
  payCredit?: number;
  payVoidRefund?: number;
  totalExpense?: number;
  advanceBox?: BalanceBox;
  reservationBox?: BalanceBox;
  keyDepositBox?: {
    broughtForward?: number;
    placedToday?: number;
    refundedToday?: number;
    forfeitedToday?: number;
    activeHeldTotal?: number;
  };
  receivableBox?: { start?: number; end?: number };
  dayShifts?: Shift[];
  handovers?: CashHandover[];
  dayExpenses?: any[];
  liveReserve?: { total?: number };
  liveRequiredTotal?: number;
  liveShiftSections?: ShiftSectionData[];
  mgrBroughtForward?: number;
  mgrOutExpenseOverride?: number | null;
  mgrBankDeposit?: number;
};

export type ShiftSummaryEditTarget = {
  slotIdx: 0 | 1 | 2;
  sh?: Shift;
  staffName: string;
  timeRange: string;
  carriedIn: number;
  sysDrawer: number;
  countedDrawer: number;
  closeSent: number;
  carriedOut: number;
  closeHandoverObj: CashHandover | null;
};

export type ManagerBoxEditTarget = {
  boxType: "box1" | "box3" | "box4";
  mgrBrought: number;
  mgrNetShifts: number;
  mgrOutExp: number;
  mgrBankDep: number;
  mgrCarried: number;
};

type Props = {
  selectedLocation: string;
  onSelectLocation: (loc: string) => void;
  availableLocations: string[];
  reportsByLocation: Record<string, LocationReportSnapshot>;
  reportDateLabel: string;
  activeReport: LocationReportSnapshot;
  isDayClosed: boolean;
  dayShifts: Shift[];
  handovers: CashHandover[];
  dayExpenses: any[];
  shiftDrawers: Record<string, ShiftDrawer>;
  transferCardCount: number;
  dataMode: "prototype" | "live";
  onChangeDataMode: (mode: "prototype" | "live") => void;
  onOpenTransferModal: () => void;
  onRequestManagerSign?: (handover: CashHandover) => void;
  canEditReport?: boolean;
  auditEdits?: Record<string, AuditEditEntry>;
  onClickEditRow?: (row: AuditLogRowItem) => void;
  onClickEditShiftSummary?: (target: ShiftSummaryEditTarget) => void;
  onClickEditManagerBox?: (target: ManagerBoxEditTarget) => void;
};

// ข้อมูลต้นแบบ 3 กะ (ตรงตามไฟล์ PDF ฉบับสมบูรณ์ 100%)
const PROTOTYPE_SHIFT_SECTIONS: ShiftSectionData[] = [
  {
    shiftIndex: 1,
    icon: "🌅",
    summaryTitle: "รวมกะที่ 1 (07:00 – 15:00 น.):",
    rows: [
      {
        id: "p-1",
        kind: "checkin",
        rowNo: "1",
        checkInLabel: (
          <>
            08/11 14:00 <span className="font-bold text-indigo-700">(3/3)</span>
          </>
        ),
        roomNo: "101",
        staffName: "เมย์",
        roomRate: 600,
        totalCharge: 600,
        advanceCreditDisplay: "-600",
        advanceCreditPositive: false,
        powerWindowDisplay: "ต่อเนื่องทั้งวัน",
      },
      {
        id: "p-2",
        kind: "checkin",
        rowNo: "2",
        checkInLabel: (
          <>
            08/11 15:20 <span className="font-bold text-indigo-700">(2/2)</span>
          </>
        ),
        roomNo: "105",
        staffName: "เมย์",
        roomRate: 600,
        totalCharge: 600,
        advanceCreditDisplay: "-600",
        advanceCreditPositive: false,
        powerWindowDisplay: "ต่อเนื่องทั้งวัน",
      },
      {
        id: "p-3",
        kind: "checkin",
        rowNo: "3",
        checkInLabel: (
          <>
            08/11 18:00 <span className="font-bold text-indigo-700">(2/5)</span>
          </>
        ),
        roomNo: "107",
        staffName: "เมย์",
        roomRate: 700,
        totalCharge: 700,
        advanceCreditDisplay: "-700",
        advanceCreditPositive: false,
        powerWindowDisplay: "ต่อเนื่องทั้งวัน",
      },
      {
        id: "p-4",
        kind: "checkin",
        rowNo: "4",
        checkInLabel: (
          <>
            11:15 <span className="font-bold text-indigo-700">(1/2)</span>
          </>
        ),
        roomNo: "102",
        staffName: "เมย์",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "200-200",
        reservationCreditDisplay: "-1,200",
        reservationCreditPositive: false,
        advanceCreditDisplay: "+600",
        advanceCreditPositive: true,
        powerWindowDisplay: "11:16 - ปัจจุบัน",
      },
      {
        id: "p-5",
        kind: "checkin",
        rowNo: "5",
        checkInLabel: (
          <>
            11:40 <span className="font-bold text-indigo-700">(3 ชม.)</span>
          </>
        ),
        roomNo: "103",
        staffName: "เมย์",
        roomRate: 360,
        totalCharge: 360,
        transferCardDisplay: "S 360",
        transferCardColor: "purple",
        powerWindowDisplay: "11:41 - 14:40",
      },
      {
        id: "p-6",
        kind: "checkin",
        rowNo: "6",
        checkInLabel: "12:05",
        roomNo: "104",
        staffName: "เมย์",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "800-200",
        powerWindowDisplay: "12:08 - ปัจจุบัน",
      },
      {
        id: "p-7",
        kind: "checkin",
        rowNo: "7",
        checkInLabel: "12:20",
        roomNo: "106",
        staffName: "เมย์",
        roomRate: 800,
        totalCharge: 800,
        cashDisplay: "-200",
        cashNegative: true,
        transferCardDisplay: "K 1,000",
        transferCardColor: "emerald",
        powerWindowDisplay: "12:22 - ปัจจุบัน",
      },
      {
        id: "p-8",
        kind: "checkin",
        rowNo: "8",
        checkInLabel: "12:50",
        roomNo: "108",
        staffName: "เมย์",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "800-200",
        powerWindowDisplay: "12:52 - ปัจจุบัน",
      },
      {
        id: "p-9",
        kind: "checkin",
        rowNo: "9",
        checkInLabel: "13:10",
        roomNo: "110",
        staffName: "เมย์",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "200-200",
        transferCardDisplay: "Cr 600",
        transferCardColor: "blue",
        powerWindowDisplay: "13:12 - ปัจจุบัน",
      },
      {
        id: "p-10",
        kind: "checkin",
        rowNo: "10",
        checkInLabel: "13:30",
        roomNo: "111",
        staffName: "เมย์",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "13:31 - ปัจจุบัน",
      },
      {
        id: "p-11",
        kind: "checkin",
        rowNo: "11",
        checkInLabel: "13:55",
        roomNo: "112",
        staffName: "เมย์",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "-200",
        cashNegative: true,
        transferCardDisplay: "K 900",
        transferCardColor: "emerald",
        powerWindowDisplay: "13:58 - ปัจจุบัน",
      },
      {
        id: "p-213-1",
        kind: "anomaly",
        rowNo: "213-1",
        checkInLabel: "⚠️ ไม่มีเช็คอิน",
        roomNo: "213",
        staffName: "",
        powerWindowDisplay: "14:10–15:00 (0.50)",
      },
      {
        id: "p-12",
        kind: "checkin",
        rowNo: "12",
        checkInLabel: "14:15",
        roomNo: "114",
        staffName: "เมย์",
        roomRate: 800,
        totalCharge: 800,
        cashDisplay: "1,000-200",
        powerWindowDisplay: "14:18 - ปัจจุบัน",
      },
      {
        id: "p-13",
        kind: "checkin",
        rowNo: "13",
        checkInLabel: "14:35",
        roomNo: "115",
        staffName: "เมย์",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "14:36 - ปัจจุบัน",
      },
      {
        id: "p-R1",
        kind: "booking",
        rowNo: "R1",
        checkInLabel: (
          <>
            จอง (09-20/11) <span className="text-indigo-700 font-bold">(12 คืน)</span>
          </>
        ),
        roomNo: "201",
        staffName: "เมย์",
        bookingRateSummary: (
          <>
            คืนละ 700 ฿ = 8,400 ฿ - 500 ฿ = <span className="text-rose-700 font-black">7,900 ฿</span>
          </>
        ),
        transferCardDisplay: "K 500",
        transferCardColor: "emerald",
        reservationCreditDisplay: "+500",
        reservationCreditPositive: true,
        powerWindowDisplay: "เข้า ~18:00 น.",
      },
    ],
    totals: {
      roomRate: 8360,
      adjust: 0,
      extra: 0,
      minibar: 0,
      totalCharge: 8360,
      cash: 3000,
      transferCard: 3360,
      reservationCredit: -700,
      advanceCredit: -1300,
      countSummaryText: "13 เข้าพัก + 1 ผิดปกติ + 1 จอง",
    },
  },
  {
    shiftIndex: 2,
    icon: "🌇",
    summaryTitle: "รวมกะที่ 2 (15:00 – 23:00 น.):",
    rows: [
      {
        id: "p-14",
        kind: "checkin",
        rowNo: "14",
        checkInLabel: (
          <>
            15:00 <span className="font-bold text-indigo-700">(3 ชม.)</span>
          </>
        ),
        roomNo: "103",
        staffName: "แอน",
        roomRate: 360,
        totalCharge: 360,
        cashDisplay: "360",
        powerWindowDisplay: "15:02 - 18:00",
      },
      {
        id: "p-15",
        kind: "checkin",
        rowNo: "15",
        checkInLabel: "15:25",
        roomNo: "201",
        staffName: "แอน",
        roomRate: 600,
        extraLabel: "เพิ่มหมอน",
        extraAmount: 60,
        totalCharge: 660,
        cashDisplay: "860-200",
        powerWindowDisplay: "15:28 - ปัจจุบัน",
      },
      {
        id: "p-16",
        kind: "checkin",
        rowNo: "16",
        checkInLabel: (
          <>
            15:45 <span className="font-bold text-indigo-700">(1/2)</span>
          </>
        ),
        roomNo: "202",
        staffName: "แอน",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "200-200",
        reservationCreditDisplay: "-1,200",
        reservationCreditPositive: false,
        advanceCreditDisplay: "+600",
        advanceCreditPositive: true,
        powerWindowDisplay: "15:46 - ปัจจุบัน",
      },
      {
        id: "p-17",
        kind: "checkin",
        rowNo: "17",
        checkInLabel: "16:10",
        roomNo: "203",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "-200",
        cashNegative: true,
        transferCardDisplay: "S 900",
        transferCardColor: "purple",
        powerWindowDisplay: "16:12 - ปัจจุบัน",
      },
      {
        id: "p-18",
        kind: "checkin",
        rowNo: "18",
        checkInLabel: "16:30",
        roomNo: "204",
        staffName: "แอน",
        roomRate: 600,
        extraLabel: "ผ้าห่ม",
        extraAmount: 50,
        totalCharge: 650,
        cashDisplay: "850-200",
        powerWindowDisplay: "16:35 - ปัจจุบัน",
      },
      {
        id: "p-19",
        kind: "checkin",
        rowNo: "19",
        checkInLabel: "16:50",
        roomNo: "113",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "-200",
        cashNegative: true,
        transferCardDisplay: "K 900",
        transferCardColor: "emerald",
        powerWindowDisplay: "16:52 - ปัจจุบัน",
      },
      {
        id: "p-20",
        kind: "checkin",
        rowNo: "20",
        checkInLabel: "17:15",
        roomNo: "116",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "17:16 - ปัจจุบัน",
      },
      {
        id: "p-21",
        kind: "checkin",
        rowNo: "21",
        checkInLabel: "17:40",
        roomNo: "117",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "17:42 - ปัจจุบัน",
      },
      {
        id: "p-22",
        kind: "checkin",
        rowNo: "22",
        checkInLabel: "18:00",
        roomNo: "118",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "-200",
        cashNegative: true,
        transferCardDisplay: "S 900",
        transferCardColor: "purple",
        powerWindowDisplay: "18:02 - ปัจจุบัน",
      },
      {
        id: "p-23",
        kind: "checkin",
        rowNo: "23",
        checkInLabel: "18:20",
        roomNo: "119",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "18:22 - ปัจจุบัน",
      },
      {
        id: "p-213-2",
        kind: "anomaly",
        rowNo: "213-2",
        checkInLabel: "⚠️ ไม่มีเช็คอิน",
        roomNo: "213",
        staffName: "",
        powerWindowDisplay: "18:40–20:15 (1.35)",
      },
      {
        id: "p-24",
        kind: "checkin",
        rowNo: "24",
        checkInLabel: "18:45",
        roomNo: "120",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "200-200",
        transferCardDisplay: "Cr 700",
        transferCardColor: "blue",
        powerWindowDisplay: "18:48 - ปัจจุบัน",
      },
      {
        id: "p-25",
        kind: "checkin",
        rowNo: "25",
        checkInLabel: "19:05",
        roomNo: "205",
        staffName: "แอน",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "800-200",
        powerWindowDisplay: "19:07 - ปัจจุบัน",
      },
      {
        id: "p-26",
        kind: "checkin",
        rowNo: "26",
        checkInLabel: "19:25",
        roomNo: "206",
        staffName: "แอน",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "-200",
        cashNegative: true,
        transferCardDisplay: "K 800",
        transferCardColor: "emerald",
        powerWindowDisplay: "19:26 - ปัจจุบัน",
      },
      {
        id: "p-27",
        kind: "checkin",
        rowNo: "27",
        checkInLabel: "19:50",
        roomNo: "207",
        staffName: "แอน",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "800-200",
        powerWindowDisplay: "19:52 - ปัจจุบัน",
      },
      {
        id: "p-28",
        kind: "checkin",
        rowNo: "28",
        checkInLabel: "20:10",
        roomNo: "208",
        staffName: "แอน",
        roomRate: 600,
        extraLabel: "ผ้าเช็ดตัว",
        extraAmount: 80,
        totalCharge: 680,
        cashDisplay: "-200",
        cashNegative: true,
        transferCardDisplay: "S 880",
        transferCardColor: "purple",
        powerWindowDisplay: "20:12 - ปัจจุบัน",
      },
      {
        id: "p-29",
        kind: "checkin",
        rowNo: "29",
        checkInLabel: "20:30",
        roomNo: "209",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "20:31 - ปัจจุบัน",
      },
      {
        id: "p-30",
        kind: "checkin",
        rowNo: "30",
        checkInLabel: "20:50",
        roomNo: "210",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "20:52 - ปัจจุบัน",
      },
      {
        id: "p-31",
        kind: "checkin",
        rowNo: "31",
        checkInLabel: "21:10",
        roomNo: "211",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "-200",
        cashNegative: true,
        transferCardDisplay: "K 900",
        transferCardColor: "emerald",
        powerWindowDisplay: "21:12 - ปัจจุบัน",
      },
      {
        id: "p-32",
        kind: "checkin",
        rowNo: "32",
        checkInLabel: "21:30",
        roomNo: "212",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "21:32 - ปัจจุบัน",
      },
      {
        id: "p-33",
        kind: "checkin",
        rowNo: "33",
        checkInLabel: "21:45",
        roomNo: "214",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "21:48 - ปัจจุบัน",
      },
      {
        id: "p-34",
        kind: "checkin",
        rowNo: "34",
        checkInLabel: "22:00",
        roomNo: "215",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "22:02 - ปัจจุบัน",
      },
      {
        id: "p-35",
        kind: "checkin",
        rowNo: "35",
        checkInLabel: "22:15",
        roomNo: "216",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "22:18 - ปัจจุบัน",
      },
      {
        id: "p-36",
        kind: "checkin",
        rowNo: "36",
        checkInLabel: "22:30",
        roomNo: "217",
        staffName: "แอน",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "22:32 - ปัจจุบัน",
      },
      {
        id: "p-37",
        kind: "checkin",
        rowNo: "37",
        checkInLabel: "22:45",
        roomNo: "218",
        staffName: "แอน",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "800-200",
        powerWindowDisplay: "22:46 - ปัจจุบัน",
      },
      {
        id: "p-109",
        kind: "anomaly",
        rowNo: "109",
        checkInLabel: (
          <>
            22:50{" "}
            <span className="bg-rose-300 text-rose-950 px-1 py-0.2 rounded font-black text-[6.2px] border border-rose-400">
              ค้างชำระ
            </span>{" "}
            (ไฟขึ้นก่อน)
          </>
        ),
        roomNo: "109",
        staffName: "แอน",
        roomRate: 600,
        totalCharge: 600,
        powerWindowDisplay: "21:30–ปัจจุบัน (9.30)",
      },
      {
        id: "p-R2-1",
        kind: "booking",
        rowNo: "R2-1",
        checkInLabel: "จอง (10/11)",
        roomNo: "208",
        staffName: "แอน",
        bookingRateSummary: (
          <>
            600 ฿ - 300 ฿ = <span className="text-rose-700 font-black">300 ฿</span>
          </>
        ),
        transferCardDisplay: "S 300",
        transferCardColor: "purple",
        reservationCreditDisplay: "+300",
        reservationCreditPositive: true,
        powerWindowDisplay: "เข้า ~14:00 (คู่ 209)",
      },
      {
        id: "p-R2-2",
        kind: "booking",
        rowNo: "R2-2",
        checkInLabel: "จอง (10/11)",
        roomNo: "209",
        staffName: "แอน",
        bookingRateSummary: (
          <>
            600 ฿ - 300 ฿ = <span className="text-rose-700 font-black">300 ฿</span>
          </>
        ),
        transferCardDisplay: "S 300",
        transferCardColor: "purple",
        reservationCreditDisplay: "+300",
        reservationCreditPositive: true,
        powerWindowDisplay: "เข้า ~14:00 (คู่ 208)",
      },
      {
        id: "p-R3",
        kind: "booking",
        rowNo: "R3",
        checkInLabel: (
          <>
            จอง (12-14/11) <span className="text-indigo-700 font-bold">(3 คืน)</span>
          </>
        ),
        roomNo: "104",
        staffName: "แอน",
        bookingRateSummary: (
          <>
            800/700/600 ฿ = 2,100 ฿ - 500 ฿ = <span className="text-rose-700 font-black">1,600 ฿</span>
          </>
        ),
        cashDisplay: "500",
        cashHighlight: true,
        reservationCreditDisplay: "+500",
        reservationCreditPositive: true,
        powerWindowDisplay: "เข้า ~20:30 หมอนเพิ่ม",
      },
    ],
    totals: {
      roomRate: 16260,
      adjust: 0,
      extra: 190,
      minibar: 0,
      totalCharge: 16450,
      cash: 9770,
      transferCard: 6580,
      reservationCredit: -100,
      advanceCredit: 600,
      countSummaryText: "25 เข้าพัก + 1 ผิดปกติ + 2 จอง",
    },
  },
  {
    shiftIndex: 3,
    icon: "🌙",
    summaryTitle: "รวมกะที่ 3 (23:00 – 07:00 น.):",
    rows: [
      {
        id: "p-38",
        kind: "checkin",
        rowNo: "38",
        checkInLabel: "23:05",
        roomNo: "219",
        staffName: "บี",
        roomRate: 700,
        totalCharge: 700,
        cashDisplay: "900-200",
        powerWindowDisplay: "23:08 - ปัจจุบัน",
      },
      {
        id: "p-39",
        kind: "checkin",
        rowNo: "39",
        checkInLabel: "01:15",
        roomNo: "220",
        staffName: "บี",
        roomRate: 600,
        totalCharge: 600,
        cashDisplay: "800-200",
        powerWindowDisplay: "01:17 - ปัจจุบัน",
      },
      {
        id: "p-40",
        kind: "checkin",
        rowNo: "40",
        checkInLabel: (
          <>
            02:30{" "}
            <span className="text-[6.2px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-bold">
              รับชำระค้าง (08/11 กะบ่าย)
            </span>
          </>
        ),
        roomNo: "109",
        staffName: "บี",
        cashDisplay: "600",
        cashHighlight: true,
        isDebtCollection: true,
      },
    ],
    totals: {
      roomRate: 1300,
      adjust: 0,
      extra: 0,
      minibar: 0,
      totalCharge: 1300,
      cash: -400,
      transferCard: 2300,
      reservationCredit: 0,
      advanceCredit: 0,
      countSummaryText: "2 เข้าพัก + 1 รับชำระหนี้ค้าง",
    },
  },
];

export default function FinancialReportType2View({
  selectedLocation = "ซอย1",
  onSelectLocation,
  availableLocations = ["ซอย1", "ซอย2", "ซามีญ่า"],
  reportsByLocation = {},
  reportDateLabel = "",
  activeReport,
  isDayClosed = false,
  dayShifts = [],
  handovers = [],
  dayExpenses = [],
  shiftDrawers = {},
  transferCardCount = 0,
  dataMode = "prototype",
  onChangeDataMode,
  onOpenTransferModal,
  onRequestManagerSign,
  canEditReport = false,
  auditEdits = {},
  onClickEditRow,
  onClickEditShiftSummary,
  onClickEditManagerBox,
}: Props) {
  const [rowFilter, setRowFilter] = useState<"all" | "checkin" | "anomaly" | "booking">("all");
  const [isShortOverDemo, setIsShortOverDemo] = useState(false);

  // การควบคุมขนาดและการซูมแสดงผลสำหรับมือถือและเดสก์ท็อป (ตั้งต้น 130% บนจอคอมพิวเตอร์ และวัดความกว้างจริงบนมือถือ)
  const [scaleMode, setScaleMode] = useState<"fit" | "default" | "custom">("default");
  const [customZoom, setCustomZoom] = useState<number>(1.3);
  const [viewportWidth, setViewportWidth] = useState<number>(1200);
  const [containerWidth, setContainerWidth] = useState<number>(1066);
  const [sheetHeight, setSheetHeight] = useState<number>(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const didInitScaleRef = useRef<boolean>(false);

  useEffect(() => {
    const measureAll = () => {
      if (typeof window !== "undefined") {
        const w = window.innerWidth;
        setViewportWidth(w);
        const cw = scrollContainerRef.current?.clientWidth || document.documentElement.clientWidth - 16 || w - 16;
        setContainerWidth(cw);
        if (sheetRef.current) {
          setSheetHeight(sheetRef.current.offsetHeight);
        }
        if (!didInitScaleRef.current) {
          didInitScaleRef.current = true;
          if (w < 820) {
            setScaleMode("fit");
          }
        }
      }
    };
    measureAll();
    window.addEventListener("resize", measureAll);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measureAll());
      if (scrollContainerRef.current) ro.observe(scrollContainerRef.current);
      if (sheetRef.current) ro.observe(sheetRef.current);
    }
    return () => {
      window.removeEventListener("resize", measureAll);
      if (ro) ro.disconnect();
    };
  }, []);

  const availW = Math.min(containerWidth, viewportWidth - 16);
  const fitScale = availW < 820 ? Math.max(0.3, Math.min(1, +(Math.floor(((availW - 4) / 820) * 1000) / 1000).toFixed(3))) : 1;
  const currentZoomLevel =
    scaleMode === "fit"
      ? fitScale
      : scaleMode === "default"
      ? viewportWidth >= 1024
        ? 1.3
        : 1.0
      : customZoom;

  const fmtNum = (n: number | undefined | null) => {
    const val = Number(n || 0);
    return isNaN(val) ? "0" : val.toLocaleString();
  };

  const fmtSignedNum = (n: number | undefined | null) => {
    const val = Number(n || 0);
    if (isNaN(val) || val === 0) return "0";
    return val > 0 ? `+${val.toLocaleString()}` : `-${Math.abs(val).toLocaleString()}`;
  };

  const safeFormatTime = (isoString?: string | null) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "-";
    }
  };

  const isProto = dataMode === "prototype";

  // ตรวจสอบสถานะปิดวันของแต่ละสถานที่
  const isLocClosed = (loc: string): boolean => {
    if (isProto) {
      if (loc === "ซอย1" || loc === "ซอย2") return true;
      return false; // ซามีญ่า และ ALL ในโหมดจำลองยังไม่ปิดวัน
    }
    return Boolean(reportsByLocation[loc]?.isDayClosed);
  };

  const currentLocClosed = isLocClosed(selectedLocation);

  const locationDisplayName =
    selectedLocation === "ALL"
      ? "รวมทุกสถานที่"
      : selectedLocation === "ซอย1"
      ? "ซอย 1"
      : selectedLocation === "ซอย2"
      ? "ซอย 2"
      : selectedLocation === "ซามีญ่า"
      ? "ซามิย่า"
      : selectedLocation;

  const handlePrintA4 = () => {
    if (!currentLocClosed) {
      if (selectedLocation === "ALL") {
        alert(
          "⚠️ รายงานการเงินรวมทุกสถานที่ ยังไม่สามารถปิดยอด 100% ได้ เนื่องจากยังมีสาขาที่ยังไม่ปิดวัน\n\nสามารถเลือกพิมพ์เฉพาะสาขาที่ปิดวันแล้วได้"
        );
      } else {
        alert(
          `⚠️ สาขา${locationDisplayName} ยังไม่สามารถพิมพ์รายงานการเงินฉบับปิดวันได้ เนื่องจากสถานะปัจจุบันยังเปิดกะอยู่ (ยังไม่ปิดวัน)\n\nกรุณาปิดกะสุดท้ายและส่งมอบปิดวันให้เสร็จสิ้นก่อนสั่งพิมพ์`
        );
      }
      return;
    }
    window.print();
  };

  // ==================== เตรียมข้อมูลสำหรับแสดงผล (Prototype vs Live) ====================
  const report = activeReport || {};
  const liveSections: ShiftSectionData[] =
    Array.isArray(report.liveShiftSections) && report.liveShiftSections.length > 0
      ? report.liveShiftSections
      : [
          {
            shiftIndex: 1,
            icon: "🌅",
            summaryTitle: "รวมกะที่ 1 (07:00 – 15:00 น.):",
            rows: [],
            totals: {
              roomRate: 0,
              adjust: 0,
              extra: 0,
              minibar: 0,
              totalCharge: 0,
              cash: 0,
              transferCard: 0,
              reservationCredit: 0,
              advanceCredit: 0,
              countSummaryText: "0 รายการ",
            },
          },
          {
            shiftIndex: 2,
            icon: "🌇",
            summaryTitle: "รวมกะที่ 2 (15:00 – 23:00 น.):",
            rows: [],
            totals: {
              roomRate: 0,
              adjust: 0,
              extra: 0,
              minibar: 0,
              totalCharge: 0,
              cash: 0,
              transferCard: 0,
              reservationCredit: 0,
              advanceCredit: 0,
              countSummaryText: "0 รายการ",
            },
          },
          {
            shiftIndex: 3,
            icon: "🌙",
            summaryTitle: "รวมกะที่ 3 (23:00 – 07:00 น.):",
            rows: [],
            totals: {
              roomRate: 0,
              adjust: 0,
              extra: 0,
              minibar: 0,
              totalCharge: 0,
              cash: 0,
              transferCard: 0,
              reservationCredit: 0,
              advanceCredit: 0,
              countSummaryText: "0 รายการ",
            },
          },
        ];

  const activeSections = isProto ? PROTOTYPE_SHIFT_SECTIONS : liveSections;

  const allRowsFlat = activeSections.flatMap((sec) => sec.rows);
  const checkinCount = allRowsFlat.filter((r) => r.kind === "checkin").length;
  const anomalyCount = allRowsFlat.filter((r) => r.kind === "anomaly").length;
  const bookingCount = allRowsFlat.filter((r) => r.kind === "booking").length;
  const totalItemsCount = allRowsFlat.length;

  // คำนวณตัวเลข Live สำหรับตารางสรุป 1-13
  const safeShifts = Array.isArray(dayShifts) ? dayShifts : [];
  const safeHandovers = Array.isArray(handovers) ? handovers : [];
  const safeExpenses = Array.isArray(dayExpenses) ? dayExpenses : [];

  // จัดกะลง 3 ช่อง (1. กะเช้า, 2. กะบ่าย, 3. กะดึก) — หากมี <= 2 กะ และเปิดกะหลัง 16:00 น. ให้จัดเป็นกะดึก (ช่อง 3) โดยเว้นวรรคกะบ่าย (ช่อง 2)
  const slottedShifts: [Shift | null, Shift | null, Shift | null] = [null, null, null];
  if (safeShifts.length >= 3) {
    slottedShifts[0] = safeShifts[0] || null;
    slottedShifts[1] = safeShifts[1] || null;
    slottedShifts[2] = safeShifts[2] || null;
  } else {
    safeShifts.forEach((sh) => {
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

  const getLiveShiftSlot = (slotIdx: 0 | 1 | 2) => {
    const sh = slottedShifts[slotIdx] || undefined;
    const sec = liveSections[slotIdx];
    const shHandovers = sh ? safeHandovers.filter((h) => h.shift_id === sh.id) : [];
    const midHandovers = shHandovers.filter((h) => h.kind === "mid_shift");
    const closeHandover = shHandovers.find((h) => h.kind === "shift_close") || null;
    const shExpenses = sh
      ? safeExpenses.filter((e) => e.shift_id === sh.id)
      : [];
    const expSum = shExpenses.reduce((s, e) => s + Math.abs(Number(e?.amount || 0)), 0);
    const expNote = shExpenses.map((e) => e?.category).filter(Boolean).join("/");

    const hasShift = Boolean(sh) || Boolean(sec && sec.rows.length > 0);
    const roomCount = sec
      ? sec.rows.filter((r) => r.kind === "checkin" && !r.isDebtCollection && Number(r.totalCharge || 0) > 0).length
      : 0;
    const rev = sec ? sec.totals.totalCharge : 0;
    const resAdvNet = sec ? sec.totals.reservationCredit + sec.totals.advanceCredit : 0;
    const resAdvNote =
      sec && (sec.totals.reservationCredit !== 0 || sec.totals.advanceCredit !== 0)
        ? `(${fmtSignedNum(sec.totals.reservationCredit)} & ${fmtSignedNum(sec.totals.advanceCredit)})`
        : "";
    const transCard = sec ? sec.totals.transferCard : 0;
    const netCashInShift = sec ? sec.totals.cash : 0;

    // คำนวณยอดค้างชำระ (-)/รับชำระหนี้เก่า (+) เฉพาะของกะนี้จากแถวในตาราง
    const recNetInShift = sec
      ? sec.rows.reduce((sum, r) => {
          if (r.kind !== "checkin") return sum;
          const chg = Number(r.totalCharge || 0);
          const advVal = r.advanceCreditDisplay ? Number(String(r.advanceCreditDisplay).replace(/,/g, "")) || 0 : 0;
          const resVal = r.reservationCreditDisplay ? Number(String(r.reservationCreditDisplay).replace(/,/g, "")) || 0 : 0;
          const tcVal = r.transferCardDisplay
            ? Number(String(r.transferCardDisplay).replace(/[^0-9.-]/g, "")) || 0
            : 0;
          const cashFirst = r.cashDisplay ? Number(String(r.cashDisplay).split("-")[0].replace(/,/g, "")) || 0 : 0;
          const covered = cashFirst + tcVal + Math.abs(advVal) + Math.abs(resVal);
          if (chg > 0 && covered < chg) {
            return sum - (chg - covered);
          }
          return sum;
        }, 0)
      : 0;

    const carriedIn = sh ? Number(sh.initial_cash || 0) : 0;
    const afterCarried = hasShift ? netCashInShift + carriedIn : 0;
    const beforeHandover = hasShift ? afterCarried - expSum : 0;
    const midSent = midHandovers.reduce((s, h) => s + Number(h.actual_amount || 0), 0);
    const sysDrawer = hasShift ? beforeHandover - midSent : 0;
    const closeSent = closeHandover ? Number(closeHandover.actual_amount || 0) : 0;
    // ห้ามส่งยอดยกไปกะถัดไปเด็ดขาด หากไม่มีการส่งมอบกะถัดไปโดยมีการเซ็นทั้งสองฝ่ายระหว่างผู้ส่งกับผู้รับ
    const hasDualSignedCarryOut = Boolean(
      closeHandover &&
        Number(closeHandover.carried_to_next_shift || 0) > 0 &&
        closeHandover.staff_signature &&
        (closeHandover.next_shift_receiver_signature || closeHandover.manager_signature)
    );
    const carriedOut = hasDualSignedCarryOut ? Number(closeHandover!.carried_to_next_shift || 0) : 0;
    const countedDrawer = hasShift
      ? closeHandover
        ? closeSent + carriedOut
        : sh?.final_cash != null
        ? Number(sh.final_cash)
        : sysDrawer
      : 0;
    const diff = hasShift && (closeHandover || sh?.final_cash != null) ? countedDrawer - sysDrawer : 0;

    return {
      sh,
      hasShift,
      staffName: sh?.staff_name || (slotIdx === 0 ? "-" : slotIdx === 1 ? "-" : "-"),
      timeRange: sh
        ? `${safeFormatTime(sh.start_time)}–${sh.end_time ? safeFormatTime(sh.end_time) + " น." : "ปัจจุบัน"}`
        : slotIdx === 0
        ? "07:00–15:00 น."
        : slotIdx === 1
        ? "15:00–23:00 น."
        : "23:00–07:00 น.",
      roomCount,
      rev,
      recNetInShift,
      resAdvNet,
      resAdvNote,
      transCard,
      netCashInShift,
      carriedIn,
      afterCarried,
      expSum,
      expNote,
      beforeHandover,
      midSent,
      midHandoverObj: midHandovers[0] || null,
      sysDrawer,
      diff,
      countedDrawer,
      closeSent,
      closeHandoverObj: closeHandover,
      carriedOut,
    };
  };

  const liveS1 = getLiveShiftSlot(0);
  const liveS2 = getLiveShiftSlot(1);
  const liveS3 = getLiveShiftSlot(2);

  // ข้อมูลส่วนหัวรายงาน (วันที่ + ค้างชำระ / รับจอง / ล่วงหน้า)
  const displayDateLabel = isProto
    ? "วันอาทิตย์ที่ 8 พฤศจิกายน 2569"
    : reportDateLabel || "วันนี้";

  const recStart = isProto ? 0 : Number(report.receivableBox?.start || 0);
  const recEnd = isProto ? 0 : Number(report.receivableBox?.end || 0);
  const recChange = recEnd - recStart;

  const resBrought = isProto ? 2400 : Number(report.reservationBox?.broughtForward || 0);
  const resAdd = isProto ? 1600 : Number(report.reservationBox?.addedToday || 0);
  const resUsed = isProto ? 2400 : Number(report.reservationBox?.usedToday || 0);
  const resNet = resAdd - resUsed;
  const resEnd = isProto
    ? 1600
    : Number(report.reservationBox?.carriedForward ?? report.reservationBox?.end ?? resBrought + resNet);

  const advBrought = isProto ? 1900 : Number(report.advanceBox?.broughtForward || 0);
  const advAdd = isProto ? 1200 : Number(report.advanceBox?.addedToday || 0);
  const advUsed = isProto ? 1900 : Number(report.advanceBox?.usedToday || 0);
  const advNet = advAdd - advUsed;
  const advEnd = isProto
    ? 1200
    : Number(report.advanceBox?.carriedForward ?? report.advanceBox?.end ?? advBrought + advNet);

  // ค่าใช้จ่ายในกะ & นอกกะ สำหรับกล่องขวา
  const liveInShiftExp = safeExpenses.filter(
    (e) => e?.shift_id && safeShifts.some((s) => s.id === e.shift_id)
  );
  const liveOutShiftExp = safeExpenses.filter(
    (e) => !e?.shift_id || !safeShifts.some((s) => s.id === e.shift_id)
  );
  const liveInExpTotal = liveInShiftExp.reduce((s, e) => s + Math.abs(Number(e?.amount || 0)), 0);
  const liveOutExpTotal = liveOutShiftExp.reduce((s, e) => s + Math.abs(Number(e?.amount || 0)), 0);

  const inShiftExpAmount = isProto ? 170 : liveInExpTotal;
  const outShiftExpAmount = isProto ? 1500 : liveOutExpTotal;
  const totalCashExpAmount = inShiftExpAmount + outShiftExpAmount;

  const inShiftExpDetailText = isProto
    ? "ค่าน้ำแข็ง 50 ฿ + ซื้อหลอดไฟ LED 120 ฿:"
    : liveInShiftExp.length > 0
    ? `${liveInShiftExp.map((e) => `${e.category} ${fmtNum(Math.abs(Number(e.amount || 0)))} ฿`).join(" + ")}:`
    : "ไม่มีค่าใช้จ่ายในกะ:";

  const outShiftExpDetailText = isProto
    ? "ค่าน้ำประปา 1,200 ฿ + ถุงขยะแม่บ้าน 300 ฿:"
    : liveOutShiftExp.length > 0
    ? `${liveOutShiftExp.map((e) => `${e.category} ${fmtNum(Math.abs(Number(e.amount || 0)))} ฿`).join(" + ")}:`
    : "ไม่มีค่าใช้จ่ายนอกกะ:";

  // กล่องผู้จัดการ 1-5
  const liveMidSentTotal = liveS1.midSent + liveS2.midSent + liveS3.midSent;
  const liveCloseSentTotal = liveS1.closeSent + liveS2.closeSent + liveS3.closeSent;
  const liveNetFromShifts = liveMidSentTotal + liveCloseSentTotal;

  const mgrBrought = isProto ? 15000 : Number(report.mgrBroughtForward ?? 0);
  const mgrNetShifts = isProto ? 12150 : liveNetFromShifts;
  const mgrOutExp = isProto ? outShiftExpAmount : Number(report.mgrOutExpenseOverride ?? outShiftExpAmount);
  const mgrBankDep = isProto ? 18000 : Number(report.mgrBankDeposit ?? 0);
  const mgrCarried = mgrBrought + mgrNetShifts - mgrOutExp - mgrBankDep;

  // ตัวช่วยแสดงยอดเดิมตัวเอียงสีเทา (ไม่มีขีดกลาง) + (ชื่อผู้แก้ไข) แบบตัวตรงปกติทางขวา
  const renderAuditTrail = (editKey: string, compact = false) => {
    if (isProto || !auditEdits) return null;
    const entry = auditEdits[editKey];
    if (!entry) return null;
    return (
      <span
        className={`inline-flex items-baseline text-slate-400 font-normal leading-none whitespace-nowrap ${
          compact ? "mr-0.5 text-[6.2px] tracking-tighter" : "mr-1 text-[7.1px]"
        }`}
        title={`แก้ไขจาก "${entry.oldDisplay}" เป็น "${entry.newDisplay}" โดย ${entry.editorName}${
          entry.editedAt ? ` (${safeFormatTime(entry.editedAt)} น.)` : ""
        }`}
      >
        <span
          className="italic text-slate-400"
          style={{
            fontStyle: "italic",
            textDecoration: "none",
          }}
        >
          {entry.oldDisplay}
        </span>
        <span className="not-italic font-normal ml-[1px]">({entry.editorName})</span>
      </span>
    );
  };

  // คำนวณยอดรวมท้ายตาราง 15 คอลัมน์ (24 ชม.)
  const grandTotals = activeSections.reduce(
    (acc, sec) => ({
      roomRate: acc.roomRate + sec.totals.roomRate,
      adjust: acc.adjust + sec.totals.adjust,
      extra: acc.extra + sec.totals.extra,
      minibar: acc.minibar + sec.totals.minibar,
      totalCharge: acc.totalCharge + sec.totals.totalCharge,
      cash: acc.cash + sec.totals.cash,
      transferCard: acc.transferCard + sec.totals.transferCard,
      reservationCredit: acc.reservationCredit + sec.totals.reservationCredit,
      advanceCredit: acc.advanceCredit + sec.totals.advanceCredit,
    }),
    {
      roomRate: 0,
      adjust: 0,
      extra: 0,
      minibar: 0,
      totalCharge: 0,
      cash: 0,
      transferCard: 0,
      reservationCredit: 0,
      advanceCredit: 0,
    }
  );

  // คำนวณแยกยอดโอนตามธนาคาร (S = SCB, K = KBANK, Cr = Credit Card) สำหรับช่องสรุปหัวตาราง
  const grandTransferBreakdown = allRowsFlat.reduce(
    (acc, r) => {
      if (r.transferCardDisplay) {
        const str = String(r.transferCardDisplay).trim();
        const m = str.match(/^([A-Za-z]+)\s*([\d,]+(?:\.\d+)?)/);
        if (m) {
          const p = m[1].toUpperCase();
          const amt = Number(m[2].replace(/,/g, "")) || 0;
          if (p.startsWith("S")) acc.S += amt;
          else if (p.startsWith("K")) acc.K += amt;
          else if (p.startsWith("CR")) acc.Cr += amt;
          else acc.other += amt;
        } else {
          const num = Number(str.replace(/[^\d.]/g, "")) || 0;
          if (num > 0) acc.K += num;
        }
      }
      return acc;
    },
    { S: 0, K: 0, Cr: 0, other: 0 }
  );

  // Fallback กรณี allRowsFlat ไม่มีข้อมูล transferCardDisplay แต่ activeReport มี payTransferByBank
  if (
    grandTransferBreakdown.S === 0 &&
    grandTransferBreakdown.K === 0 &&
    grandTransferBreakdown.Cr === 0 &&
    grandTotals.transferCard > 0
  ) {
    if (activeReport?.payTransferByBank) {
      const bankMap = activeReport.payTransferByBank;
      for (const [k, v] of Object.entries(bankMap)) {
        const upper = k.toUpperCase();
        const amt = Number(v || 0);
        if (upper.startsWith("S")) grandTransferBreakdown.S += amt;
        else if (upper.startsWith("K")) grandTransferBreakdown.K += amt;
        else if (upper.startsWith("CR")) grandTransferBreakdown.Cr += amt;
        else grandTransferBreakdown.other += amt;
      }
    }
    if (grandTransferBreakdown.S === 0 && grandTransferBreakdown.K === 0) {
      grandTransferBreakdown.K = grandTotals.transferCard;
    }
  }

  // สร้างรายการยอดโอนที่จะแสดงผล (คัดเฉพาะที่มีมูลค่า > 0 หากไม่มีเลยจะว่าง)
  const activeTransferItems = [
    {
      key: "S",
      label: "S",
      amount: grandTransferBreakdown.S,
      colorClass: "text-purple-900",
      textColor: "text-slate-900",
    },
    {
      key: "K",
      label: "K",
      amount: grandTransferBreakdown.K,
      colorClass: "text-emerald-900",
      textColor: "text-slate-900",
    },
    {
      key: "Cr",
      label: "Cr",
      amount: grandTransferBreakdown.Cr,
      colorClass: "text-blue-900",
      textColor: "text-blue-950",
    },
  ].filter((item) => item.amount > 0);

  // ตัวช่วยจัดรูปแบบวันที่และเวลาสำหรับการเซ็นรับ/ส่งมอบเงิน
  const formatSignTime = (isoString?: string | null) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return null;
      const day = d.getDate();
      const monthNames = [
        "ม.ค.",
        "ก.พ.",
        "มี.ค.",
        "เม.ย.",
        "พ.ค.",
        "มิ.ย.",
        "ก.ค.",
        "ส.ค.",
        "ก.ย.",
        "ต.ค.",
        "พ.ย.",
        "ธ.ค.",
      ];
      const month = monthNames[d.getMonth()];
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${day} ${month} ${hh}:${mm} น.`;
    } catch {
      return null;
    }
  };

  // ตัวช่วยแสดงลายเซ็นในโหมด Live / Prototype
  const renderLiveSignatureCell = (
    h: CashHandover | null,
    subLabel: string,
    theme: "amber" | "rose" | "emerald" | "blue"
  ) => {
    if (!h) {
      return (
        <div className="flex items-center min-h-[25px] w-full text-center justify-center">
          <span className="text-[8.5px] font-bold text-slate-400 italic">ไม่มีการส่งมอบ (-)</span>
        </div>
      );
    }
    const isNeg = (h.kind === "mid_shift" ? h.actual_amount : h.required_amount) < 0;
    const amt = Math.abs(Number(h.actual_amount || h.required_amount || 0));
    const senderName = isNeg ? h.manager_name || "ผู้จัดการ" : h.staff_name || h.shift_staff_name;
    const senderSig = isNeg ? h.manager_signature : h.staff_signature;
    const senderTime = formatSignTime(isNeg ? h.manager_signed_at : (h.staff_signed_at || h.created_at));
    const receiverName = isNeg ? h.staff_name || h.shift_staff_name : h.manager_name;
    const receiverSig = isNeg ? h.staff_signature : h.manager_signature;
    const receiverTime = formatSignTime(isNeg ? (h.staff_signed_at || h.created_at) : h.manager_signed_at);
    const borderCol =
      theme === "amber"
        ? "border-amber-300"
        : theme === "rose"
        ? "border-rose-300"
        : theme === "emerald"
        ? "border-emerald-300"
        : "border-blue-300";

    return (
      <div className="flex items-center min-h-[25px] py-0.5 w-full">
        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
          {senderSig ? (
            <img src={senderSig} alt={senderName} className="h-[18px] max-w-full object-contain" />
          ) : (
            <span className="sig-canvas text-[11px] leading-tight truncate">{senderName || "-"}</span>
          )}
          {senderTime && (
            <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5 whitespace-nowrap">
              {senderTime}
            </span>
          )}
        </div>
        <div className={`w-[38px] shrink-0 border-x ${borderCol} text-center flex flex-col justify-center items-center px-0.5`}>
          <span className="font-black text-slate-900 text-[8.2px] leading-tight whitespace-nowrap">
            {isNeg ? `+${fmtNum(amt)}` : fmtNum(amt)} ฿
          </span>
          <span className="text-[6.5px] font-bold text-slate-600 leading-none mt-0.5">{subLabel}</span>
        </div>
        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
          {receiverSig ? (
            <img src={receiverSig} alt={receiverName || ""} className="h-[18px] max-w-full object-contain" />
          ) : receiverName ? (
            <span className="sig-canvas text-[11px] text-amber-900 leading-tight truncate">{receiverName}</span>
          ) : onRequestManagerSign ? (
            <button
              type="button"
              onClick={() => onRequestManagerSign(h)}
              className="no-print px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-black text-[7px] cursor-pointer"
            >
              ✍️ เซ็นรับ
            </button>
          ) : (
            <span className="text-[7.5px] text-amber-700 font-bold">รอผู้จัดการเซ็น</span>
          )}
          {receiverTime && (
            <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5 whitespace-nowrap">
              {receiverTime}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div id="financial-report-type2-root" className="w-full">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=Dancing+Script:wght@700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @media screen and (min-width: 1024px) {
          .report-control-bar {
            max-width: 1066px !important;
          }
        }
        #a4-financial-report-sheet {
          font-family: 'Sarabun', sans-serif;
          font-size: 7.6px;
          line-height: 1.15;
          width: 820px;
          min-width: 820px;
          max-width: 820px;
          box-sizing: border-box;
          margin: 0 auto;
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.12);
          border: 1px solid #cbd5e1;
          padding: 8px 10px;
          border-radius: 4px;
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
        }
        #a4-financial-report-sheet table.audit-table {
          width: 100%;
          box-sizing: border-box;
          border-collapse: collapse;
          table-layout: fixed;
          border: 1.8px solid #334155 !important;
          border-left: 2px solid #334155 !important;
          border-right: 2px solid #334155 !important;
          border-top: 1.8px solid #334155 !important;
          border-bottom: 1.8px solid #334155 !important;
        }
        #a4-financial-report-sheet table.audit-table th,
        #a4-financial-report-sheet table.audit-table td {
          border: 1px solid #64748b;
          padding: 0.8px 1.5px;
          vertical-align: middle;
          font-size: 7.9px;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #a4-financial-report-sheet table.audit-table th:first-child,
        #a4-financial-report-sheet table.audit-table td:first-child,
        #a4-financial-report-sheet table.audit-table tr > *:first-child {
          border-left: 2px solid #334155 !important;
        }
        #a4-financial-report-sheet table.audit-table th:last-child,
        #a4-financial-report-sheet table.audit-table td:last-child,
        #a4-financial-report-sheet table.audit-table tr > *:last-child {
          border-right: 2px solid #334155 !important;
        }
        #a4-financial-report-sheet table.audit-table thead th {
          background-color: #f1f5f9;
          color: #0f172a;
          font-weight: 800;
          text-align: center;
          padding: 2px 1px;
        }
        #a4-financial-report-sheet table.audit-table tbody tr.section-row td {
          font-size: 8.3px !important;
          line-height: 1.05;
        }
        #a4-financial-report-sheet table.audit-table tfoot td {
          font-weight: 800;
          border-top: 1.5px solid #0f172a;
          padding: 2.5px 1.5px;
          font-size: 10.2px !important;
          line-height: 1.15;
        }
        #a4-financial-report-sheet .sig-canvas {
          font-family: 'Dancing Script', 'Brush Script MT', cursive, sans-serif;
          font-size: 13px;
          color: #1e3a8a;
          line-height: 1;
        }
        #a4-financial-report-sheet table.audit-table th.boundary-col-1-prev,
        #a4-financial-report-sheet table.audit-table td.boundary-col-1-prev,
        #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-child(4) {
          border-right: 2px solid #1e293b !important;
        }
        #a4-financial-report-sheet table.audit-table th.boundary-col-1,
        #a4-financial-report-sheet table.audit-table td.boundary-col-1,
        #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-child(5) {
          border-left: 2px solid #1e293b !important;
        }
        #a4-financial-report-sheet table.audit-table th.boundary-col-2-prev,
        #a4-financial-report-sheet table.audit-table td.boundary-col-2-prev,
        #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-last-child(7) {
          border-right: 2px solid #1e293b !important;
        }
        #a4-financial-report-sheet table.audit-table th.boundary-col-2,
        #a4-financial-report-sheet table.audit-table td.boundary-col-2,
        #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-last-child(6) {
          border-left: 2px solid #1e293b !important;
        }
        #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-last-child(4) {
          border-left: 2px solid #312e81 !important;
        }
        #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-last-child(3) {
          border-right: 1.8px solid #334155 !important;
        }
        #a4-financial-report-sheet table.audit-table tbody tr.item-checkin td:nth-last-child(4),
        #a4-financial-report-sheet table.audit-table tbody tr.item-checkin td:nth-last-child(3) {
          background-color: rgba(238, 242, 255, 0.45);
        }
        @page {
          size: A4 portrait;
          margin: 3mm;
        }
        @media print {
          nav, header, .no-print {
            display: none !important;
          }
          html, body, main {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #audit-page-root, #audit-page-content, #daily-report-root, #financial-report-type2-root {
            margin: 0 !important;
            padding: 0 !important;
          }
          .space-y-6 > :not(:first-child),
          .space-y-4 > :not(:first-child) {
            margin-top: 0 !important;
          }
          .a4-scale-stage {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
          }
          #a4-financial-report-sheet {
            box-sizing: border-box !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
            padding: 0 1.5mm !important;
            max-width: 100% !important;
            min-width: 100% !important;
            width: 100% !important;
            zoom: 1 !important;
            transform: none !important;
          }
          #a4-financial-report-sheet div.overflow-x-auto,
          #a4-financial-report-sheet .overflow-x-auto {
            overflow: visible !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #a4-financial-report-sheet > div:first-child {
            padding: 2px 3px !important;
            margin-bottom: 2px !important;
          }
          #a4-financial-report-sheet > div:first-child > div:first-child {
            padding-bottom: 2px !important;
            margin-bottom: 2px !important;
          }
          #a4-financial-report-sheet #summary-type-2 table {
            line-height: 1.1 !important;
            font-size: 8.1px !important;
            width: 100% !important;
          }
          #a4-financial-report-sheet #summary-type-2 th,
          #a4-financial-report-sheet #summary-type-2 td {
            padding-top: 1px !important;
            padding-bottom: 1px !important;
          }
          #a4-financial-report-sheet #summary-type-2 div[class*="h-[23px]"] {
            height: 17px !important;
          }
          #a4-financial-report-sheet > div:first-child > div:last-child {
            margin-top: 2px !important;
            padding: 2px !important;
          }
          #a4-financial-report-sheet table.audit-table {
            width: 100% !important;
            box-sizing: border-box !important;
            page-break-inside: auto !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            border: 1.8px solid #1e293b !important;
            border-left: 2px solid #1e293b !important;
            border-right: 2px solid #1e293b !important;
            border-top: 1.8px solid #1e293b !important;
            border-bottom: 1.8px solid #1e293b !important;
          }
          #a4-financial-report-sheet table.audit-table th:first-child,
          #a4-financial-report-sheet table.audit-table td:first-child,
          #a4-financial-report-sheet table.audit-table tr > *:first-child {
            border-left: 2px solid #1e293b !important;
          }
          #a4-financial-report-sheet table.audit-table th:last-child,
          #a4-financial-report-sheet table.audit-table td:last-child,
          #a4-financial-report-sheet table.audit-table tr > *:last-child {
            border-right: 2px solid #1e293b !important;
          }
          #a4-financial-report-sheet table.audit-table th.boundary-col-1-prev,
          #a4-financial-report-sheet table.audit-table td.boundary-col-1-prev,
          #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-child(4) {
            border-right: 2px solid #1e293b !important;
          }
          #a4-financial-report-sheet table.audit-table th.boundary-col-1,
          #a4-financial-report-sheet table.audit-table td.boundary-col-1,
          #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-child(5) {
            border-left: 2px solid #1e293b !important;
          }
          #a4-financial-report-sheet table.audit-table th.boundary-col-2-prev,
          #a4-financial-report-sheet table.audit-table td.boundary-col-2-prev,
          #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-last-child(7) {
            border-right: 2px solid #1e293b !important;
          }
          #a4-financial-report-sheet table.audit-table th.boundary-col-2,
          #a4-financial-report-sheet table.audit-table td.boundary-col-2,
          #a4-financial-report-sheet table.audit-table tbody tr:not(.section-row) td:nth-last-child(6) {
            border-left: 2px solid #1e293b !important;
          }
          #a4-financial-report-sheet table.audit-table th,
          #a4-financial-report-sheet table.audit-table td {
            padding: 0.3px 1.2px !important;
            font-size: 7.4px !important;
            line-height: 1.03 !important;
          }
          #a4-financial-report-sheet table.audit-table thead {
            display: table-header-group !important;
          }
          #a4-financial-report-sheet table.audit-table thead th {
            padding: 1.5px 1px !important;
          }
          #a4-financial-report-sheet table.audit-table tfoot {
            display: table-row-group !important;
            page-break-inside: avoid !important;
          }
          #a4-financial-report-sheet table.audit-table tbody tr.section-row td {
            font-size: 8.3px !important;
            line-height: 1.05;
          }
          #a4-financial-report-sheet table.audit-table tfoot td {
            padding: 2px 1.5px !important;
            font-size: 9.8px !important;
            line-height: 1.1 !important;
          }
          #a4-financial-report-sheet table.audit-table tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          #a4-financial-report-sheet table.audit-table tr.section-row {
            height: 15px !important;
          }
          #a4-financial-report-sheet table.audit-table tbody tr.section-row td {
            font-size: 7.8px !important;
          }
          #a4-financial-report-sheet table.audit-table tfoot tr.section-row {
            height: 22px !important;
          }
          #a4-financial-report-sheet tr.section-row {
            break-before: avoid !important;
            page-break-before: avoid !important;
          }
        }
      `}</style>

      {/* ================= แถบควบคุม Interactive ด้านบน (ไม่พิมพ์) ================= */}
      <div
        className="no-print report-control-bar max-w-[820px] lg:max-w-[1066px] mx-auto mb-2 bg-slate-900 text-white px-3 py-2 rounded-lg flex flex-wrap items-center justify-between gap-2 shadow"
        style={{ fontFamily: "'Sarabun', sans-serif" }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-2 py-0.5 rounded bg-indigo-900 text-indigo-100 font-black text-[10.5px] tracking-wide flex items-center gap-1 shadow-xs border border-indigo-700">
            📊 รายงานการเงิน
          </span>

          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex-wrap">
            {availableLocations.map((loc) => {
              const closed = isLocClosed(loc);
              const isSelected = selectedLocation === loc;
              const locLabel =
                loc === "ซอย1" ? "ซอย 1" : loc === "ซอย2" ? "ซอย 2" : loc === "ซามีญ่า" ? "ซามิย่า" : loc;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => onSelectLocation(loc)}
                  title={
                    closed
                      ? `สถานะ: ปิดวันเรียบร้อย (พิมพ์ได้)`
                      : `สถานะ: กำลังเปิดกะ (ยังไม่ปิดวัน - ล็อคการพิมพ์)`
                  }
                  className={`px-2 py-0.5 rounded text-[9.5px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    closed
                      ? isSelected
                        ? "bg-emerald-700 text-white ring-2 ring-emerald-400 shadow"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700 opacity-80"
                      : isSelected
                      ? "bg-amber-900 text-amber-200 border border-amber-500 ring-2 ring-amber-400 shadow"
                      : "bg-amber-950/70 text-amber-300 border border-amber-600/50 hover:bg-amber-900/60 opacity-80"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      closed ? "bg-emerald-300" : "bg-amber-400 animate-pulse"
                    }`}
                  />
                  <span>🏨 {locLabel}</span>
                  <span
                    className={`px-1 py-0.2 rounded text-[7.5px] ${
                      closed
                        ? isSelected
                          ? "bg-emerald-900/80 text-emerald-200"
                          : "bg-emerald-900/60 text-emerald-300"
                        : "bg-amber-800 text-amber-100"
                    }`}
                  >
                    {closed ? "ปิดวันแล้ว ✅" : isProto && loc === "ซามีญ่า" ? "เปิดกะ 3 ⏳ ยังไม่ปิดวัน" : "เปิดกะ ⏳ ยังไม่ปิดวัน"}
                  </span>
                </button>
              );
            })}

            {/* ปุ่มรวมทุกสถานที่ */}
            {(() => {
              const allClosed = isLocClosed("ALL");
              const isSelected = selectedLocation === "ALL";
              return (
                <button
                  type="button"
                  onClick={() => onSelectLocation("ALL")}
                  title="สถานะ: รวมทุกสถานที่"
                  className={`px-2 py-0.5 rounded text-[9.5px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    isSelected
                      ? "bg-slate-700 text-white ring-2 ring-emerald-400 shadow"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700 opacity-80"
                  }`}
                >
                  <span>🌐 รวมทุกสถานที่</span>
                  <span
                    className={`px-1 py-0.2 rounded text-[7.5px] ${
                      allClosed ? "bg-emerald-900/80 text-emerald-200" : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {allClosed ? "ปิดครบแล้ว ✅" : "รอปิดครบ"}
                  </span>
                </button>
              );
            })()}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[9.5px] flex-wrap">
          {isProto && (
            <button
              type="button"
              onClick={() => setIsShortOverDemo((v) => !v)}
              className={`ml-0.5 px-2 py-0.5 rounded font-bold cursor-pointer ${
                isShortOverDemo ? "bg-rose-600 hover:bg-rose-500 text-white" : "bg-amber-600 hover:bg-amber-500 text-white"
              }`}
            >
              ⚡ จำลองเงินขาด/เกิน &amp; เติมเงินทอน
            </button>
          )}

          <button
            type="button"
            onClick={() => onChangeDataMode(isProto ? "live" : "prototype")}
            className={`ml-0.5 px-2 py-0.5 rounded font-bold cursor-pointer border ${
              isProto
                ? "bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-500/40"
                : "bg-cyan-700 hover:bg-cyan-600 text-white border-cyan-400"
            }`}
            title="สลับระหว่างข้อมูลต้นแบบ 3 กะ (ตามไฟล์ PDF) กับข้อมูลจริงตามวันที่เลือก"
          >
            {isProto ? "📡 สลับดูข้อมูลจริงตามวันที่เลือก" : "📋 ดูรายงานต้นแบบ 3 กะ (ตาม PDF)"}
          </button>

          <button
            type="button"
            onClick={handlePrintA4}
            className={`ml-0.5 px-2.5 py-0.5 rounded font-black text-[9.5px] shadow flex items-center gap-1 transition-all ${
              currentLocClosed
                ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                : "bg-slate-600 font-bold text-slate-300 cursor-not-allowed opacity-60"
            }`}
            title={
              currentLocClosed
                ? `พิมพ์รายงานการเงิน ${locationDisplayName} (A4)`
                : "⚠️ ยังไม่ปิดวัน ไม่สามารถพิมพ์ได้"
            }
          >
            🖨️ พิมพ์รายงานการเงิน A4
          </button>

          <button
            type="button"
            onClick={onOpenTransferModal}
            className="ml-0.5 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 font-black text-white text-[9.5px] shadow flex items-center gap-1 cursor-pointer"
            title="พิมพ์ใบตรวจสอบยอดโอนเงินและบัตรเครดิต A4 สำหรับฝ่ายบัญชี"
          >
            💳 พิมพ์ใบตรวจยอดโอน &amp; บัตรเครดิต (A4)
            {transferCardCount > 0 && (
              <span className="bg-white/20 px-1 rounded text-[8px]">{transferCardCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* แถบเครื่องมือควบคุมการซูมและปรับมุมมอง (สำหรับมือถือและจอคอมพิวเตอร์) */}
      <div
        className="no-print report-control-bar w-full max-w-[820px] lg:max-w-[1066px] mx-auto mb-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg flex items-center justify-between gap-2 text-xs shadow-sm"
        style={{ fontFamily: "'Sarabun', sans-serif" }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
            <span>🔍</span>
            <span>มุมมองรายงาน:</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setScaleMode("fit");
              setCustomZoom(fitScale);
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              scaleMode === "fit"
                ? "bg-emerald-600 text-white ring-2 ring-emerald-400 shadow-xs"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
            title="ย่อขนาดให้แสดงผลพอดีหน้าจอโทรศัพท์/หน้าจอปัจจุบัน เห็นรายงานครบทั้งแผ่น ไม่ต้องเลื่อนแนวนอน"
          >
            <span>📱 พอดีจอ</span>
            <span className="text-[9.5px] opacity-80 font-mono">({Math.round(fitScale * 100)}%)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setScaleMode("default");
              setCustomZoom(viewportWidth >= 1024 ? 1.3 : 1);
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
              scaleMode === "default"
                ? "bg-indigo-600 text-white ring-2 ring-indigo-400 shadow-xs"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
            title="ขนาดมาตรฐานตั้งต้น (130% สำหรับจอคอมพิวเตอร์ / 100% สำหรับแท็บเล็ต)"
          >
            ขนาดจริง {viewportWidth >= 1024 ? "130%" : "100%"}
          </button>
        </div>

        <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
          <button
            type="button"
            onClick={() => {
              setScaleMode("custom");
              setCustomZoom(Math.max(0.35, +(currentZoomLevel - 0.1).toFixed(2)));
            }}
            className="px-2 py-0.5 rounded text-[12px] font-black hover:bg-slate-700 text-slate-200 cursor-pointer"
            title="ย่อขนาดลง (-)"
          >
            ➖
          </button>
          <span className="text-[11px] font-mono font-bold text-emerald-400 min-w-[42px] text-center">
            {Math.round(currentZoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={() => {
              setScaleMode("custom");
              setCustomZoom(Math.min(2.0, +(currentZoomLevel + 0.1).toFixed(2)));
            }}
            className="px-2 py-0.5 rounded text-[12px] font-black hover:bg-slate-700 text-slate-200 cursor-pointer"
            title="ขยายขนาดขึ้น (+)"
          >
            ➕
          </button>
        </div>
      </div>

      {/* ================= หน้ากระดาษรายงาน A4 Portrait ================= */}
      {canEditReport && !isProto && (
        <div className="no-print mb-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-[11px] font-bold flex items-center justify-between gap-2 shadow-2xs">
          <span>
            ✏️ โหมดแก้ไขรายงานการเงินโดยตรง (ผู้จัดการ/แอดมิน): แตะที่ <b>แถวรายการห้องพัก</b>,{" "}
            <b>ช่องสรุปกะ (ข้อ 6, 11, 12, 13)</b> หรือ <b>กล่องผู้จัดการ (1, 3, 4)</b> เพื่อแก้ไขข้อมูลด่วน
          </span>
        </div>
      )}
      <div ref={scrollContainerRef} className="w-full overflow-x-auto pb-4 print:p-0 print:overflow-visible">
        <div
          className="a4-scale-stage mx-auto"
          style={{
            width: `${Math.round(820 * currentZoomLevel)}px`,
            height: sheetHeight > 0 ? `${Math.round(sheetHeight * currentZoomLevel)}px` : "auto",
            position: "relative",
          }}
        >
          <div
            ref={sheetRef}
            id="a4-financial-report-sheet"
            className="a4-portrait-container shrink-0"
            style={{
              transform: `scale(${currentZoomLevel})`,
              transformOrigin: "top left",
              margin: 0,
            }}
          >
        <div className="mb-1.5 border border-slate-300 rounded bg-slate-50 p-1.5">
          {/* แถวหัวกระดาษ: ซ้าย=สถานที่ (ไม่มีป้ายปิดวันสมบูรณ์) | กลาง=วันที่ (อยู่กึ่งกลางระหว่างสถานที่กับค้างชำระ) | ขวา=ค้างชำระ/รับจอง/ล่วงหน้า */}
          <div className="flex justify-between items-center border-b border-slate-300 pb-1 mb-1.5 gap-1.5 text-[8.2px]">
            <div className="flex items-center shrink-0">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-black text-slate-900 text-[10px] flex items-center gap-1">
                  🏨 ห้องพักเบิร์ด (<span>{locationDisplayName}</span>)
                </span>
              </div>
            </div>

            <div className="flex-1 flex justify-center items-center min-w-0">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-950 border border-blue-300 rounded font-black text-[9px] whitespace-nowrap">
                📅 {displayDateLabel}
              </span>
            </div>

            <div className="flex items-center gap-1 font-bold shrink-0">
              <span
                className="px-1.5 py-0.2 bg-rose-50 text-rose-950 border border-rose-300 rounded shadow-2xs whitespace-nowrap"
                title="ยอดยกมาค้างชำระ +/- ลูกค้าค้างชำระ/รับชำระหนี้ค้าง = ยอดยกไปค้างชำระ"
              >
                {isProto ? (
                  <>
                    ค้างชำระ: <b>0</b> + <b>600</b> - <b>600</b> = ยกไป <b className="text-rose-700">0 ฿</b>
                  </>
                ) : (
                  <>
                    ค้างชำระ: <b>{fmtNum(recStart)}</b> {recChange >= 0 ? `+ ${fmtNum(recChange)}` : `- ${fmtNum(Math.abs(recChange))}`} = ยกไป{" "}
                    <b className="text-rose-700">{fmtNum(recEnd)} ฿</b>
                  </>
                )}
              </span>
              <span
                className="px-1.5 py-0.2 bg-indigo-50 text-indigo-950 border border-indigo-200 rounded shadow-2xs whitespace-nowrap"
                title="ยอดยกมารับจอง +/- รับจองสุทธิ = ยอดยกไปรับจอง"
              >
                {isProto ? (
                  <>
                    รับจอง: <b>2,400</b> - <b>800</b> = ยกไป <b className="text-indigo-700">1,600 ฿</b>
                  </>
                ) : (
                  <>
                    รับจอง: <b>{fmtNum(resBrought)}</b>{" "}
                    {resNet >= 0 ? `+ ${fmtNum(resNet)}` : `- ${fmtNum(Math.abs(resNet))}`} = ยกไป{" "}
                    <b className="text-indigo-700">{fmtNum(resEnd)} ฿</b>
                  </>
                )}
              </span>
              <span
                className="px-1.5 py-0.2 bg-amber-50 text-amber-950 border border-amber-200 rounded shadow-2xs whitespace-nowrap"
                title="ยอดยกมาล่วงหน้า +/- ล่วงหน้าสุทธิ = ยอดยกไปล่วงหน้า"
              >
                {isProto ? (
                  <>
                    ล่วงหน้า: <b>1,900</b> - <b>700</b> = ยกไป <b className="text-amber-800">1,200 ฿</b>
                  </>
                ) : (
                  <>
                    ล่วงหน้า: <b>{fmtNum(advBrought)}</b>{" "}
                    {advNet >= 0 ? `+ ${fmtNum(advNet)}` : `- ${fmtNum(Math.abs(advNet))}`} = ยกไป{" "}
                    <b className="text-amber-800">{fmtNum(advEnd)} ฿</b>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* ================= ตารางที่ 1: รายการสรุปการเงิน 1-13 + การลงนาม & การส่งมอบเงิน ================= */}
          <div id="summary-type-2">
            <table className="w-full border-collapse border border-slate-400 bg-white text-[8.8px] leading-[1.3]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-400 font-black text-[9.8px]">
                  <th
                    className="border border-slate-400 px-1.5 py-1 text-center text-slate-900"
                    style={{ width: "14.8%" }}
                  >
                    รายการสรุปการเงิน
                  </th>
                  <th
                    className="border border-slate-400 px-1.5 py-1 bg-amber-100/80 text-amber-950 text-right"
                    style={{ width: "26.13%" }}
                  >
                    <div className="font-bold text-[9.8px]">
                      1. กะเช้า ({isProto ? "เมย์" : liveS1.staffName})
                    </div>
                    <div className="text-[7.4px] bg-white/90 px-1 rounded border border-amber-300 inline-block font-medium">
                      {isProto ? "07:00–15:00 น." : liveS1.timeRange}
                    </div>
                  </th>
                  <th
                    className="border border-slate-400 px-1.5 py-1 bg-blue-100/80 text-blue-950 text-right"
                    style={{ width: "26.13%" }}
                  >
                    <div className="font-bold text-[9.8px]">
                      2. กะบ่าย ({isProto ? "แอน" : liveS2.staffName})
                    </div>
                    <div className="text-[7.4px] bg-white/90 px-1 rounded border border-blue-300 inline-block font-medium">
                      {isProto ? "15:00–23:00 น." : liveS2.timeRange}
                    </div>
                  </th>
                  <th
                    className="border border-slate-400 px-1.5 py-1 bg-indigo-100/80 text-indigo-950 text-right"
                    style={{ width: "26.13%" }}
                  >
                    <div className="font-bold text-[9.8px]">
                      3. กะดึก ({isProto ? "บี" : liveS3.staffName})
                    </div>
                    <div className="text-[7.4px] bg-white/90 px-1 rounded border border-indigo-300 inline-block font-medium">
                      {isProto ? "23:00–07:00 น." : liveS3.timeRange}
                    </div>
                  </th>
                  <th
                    className="border border-slate-400 px-0.5 py-1 bg-slate-800 text-white text-center whitespace-nowrap text-[8.8px] font-black"
                    style={{ width: "6.81%" }}
                  >
                    รวมทั้งวัน
                  </th>
                </tr>
              </thead>

              {isProto ? (
                <tbody className="text-slate-800">
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800 whitespace-nowrap">
                      1. รายได้รวมในกะ
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right">
                      <span className="text-[7.8px] text-slate-500 mr-1">(13 ห้อง)</span>
                      <b className="text-[9.8px] text-slate-900">8,360 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right">
                      <span className="text-[7.8px] text-slate-500 mr-1">(25 ห้อง)</span>
                      <b className="text-[9.8px] text-slate-900">16,450 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right">
                      <span className="text-[7.8px] text-slate-500 mr-1">(2 ห้อง)</span>
                      <b className="text-[9.8px] text-slate-900">1,300 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-black text-slate-900 text-[9.8px]">
                      26,110 ฿
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      2. ค้างชำระ (-) / รับชำระ (+)
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right text-slate-400"></td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right bg-rose-50/70">
                      <span className="text-[7.8px] text-rose-800 font-bold mr-1">(ค้าง 109)</span>
                      <b className="text-[9.8px] text-rose-700 font-black">-600 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right bg-emerald-50/70">
                      <span className="text-[7.8px] text-emerald-800 font-bold mr-1">(รับ 109: 08/11)</span>
                      <b className="text-[9.8px] text-emerald-700 font-black">+600 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50"></td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      3. เครดิต รับจอง &amp; ล่วงหน้า
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right">
                      <span className="text-[7.8px] text-slate-500 mr-1">(-700 &amp; -1,300)</span>
                      <b className="text-[9.8px] text-amber-900">-2,000 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right">
                      <span className="text-[7.8px] text-slate-500 mr-1">(-100 &amp; +600)</span>
                      <b className="text-[9.8px] text-emerald-800">+500 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right text-slate-400"></td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-amber-900">
                      -1,500 ฿
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      4. หัก โอน / บัตรเครดิต
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-bold text-blue-800 text-[9.8px]">
                      -3,360 ฿
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-bold text-blue-800 text-[9.8px]">
                      -6,580 ฿
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-bold text-blue-800 text-[9.8px]">
                      -2,300 ฿
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-blue-900 text-[9.8px]">
                      -12,240 ฿
                    </td>
                  </tr>
                  <tr className="bg-emerald-50/70 font-bold">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-emerald-950">
                      5. เงินสดรับสุทธิในกะ
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-black text-emerald-800 text-[10px]">
                      +3,000 ฿
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-black text-emerald-800 text-[10px]">
                      +9,770 ฿
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-black text-rose-700 text-[10px]">
                      -400 ฿
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-emerald-100/80 font-black text-emerald-900 text-[10.3px]">
                      +12,370 ฿
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      6. บวก เงินสดยกมาต้นกะ
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right">
                      <span className="text-[7.8px] text-slate-500 mr-1">(ยกมา 0)</span>
                      <b className="text-[9.8px] text-slate-900">3,000 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right">
                      <span className="text-[7.8px] text-slate-500 mr-1">(ยกมา 2,900)</span>
                      <b className="text-[9.8px] text-slate-900">12,670 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right">
                      <span className="text-[7.8px] text-slate-500 mr-1">(ยกมา 0)</span>
                      <b className="text-[9.8px] text-rose-700 font-black">-400 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-slate-700">
                      12,370 ฿
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      7. หัก ค่าใช้จ่ายในกะ (-)
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right text-slate-400"></td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right bg-amber-50/70">
                      <span className="text-[7.8px] text-amber-900 font-bold mr-1">(น้ำแข็ง/หลอดไฟ)</span>
                      <b className="text-[9.8px] text-rose-700 font-black">-170 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right text-slate-400"></td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-rose-700">
                      -170 ฿
                    </td>
                  </tr>
                  <tr className="border-t-2 border-b-2 border-slate-400 bg-emerald-100 font-black text-emerald-950 shadow-2xs">
                    <td className="border border-slate-400 px-1.5 py-0.5 font-black text-emerald-950 whitespace-nowrap bg-emerald-100">
                      8. เงินสดก่อนส่งเงิน
                    </td>
                    <td className="border border-slate-400 px-1.5 py-0.5 text-right font-black text-emerald-900 text-[10px] bg-emerald-100">
                      3,000 ฿
                    </td>
                    <td className="border border-slate-400 px-1.5 py-0.5 text-right font-black text-emerald-900 text-[10px] bg-emerald-100">
                      12,500 ฿
                    </td>
                    <td className="border border-slate-400 px-1.5 py-0.5 text-right font-black text-rose-700 text-[10px] bg-emerald-100">
                      -400 ฿
                    </td>
                    <td className="border border-slate-400 px-1 py-0.5 text-right bg-emerald-200/90 font-black text-emerald-950 text-[10.3px]">
                      12,200 ฿
                    </td>
                  </tr>
                  <tr className="border-t border-b border-slate-300 bg-amber-50/20">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-amber-950 bg-amber-50/70 whitespace-nowrap">
                      9. หัก ส่งเงินระหว่างกะ (-)
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right text-slate-400">-</td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right bg-amber-50/70">
                      <span className="text-[7.8px] text-amber-800 mr-1">(เก็บ)</span>
                      <b className="text-[9.8px] text-amber-900 font-black">-2,500 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right text-slate-400">-</td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-amber-900 text-[9.6px]">
                      -2,500 ฿
                    </td>
                  </tr>
                  <tr className="bg-amber-50/40">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-900 whitespace-nowrap">
                      10. เงินสดในเก๊ะตามระบบ
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-black text-slate-900 text-[9.8px]">
                      3,000 ฿
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-black text-slate-900 text-[9.8px]">
                      10,000 ฿
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-black text-rose-700 bg-rose-50 text-[9.8px]">
                      -400 ฿
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-black text-slate-900 text-[9.8px]">
                      9,700 ฿
                    </td>
                  </tr>
                  <tr className="bg-slate-100/90 border-t border-b border-slate-300 font-bold">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-slate-900 whitespace-nowrap">
                      11. เงินสดตรวจนับจริง (ในเก๊ะ)
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-amber-50/40">
                      <div className="flex justify-end items-center gap-1 w-full">
                        <span className="text-[7.2px] leading-none text-rose-700 font-black bg-rose-50 px-1 py-[1px] rounded border border-rose-300 whitespace-nowrap">
                          ขาด -100 ฿
                        </span>
                        <b className="text-[9.8px] leading-tight text-slate-900 font-black">2,900 ฿</b>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-blue-50/40">
                      <div className="flex justify-end items-center gap-1 w-full">
                        <span className="text-[7.2px] leading-none text-emerald-800 font-black bg-emerald-50 px-1 py-[1px] rounded border border-emerald-300 whitespace-nowrap">
                          {isShortOverDemo ? "ขาด -20 ฿" : "เกิน +50 ฿"}
                        </span>
                        <b className="text-[9.8px] leading-tight text-slate-900 font-black">
                          {isShortOverDemo ? "9,980 ฿" : "10,050 ฿"}
                        </b>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-indigo-50/40 text-right">
                      <b className="text-[9.8px] leading-tight text-rose-700 font-black">-400 ฿</b>
                    </td>
                    <td
                      className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-black text-slate-900"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <div className="flex justify-end items-center w-full">
                        <span className="text-[8.2px] leading-none text-rose-700 font-black bg-rose-50 px-1 py-[1px] rounded border border-rose-300 whitespace-nowrap inline-flex items-center">
                          {isShortOverDemo ? "ขาด -120 ฿" : "ขาด -50 ฿"}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-t border-slate-300 bg-rose-50/20">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-rose-950 bg-rose-50/70 whitespace-nowrap">
                      12. หัก ส่งเงิน (-) / บวก เบิกทอน (+)
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right text-slate-400">-</td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right bg-rose-50/60">
                      <span className="text-[7.8px] text-rose-800 mr-1">(เก็บ)</span>
                      <b className="text-[9.8px] text-rose-800 font-black">-10,050 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right bg-emerald-50/90">
                      <span className="text-[7.8px] text-emerald-900 font-bold mr-1">(เบิก)</span>
                      <b className="text-[9.8px] text-emerald-700 font-black">+400 ฿</b>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-rose-900 text-[9.6px]">
                      -9,650 ฿
                    </td>
                  </tr>
                  <tr className="border-t border-b-2 border-slate-500 bg-blue-50/20">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-blue-950 bg-blue-50/70 whitespace-nowrap">
                      13. เงินทอนส่งมอบยกไป
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-black text-emerald-800 text-[9.8px]">
                      2,900 ฿
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-bold text-slate-400 text-[8.5px]">
                      0 ฿
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.5 text-right font-bold text-slate-400 text-[8.5px]">
                      0 ฿
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-100 font-black text-slate-800 text-[9.8px]">
                      0 ฿
                    </td>
                  </tr>

                  {/* ส่วนการลงนาม & การส่งมอบเงิน */}
                  <tr className="bg-slate-100 text-[8.5px] text-slate-800 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-1 py-1.5 font-black text-slate-950 bg-slate-200 text-center text-[12px] leading-tight tracking-tight shadow-2xs">
                      การลงนาม &amp; การส่งมอบเงิน
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-amber-100/70">
                      <div className="flex items-center w-full text-center">
                        <div className="flex-1 text-amber-950 font-bold text-[9.5px]">ผู้ส่งเงิน</div>
                        <div className="w-[38px] shrink-0 border-x border-amber-300 text-amber-950 font-black text-[9.5px]">
                          ยอดเงิน
                        </div>
                        <div className="flex-1 text-amber-950 font-bold text-[9.5px]">ผู้รับเงิน</div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-blue-100/70">
                      <div className="flex items-center w-full text-center">
                        <div className="flex-1 text-blue-950 font-bold text-[9.5px]">ผู้ส่งเงิน</div>
                        <div className="w-[38px] shrink-0 border-x border-blue-300 text-blue-950 font-black text-[9.5px]">
                          ยอดเงิน
                        </div>
                        <div className="flex-1 text-blue-950 font-bold text-[9.5px]">ผู้รับเงิน</div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-indigo-100/70">
                      <div className="flex items-center w-full text-center">
                        <div className="flex-1 text-indigo-950 font-bold text-[9.5px]">ผู้ส่งเงิน</div>
                        <div className="w-[38px] shrink-0 border-x border-indigo-300 text-indigo-950 font-black text-[9.5px]">
                          ยอดเงิน
                        </div>
                        <div className="flex-1 text-indigo-950 font-bold text-[9.5px]">ผู้รับเงิน</div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center bg-slate-200/90 text-slate-950 font-black whitespace-nowrap">
                      <div className="text-[9.5px] leading-tight">สรุปยอดรวม</div>
                      <div className="text-[8.5px] font-black text-rose-900 mt-0.5">(12,150 ฿)</div>
                    </td>
                  </tr>

                  {/* (9) ลายเซ็น ส่งเงินระหว่างกะ */}
                  <tr className="text-[7.6px] border-b border-slate-200">
                    <td className="border border-slate-300 px-1.5 py-1 font-black text-amber-950 bg-amber-50/70 text-center text-[9px] leading-snug">
                      <span className="font-black text-amber-950 text-[9.8px]">(9) ลายเซ็น ส่งเงินระหว่างกะ</span>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-slate-50 text-slate-400">
                      <div className="flex items-center h-[23px] w-full text-center justify-center">
                        <span className="text-[8.5px] font-bold text-slate-400 italic">ไม่มีการส่งมอบ (-)</span>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-amber-50/50">
                      <div className="flex items-center min-h-[25px] py-0.5 w-full">
                        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                          <span className="sig-canvas text-[11px] leading-tight">Ann T.</span>
                          <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5">27 พ.ย. 14:10 น.</span>
                        </div>
                        <div className="w-[38px] shrink-0 border-x border-amber-300 text-center flex flex-col justify-center items-center px-0.5">
                          <span className="font-black text-amber-950 text-[8.2px] leading-tight whitespace-nowrap">
                            2,500 ฿
                          </span>
                          <span className="text-[6.5px] font-bold text-amber-800 leading-none mt-0.5">(เก็บ)</span>
                        </div>
                        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                          <span className="sig-canvas text-[11px] text-amber-900 leading-tight">Monthira K.</span>
                          <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5">27 พ.ย. 14:15 น.</span>
                        </div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-slate-50 text-slate-400">
                      <div className="flex items-center min-h-[25px] w-full text-center justify-center">
                        <span className="text-[8.5px] font-bold text-slate-400 italic">ไม่มีการส่งมอบ (-)</span>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center bg-amber-50">
                      <div className="font-black text-amber-950 text-[9.5px]">2,500 ฿</div>
                      <div className="text-[7.5px] text-amber-800 font-bold mt-0.5">ส่งระหว่างกะ</div>
                    </td>
                  </tr>

                  {/* (12) ลายเซ็น ส่งเงินปิดกะ */}
                  <tr className="text-[7.6px] border-b border-slate-300">
                    <td className="border border-slate-300 px-1.5 py-1 font-black text-rose-950 bg-rose-50/70 text-center text-[9px] leading-snug">
                      <span className="font-black text-rose-950 text-[9.8px]">(12) ลายเซ็น ส่งเงินปิดกะ</span>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-slate-50 text-slate-400">
                      <div className="flex items-center min-h-[25px] w-full text-center justify-center">
                        <span className="text-[8.5px] font-bold text-slate-400 italic">ไม่มีการส่งมอบ (-)</span>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-rose-50/50">
                      <div className="flex items-center min-h-[25px] py-0.5 w-full">
                        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                          <span className="sig-canvas text-[11px] leading-tight">Ann T.</span>
                          <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5">27 พ.ย. 15:02 น.</span>
                        </div>
                        <div className="w-[38px] shrink-0 border-x border-rose-300 text-center flex flex-col justify-center items-center px-0.5">
                          <span className="font-black text-rose-900 text-[8.2px] leading-tight whitespace-nowrap">
                            10,050 ฿
                          </span>
                          <span className="text-[6.5px] font-bold text-rose-700 leading-none mt-0.5">(เก็บ)</span>
                        </div>
                        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                          <span className="sig-canvas text-[11px] text-rose-900 leading-tight">Monthira K.</span>
                          <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5">27 พ.ย. 15:05 น.</span>
                        </div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-emerald-50/50">
                      <div className="flex items-center min-h-[25px] py-0.5 w-full">
                        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                          <span className="sig-canvas text-[11px] text-slate-700 leading-tight">Monthira K.</span>
                          <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5">27 พ.ย. 23:05 น.</span>
                        </div>
                        <div className="w-[38px] shrink-0 border-x border-emerald-300 text-center flex flex-col justify-center items-center px-0.5">
                          <span className="font-black text-emerald-800 text-[8.2px] leading-tight whitespace-nowrap">
                            +400 ฿
                          </span>
                          <span className="text-[6.5px] font-bold text-emerald-700 leading-none mt-0.5">(เบิก)</span>
                        </div>
                        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                          <span className="sig-canvas text-[11px] text-emerald-900 leading-tight">Bee S.</span>
                          <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5">27 พ.ย. 23:10 น.</span>
                        </div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center bg-rose-50">
                      <div className="font-black text-rose-900 text-[9.5px]">9,650 ฿</div>
                      <div className="text-[7.5px] text-rose-800 font-bold mt-0.5">เก็บส่งปิดกะ</div>
                    </td>
                  </tr>

                  {/* (13) ลายเซ็น ส่งมอบเงินกะถัดไป */}
                  <tr className="text-[7.6px] border-b-2 border-slate-400">
                    <td className="border border-slate-300 px-1 py-1 font-black text-blue-950 bg-blue-50/70 text-center text-[9px] leading-snug whitespace-nowrap">
                      <span className="font-black text-blue-950 text-[9.2px] whitespace-nowrap leading-none">
                        (13) ลายเซ็น ส่งมอบเงินกะถัดไป
                      </span>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-amber-50/60">
                      <div className="flex items-center min-h-[25px] py-0.5 w-full">
                        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                          <span className="sig-canvas text-[11px] leading-tight">May P.</span>
                          <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5">27 พ.ย. 07:00 น.</span>
                        </div>
                        <div className="w-[38px] shrink-0 border-x border-amber-300 text-center flex flex-col justify-center items-center px-0.5">
                          <span className="font-black text-emerald-700 text-[8.2px] leading-tight whitespace-nowrap">
                            2,900 ฿
                          </span>
                          <span className="text-[6.5px] font-bold text-slate-500 leading-none mt-0.5">(ส่งต่อ)</span>
                        </div>
                        <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                          <span className="sig-canvas text-[11px] text-amber-900 leading-tight">Ann T.</span>
                          <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5">27 พ.ย. 07:05 น.</span>
                        </div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-slate-50 text-slate-400">
                      <div className="flex items-center h-[23px] w-full text-center justify-center">
                        <span className="text-[8.5px] font-bold text-slate-400 italic">ไม่มีการส่งมอบ (-)</span>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-slate-50 text-slate-400">
                      <div className="flex items-center h-[23px] w-full text-center justify-center">
                        <span className="text-[8.5px] font-bold text-slate-400 italic">ไม่มีการส่งมอบ (-)</span>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center bg-slate-100">
                      <div className="font-black text-slate-700 text-[9.5px]">0 ฿</div>
                      <div className="text-[7.5px] text-slate-600 font-bold mt-0.5">ทอนยกไป</div>
                    </td>
                  </tr>
                </tbody>
              ) : (
                /* ================= โหมดข้อมูลจริงจากระบบ (Live Supabase Data) ================= */
                <tbody className="text-slate-800">
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800 whitespace-nowrap">
                      1. รายได้รวมในกะ
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td key={i} className="border border-slate-300 px-1.5 py-0.5 text-right">
                        {s.rev > 0 || s.roomCount > 0 ? (
                          <>
                            <span className="text-[7.8px] text-slate-500 mr-1">({s.roomCount} ห้อง)</span>
                            <b className="text-[9.8px] text-slate-900">{fmtNum(s.rev)} ฿</b>
                          </>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-black text-slate-900 text-[9.8px]">
                      {fmtNum(grandTotals.totalCharge)} ฿
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      2. ค้างชำระ (-) / รับชำระ (+)
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td key={i} className="border border-slate-300 px-1.5 py-0.5 text-right">
                        {s.recNetInShift !== 0 ? (
                          <b className={`text-[9.8px] ${s.recNetInShift < 0 ? "text-rose-700" : "text-emerald-800"}`}>
                            {fmtSignedNum(s.recNetInShift)} ฿
                          </b>
                        ) : (
                          ""
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-rose-800">
                      {recChange !== 0 ? `${fmtSignedNum(-recChange)} ฿` : ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      3. เครดิต รับจอง &amp; ล่วงหน้า
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td key={i} className="border border-slate-300 px-1.5 py-0.5 text-right">
                        {s.resAdvNet !== 0 ? (
                          <>
                            <span className="text-[7.8px] text-slate-500 mr-1">{s.resAdvNote}</span>
                            <b
                              className={`text-[9.8px] ${
                                s.resAdvNet > 0 ? "text-emerald-800" : "text-amber-900"
                              }`}
                            >
                              {fmtSignedNum(s.resAdvNet)} ฿
                            </b>
                          </>
                        ) : (
                          ""
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-amber-900">
                      {grandTotals.reservationCredit + grandTotals.advanceCredit !== 0
                        ? `${fmtSignedNum(grandTotals.reservationCredit + grandTotals.advanceCredit)} ฿`
                        : ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      4. หัก โอน / บัตรเครดิต
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        className="border border-slate-300 px-1.5 py-0.5 text-right font-bold text-blue-800 text-[9.8px]"
                      >
                        {s.transCard > 0 ? `-${fmtNum(s.transCard)} ฿` : "-"}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-blue-900 text-[9.8px]">
                      {grandTotals.transferCard > 0 ? `-${fmtNum(grandTotals.transferCard)} ฿` : "0 ฿"}
                    </td>
                  </tr>
                  <tr className="bg-emerald-50/70 font-bold">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-emerald-950">
                      5. เงินสดรับสุทธิในกะ
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        className={`border border-slate-300 px-1.5 py-0.5 text-right font-black text-[10px] ${
                          !s.hasShift ? "text-slate-400 font-normal" : s.netCashInShift < 0 ? "text-rose-700" : "text-emerald-800"
                        }`}
                      >
                        {s.hasShift ? `${fmtSignedNum(s.netCashInShift)} ฿` : "-"}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-emerald-100/80 font-black text-emerald-900 text-[10.3px]">
                      {fmtSignedNum(grandTotals.cash)} ฿
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      6. บวก เงินสดยกมาต้นกะ
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        onClick={() =>
                          canEditReport &&
                          !isProto &&
                          s.hasShift &&
                          onClickEditShiftSummary?.({
                            slotIdx: i as 0 | 1 | 2,
                            sh: s.sh,
                            staffName: s.staffName,
                            timeRange: s.timeRange,
                            carriedIn: s.carriedIn,
                            sysDrawer: s.sysDrawer,
                            countedDrawer: s.countedDrawer,
                            closeSent: s.closeSent,
                            carriedOut: s.carriedOut,
                            closeHandoverObj: s.closeHandoverObj,
                          })
                        }
                        className={`border border-slate-300 px-1.5 py-0.5 text-right ${
                          canEditReport && !isProto && s.hasShift
                            ? "cursor-pointer hover:bg-amber-50/80 hover:ring-1 hover:ring-amber-400"
                            : ""
                        }`}
                      >
                        {s.hasShift ? (
                          <>
                            {renderAuditTrail(`shift_slot_${i}_row6`)}
                            <span className="text-[7.8px] text-slate-500 mr-1">(ยกมา {fmtNum(s.carriedIn)})</span>
                            <b
                              className={`text-[9.8px] ${
                                s.afterCarried < 0 ? "text-rose-700 font-black" : "text-slate-900"
                              }`}
                            >
                              {fmtNum(s.afterCarried)} ฿
                            </b>
                          </>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-slate-700">
                      {fmtNum(grandTotals.cash + liveS1.carriedIn)} ฿
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
                      7. หัก ค่าใช้จ่ายในกะ (-)
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        className={`border border-slate-300 px-1.5 py-0.5 text-right ${
                          s.expSum > 0 ? "bg-amber-50/70" : "text-slate-400"
                        }`}
                      >
                        {s.expSum > 0 ? (
                          <>
                            {s.expNote && (
                              <span className="text-[7.8px] text-amber-900 font-bold mr-1">({s.expNote})</span>
                            )}
                            <b className="text-[9.8px] text-rose-700 font-black">-{fmtNum(s.expSum)} ฿</b>
                          </>
                        ) : (
                          ""
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-rose-700">
                      {liveInExpTotal > 0 ? `-${fmtNum(liveInExpTotal)} ฿` : "0 ฿"}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-b-2 border-slate-400 bg-emerald-100 font-black text-emerald-950 shadow-2xs">
                    <td className="border border-slate-400 px-1.5 py-0.5 font-black text-emerald-950 whitespace-nowrap bg-emerald-100">
                      8. เงินสดก่อนส่งเงิน
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        className={`border border-slate-400 px-1.5 py-0.5 text-right font-black text-[10px] bg-emerald-100 ${
                          !s.hasShift ? "text-slate-400 font-normal" : s.beforeHandover < 0 ? "text-rose-700" : "text-emerald-900"
                        }`}
                      >
                        {s.hasShift ? `${fmtNum(s.beforeHandover)} ฿` : "-"}
                      </td>
                    ))}
                    <td className="border border-slate-400 px-1 py-0.5 text-right bg-emerald-200/90 font-black text-emerald-950 text-[10.3px]">
                      {fmtNum(grandTotals.cash + liveS1.carriedIn - liveInExpTotal)} ฿
                    </td>
                  </tr>
                  <tr className="border-t border-b border-slate-300 bg-amber-50/20">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-amber-950 bg-amber-50/70 whitespace-nowrap">
                      9. หัก ส่งเงินระหว่างกะ (-)
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        className={`border border-slate-300 px-1.5 py-0.5 text-right ${
                          s.midSent > 0 ? "bg-amber-50/70" : "text-slate-400"
                        }`}
                      >
                        {s.midSent > 0 ? (
                          <>
                            <span className="text-[7.8px] text-amber-800 mr-1">(เก็บ)</span>
                            <b className="text-[9.8px] text-amber-900 font-black">-{fmtNum(s.midSent)} ฿</b>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-amber-900 text-[9.6px]">
                      {liveMidSentTotal > 0 ? `-${fmtNum(liveMidSentTotal)} ฿` : "0 ฿"}
                    </td>
                  </tr>
                  <tr className="bg-amber-50/40">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-bold text-slate-900 whitespace-nowrap">
                      10. เงินสดในเก๊ะตามระบบ
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        className={`border border-slate-300 px-1.5 py-0.5 text-right font-black text-[9.8px] ${
                          !s.hasShift ? "text-slate-400 font-normal" : s.sysDrawer < 0 ? "text-rose-700 bg-rose-50" : "text-slate-900"
                        }`}
                      >
                        {s.hasShift ? `${fmtNum(s.sysDrawer)} ฿` : "-"}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-black text-slate-900 text-[9.8px]">
                      {fmtNum(grandTotals.cash + liveS1.carriedIn - liveInExpTotal - liveMidSentTotal)} ฿
                    </td>
                  </tr>
                  <tr className="bg-slate-100/90 border-t border-b border-slate-300 font-bold">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-slate-900 whitespace-nowrap">
                      11. เงินสดตรวจนับจริง (ในเก๊ะ)
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        onClick={() =>
                          canEditReport &&
                          !isProto &&
                          s.hasShift &&
                          onClickEditShiftSummary?.({
                            slotIdx: i as 0 | 1 | 2,
                            sh: s.sh,
                            staffName: s.staffName,
                            timeRange: s.timeRange,
                            carriedIn: s.carriedIn,
                            sysDrawer: s.sysDrawer,
                            countedDrawer: s.countedDrawer,
                            closeSent: s.closeSent,
                            carriedOut: s.carriedOut,
                            closeHandoverObj: s.closeHandoverObj,
                          })
                        }
                        className={`border border-slate-300 px-1 py-0.5 ${
                          i === 0 ? "bg-amber-50/40" : i === 1 ? "bg-blue-50/40" : "bg-indigo-50/40"
                        } ${
                          canEditReport && !isProto && s.hasShift
                            ? "cursor-pointer hover:ring-1 hover:ring-amber-400"
                            : ""
                        }`}
                      >
                        {s.hasShift ? (
                          <div className="flex justify-end items-center gap-1 w-full">
                            {s.diff < 0 && (
                              <span className="text-[7.2px] leading-none text-rose-700 font-black bg-rose-50 px-1 py-[1px] rounded border border-rose-300 whitespace-nowrap">
                                ขาด -{fmtNum(Math.abs(s.diff))} ฿
                              </span>
                            )}
                            {s.diff > 0 && (
                              <span className="text-[7.2px] leading-none text-emerald-800 font-black bg-emerald-50 px-1 py-[1px] rounded border border-emerald-300 whitespace-nowrap">
                                เกิน +{fmtNum(s.diff)} ฿
                              </span>
                            )}
                            {renderAuditTrail(`shift_slot_${i}_row11`)}
                            <b
                              className={`text-[9.8px] leading-tight font-black ${
                                s.countedDrawer < 0 ? "text-rose-700" : "text-slate-900"
                              }`}
                            >
                              {fmtNum(s.countedDrawer)} ฿
                            </b>
                          </div>
                        ) : (
                          <div className="text-right text-slate-400 font-normal">-</div>
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-black text-slate-900">
                      {(() => {
                        const netDiff = liveS1.diff + liveS2.diff + liveS3.diff;
                        return (
                          <div className="flex justify-end items-center w-full">
                            <span
                              className={`text-[8.2px] leading-none font-black px-1 py-[1px] rounded border whitespace-nowrap inline-flex items-center ${
                                netDiff < 0
                                  ? "text-rose-700 bg-rose-50 border-rose-300"
                                  : netDiff > 0
                                  ? "text-emerald-800 bg-emerald-50 border-emerald-300"
                                  : "text-slate-700 bg-slate-100 border-slate-300"
                              }`}
                            >
                              {netDiff < 0
                                ? `ขาด -${fmtNum(Math.abs(netDiff))} ฿`
                                : netDiff > 0
                                ? `เกิน +${fmtNum(netDiff)} ฿`
                                : "ตรง 0 ฿"}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-300 bg-rose-50/20">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-rose-950 bg-rose-50/70 whitespace-nowrap">
                      12. หัก ส่งเงิน (-) / บวก เบิกทอน (+)
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        onClick={() =>
                          canEditReport &&
                          !isProto &&
                          s.hasShift &&
                          onClickEditShiftSummary?.({
                            slotIdx: i as 0 | 1 | 2,
                            sh: s.sh,
                            staffName: s.staffName,
                            timeRange: s.timeRange,
                            carriedIn: s.carriedIn,
                            sysDrawer: s.sysDrawer,
                            countedDrawer: s.countedDrawer,
                            closeSent: s.closeSent,
                            carriedOut: s.carriedOut,
                            closeHandoverObj: s.closeHandoverObj,
                          })
                        }
                        className={`border border-slate-300 px-1.5 py-0.5 text-right ${
                          s.closeSent > 0
                            ? "bg-rose-50/60"
                            : s.closeSent < 0
                            ? "bg-emerald-50/90"
                            : "text-slate-400"
                        } ${
                          canEditReport && !isProto && s.hasShift
                            ? "cursor-pointer hover:ring-1 hover:ring-amber-400"
                            : ""
                        }`}
                      >
                        {renderAuditTrail(`shift_slot_${i}_row12`)}
                        {s.closeSent > 0 ? (
                          <>
                            <span className="text-[7.8px] text-rose-800 mr-1">(เก็บ)</span>
                            <b className="text-[9.8px] text-rose-800 font-black">-{fmtNum(s.closeSent)} ฿</b>
                          </>
                        ) : s.closeSent < 0 ? (
                          <>
                            <span className="text-[7.8px] text-emerald-900 font-bold mr-1">(เบิก)</span>
                            <b className="text-[9.8px] text-emerald-700 font-black">
                              +{fmtNum(Math.abs(s.closeSent))} ฿
                            </b>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-50 font-bold text-rose-900 text-[9.6px]">
                      {liveCloseSentTotal !== 0 ? `${fmtSignedNum(-liveCloseSentTotal)} ฿` : "0 ฿"}
                    </td>
                  </tr>
                  <tr className="border-t border-b-2 border-slate-500 bg-blue-50/20">
                    <td className="border border-slate-300 px-1.5 py-0.5 font-black text-blue-950 bg-blue-50/70 whitespace-nowrap">
                      13. เงินทอนส่งมอบยกไป
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        onClick={() =>
                          canEditReport &&
                          !isProto &&
                          s.hasShift &&
                          onClickEditShiftSummary?.({
                            slotIdx: i as 0 | 1 | 2,
                            sh: s.sh,
                            staffName: s.staffName,
                            timeRange: s.timeRange,
                            carriedIn: s.carriedIn,
                            sysDrawer: s.sysDrawer,
                            countedDrawer: s.countedDrawer,
                            closeSent: s.closeSent,
                            carriedOut: s.carriedOut,
                            closeHandoverObj: s.closeHandoverObj,
                          })
                        }
                        className={`border border-slate-300 px-1.5 py-0.5 text-right ${
                          s.carriedOut > 0
                            ? "font-black text-emerald-800 text-[9.8px]"
                            : "font-bold text-slate-400 text-[8.5px]"
                        } ${
                          canEditReport && !isProto && s.hasShift
                            ? "cursor-pointer hover:ring-1 hover:ring-amber-400"
                            : ""
                        }`}
                      >
                        {renderAuditTrail(`shift_slot_${i}_row13`)}
                        {fmtNum(s.carriedOut)} ฿
                      </td>
                    ))}
                    <td className="border border-slate-300 px-1 py-0.5 text-right bg-slate-100 font-black text-slate-800 text-[9.8px]">
                      {fmtNum(liveS3.carriedOut || liveS2.carriedOut || liveS1.carriedOut)} ฿
                    </td>
                  </tr>

                  {/* ส่วนการลงนาม & การส่งมอบเงิน (Live) */}
                  <tr className="bg-slate-100 text-[8.5px] text-slate-800 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-1 py-1.5 font-black text-slate-950 bg-slate-200 text-center text-[12px] leading-tight tracking-tight shadow-2xs">
                      การลงนาม &amp; การส่งมอบเงิน
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-amber-100/70">
                      <div className="flex items-center w-full text-center">
                        <div className="flex-1 text-amber-950 font-bold text-[9.5px]">ผู้ส่งเงิน</div>
                        <div className="w-[38px] shrink-0 border-x border-amber-300 text-amber-950 font-black text-[9.5px]">
                          ยอดเงิน
                        </div>
                        <div className="flex-1 text-amber-950 font-bold text-[9.5px]">ผู้รับเงิน</div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-blue-100/70">
                      <div className="flex items-center w-full text-center">
                        <div className="flex-1 text-blue-950 font-bold text-[9.5px]">ผู้ส่งเงิน</div>
                        <div className="w-[38px] shrink-0 border-x border-blue-300 text-blue-950 font-black text-[9.5px]">
                          ยอดเงิน
                        </div>
                        <div className="flex-1 text-blue-950 font-bold text-[9.5px]">ผู้รับเงิน</div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-indigo-100/70">
                      <div className="flex items-center w-full text-center">
                        <div className="flex-1 text-indigo-950 font-bold text-[9.5px]">ผู้ส่งเงิน</div>
                        <div className="w-[38px] shrink-0 border-x border-indigo-300 text-indigo-950 font-black text-[9.5px]">
                          ยอดเงิน
                        </div>
                        <div className="flex-1 text-indigo-950 font-bold text-[9.5px]">ผู้รับเงิน</div>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center bg-slate-200/90 text-slate-950 font-black whitespace-nowrap">
                      <div className="text-[9.5px] leading-tight">สรุปยอดรวม</div>
                      <div className="text-[8.5px] font-black text-rose-900 mt-0.5">
                        ({fmtNum(liveNetFromShifts)} ฿)
                      </div>
                    </td>
                  </tr>
                  <tr className="text-[7.6px] border-b border-slate-200">
                    <td className="border border-slate-300 px-1.5 py-1 font-black text-amber-950 bg-amber-50/70 text-center text-[9px] leading-snug">
                      <span className="font-black text-amber-950 text-[9.8px]">(9) ลายเซ็น ส่งเงินระหว่างกะ</span>
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        className={`border border-slate-300 px-1 py-0.5 ${
                          s.midHandoverObj ? "bg-amber-50/50" : "bg-slate-50 text-slate-400"
                        }`}
                      >
                        {renderLiveSignatureCell(s.midHandoverObj, "(เก็บ)", "amber")}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center bg-amber-50">
                      <div className="font-black text-amber-950 text-[9.5px]">{fmtNum(liveMidSentTotal)} ฿</div>
                      <div className="text-[7.5px] text-amber-800 font-bold mt-0.5">ส่งระหว่างกะ</div>
                    </td>
                  </tr>
                  <tr className="text-[7.6px] border-b border-slate-300">
                    <td className="border border-slate-300 px-1.5 py-1 font-black text-rose-950 bg-rose-50/70 text-center text-[9px] leading-snug">
                      <span className="font-black text-rose-950 text-[9.8px]">(12) ลายเซ็น ส่งเงินปิดกะ</span>
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => (
                      <td
                        key={i}
                        className={`border border-slate-300 px-1 py-0.5 ${
                          s.closeHandoverObj
                            ? s.closeSent < 0
                              ? "bg-emerald-50/50"
                              : "bg-rose-50/50"
                            : "bg-slate-50 text-slate-400"
                        }`}
                      >
                        {renderLiveSignatureCell(
                          s.closeHandoverObj,
                          s.closeSent < 0 ? "(เบิก)" : "(เก็บ)",
                          s.closeSent < 0 ? "emerald" : "rose"
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center bg-rose-50">
                      <div className="font-black text-rose-900 text-[9.5px]">{fmtNum(liveCloseSentTotal)} ฿</div>
                      <div className="text-[7.5px] text-rose-800 font-bold mt-0.5">เก็บส่งปิดกะ</div>
                    </td>
                  </tr>
                  <tr className="text-[7.6px] border-b-2 border-slate-400">
                    <td className="border border-slate-300 px-1 py-1 font-black text-blue-950 bg-blue-50/70 text-center text-[9px] leading-snug whitespace-nowrap">
                      <span className="font-black text-blue-950 text-[9.2px] whitespace-nowrap leading-none">
                        (13) ลายเซ็น ส่งมอบเงินกะถัดไป
                      </span>
                    </td>
                    {[liveS1, liveS2, liveS3].map((s, i) => {
                      const nextStaff =
                        s.closeHandoverObj?.next_shift_receiver_name ||
                        (i === 0 ? liveS2.staffName : i === 1 ? liveS3.staffName : "-");
                      const senderSig = s.closeHandoverObj?.staff_signature;
                      const senderTime = formatSignTime(
                        s.closeHandoverObj?.staff_signed_at || s.closeHandoverObj?.created_at
                      );
                      const receiverSig = s.closeHandoverObj?.next_shift_receiver_signature;
                      const receiverTime = formatSignTime(
                        s.closeHandoverObj?.next_shift_receiver_signed_at
                      );

                      return (
                        <td
                          key={i}
                          className={`border border-slate-300 px-1 py-0.5 ${
                            s.carriedOut > 0 ? "bg-amber-50/60" : "bg-slate-50 text-slate-400"
                          }`}
                        >
                          {s.carriedOut > 0 ? (
                            <div className="flex items-center min-h-[25px] py-0.5 w-full">
                              <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                                {senderSig ? (
                                  <img
                                    src={senderSig}
                                    alt={s.staffName}
                                    className="h-[18px] max-w-full object-contain"
                                  />
                                ) : (
                                  <span className="sig-canvas text-[11px] leading-tight truncate">
                                    {s.staffName}
                                  </span>
                                )}
                                {senderTime && (
                                  <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5 whitespace-nowrap">
                                    {senderTime}
                                  </span>
                                )}
                              </div>
                              <div className="w-[38px] shrink-0 border-x border-amber-300 text-center flex flex-col justify-center items-center px-0.5">
                                <span className="font-black text-emerald-700 text-[8.2px] leading-tight whitespace-nowrap">
                                  {fmtNum(s.carriedOut)} ฿
                                </span>
                                <span className="text-[6.5px] font-bold text-slate-500 leading-none mt-0.5">
                                  (ส่งต่อ)
                                </span>
                              </div>
                              <div className="flex-1 text-center flex flex-col items-center justify-center overflow-hidden px-0.5">
                                {receiverSig ? (
                                  <img
                                    src={receiverSig}
                                    alt={nextStaff}
                                    className="h-[18px] max-w-full object-contain"
                                  />
                                ) : (
                                  <span className="sig-canvas text-[11px] text-amber-900 leading-tight truncate">
                                    {nextStaff}
                                  </span>
                                )}
                                {receiverTime && (
                                  <span className="text-[6.2px] font-semibold text-slate-500 leading-none mt-0.5 whitespace-nowrap">
                                    {receiverTime}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center min-h-[25px] w-full text-center justify-center">
                              <span className="text-[8.5px] font-bold text-slate-400 italic">
                                ไม่มีการส่งมอบ (-)
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center bg-slate-100">
                      <div className="font-black text-slate-700 text-[9.5px]">
                        {fmtNum(liveS3.carriedOut || liveS2.carriedOut || liveS1.carriedOut)} ฿
                      </div>
                      <div className="text-[7.5px] text-slate-600 font-bold mt-0.5">ทอนยกไป</div>
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>

          {/* ================= ส่วนกระทบยอดเงินสดสะสมผู้จัดการ (ซ้าย 1/3) + รายการจ่ายค่าใช้จ่ายเงินสดวันนี้ (ขวา 2/3) : จัดอยู่แถวแนวเดียวกัน ================= */}
          <div className="mt-1 bg-white border border-slate-300 rounded p-1 shadow-xs text-[8px]">
            <div className="flex gap-1 items-stretch">
              {/* ฝั่งซ้าย: 5 กล่องสมการเงินสดสะสมผู้จัดการ (ขยายความกว้างขึ้น +15% โดยคงขนาดตัวหนังสือ/ตัวเลขภายในเท่าเดิม และลดความกว้างกล่องรายจ่ายด้านขวาลงตามสัดส่วน) */}
              <div
                className="bg-slate-50 rounded border border-slate-200 p-[2.5px] flex flex-col justify-center"
                style={{ flex: "0 0 44%" }}
              >
                <div className="grid grid-cols-5 gap-[2.5px] text-center">
                  <div
                    onClick={() =>
                      canEditReport &&
                      !isProto &&
                      onClickEditManagerBox?.({
                        boxType: "box1",
                        mgrBrought,
                        mgrNetShifts,
                        mgrOutExp,
                        mgrBankDep,
                        mgrCarried,
                      })
                    }
                    className={`bg-white px-[2px] py-[4.5px] min-w-0 rounded border border-slate-200 flex flex-col justify-center ${
                      canEditReport && !isProto
                        ? "cursor-pointer hover:ring-1 hover:ring-amber-400 hover:bg-amber-50/40"
                        : ""
                    }`}
                  >
                    <div className="text-[8.2px] leading-tight text-slate-600 font-bold whitespace-nowrap">
                      1. ยกมา
                    </div>
                    <div className="text-[11.9px] font-black text-slate-800 mt-0.5 tracking-tighter leading-none whitespace-nowrap">
                      {renderAuditTrail(`mgr_${selectedLocation}_box1`)}
                      {fmtNum(mgrBrought)} ฿
                    </div>
                  </div>
                  <div className="bg-emerald-50/70 px-[2px] py-[4.5px] min-w-0 rounded border border-emerald-200 flex flex-col justify-center">
                    <div className="text-[8.2px] leading-tight text-emerald-900 font-bold whitespace-nowrap">
                      2. รับสุทธิ
                    </div>
                    <div className="text-[11.9px] font-black text-emerald-700 mt-0.5 tracking-tighter leading-none whitespace-nowrap">
                      +{fmtNum(mgrNetShifts)} ฿
                    </div>
                  </div>
                  <div
                    onClick={() =>
                      canEditReport &&
                      !isProto &&
                      onClickEditManagerBox?.({
                        boxType: "box3",
                        mgrBrought,
                        mgrNetShifts,
                        mgrOutExp,
                        mgrBankDep,
                        mgrCarried,
                      })
                    }
                    className={`bg-rose-50/70 px-[2px] py-[4.5px] min-w-0 rounded border border-rose-200 flex flex-col justify-center ${
                      canEditReport && !isProto
                        ? "cursor-pointer hover:ring-1 hover:ring-amber-400 hover:bg-rose-100/70"
                        : ""
                    }`}
                  >
                    <div className="text-[8.2px] leading-tight text-rose-900 font-bold whitespace-nowrap">
                      3. จ่ายนอกกะ
                    </div>
                    <div className="text-[11.9px] font-black text-rose-700 mt-0.5 tracking-tighter leading-none whitespace-nowrap">
                      {renderAuditTrail(`mgr_${selectedLocation}_box3`)}-{fmtNum(mgrOutExp)} ฿
                    </div>
                  </div>
                  <div
                    onClick={() =>
                      canEditReport &&
                      !isProto &&
                      onClickEditManagerBox?.({
                        boxType: "box4",
                        mgrBrought,
                        mgrNetShifts,
                        mgrOutExp,
                        mgrBankDep,
                        mgrCarried,
                      })
                    }
                    className={`bg-blue-50/70 px-[2px] py-[4.5px] min-w-0 rounded border border-blue-200 flex flex-col justify-center ${
                      canEditReport && !isProto
                        ? "cursor-pointer hover:ring-1 hover:ring-amber-400 hover:bg-blue-100/70"
                        : ""
                    }`}
                  >
                    <div className="text-[8.2px] leading-tight text-blue-900 font-bold whitespace-nowrap">
                      4. ฝากเงิน
                    </div>
                    <div className="text-[11.9px] font-black text-blue-800 mt-0.5 tracking-tighter leading-none whitespace-nowrap">
                      {renderAuditTrail(`mgr_${selectedLocation}_box4`)}-{fmtNum(mgrBankDep)} ฿
                    </div>
                  </div>
                  <div className="bg-amber-50 px-[2px] py-[4.5px] min-w-0 rounded border border-amber-300 flex flex-col justify-center">
                    <div className="text-[8.2px] leading-tight text-amber-950 font-black whitespace-nowrap">
                      5. ยกไป
                    </div>
                    <div className="text-[11.9px] font-black text-amber-900 mt-0.5 tracking-tighter leading-none whitespace-nowrap">
                      {fmtNum(mgrCarried)} ฿
                    </div>
                  </div>
                </div>
              </div>

              {/* ฝั่งขวา: รายการจ่ายค่าใช้จ่ายเงินสดวันนี้ (ขยายเป็น ~2/3 เพื่อรองรับข้อมูลค่าใช้จ่ายจำนวนมาก) */}
              <div
                className="bg-rose-50/40 rounded border border-rose-200 px-1.5 py-0.5 flex flex-col justify-center text-[7.4px] min-w-0"
                style={{ flex: "1 1 0" }}
              >
                <div className="flex justify-between items-center font-bold text-rose-950 border-b border-rose-200 pb-0.5 whitespace-nowrap text-[8.8px]">
                  <span>📝 รายการจ่ายค่าใช้จ่ายเงินสดวันนี้:</span>
                  <span className="font-black text-rose-700 text-[8.8px] ml-1">
                    รวม -{fmtNum(totalCashExpAmount)} ฿
                  </span>
                </div>
                <div className="mt-0.5 space-y-0.5">
                  <div className="flex justify-between items-center whitespace-nowrap gap-1">
                    <span className="truncate min-w-0">
                      • <b>[จ่ายในกะ]</b> {inShiftExpDetailText}
                    </span>
                    <span className="font-black text-rose-800 text-[8px] shrink-0">
                      -{fmtNum(inShiftExpAmount)} ฿
                    </span>
                  </div>
                  <div className="flex justify-between items-center whitespace-nowrap gap-1">
                    <span className="truncate min-w-0">
                      • <b>[จ่ายนอกกะ]</b> {outShiftExpDetailText}
                    </span>
                    <span className="font-black text-rose-800 text-[8px] shrink-0">
                      -{fmtNum(outShiftExpAmount)} ฿
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= ตารางที่ 2: ตารางบันทึกประจำวัน 15 คอลัมน์ ================= */}
        <div className="overflow-x-auto">
          <table className="audit-table">
            <colgroup>
              <col style={{ width: "3.3%" }} />
              <col style={{ width: "12.0%" }} />
              <col style={{ width: "3.6%" }} />
              <col style={{ width: "3.8%" }} />
              <col style={{ width: "6.8%" }} />
              <col style={{ width: "6.4%" }} />
              <col style={{ width: "9.0%" }} />
              <col style={{ width: "4.0%" }} />
              <col style={{ width: "7.8%" }} />
              <col style={{ width: "9.2%" }} />
              <col style={{ width: "9.2%" }} />
              <col style={{ width: "4.5%" }} />
              <col style={{ width: "4.5%" }} />
              <col style={{ width: "12.7%" }} />
              <col style={{ width: "3.2%" }} />
            </colgroup>
            <thead>
              {/* แถบลงชื่อผู้ตรวจ และสรุปรวมทั้งสิ้น 24 ชม. (ย้ายมาไว้เหนือตารางเช็คอิน ใต้กล่อง 5 กล่อง) */}
              <tr
                className="bg-slate-50 text-slate-950 font-black text-[9.8px] border-b-2 border-slate-800 section-row"
                style={{ height: "28px" }}
              >
                <td colSpan={4} className="boundary-col-1-prev px-2 bg-white text-slate-950 font-bold border-l-2 border-slate-700" style={{ height: "28px", fontSize: "9.8px", borderRight: "2px solid #1e293b" }}>
                  <div className="flex justify-between items-center w-full text-[9.8px] text-slate-950 font-bold">
                    <span>ลงชื่อ</span>
                    <span>ผู้ตรวจ</span>
                  </div>
                </td>
                <td
                  className="boundary-col-1 text-right bg-slate-100 text-slate-950 font-black text-[11.3px]"
                  style={{ borderLeft: "2px solid #1e293b", fontSize: "11.3px" }}
                >
                  {fmtNum(grandTotals.roomRate)}
                </td>
                <td className="text-center bg-slate-100 text-slate-800 font-black text-[10.4px]" style={{ fontSize: "10.4px" }}>
                  {grandTotals.adjust ? fmtSignedNum(grandTotals.adjust) : ""}
                </td>
                <td className="text-right bg-slate-100 text-slate-950 font-black text-[11.3px]" style={{ fontSize: "11.3px" }}>
                  {grandTotals.extra ? fmtNum(grandTotals.extra) : ""}
                </td>
                <td className="text-center bg-slate-100 text-slate-800 font-black text-[10.4px]" style={{ fontSize: "10.4px" }}>
                  {grandTotals.minibar ? fmtNum(grandTotals.minibar) : ""}
                </td>
                <td className="boundary-col-2-prev text-right bg-blue-100 text-slate-950 font-black text-[11.8px]" style={{ fontSize: "11.8px", borderRight: "2px solid #1e293b" }}>
                  {fmtNum(grandTotals.totalCharge)}
                </td>
                <td
                  className="boundary-col-2 text-right bg-emerald-100 text-emerald-950 font-black text-[11.8px]"
                  style={{ borderLeft: "2px solid #1e293b", fontSize: "11.8px" }}
                >
                  {fmtNum(grandTotals.cash)}
                </td>
                <td
                  className="bg-blue-100 text-blue-950 font-black px-1 py-0.5 align-middle"
                  style={{ height: "28px", boxSizing: "border-box" }}
                >
                  {activeTransferItems.length === 0 ? null : activeTransferItems.length === 1 ? (
                    <div className="flex items-center justify-end h-full w-full pr-0.5">
                      <div className="flex items-baseline justify-end gap-1 leading-none">
                        <span
                          className={`font-black ${activeTransferItems[0].colorClass} text-[11.3px] leading-none`}
                          style={{ fontSize: "11.3px" }}
                        >
                          {activeTransferItems[0].label}
                        </span>
                        <span
                          className="font-black text-slate-900 text-[11.3px] font-mono leading-none"
                          style={{ fontSize: "11.3px" }}
                        >
                          {fmtNum(activeTransferItems[0].amount)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center items-end h-full w-full leading-none pr-0.5">
                      <div className="inline-grid grid-cols-[auto_auto] items-baseline gap-x-1.5 text-right">
                        {activeTransferItems.map((item) => (
                          <React.Fragment key={item.key}>
                            <span
                              className={`font-black ${item.colorClass} text-[9.2px] text-right leading-none`}
                              style={{ fontSize: "9.2px" }}
                            >
                              {item.label}
                            </span>
                            <span
                              className={`font-black ${item.textColor} text-[9.2px] font-mono text-right leading-none`}
                              style={{ fontSize: "9.2px" }}
                            >
                              {fmtNum(item.amount)}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </td>
                <td
                  className="text-center bg-rose-50 text-rose-800 font-black text-[10.6px]"
                  style={{ borderLeft: "2px solid #312e81", fontSize: "10.6px" }}
                >
                  {grandTotals.reservationCredit !== 0 ? fmtSignedNum(grandTotals.reservationCredit) : ""}
                </td>
                <td
                  className="text-center bg-rose-50 text-rose-800 font-black text-[10.6px]"
                  style={{ borderRight: "1.8px solid #334155", fontSize: "10.6px" }}
                >
                  {grandTotals.advanceCredit !== 0 ? fmtSignedNum(grandTotals.advanceCredit) : ""}
                </td>
                <td colSpan={2} className="text-center bg-slate-50 text-slate-500 border-r-2 border-slate-700"></td>
              </tr>
              <tr>
                <th rowSpan={2} style={{ width: "3.6%" }} className="border-l-2 border-slate-700">
                  #
                </th>
                <th
                  rowSpan={2}
                  style={{ width: "15.3%" }}
                  className="bg-blue-100/70 text-blue-950 font-black border-slate-500"
                >
                  เช็คอิน / จอง
                </th>
                <th rowSpan={2} style={{ width: "3.75%" }}>
                  ห้อง
                </th>
                <th rowSpan={2} className="boundary-col-1-prev" style={{ width: "3.9%", borderRight: "2px solid #1e293b" }}>
                  พนง.
                </th>
                <th
                  colSpan={5}
                  className="boundary-col-1 boundary-col-2-prev bg-blue-50 text-blue-950 border-b border-slate-400"
                  style={{ borderLeft: "2px solid #1e293b", borderRight: "2px solid #1e293b" }}
                >
                  รายการเรียกเก็บ (รายได้วันนี้)
                </th>
                <th
                  colSpan={2}
                  className="boundary-col-2 bg-emerald-100/90 text-emerald-950 font-black border-b border-slate-400"
                  style={{ borderLeft: "2px solid #1e293b" }}
                >
                  ชำระเงิน
                </th>
                <th
                  colSpan={2}
                  className="bg-indigo-100/90 text-indigo-950 font-black border-b border-slate-400"
                  style={{ borderLeft: "2px solid #312e81", borderRight: "1.8px solid #334155" }}
                >
                  เครดิต
                </th>
                <th rowSpan={2} style={{ width: "12.2%" }} className="bg-amber-50 text-amber-950">
                  ช่วงการใช้ไฟจริง
                </th>
                <th
                  rowSpan={2}
                  style={{ width: "3.2%", padding: "2px 0" }}
                  className="bg-slate-100 text-slate-900 text-center align-middle font-black border-r-2 border-slate-700"
                >
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <span className="text-[10px] leading-none text-slate-700">☑</span>
                    <span className="text-[6.5px] leading-tight font-bold">ตรวจ</span>
                  </div>
                </th>
              </tr>
              <tr>
                <th className="boundary-col-1 bg-blue-50/60" style={{ width: "2.6%", borderLeft: "2px solid #1e293b" }}>
                  ค่าห้อง
                </th>
                <th className="bg-blue-50/60 text-slate-900" style={{ width: "2.4%" }}>
                  เพิ่ม/ลด
                </th>
                <th className="bg-blue-50/60" style={{ width: "6.0%" }}>
                  เสริม
                </th>
                <th className="bg-blue-50/60" style={{ width: "3.9%" }}>
                  มินิบาร์
                </th>
                <th className="boundary-col-2-prev bg-blue-100/80 font-black text-blue-950" style={{ width: "4.95%", borderRight: "2px solid #1e293b" }}>
                  รวมเงิน
                </th>
                <th
                  className="boundary-col-2 bg-emerald-50/80 text-emerald-950"
                  style={{ width: "10.5%", borderLeft: "2px solid #1e293b" }}
                >
                  เงินสด
                </th>
                <th className="bg-emerald-50/80 text-emerald-950" style={{ width: "10.5%" }}>
                  โอน / บัตร
                </th>
                <th
                  className="bg-indigo-100/60 text-indigo-950 font-extrabold"
                  style={{ width: "2.05%", borderLeft: "2px solid #312e81" }}
                >
                  รับจอง
                </th>
                <th
                  className="bg-indigo-100/60 text-indigo-950 font-extrabold"
                  style={{ width: "2.05%", borderRight: "1.8px solid #334155" }}
                >
                  ล่วงหน้า
                </th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {activeSections
                .filter((sec) => isProto || sec.rows.length > 0)
                .map((sec, visibleSecIdx) => {
                  const displayShiftNo = isProto ? sec.shiftIndex : visibleSecIdx + 1;
                  const displaySummaryTitle = String(sec.summaryTitle)
                    .replace(/\)\s*:\s*$/, ")")
                    .replace(/รวมกะที่\s*\d+/, `รวมกะที่ ${displayShiftNo}`);
                  const visibleRows = sec.rows.filter(
                    (r) => rowFilter === "all" || r.kind === rowFilter
                  );
                  return (
                    <React.Fragment key={sec.shiftIndex}>
                      {visibleRows.map((r) => {
                        if (r.kind === "anomaly" && !r.roomRate) {
                          return (
                            <tr
                              key={r.id}
                              onClick={() => canEditReport && !isProto && onClickEditRow?.(r)}
                              className={`bg-rose-200 border-y border-rose-400 font-bold text-rose-950 item-anomaly ${
                                canEditReport && !isProto ? "cursor-pointer hover:bg-rose-300/80" : ""
                              }`}
                            >
                              <td className="text-center font-black text-rose-950 border-l-2 border-slate-700">{r.rowNo}</td>
                              <td className="text-right pr-1.5 font-black text-rose-950">{r.checkInLabel}</td>
                              <td className="text-center font-black text-rose-950">{r.roomNo}</td>
                              <td className="text-center text-rose-800 boundary-col-1-prev">{r.staffName}</td>
                              <td className="text-center text-rose-800 boundary-col-1">
                                {renderAuditTrail(`row_${r.id}_roomRate`)}
                              </td>
                              <td className="text-center text-rose-800">
                                {renderAuditTrail(`row_${r.id}_adjust`)}
                              </td>
                              <td className="text-center text-rose-800">
                                {renderAuditTrail(`row_${r.id}_extra`)}
                              </td>
                              <td className="text-center text-rose-800">
                                {renderAuditTrail(`row_${r.id}_minibar`)}
                              </td>
                              <td className="text-center text-rose-800 font-black boundary-col-2-prev">
                                {renderAuditTrail(`row_${r.id}_totalCharge`)}
                              </td>
                              <td className="text-center text-rose-800 boundary-col-2">
                                {renderAuditTrail(`row_${r.id}_cash`)}
                              </td>
                              <td className="text-center text-rose-800">
                                {renderAuditTrail(`row_${r.id}_transfer`)}
                              </td>
                              <td className="text-center text-rose-800"></td>
                              <td className="text-center text-rose-800"></td>
                              <td className="text-center font-black text-rose-950">{r.powerWindowDisplay}</td>
                              <td className="text-center border-r-2 border-slate-700"></td>
                            </tr>
                          );
                        }

                        if (r.kind === "anomaly" && r.roomRate) {
                          return (
                            <tr
                              key={r.id}
                              onClick={() => canEditReport && !isProto && onClickEditRow?.(r)}
                              className={`bg-rose-200 border-y border-rose-400 font-bold text-rose-950 item-anomaly ${
                                canEditReport && !isProto ? "cursor-pointer hover:bg-rose-300/80" : ""
                              }`}
                            >
                              <td className="text-center font-black text-rose-950 border-l-2 border-slate-700">{r.rowNo}</td>
                              <td className="text-center font-black text-rose-950">{r.checkInLabel}</td>
                              <td className="text-center font-black text-rose-950">{r.roomNo}</td>
                              <td className="text-center text-rose-950 font-bold boundary-col-1-prev">{r.staffName}</td>
                              <td className="text-right font-black text-rose-950 boundary-col-1">
                                {renderAuditTrail(`row_${r.id}_roomRate`)}
                                {fmtNum(r.roomRate)}
                              </td>
                              <td className="text-center text-rose-800">
                                {renderAuditTrail(`row_${r.id}_adjust`)}
                                {r.adjust ? fmtSignedNum(r.adjust) : ""}
                              </td>
                              <td className="text-center text-rose-800">
                                {renderAuditTrail(`row_${r.id}_extra`)}
                                {r.extraAmount ? fmtNum(r.extraAmount) : ""}
                              </td>
                              <td className="text-center text-rose-800">
                                {renderAuditTrail(`row_${r.id}_minibar`)}
                                {r.minibarAmount ? fmtNum(r.minibarAmount) : ""}
                              </td>
                              <td className="text-right font-black text-rose-950 boundary-col-2-prev">
                                {renderAuditTrail(`row_${r.id}_totalCharge`)}
                                {fmtNum(r.totalCharge)}
                              </td>
                              <td className="text-center text-rose-800 boundary-col-2">
                                {renderAuditTrail(`row_${r.id}_cash`)}
                                {r.cashDisplay || ""}
                              </td>
                              <td className="text-center text-rose-800">
                                {renderAuditTrail(`row_${r.id}_transfer`)}
                                {r.transferCardDisplay || ""}
                              </td>
                              <td className="text-center text-rose-800"></td>
                              <td className="text-center text-rose-800"></td>
                              <td className="text-center font-black text-rose-950">{r.powerWindowDisplay}</td>
                              <td className="text-center border-r-2 border-slate-700"></td>
                            </tr>
                          );
                        }

                        if (r.kind === "booking") {
                          const tcColor =
                            r.transferCardColor === "purple"
                              ? "text-purple-700"
                              : r.transferCardColor === "emerald"
                              ? "text-emerald-700"
                              : r.transferCardColor === "blue"
                              ? "text-blue-800"
                              : "text-slate-700";
                          return (
                            <tr
                              key={r.id}
                              onClick={() => canEditReport && !isProto && onClickEditRow?.(r)}
                              className={`bg-indigo-50/60 border-y border-indigo-200 item-booking ${
                                canEditReport && !isProto ? "cursor-pointer hover:bg-indigo-100/80" : ""
                              }`}
                            >
                              <td className="text-center font-bold text-indigo-900 border-l-2 border-slate-700">{r.rowNo}</td>
                              <td className="text-center font-black text-indigo-950 bg-indigo-100/70">
                                {r.checkInLabel}
                              </td>
                              <td className="text-center font-black text-indigo-950">{r.roomNo}</td>
                              <td className="text-center boundary-col-1-prev">{r.staffName}</td>
                              <td
                                colSpan={5}
                                className="text-center font-bold text-indigo-950 bg-indigo-50/70 text-[6.6px] boundary-col-1 boundary-col-2-prev"
                              >
                                {r.bookingRateSummary}
                              </td>
                              <td
                                className={`${
                                  r.cashDisplay
                                    ? "text-right font-bold text-blue-900 bg-emerald-50/70"
                                    : "text-center text-slate-400"
                                } boundary-col-2`}
                              >
                                {renderAuditTrail(`row_${r.id}_cash`)}
                                {r.cashDisplay || ""}
                              </td>
                              <td
                                className={
                                  r.transferCardDisplay
                                    ? `text-center font-bold ${tcColor}`
                                    : "text-center text-slate-400"
                                }
                              >
                                {renderAuditTrail(`row_${r.id}_transfer`)}
                                {r.transferCardDisplay || ""}
                              </td>
                              <td className="text-center font-black text-emerald-800 bg-emerald-100/70">
                                {r.reservationCreditDisplay || ""}
                              </td>
                              <td className="text-center text-slate-400">{r.advanceCreditDisplay || ""}</td>
                              <td className="text-center px-1 text-indigo-950 bg-indigo-50/50 text-[6.4px] max-w-[85px] truncate">
                                {r.powerWindowDisplay || ""}
                              </td>
                              <td className="text-center border-r-2 border-slate-700"></td>
                            </tr>
                          );
                        }

                        // Regular check-in or debt collection row
                        const tcColor =
                          r.transferCardColor === "purple"
                            ? "text-purple-700"
                            : r.transferCardColor === "emerald"
                            ? "text-emerald-700"
                            : r.transferCardColor === "blue"
                            ? "text-blue-800"
                            : "text-slate-700";

                        return (
                          <tr
                            key={r.id}
                            onClick={() => canEditReport && !isProto && onClickEditRow?.(r)}
                            className={`item-checkin ${
                              r.isDebtCollection ? "bg-emerald-50/60 border border-emerald-200" : ""
                            } ${canEditReport && !isProto ? "cursor-pointer hover:bg-amber-50/80 transition-colors" : ""}`}
                          >
                            <td
                              className={`text-center font-bold border-l-2 border-slate-700 ${
                                r.isDebtCollection ? "text-emerald-900" : ""
                              }`}
                            >
                              {r.rowNo}
                            </td>
                            <td
                              className={`text-center ${
                                r.isDebtCollection ? "font-bold text-emerald-800" : ""
                              }`}
                            >
                              {r.checkInLabel}
                            </td>
                            <td
                              className={`text-center font-black ${
                                r.isDebtCollection ? "text-emerald-950" : ""
                              }`}
                            >
                              {r.roomNo}
                            </td>
                            <td className="text-center boundary-col-1-prev">{r.staffName}</td>
                            <td
                              className={`${
                                r.roomRate || auditEdits[`row_${r.id}_roomRate`]
                                  ? "text-right"
                                  : "text-center text-slate-400"
                              } boundary-col-1`}
                              style={
                                auditEdits[`row_${r.id}_roomRate`]
                                  ? { whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }
                                  : undefined
                              }
                            >
                              {renderAuditTrail(`row_${r.id}_roomRate`, true)}
                              {r.roomRate ? (
                                <span title={r.isShortStay ? "ราคาชั่วคราว (*)" : undefined}>
                                  {fmtNum(r.roomRate)}
                                  {r.isShortStay && <b className="text-amber-700 font-black ml-[0.5px]">*</b>}
                                </span>
                              ) : (
                                ""
                              )}
                            </td>
                            <td
                              className="text-center text-slate-700 font-bold"
                              style={
                                r.adjust || auditEdits[`row_${r.id}_adjust`]
                                  ? { whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }
                                  : undefined
                              }
                            >
                              {renderAuditTrail(`row_${r.id}_adjust`, true)}
                              {r.adjust ? (
                                <span
                                  className={`inline-flex items-baseline justify-center whitespace-nowrap ${
                                    r.adjust > 0 ? "text-emerald-700 font-black" : "text-rose-700 font-black"
                                  }`}
                                >
                                  <span>{fmtSignedNum(r.adjust)}</span>
                                </span>
                              ) : (
                                ""
                              )}
                            </td>
                            <td
                              className={
                                r.extraAmount || auditEdits[`row_${r.id}_extra`]
                                  ? "px-1 py-0.5 text-[7px] bg-indigo-50/20 whitespace-normal"
                                  : "text-center text-slate-400"
                              }
                              style={
                                r.extraAmount || auditEdits[`row_${r.id}_extra`]
                                  ? { whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }
                                  : undefined
                              }
                            >
                              {r.extraAmount || auditEdits[`row_${r.id}_extra`] ? (
                                <div className="flex flex-col justify-center w-full leading-[1.05]">
                                  {r.extraAmount && r.extraLabel ? (
                                    <div className="flex items-center justify-between gap-0.5 text-left text-indigo-900 font-semibold text-[6.3px]">
                                      <span className="truncate">{r.extraLabel}</span>
                                      {canEditReport && !isProto && (
                                        <span
                                          className="no-print text-[7px] text-rose-600 shrink-0 leading-none"
                                          title="แตะเพื่อแก้ไขหรือลบรายการค่าเสริมนี้"
                                        >
                                          🗑️
                                        </span>
                                      )}
                                    </div>
                                  ) : null}
                                  <div className="text-right font-bold text-indigo-950 text-[8.3px] leading-none">
                                    {renderAuditTrail(`row_${r.id}_extra`, true)}
                                    {r.extraAmount ? fmtNum(r.extraAmount) : ""}
                                  </div>
                                </div>
                              ) : (
                                ""
                              )}
                            </td>
                            <td
                              className={
                                r.minibarAmount || auditEdits[`row_${r.id}_minibar`]
                                  ? "text-right font-bold"
                                  : "text-center text-slate-400"
                              }
                              style={
                                auditEdits[`row_${r.id}_minibar`]
                                  ? { whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }
                                  : undefined
                              }
                            >
                              {renderAuditTrail(`row_${r.id}_minibar`, true)}
                              {r.minibarAmount ? fmtNum(r.minibarAmount) : ""}
                            </td>
                            <td
                              className={`${
                                r.totalCharge || auditEdits[`row_${r.id}_totalCharge`]
                                  ? "text-right font-bold bg-blue-50/30"
                                  : "text-center text-slate-400"
                              } boundary-col-2-prev`}
                              style={
                                auditEdits[`row_${r.id}_totalCharge`]
                                  ? { whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }
                                  : undefined
                              }
                            >
                              {renderAuditTrail(`row_${r.id}_totalCharge`, true)}
                              {r.totalCharge ? fmtNum(r.totalCharge) : ""}
                            </td>
                            <td
                              className={`${
                                r.cashDisplay || auditEdits[`row_${r.id}_cash`]
                                  ? r.cashHighlight
                                    ? "text-right font-black text-emerald-900 bg-emerald-100/70"
                                    : r.cashNegative
                                    ? "text-center font-bold text-rose-700"
                                    : "text-center font-bold"
                                  : "text-center text-slate-400"
                              } boundary-col-2`}
                              style={
                                auditEdits[`row_${r.id}_cash`]
                                  ? { whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }
                                  : undefined
                              }
                            >
                              {renderAuditTrail(`row_${r.id}_cash`, true)}
                              {r.cashDisplay || ""}
                            </td>
                            <td
                              className={
                                r.transferCardDisplay || auditEdits[`row_${r.id}_transfer`]
                                  ? `text-center font-bold ${tcColor}`
                                  : "text-center text-slate-400"
                              }
                              style={
                                auditEdits[`row_${r.id}_transfer`]
                                  ? { whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }
                                  : undefined
                              }
                            >
                              {renderAuditTrail(`row_${r.id}_transfer`, true)}
                              {r.transferCardDisplay || ""}
                            </td>
                            <td
                              className={
                                r.reservationCreditDisplay
                                  ? r.reservationCreditPositive
                                    ? "text-center font-bold text-emerald-800 bg-emerald-50/50"
                                    : "text-center font-bold text-rose-700 bg-rose-50/40"
                                  : "text-center text-slate-400"
                              }
                            >
                              {r.reservationCreditDisplay || ""}
                            </td>
                            <td
                              className={
                                r.advanceCreditDisplay
                                  ? r.advanceCreditPositive
                                    ? "text-center font-bold text-emerald-800 bg-emerald-50/50"
                                    : "text-center font-bold text-rose-700 bg-rose-50/40"
                                  : "text-center text-slate-400"
                              }
                            >
                              {r.advanceCreditDisplay || ""}
                            </td>
                            <td className="text-center">{r.powerWindowDisplay || ""}</td>
                            <td className="text-center border-r-2 border-slate-700"></td>
                          </tr>
                        );
                      })}

                      {/* แถวยอดรวมประจำกะ */}
                      <tr
                        className="bg-amber-100/70 font-bold text-[8px] leading-tight border-b-2 border-slate-400 section-row"
                        style={{ height: "18px" }}
                      >
                        <td colSpan={4} className="boundary-col-1-prev text-center text-amber-950 py-0.5 border-l-2 border-slate-700" style={{ borderRight: "2px solid #1e293b" }}>
                          {sec.icon} {displaySummaryTitle} {sec.totals.countSummaryText}
                        </td>
                        <td className="boundary-col-1 text-right text-amber-950 py-0.5" style={{ borderLeft: "2px solid #1e293b" }}>
                          {sec.totals.roomRate ? fmtNum(sec.totals.roomRate) : ""}
                        </td>
                        <td className="text-center text-slate-700 py-0.5">
                          {sec.totals.adjust ? fmtSignedNum(sec.totals.adjust) : ""}
                        </td>
                        <td className="text-right text-amber-950 font-bold py-0.5">
                          {sec.totals.extra ? fmtNum(sec.totals.extra) : ""}
                        </td>
                        <td className="text-right text-amber-950 font-bold py-0.5">
                          {sec.totals.minibar ? fmtNum(sec.totals.minibar) : ""}
                        </td>
                        <td className="boundary-col-2-prev text-right font-black text-amber-950 bg-amber-200/50 py-0.5" style={{ borderRight: "2px solid #1e293b" }}>
                          {sec.totals.totalCharge ? fmtNum(sec.totals.totalCharge) : ""}
                        </td>
                        <td
                          className={`boundary-col-2 text-right font-black py-0.5 ${
                            sec.totals.cash < 0 ? "text-rose-700" : "text-emerald-900"
                          }`}
                          style={{ borderLeft: "2px solid #1e293b" }}
                        >
                          {sec.totals.cash !== 0 ? fmtNum(sec.totals.cash) : ""}
                        </td>
                        <td className="text-right font-bold text-blue-900 py-0.5">
                          {sec.totals.transferCard ? fmtNum(sec.totals.transferCard) : ""}
                        </td>
                        <td
                          className={`text-center font-bold py-0.5 ${
                            sec.totals.reservationCredit > 0
                              ? "text-emerald-800"
                              : sec.totals.reservationCredit < 0
                              ? "text-rose-700"
                              : "text-slate-400"
                          }`}
                          style={{ borderLeft: "2px solid #312e81" }}
                        >
                          {sec.totals.reservationCredit !== 0
                            ? fmtSignedNum(sec.totals.reservationCredit)
                            : ""}
                        </td>
                        <td
                          className={`text-center font-bold py-0.5 ${
                            sec.totals.advanceCredit > 0
                              ? "text-emerald-800"
                              : sec.totals.advanceCredit < 0
                              ? "text-rose-700"
                              : "text-slate-400"
                          }`}
                          style={{ borderRight: "1.8px solid #334155" }}
                        >
                          {sec.totals.advanceCredit !== 0 ? fmtSignedNum(sec.totals.advanceCredit) : ""}
                        </td>
                        <td
                          colSpan={2}
                          className="text-center text-[7.6px] font-semibold text-slate-700 py-0.5 whitespace-nowrap border-r-2 border-slate-700"
                          style={{ fontSize: "7.6px" }}
                        ></td>
                      </tr>
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>

        {isShortOverDemo && (
          <div className="mt-1 p-1 bg-amber-50 border border-amber-300 rounded text-[6.5px] text-amber-950">
            <strong>⚡ โหมดจำลอง Audit:</strong> หากกะบ่ายมีลูกค้าโอนเงินแต่ต้องทอนเงินสดจนลิ้นชักติดลบ
            ผจก.จะทำการ <strong>&quot;เติมเงินทอนเข้าลิ้นชัก (+2,000 ฿)&quot;</strong> และหากนับจริงขาดไป 20 ฿
            ระบบจะลงบันทึกในช่อง <em>&quot;ขาด/เกิน&quot;</em> ของกะบ่ายโดยอัตโนมัติ
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
