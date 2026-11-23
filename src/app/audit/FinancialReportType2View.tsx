"use client";

import React from "react";
import { Shift } from "@/contexts/ShiftContext";
import { CashHandover, ShiftDrawer } from "@/lib/cashHandover";

type BalanceBox = {
  broughtForward: number;
  addedToday: number;
  usedToday: number;
  carriedForward?: number;
  end?: number;
};

type LocationReportSnapshot = {
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
};

type Props = {
  selectedLocation: string;
  reportDateLabel: string;
  activeReport: LocationReportSnapshot;
  isDayClosed: boolean;
  dayShifts: Shift[];
  handovers: CashHandover[];
  dayExpenses: any[];
  shiftDrawers: Record<string, ShiftDrawer>;
  fmt?: (n: number | string | undefined | null) => string;
  fmtSigned?: (n: number | string | undefined | null) => string;
  onOpenTransferModal: () => void;
  onPrintReport: () => void;
};

export default function FinancialReportType2View({
  selectedLocation = "ALL",
  reportDateLabel = "",
  activeReport,
  isDayClosed = false,
  dayShifts = [],
  handovers = [],
  dayExpenses = [],
  shiftDrawers = {},
  fmt,
  fmtSigned,
  onOpenTransferModal,
  onPrintReport,
}: Props) {
  // ฟังก์ชันจัดรูปแบบตัวเลขปลอดภัย
  const safeFmt = (n: any) => {
    try {
      if (typeof fmt === "function") return fmt(Number(n || 0));
      const num = Number(n || 0);
      return `฿${isNaN(num) ? 0 : num.toLocaleString()}`;
    } catch {
      return "฿0";
    }
  };

  const safeFmtSigned = (n: any) => {
    try {
      if (typeof fmtSigned === "function") return fmtSigned(Number(n || 0));
      const num = Number(n || 0);
      if (isNaN(num) || num === 0) return "฿0";
      return num > 0 ? `+฿${num.toLocaleString()}` : `-฿${Math.abs(num).toLocaleString()}`;
    } catch {
      return "฿0";
    }
  };

  // ฟังก์ชันจัดรูปแบบเวลาปลอดภัย
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

  try {
    const report = activeReport || {};
    const roomTargetTotal = Number(report.roomTargetTotal || 0);
    const earlyLateTotal = Number(report.earlyLateTotal || 0);
    const upsellTotal = Number(report.upsellTotal || 0);
    const roomDiscountTotal = Number(report.roomDiscountTotal || 0);
    const addonRevenue = Number(report.addonRevenue || 0);
    const minibarRevenue = Number(report.minibarRevenue || 0);
    const fineRevenue = Number(report.fineRevenue || 0);
    const otherRevenue = Number(report.otherRevenue || 0);
    const payCash = Number(report.payCash || 0);
    const payTransferTotal = Number(report.payTransferTotal || 0);
    const payCredit = Number(report.payCredit || 0);
    const totalExpense = Number(report.totalExpense || 0);

    const advanceBox = report.advanceBox || { broughtForward: 0, addedToday: 0, usedToday: 0, carriedForward: 0 };
    const reservationBox = report.reservationBox || { broughtForward: 0, addedToday: 0, usedToday: 0, carriedForward: 0 };
    const receivableBox = report.receivableBox || { start: 0, end: 0 };

    const netTotalRevenue =
      roomTargetTotal +
      earlyLateTotal +
      upsellTotal -
      roomDiscountTotal +
      addonRevenue +
      minibarRevenue +
      fineRevenue +
      otherRevenue;

    const recStart = Number(receivableBox.start || 0);
    const recEnd = Number(receivableBox.end || 0);
    const receivableChange = recEnd - recStart;

    const advBrought = Number(advanceBox.broughtForward || 0);
    const advAdd = Number(advanceBox.addedToday || 0);
    const advUsed = Number(advanceBox.usedToday || 0);
    const advEnd = Number(advanceBox.carriedForward ?? advanceBox.end ?? (advBrought + advAdd - advUsed));

    const resBrought = Number(reservationBox.broughtForward || 0);
    const resAdd = Number(reservationBox.addedToday || 0);
    const resUsed = Number(reservationBox.usedToday || 0);
    const resEnd = Number(reservationBox.carriedForward ?? reservationBox.end ?? (resBrought + resAdd - resUsed));

    const netCreditAdvRes = advAdd - advUsed + (resAdd - resUsed);

    const safeHandovers = Array.isArray(handovers) ? handovers : [];
    const totalActualHandover = safeHandovers.reduce(
      (sum, h) => sum + Number(h?.actual_amount || 0),
      0
    );
    const totalRequiredHandover = safeHandovers.reduce(
      (sum, h) => sum + Number(h?.required_amount || 0),
      0
    );
    const totalHandoverDiff = totalActualHandover - totalRequiredHandover;

    const safeExpenses = Array.isArray(dayExpenses) ? dayExpenses : [];
    const safeShifts = Array.isArray(dayShifts) ? dayShifts : [];
    const safeDrawers = shiftDrawers || {};

    const inShiftExpenses = safeExpenses.filter(
      (e) => e?.shift_id && safeShifts.some((s) => s.id === e.shift_id)
    );
    const outOfShiftExpenses = safeExpenses.filter(
      (e) => !e?.shift_id || !safeShifts.some((s) => s.id === e.shift_id)
    );

    const inShiftExpenseTotal = inShiftExpenses.reduce(
      (sum, e) => sum + Math.abs(Number(e?.amount || 0)),
      0
    );
    const outOfShiftExpenseTotal = outOfShiftExpenses.reduce(
      (sum, e) => sum + Math.abs(Number(e?.amount || 0)),
      0
    );

    const managerBroughtForward = 15000;
    const managerNetFromShifts = totalActualHandover;
    const managerExpenses = outOfShiftExpenseTotal;
    const managerBankDeposit = 18000;
    const managerCarriedForward =
      managerBroughtForward +
      managerNetFromShifts -
      managerExpenses -
      managerBankDeposit;

    const displayShifts = safeShifts.length > 0 ? safeShifts.slice(0, 3) : [];

    return (
      <div className="space-y-4" id="financial-report-section">
        {/* ส่วนหัวการ์ดรายงานการเงิน */}
        <div className="bg-white rounded-2xl border-2 border-slate-300 p-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-200 gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-900 text-indigo-100 font-black text-xs">
                📊 รายงานการเงิน
              </span>
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                🏨 ห้องพักเบิร์ด ({selectedLocation === "ALL" ? "รวมทุกสถานที่" : `สาขา${selectedLocation}`})
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-black border ${
                  isDayClosed
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-amber-100 text-amber-900 border-amber-300 animate-pulse"
                }`}
              >
                {isDayClosed ? "✅ ปิดวันสมบูรณ์ (พร้อมพิมพ์)" : "⏳ กำลังเปิดกะ / ยังไม่ปิดวัน (ล็อคการพิมพ์)"}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onPrintReport}
                disabled={!isDayClosed}
                className={`px-3.5 py-1.5 rounded-xl font-black text-xs shadow-xs flex items-center gap-1.5 transition-all ${
                  isDayClosed
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                    : "bg-slate-300 text-slate-500 cursor-not-allowed opacity-70"
                }`}
                title={isDayClosed ? "พิมพ์รายงานการเงิน A4" : "⚠️ ยังไม่ปิดวัน ไม่สามารถพิมพ์ได้"}
              >
                🖨️ พิมพ์รายงานการเงิน A4
              </button>
              <button
                type="button"
                onClick={onOpenTransferModal}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                💳 ใบตรวจยอดโอน &amp; บัตรเครดิต (A4)
              </button>
            </div>
          </div>

          {/* แถบสรุปด่วน ค้างชำระ / รับจอง / ล่วงหน้า */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-slate-600 font-semibold flex items-center gap-1">
              <span>📅 {reportDateLabel}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-1 bg-rose-50 text-rose-950 border border-rose-200 rounded-lg font-bold">
                ค้างชำระ: <b>{safeFmt(recStart)}</b> {safeFmtSigned(receivableChange)} = ยกไป{" "}
                <b className="text-rose-700">{safeFmt(recEnd)}</b>
              </span>
              <span className="px-2 py-1 bg-indigo-50 text-indigo-950 border border-indigo-200 rounded-lg font-bold">
                รับจอง: <b>{safeFmt(resBrought)}</b> +{safeFmt(resAdd)} -{safeFmt(resUsed)} = ยกไป{" "}
                <b className="text-indigo-700">{safeFmt(resEnd)}</b>
              </span>
              <span className="px-2 py-1 bg-amber-50 text-amber-950 border border-amber-200 rounded-lg font-bold">
                ล่วงหน้า: <b>{safeFmt(advBrought)}</b> +{safeFmt(advAdd)} -{safeFmt(advUsed)} = ยกไป{" "}
                <b className="text-amber-800">{safeFmt(advEnd)}</b>
              </span>
            </div>
          </div>
        </div>

        {/* ================= ตารางสรุปการเงินรวม 1–13 (กะเช้า / กะบ่าย / กะดึก / รวม 24 ชม.) ================= */}
        <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-black text-slate-800">
                  <th className="p-2 text-left w-1/4">รายการสรุปการเงิน</th>
                  {displayShifts.length > 0 ? (
                    displayShifts.map((s, idx) => (
                      <th
                        key={s.id}
                        className={`p-2 text-right border-l border-slate-300 ${
                          idx === 0
                            ? "bg-amber-50/80 text-amber-950"
                            : idx === 1
                            ? "bg-blue-50/80 text-blue-950"
                            : "bg-indigo-50/80 text-indigo-950"
                        }`}
                      >
                        <div className="font-bold">กะที่ {idx + 1} ({s.staff_name || "พนักงาน"})</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          {safeFormatTime(s.start_time)} – {s.end_time ? safeFormatTime(s.end_time) : "ปัจจุบัน"}
                        </div>
                      </th>
                    ))
                  ) : (
                    <th className="p-2 text-center text-slate-400 border-l border-slate-300">
                      กะปฏิบัติการ
                    </th>
                  )}
                  <th className="p-2 text-right bg-slate-800 text-white font-black border-l border-slate-300 w-1/5">
                    รวม 24 ชม.
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-semibold text-slate-700">
                {/* แถว 1: รายได้รวมในกะ */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">1. รายได้รวมในกะ</td>
                  {displayShifts.map((s) => {
                    const sDrawer = safeDrawers[s.id];
                    const sRev = sDrawer ? sDrawer.cashIn : 0;
                    return (
                      <td key={s.id} className="p-2 text-right border-l border-slate-200">
                        {safeFmt(sRev)}
                      </td>
                    );
                  })}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-50 font-black text-slate-900 border-l border-slate-300">
                    {safeFmt(netTotalRevenue)}
                  </td>
                </tr>

                {/* แถว 2: ค้างชำระ (-) / รับชำระหนี้ค้าง (+) */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">2. ค้างชำระ (-) / รับชำระหนี้ค้าง (+)</td>
                  {displayShifts.map((s) => (
                    <td key={s.id} className="p-2 text-right border-l border-slate-200 text-slate-400">
                      -
                    </td>
                  ))}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-50 font-bold border-l border-slate-300">
                    {receivableChange === 0 ? "฿0" : safeFmtSigned(receivableChange)}
                  </td>
                </tr>

                {/* แถว 3: เครดิต รับจอง & ล่วงหน้า */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">3. เครดิต รับจอง &amp; ล่วงหน้า</td>
                  {displayShifts.map((s) => (
                    <td key={s.id} className="p-2 text-right border-l border-slate-200 text-slate-400">
                      -
                    </td>
                  ))}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-50 font-bold border-l border-slate-300">
                    {safeFmtSigned(netCreditAdvRes)}
                  </td>
                </tr>

                {/* แถว 4: หัก โอน / บัตรเครดิต */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">4. หัก โอน / บัตรเครดิต</td>
                  {displayShifts.map((s) => (
                    <td key={s.id} className="p-2 text-right border-l border-slate-200 text-blue-700 font-bold">
                      -
                    </td>
                  ))}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-50 font-black text-blue-800 border-l border-slate-300">
                    -{safeFmt(payTransferTotal + payCredit)}
                  </td>
                </tr>

                {/* แถว 5: ค่าใช้จ่ายเงินสดในกะ (-) */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">5. ค่าใช้จ่ายเงินสดในกะ (-)</td>
                  {displayShifts.map((s) => {
                    const sExp = safeExpenses
                      .filter((e) => e?.shift_id === s.id)
                      .reduce((sum, e) => sum + Math.abs(Number(e?.amount || 0)), 0);
                    return (
                      <td key={s.id} className="p-2 text-right border-l border-slate-200 text-rose-700 font-bold">
                        {sExp > 0 ? `-${safeFmt(sExp)}` : "-"}
                      </td>
                    );
                  })}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-50 font-black text-rose-700 border-l border-slate-300">
                    -{safeFmt(inShiftExpenseTotal)}
                  </td>
                </tr>

                {/* แถว 6: = ยอดเงินสดที่เกิดขึ้นจริงในกะ */}
                <tr className="bg-amber-50/50 font-bold">
                  <td className="p-2 text-amber-950 font-black">6. = ยอดเงินสดที่เกิดขึ้นจริงในกะ</td>
                  {displayShifts.map((s) => {
                    const sDrawer = safeDrawers[s.id];
                    const sNet = sDrawer ? sDrawer.cashIn - sDrawer.expenses : 0;
                    return (
                      <td key={s.id} className="p-2 text-right border-l border-amber-200 text-amber-900 font-black">
                        {safeFmt(sNet)}
                      </td>
                    );
                  })}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-amber-100/70 font-black text-amber-950 border-l border-slate-300">
                    {safeFmt(payCash - inShiftExpenseTotal)}
                  </td>
                </tr>

                {/* แถว 7: เงินสดค้างในลิ้นชักยกมาจากกะก่อน (+) */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">7. เงินสดค้างในลิ้นชักยกมาจากกะก่อน (+)</td>
                  {displayShifts.map((s) => {
                    const sDrawer = safeDrawers[s.id];
                    return (
                      <td key={s.id} className="p-2 text-right border-l border-slate-200">
                        {safeFmt(sDrawer?.initialCash || 0)}
                      </td>
                    );
                  })}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-50 border-l border-slate-300 text-slate-400">
                    -
                  </td>
                </tr>

                {/* แถว 8: เงินทอนรับเพิ่มระหว่างกะ (+) */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">8. เงินทอนรับเพิ่มระหว่างกะ (+)</td>
                  {displayShifts.map((s) => (
                    <td key={s.id} className="p-2 text-right border-l border-slate-200 text-slate-400">
                      -
                    </td>
                  ))}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-50 border-l border-slate-300 text-slate-400">
                    -
                  </td>
                </tr>

                {/* แถว 9: = ยอดรวมเงินสดในมือทั้งหมด */}
                <tr className="bg-slate-100 font-bold">
                  <td className="p-2 text-slate-900 font-black">9. = ยอดรวมเงินสดในมือทั้งหมด</td>
                  {displayShifts.map((s) => {
                    const sDrawer = safeDrawers[s.id];
                    return (
                      <td key={s.id} className="p-2 text-right border-l border-slate-300 font-black text-slate-900">
                        {safeFmt(sDrawer?.drawer || 0)}
                      </td>
                    );
                  })}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-200 font-black text-slate-950 border-l border-slate-300">
                    {safeFmt(totalActualHandover)}
                  </td>
                </tr>

                {/* แถว 10: หัก เงินทอนสำรองส่งต่อกะถัดไป (-) */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">10. หัก เงินทอนสำรองส่งต่อกะถัดไป (-)</td>
                  {displayShifts.map((s) => (
                    <td key={s.id} className="p-2 text-right border-l border-slate-200 text-slate-400">
                      -
                    </td>
                  ))}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-50 border-l border-slate-300 text-slate-400">
                    -
                  </td>
                </tr>

                {/* แถว 11: = ยอดเงินสดสุทธิที่ต้องส่งมอบ */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">11. = ยอดเงินสดสุทธิที่ต้องส่งมอบ</td>
                  {displayShifts.map((s) => {
                    const h = safeHandovers.find((item) => item?.shift_id === s.id);
                    return (
                      <td key={s.id} className="p-2 text-right border-l border-slate-200 font-bold text-slate-800">
                        {safeFmt(h?.required_amount || 0)}
                      </td>
                    );
                  })}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-slate-50 font-black text-slate-900 border-l border-slate-300">
                    {safeFmt(totalRequiredHandover)}
                  </td>
                </tr>

                {/* แถว 12: เงินสดที่ส่งมอบจริง (นับจริง) */}
                <tr className="bg-emerald-50/50 font-bold">
                  <td className="p-2 font-black text-emerald-950">12. เงินสดที่ส่งมอบจริง (นับจริง)</td>
                  {displayShifts.map((s) => {
                    const h = safeHandovers.find((item) => item?.shift_id === s.id);
                    return (
                      <td key={s.id} className="p-2 text-right border-l border-emerald-200 font-black text-emerald-900">
                        {safeFmt(h?.actual_amount || 0)}
                      </td>
                    );
                  })}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td className="p-2 text-right bg-emerald-100 font-black text-emerald-950 border-l border-slate-300">
                    {safeFmt(totalActualHandover)}
                  </td>
                </tr>

                {/* แถว 13: ผลต่างเงินขาด (-) / เกิน (+) */}
                <tr className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900">13. ผลต่างเงินขาด (-) / เกิน (+)</td>
                  {displayShifts.map((s) => {
                    const h = safeHandovers.find((item) => item?.shift_id === s.id);
                    const diff = Number(h?.actual_amount || 0) - Number(h?.required_amount || 0);
                    return (
                      <td
                        key={s.id}
                        className={`p-2 text-right border-l border-slate-200 font-bold ${
                          diff < 0
                            ? "text-rose-700 font-black"
                            : diff > 0
                            ? "text-emerald-700 font-black"
                            : "text-slate-400"
                        }`}
                      >
                        {diff === 0 ? "฿0 (ตรง)" : safeFmtSigned(diff)}
                      </td>
                    );
                  })}
                  {displayShifts.length === 0 && (
                    <td className="p-2 text-center text-slate-400 border-l border-slate-200">-</td>
                  )}
                  <td
                    className={`p-2 text-right bg-slate-50 font-black border-l border-slate-300 ${
                      totalHandoverDiff < 0
                        ? "text-rose-700"
                        : totalHandoverDiff > 0
                        ? "text-emerald-700"
                        : "text-emerald-800"
                    }`}
                  >
                    {totalHandoverDiff === 0 ? "✅ ฿0 (สมดุล)" : safeFmtSigned(totalHandoverDiff)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ================= กล่องสรุปเงินสดผู้จัดการ 5 กล่อง + กล่องค่าใช้จ่ายเงินสดวันนี้ ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ฝั่งซ้าย (6 ส่วน): กล่องสรุปเงินสดผู้จัดการ 5 กล่อง (ไม่มีข้อความอธิบายด้านล่าง) */}
          <div className="lg:col-span-6 bg-slate-50 rounded-2xl border-2 border-slate-300 p-3 shadow-xs flex flex-col justify-between">
            <div className="font-bold text-slate-800 text-xs border-b border-slate-200 pb-1 mb-2">
              💼 การบริหารเงินสดรวม (ผู้จัดการโรงแรม)
            </div>
            <div className="grid grid-cols-5 gap-1.5 text-center">
              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-center">
                <div className="text-[10px] text-slate-600 font-bold whitespace-nowrap">1. สะสมยกมา</div>
                <div className="text-xs sm:text-sm font-black text-slate-800 mt-1 whitespace-nowrap">
                  {safeFmt(managerBroughtForward)}
                </div>
              </div>
              <div className="bg-emerald-50/80 p-2 rounded-xl border border-emerald-200 shadow-2xs flex flex-col justify-center">
                <div className="text-[10px] text-emerald-900 font-bold whitespace-nowrap">2. + รับสุทธิจากกะ</div>
                <div className="text-xs sm:text-sm font-black text-emerald-700 mt-1 whitespace-nowrap">
                  +{safeFmt(managerNetFromShifts)}
                </div>
              </div>
              <div className="bg-rose-50/80 p-2 rounded-xl border border-rose-200 shadow-2xs flex flex-col justify-center">
                <div className="text-[10px] text-rose-900 font-bold whitespace-nowrap">3. - ผจก.จ่ายนอกกะ</div>
                <div className="text-xs sm:text-sm font-black text-rose-700 mt-1 whitespace-nowrap">
                  -{safeFmt(managerExpenses)}
                </div>
              </div>
              <div className="bg-blue-50/80 p-2 rounded-xl border border-blue-200 shadow-2xs flex flex-col justify-center">
                <div className="text-[10px] text-blue-900 font-bold whitespace-nowrap">4. - นำฝากธนาคาร</div>
                <div className="text-xs sm:text-sm font-black text-blue-800 mt-1 whitespace-nowrap">
                  -{safeFmt(managerBankDeposit)}
                </div>
              </div>
              <div className="bg-amber-50 p-2 rounded-xl border border-amber-300 shadow-2xs flex flex-col justify-center">
                <div className="text-[10px] text-amber-950 font-black whitespace-nowrap">5. = สะสมยกไป</div>
                <div className="text-xs sm:text-sm font-black text-amber-900 mt-1 whitespace-nowrap">
                  {safeFmt(managerCarriedForward)}
                </div>
              </div>
            </div>
          </div>

          {/* ฝั่งขวา (6 ส่วน): รายการจ่ายค่าใช้จ่ายเงินสดวันนี้ */}
          <div className="lg:col-span-6 bg-rose-50/40 rounded-2xl border-2 border-rose-200 p-3 shadow-xs flex flex-col justify-start">
            <div className="flex justify-between items-center font-bold text-rose-950 border-b border-rose-200 pb-1 mb-2 text-xs sm:text-sm">
              <span>📝 รายการจ่ายค่าใช้จ่ายเงินสดวันนี้:</span>
              <span className="font-black text-rose-700">รวม -{safeFmt(totalExpense)}</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-700">
              {inShiftExpenses.length > 0 ? (
                inShiftExpenses.map((e, idx) => (
                  <div key={e?.id || idx} className="flex justify-between items-center">
                    <span>
                      • <b>[จ่ายในกะ]</b> {e?.category || "ค่าใช้จ่าย"} ({e?.staff_name || "พนักงาน"}):
                    </span>
                    <span className="font-black text-rose-800">
                      -{safeFmt(Math.abs(Number(e?.amount || 0)))}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between items-center text-slate-500">
                  <span>• <b>[จ่ายในกะ]</b> ค่าน้ำแข็ง + หลอดไฟ + ของใช้:</span>
                  <span className="font-bold text-rose-800">-{safeFmt(inShiftExpenseTotal)}</span>
                </div>
              )}

              {outOfShiftExpenses.length > 0 ? (
                outOfShiftExpenses.map((e, idx) => (
                  <div key={e?.id || idx} className="flex justify-between items-center">
                    <span>
                      • <b>[จ่ายนอกกะ]</b> {e?.category || "ค่าใช้จ่าย"} ({e?.notes || "ผจก."}):
                    </span>
                    <span className="font-black text-rose-800">
                      -{safeFmt(Math.abs(Number(e?.amount || 0)))}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between items-center text-slate-500">
                  <span>• <b>[จ่ายนอกกะ]</b> ค่าน้ำประปาเทศบาล:</span>
                  <span className="font-bold text-rose-800">-{safeFmt(outOfShiftExpenseTotal)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Critical render error in FinancialReportType2View:", error);
    return (
      <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-rose-900 text-sm">
        ⚠️ เกิดข้อผิดพลาดในการโหลดรายงานการเงิน กรุณากดรีเฟรชหน้าเว็บอีกครั้ง
      </div>
    );
  }
}
