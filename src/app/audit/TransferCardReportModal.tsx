"use client";

import React, { useMemo, useState } from "react";

export interface TransferCardReportItem {
  id: string;
  category: "transfer" | "credit_card";
  bank: string; // e.g. 'SCB', 'KBANK', or 'CREDIT_CARD'
  amount: number;
  roomNo: string;
  roomLocation: string; // e.g. 'ซอย1', 'ซอย2', 'ซามีญ่า'
  staffName: string;
  shiftLocation: string | null; // location where shift was open when collecting
  createdAt: string; // ISO string when recorded in system
  slipTimeStr: string; // Display string for transfer/swipe date-time
  sortTimestamp: number; // Numeric timestamp for ascending sort (old -> new)
  hasExplicitSlipTime: boolean;
  allocationLabel: string; // e.g. 'ค่าห้องวันนี้', 'มัดจำกุญแจ', 'รับล่วงหน้า'
  rawNotes?: string;
}

interface TransferCardReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessDate: string;
  windowLabel: string;
  items: TransferCardReportItem[];
  locations: string[];
  bankAccounts: string[];
}

export default function TransferCardReportModal({
  isOpen,
  onClose,
  businessDate,
  windowLabel,
  items,
  locations,
  bankAccounts,
}: TransferCardReportModalProps) {
  const [layoutMode, setLayoutMode] = useState<"auto" | "half" | "full">("auto");
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [filterLocation, setFilterLocation] = useState<string>("ALL");

  const filteredItems = useMemo(() => {
    if (filterLocation === "ALL") return items;
    return items.filter((it) => it.roomLocation === filterLocation);
  }, [items, filterLocation]);

  // Auto mode: <= 32 items -> Half A4 Eco Mode; > 32 items -> Full A4 Multi-Column Mode
  const effectiveLayout: "half" | "full" =
    layoutMode === "auto"
      ? filteredItems.length <= 32
        ? "half"
        : "full"
      : layoutMode;

  // Determine ordered list of bank keys + CREDIT_CARD
  const accountGroups = useMemo(() => {
    const bankSet = new Set<string>();
    bankAccounts.forEach((b) => {
      if (b && b.trim()) bankSet.add(b.trim().toUpperCase());
    });
    filteredItems.forEach((it) => {
      if (it.category === "transfer" && it.bank) {
        bankSet.add(it.bank.trim().toUpperCase());
      }
    });

    const groups: {
      key: string;
      title: string;
      shortTitle: string;
      badgeClass: string;
      headerClass: string;
      isCreditCard: boolean;
      rows: TransferCardReportItem[];
      totalAmount: number;
    }[] = [];

    Array.from(bankSet).forEach((bankName) => {
      const rows = filteredItems
        .filter(
          (it) =>
            it.category === "transfer" &&
            it.bank.trim().toUpperCase() === bankName
        )
        .sort((a, b) => a.sortTimestamp - b.sortTimestamp);

      if (rows.length > 0 || bankAccounts.map((b) => b.toUpperCase()).includes(bankName)) {
        const isKbank = bankName.includes("KBANK") || bankName.includes("กสิกร");
        const isScb = bankName.includes("SCB") || bankName.includes("ไทยพาณิชย์");
        groups.push({
          key: `BANK_${bankName}`,
          title: `🏦 โอนเข้าบัญชี: ${bankName}${isScb ? " (ไทยพาณิชย์)" : isKbank ? " (กสิกรไทย)" : ""}`,
          shortTitle: `บัญชี ${bankName}`,
          badgeClass: isKbank
            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
            : "bg-purple-100 text-purple-800 border-purple-300",
          headerClass: isKbank
            ? "bg-emerald-50 border-emerald-200 text-emerald-950"
            : "bg-purple-50 border-purple-200 text-purple-950",
          isCreditCard: false,
          rows,
          totalAmount: rows.reduce((s, r) => s + r.amount, 0),
        });
      }
    });

    const creditRows = filteredItems
      .filter((it) => it.category === "credit_card")
      .sort((a, b) => a.sortTimestamp - b.sortTimestamp);

    groups.push({
      key: "CREDIT_CARD",
      title: "💳 บัตรเครดิต (Credit Card / EDC)",
      shortTitle: "บัตรเครดิต",
      badgeClass: "bg-blue-100 text-blue-800 border-blue-300",
      headerClass: "bg-blue-50 border-blue-200 text-blue-950",
      isCreditCard: true,
      rows: creditRows,
      totalAmount: creditRows.reduce((s, r) => s + r.amount, 0),
    });

    return groups;
  }, [filteredItems, bankAccounts]);

  // All distinct bank names across all items (for per-location breakdown)
  const allBankNames = useMemo(() => {
    const s = new Set<string>();
    bankAccounts.forEach((b) => {
      if (b && b.trim()) s.add(b.trim().toUpperCase());
    });
    items.forEach((it) => {
      if (it.category === "transfer" && it.bank) {
        s.add(it.bank.trim().toUpperCase());
      }
    });
    return Array.from(s);
  }, [items, bankAccounts]);

  // Per-location breakdown (Total + each Bank + Credit Card)
  const locationSummaries = useMemo(() => {
    const locList =
      locations.length > 0 ? locations : ["ซอย1", "ซอย2", "ซามีญ่า"];
    return locList.map((loc) => {
      const locItems = items.filter((it) => it.roomLocation === loc);
      const totalAmt = locItems.reduce((s, r) => s + r.amount, 0);
      const byBank: { bankName: string; amount: number; count: number }[] =
        allBankNames.map((bankName) => {
          const matched = locItems.filter(
            (it) =>
              it.category === "transfer" &&
              it.bank.trim().toUpperCase() === bankName
          );
          return {
            bankName,
            amount: matched.reduce((s, r) => s + r.amount, 0),
            count: matched.length,
          };
        });
      const creditMatched = locItems.filter(
        (it) => it.category === "credit_card"
      );
      const creditAmount = creditMatched.reduce((s, r) => s + r.amount, 0);
      const creditCount = creditMatched.length;

      return {
        location: loc,
        totalAmount: totalAmt,
        totalCount: locItems.length,
        byBank,
        creditAmount,
        creditCount,
      };
    });
  }, [items, locations, allBankNames]);

  const grandTotalAmount = useMemo(
    () => filteredItems.reduce((s, r) => s + r.amount, 0),
    [filteredItems]
  );
  const totalTransferAmount = useMemo(
    () =>
      filteredItems
        .filter((r) => r.category === "transfer")
        .reduce((s, r) => s + r.amount, 0),
    [filteredItems]
  );
  const totalCreditAmount = useMemo(
    () =>
      filteredItems
        .filter((r) => r.category === "credit_card")
        .reduce((s, r) => s + r.amount, 0),
    [filteredItems]
  );

  if (!isOpen) return null;

  const formattedBizDate = new Date(`${businessDate}T00:00:00`).toLocaleDateString(
    "th-TH",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePrintA4 = () => {
    const printEl = document.getElementById("a4-transfer-card-print-sheet");
    if (!printEl) {
      window.print();
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const styles = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]')
    )
      .map((el) => el.outerHTML)
      .join("\n");

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ใบตรวจยอดโอนและบัตรเครดิต - ${businessDate}</title>
  ${styles}
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm 7mm;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: 'Sarabun', ui-sans-serif, system-ui, -apple-system, sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    #a4-transfer-card-print-sheet {
      width: 100% !important;
      max-width: 100% !important;
      box-shadow: none !important;
      border: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .no-print-in-sheet {
      display: none !important;
    }
  </style>
</head>
<body>
  ${printEl.outerHTML}
</body>
</html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 350);
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🧾</span>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-2">
                <span>ใบตรวจสอบยอดโอนเงิน & บัตรเครดิต (ฝ่ายบัญชี)</span>
                <span className="text-[11px] bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 px-2 py-0.5 rounded-full font-bold">
                  เรียงตามเวลาโอนจริง (เก่า → ใหม่)
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                ประจำวันธุรกิจ {formattedBizDate} • รอบเวลา {windowLabel}
              </p>
            </div>
          </div>

          {/* Filter Location + Print Layout Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Location Filter */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setFilterLocation("ALL")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  filterLocation === "ALL"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                รวมทุกสาขา ({items.length})
              </button>
              {locations.map((loc) => {
                const cnt = items.filter((i) => i.roomLocation === loc).length;
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setFilterLocation(loc)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      filterLocation === loc
                        ? "bg-indigo-600 text-white"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    📍{loc} ({cnt})
                  </button>
                );
              })}
            </div>

            {/* Paper Layout Selector */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setLayoutMode("auto")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  layoutMode === "auto"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
                title="น้อยกว่าหรือเท่ากับ 32 รายการ = ครึ่งหน้า A4 ประหยัดกระดาษ, มากกว่า 32 รายการ = เต็มหน้า A4"
              >
                ✨ อัตโนมัติ ({effectiveLayout === "half" ? "ครึ่ง A4" : "เต็ม A4"})
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("half")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  layoutMode === "half"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                ✂️ ครึ่งหน้า A4
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("full")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  layoutMode === "full"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                📋 เต็มหน้า A4 (100 รายการ)
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrintA4}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>🖨️</span>
              <span>สั่งพิมพ์กระดาษ A4</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs px-3 py-2 rounded-xl border border-slate-700 transition-colors"
            >
              ✕ ปิด
            </button>
          </div>
        </div>

        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 flex justify-center">
          {/* A4 Printable Sheet */}
          <div
            id="a4-transfer-card-print-sheet"
            className="bg-white w-full max-w-[210mm] rounded-xl shadow-md border border-slate-200 p-4 sm:p-5 text-slate-900 space-y-3"
          >
            {/* Header inside A4 Sheet */}
            <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b-2 border-slate-900">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    ใบตรวจสอบรายการโอนเงินและบัตรเครดิต (สำหรับฝ่ายบัญชี)
                  </h1>
                  <span className="text-[11px] font-black px-2 py-0.5 rounded bg-slate-900 text-white">
                    {filterLocation === "ALL" ? "รวมทุกสถานที่" : `เฉพาะ ${filterLocation}`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  ประจำวันธุรกิจ: <b>{formattedBizDate}</b> ({businessDate}) • รอบตัดยอด:{" "}
                  <b>{windowLabel}</b> • เรียงตามวัน-เวลาโอน/รูดจริงจากเก่าไปใหม่
                </p>
              </div>

              <div className="flex items-center gap-2 text-right">
                <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500">รวมโอนเข้าบัญชี</div>
                  <div className="text-xs sm:text-sm font-black text-indigo-900">
                    ฿{totalTransferAmount.toLocaleString()}
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500">รวมบัตรเครดิต</div>
                  <div className="text-xs sm:text-sm font-black text-blue-900">
                    ฿{totalCreditAmount.toLocaleString()}
                  </div>
                </div>
                <div className="px-3 py-1 rounded-lg bg-slate-900 text-white">
                  <div className="text-[10px] font-bold text-slate-300">
                    รวมสุทธิ ({filteredItems.length} รายการ)
                  </div>
                  <div className="text-sm sm:text-base font-black text-emerald-400">
                    ฿{grandTotalAmount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Account Tables Grid (2 columns in Half-A4 mode, 2 or 3 columns in Full-A4 mode when many items) */}
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl text-sm font-bold">
                ไม่มีรายการโอนเงินหรือรูดบัตรเครดิตในรอบวันธุรกิจนี้
              </div>
            ) : (
              <div
                className={`grid gap-2.5 items-start ${
                  effectiveLayout === "full" && filteredItems.length > 55
                    ? "grid-cols-1 md:grid-cols-3"
                    : "grid-cols-1 md:grid-cols-2"
                }`}
              >
                {accountGroups
                  .filter((g) => g.rows.length > 0 || !g.isCreditCard)
                  .map((group) => (
                    <div
                      key={group.key}
                      className="border border-slate-300 rounded-lg overflow-hidden bg-white"
                    >
                      <div
                        className={`px-2.5 py-1.5 border-b border-slate-300 flex items-center justify-between ${group.headerClass}`}
                      >
                        <span className="text-xs font-black">{group.title}</span>
                        <span className="text-xs font-black">
                          {group.rows.length} รายการ • ฿{group.totalAmount.toLocaleString()}
                        </span>
                      </div>

                      {group.rows.length === 0 ? (
                        <div className="p-3 text-center text-[11px] text-slate-400">
                          ไม่มีรายการในบัญชีนี้
                        </div>
                      ) : (
                        <table className="w-full border-collapse text-[10.5px] leading-tight">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold">
                              <th className="py-1 px-1.5 text-center w-6">#</th>
                              <th className="py-1 px-1.5 text-left">วัน-เวลาโอน/รูด</th>
                              <th className="py-1 px-1.5 text-left">ห้อง (สาขา)</th>
                              <th className="py-1 px-1.5 text-left">ผู้รับ (กะ • เวลาคีย์)</th>
                              <th className="py-1 px-1.5 text-right">จำนวนเงิน</th>
                              <th className="py-1 px-1.5 text-center w-6">✓</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {group.rows.map((row, idx) => {
                              const isCross = Boolean(
                                row.shiftLocation &&
                                  row.roomLocation &&
                                  row.shiftLocation !== row.roomLocation
                              );
                              const isChecked = Boolean(checkedIds[row.id]);
                              const createdShort = new Date(row.createdAt).toLocaleTimeString(
                                "th-TH",
                                { hour: "2-digit", minute: "2-digit" }
                              );
                              return (
                                <tr
                                  key={row.id}
                                  onClick={() => toggleCheck(row.id)}
                                  className={`cursor-pointer transition-colors ${
                                    isChecked
                                      ? "bg-emerald-50/70 text-slate-500"
                                      : isCross
                                      ? "bg-amber-50/40 hover:bg-amber-50"
                                      : "hover:bg-slate-50"
                                  }`}
                                >
                                  <td className="py-1 px-1.5 text-center font-mono text-slate-500">
                                    {idx + 1}
                                  </td>
                                  <td className="py-1 px-1.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                                    <span>{row.slipTimeStr}</span>
                                    {!row.hasExplicitSlipTime && (
                                      <span
                                        className="ml-1 text-[9px] font-normal text-slate-400"
                                        title="ไม่ได้ระบุเวลาสลิป ใช้เวลาที่บันทึกแทน"
                                      >
                                        (เวลาคีย์)
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1 px-1.5 whitespace-nowrap">
                                    <span className="font-black text-slate-900">
                                      ห้อง {row.roomNo}
                                    </span>{" "}
                                    <span className="text-[9.5px] font-bold px-1 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                      {row.roomLocation}
                                    </span>
                                  </td>
                                  <td className="py-1 px-1.5">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <span className="font-semibold text-slate-700">
                                        {row.staffName}
                                      </span>
                                      {isCross ? (
                                        <span className="text-[9px] font-black px-1 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                          ⚡กะ{row.shiftLocation}•{createdShort}
                                        </span>
                                      ) : (
                                        <span className="text-[9.5px] text-slate-400">
                                          ({row.shiftLocation ? `กะ${row.shiftLocation}•` : ""}
                                          {createdShort})
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-1 px-1.5 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                                    {row.amount.toLocaleString()}
                                  </td>
                                  <td className="py-1 px-1.5 text-center">
                                    <span
                                      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-xs border text-[9px] font-black ${
                                        isChecked
                                          ? "bg-emerald-600 border-emerald-600 text-white"
                                          : "border-slate-400 bg-white text-transparent"
                                      }`}
                                    >
                                      ✓
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-50 border-t border-slate-300 font-black text-slate-900">
                              <td colSpan={4} className="py-1 px-2 text-right text-[10.5px]">
                                รวม {group.shortTitle} ({group.rows.length} รายการ)
                              </td>
                              <td className="py-1 px-1.5 text-right font-mono text-xs">
                                ฿{group.totalAmount.toLocaleString()}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* สรุปยอดโอน+บัตร แยกตามสถานที่ห้องพัก พร้อมแยกยอดแต่ละบัญชีธนาคารและบัตรเครดิต */}
            <div className="border-2 border-slate-800 rounded-xl overflow-hidden bg-slate-50/70">
              <div className="bg-slate-800 text-white px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-black flex items-center gap-1.5">
                  <span>📍</span>
                  <span>
                    สรุปยอดโอนเงิน + บัตรเครดิต แยกตามสถานที่ห้องพัก (พร้อมแยกยอดแต่ละบัญชี)
                  </span>
                </span>
                <span className="text-[10.5px] text-slate-300">
                  รายได้คิดตามสถานที่ห้องพัก แม้พนักงานอีกสาขาเป็นผู้รับชำระแทน
                </span>
              </div>

              <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {locationSummaries.map((locSum) => (
                  <div
                    key={locSum.location}
                    className="bg-white border border-slate-300 rounded-lg p-2.5 flex flex-col justify-between shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-1.5">
                        <span className="text-xs font-black text-slate-800 flex items-center gap-1">
                          <span>📍</span>
                          <span>{locSum.location}</span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {locSum.totalCount} รายการ
                        </span>
                      </div>

                      {/* แยกตามบัญชีธนาคารแต่ละบัญชี + บัตรเครดิต ของสถานที่นี้ */}
                      <div className="space-y-1 text-[11px]">
                        {locSum.byBank.map((b) => (
                          <div
                            key={b.bankName}
                            className="flex items-center justify-between text-slate-700"
                          >
                            <span className="font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span>
                              <span>บัญชี {b.bankName}</span>
                              <span className="text-[10px] text-slate-400">
                                ({b.count})
                              </span>
                            </span>
                            <span
                              className={`font-mono font-bold ${
                                b.amount > 0 ? "text-slate-900" : "text-slate-400"
                              }`}
                            >
                              ฿{b.amount.toLocaleString()}
                            </span>
                          </div>
                        ))}

                        <div className="flex items-center justify-between text-slate-700">
                          <span className="font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
                            <span>บัตรเครดิต</span>
                            <span className="text-[10px] text-slate-400">
                              ({locSum.creditCount})
                            </span>
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              locSum.creditAmount > 0
                                ? "text-slate-900"
                                : "text-slate-400"
                            }`}
                          >
                            ฿{locSum.creditAmount.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-[11px] font-black text-slate-700">
                        รวม {locSum.location}
                      </span>
                      <span className="text-sm font-black font-mono text-indigo-950">
                        ฿{locSum.totalAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Grand Total Card across all locations */}
                <div className="bg-slate-900 text-white border border-slate-900 rounded-lg p-2.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-1.5">
                      <span className="text-xs font-black text-emerald-300">
                        📊 รวมทุกสถานที่
                      </span>
                      <span className="text-[10px] font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                        {items.length} รายการ
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      {allBankNames.map((bankName) => {
                        const matched = items.filter(
                          (it) =>
                            it.category === "transfer" &&
                            it.bank.trim().toUpperCase() === bankName
                        );
                        const sum = matched.reduce((s, r) => s + r.amount, 0);
                        return (
                          <div
                            key={bankName}
                            className="flex items-center justify-between text-slate-200"
                          >
                            <span className="font-semibold">
                              รวมบัญชี {bankName}{" "}
                              <span className="text-[10px] text-slate-400">
                                ({matched.length})
                              </span>
                            </span>
                            <span className="font-mono font-bold text-white">
                              ฿{sum.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                      {(() => {
                        const cred = items.filter(
                          (it) => it.category === "credit_card"
                        );
                        const sum = cred.reduce((s, r) => s + r.amount, 0);
                        return (
                          <div className="flex items-center justify-between text-slate-200">
                            <span className="font-semibold">
                              รวมบัตรเครดิต{" "}
                              <span className="text-[10px] text-slate-400">
                                ({cred.length})
                              </span>
                            </span>
                            <span className="font-mono font-bold text-white">
                              ฿{sum.toLocaleString()}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-slate-700 flex items-center justify-between">
                    <span className="text-[11px] font-black text-emerald-300">
                      ยอดสุทธิทุกสาขา
                    </span>
                    <span className="text-base font-black font-mono text-emerald-400">
                      ฿{items.reduce((s, r) => s + r.amount, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Signature / Verification Footer */}
            <div className="pt-1 flex items-center justify-between text-[10.5px] text-slate-500">
              <div>
                พิมพ์เมื่อ: {new Date().toLocaleString("th-TH")} • ระบบตรวจสอบบัญชีอัตโนมัติ
              </div>
              <div className="flex items-center gap-6">
                <span>ผู้ส่งยอด: ________________________</span>
                <span>ฝ่ายบัญชีผู้ตรวจ: ________________________</span>
              </div>
            </div>

            {/* Half-A4 Eco Cut Line (shown when effectiveLayout === 'half') */}
            {effectiveLayout === "half" && (
              <div className="pt-3">
                <div className="border-t-2 border-dashed border-slate-400 relative flex items-center justify-center">
                  <span className="bg-white px-3 text-[10px] font-bold text-slate-500 -mt-2.5">
                    ✂️ แนวตัดครึ่งกระดาษ A4 (โหมดประหยัดกระดาษ — ครึ่งล่างของกระดาษ A4 สามารถตัดนำไปใช้ซ้ำได้)
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
