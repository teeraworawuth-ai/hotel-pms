"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";

export type ReceiptDateMode = "up_to_latest" | "all_stay" | "custom_dates";
export type ReceiptItemCategory = "room" | "addon" | "minibar" | "other" | "deposit";

export interface ReceiptLineItem {
  id: string;
  dateStr: string; // YYYY-MM-DD
  title: string;
  note?: string;
  amount: number;
  categoryGroup: ReceiptItemCategory;
  isOccurred: boolean; // true = เกิดขึ้นจริงแล้ว (<= วันปัจจุบัน หรืออยู่ใน ledger แล้ว), false = รายการล่วงหน้า
}

interface FolioReceiptModalProps {
  roomId: string;
  roomNo: string;
  bookingId: string;
  onClose: () => void;
}

export default function FolioReceiptModal({
  roomId,
  roomNo,
  bookingId,
  onClose,
}: FolioReceiptModalProps) {
  const { getNow } = useSimulatedTime();
  const [loading, setLoading] = useState(true);

  const [guestName, setGuestName] = useState("");
  const [companyOrPayerInfo, setCompanyOrPayerInfo] = useState("");
  const [receiptNote, setReceiptNote] = useState("");
  const [hotelName, setHotelName] = useState("ใบเสร็จรับเงิน / ใบสรุปค่าใช้จ่าย (Folio Receipt)");
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);

  const [allItems, setAllItems] = useState<ReceiptLineItem[]>([]);
  const [excludedItemIds, setExcludedItemIds] = useState<Set<string>>(new Set());

  const [dateMode, setDateMode] = useState<ReceiptDateMode>("up_to_latest");
  const [selectedCustomDates, setSelectedCustomDates] = useState<Set<string>>(new Set());
  const [paperSize, setPaperSize] = useState<"a4" | "slip80">("a4");
  const [showPaymentStatusOnReceipt, setShowPaymentStatusOnReceipt] = useState(true);

  // ยอดรับชำระจริงทั้งหมดจาก ledger (ไม่รวมมัดจำกุญแจ)
  const [totalPaidNet, setTotalPaidNet] = useState(0);
  const [paymentMethodsText, setPaymentMethodsText] = useState("");

  // คำนวณวันตัดรอบธุรกิจปัจจุบัน (09:45 น. ตามเวลาไทย)
  const todayStr = useMemo(() => {
    const now = getNow();
    const cutoff = new Date(now);
    if (now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 45)) {
      cutoff.setDate(cutoff.getDate() - 1);
    }
    return cutoff.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  }, [getNow]);

  useEffect(() => {
    async function loadReceiptData() {
      setLoading(true);
      const [bookingRes, txRes, ratesRes, extrasRes, posRes, extraSettingsRes] = await Promise.all([
        supabase.from("bookings").select("*").eq("id", bookingId).maybeSingle(),
        supabase
          .from("ledger_transactions")
          .select("*")
          .eq("booking_id", bookingId)
          .order("created_at", { ascending: true }),
        supabase
          .from("booking_daily_rates")
          .select("*")
          .eq("booking_id", bookingId)
          .order("target_date", { ascending: true }),
        supabase
          .from("booking_daily_extras")
          .select("*")
          .eq("booking_id", bookingId)
          .order("target_date", { ascending: true }),
        supabase.from("pos_items").select("name"),
        supabase.from("extra_charge_settings").select("name"),
      ]);

      const booking = bookingRes.data;
      if (booking) {
        setGuestName(booking.guest_name || "");
        setCheckInTime(booking.actual_check_in_time || booking.check_in_time || null);
        setCheckOutTime(booking.actual_check_out_time || booking.check_out_time || null);
      }

      const txs = (txRes.data || []).filter((t: any) => !String(t.category || "").includes("(Voided)"));
      const rates = ratesRes.data || [];
      const extras = (extrasRes.data || []).filter((e: any) => !String(e.category || "").includes("(Voided)"));
      const posNames = new Set((posRes.data || []).map((p: any) => String(p.name || "").trim()));
      const extraNames = new Set((extraSettingsRes.data || []).map((e: any) => String(e.name || "").trim()));

      // Helper แปลงเวลา created_at เป็นวันที่ธุรกิจ YYYY-MM-DD (Asia/Bangkok)
      const toBizDateStr = (isoStr: string, isRoomTx: boolean) => {
        const d = new Date(isoStr);
        const bangkokStr = d.toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
        const bDate = new Date(bangkokStr);
        const h = bDate.getHours();
        const m = bDate.getMinutes();
        if (isRoomTx) {
          if (h < 9 || (h === 9 && m < 45)) {
            bDate.setDate(bDate.getDate() - 1);
          }
        } else {
          if (h < 6 || (h === 6 && m < 45)) {
            bDate.setDate(bDate.getDate() - 1);
          }
        }
        const y = bDate.getFullYear();
        const mo = String(bDate.getMonth() + 1).padStart(2, "0");
        const da = String(bDate.getDate()).padStart(2, "0");
        return `${y}-${mo}-${da}`;
      };

      const classifyCategory = (catName: string): ReceiptItemCategory => {
        const clean = catName.trim();
        if (clean === "room_charge" || clean.includes("ค่าห้องพัก")) return "room";
        if (clean.includes("มัดจำกุญแจ") || clean === "key_deposit") return "deposit";
        if (posNames.has(clean) || clean.includes("น้ำ") || clean.includes("มินิบาร์") || clean.includes("ขนม") || clean.includes("เครื่องดื่ม")) {
          return "minibar";
        }
        if (
          extraNames.has(clean) ||
          clean.includes("เสริม") ||
          clean.includes("มอเตอร์ไซค์") ||
          clean.includes("ผ้าห่ม") ||
          clean.includes("หมอน") ||
          clean.includes("ผ้าเช็ดตัว") ||
          clean.includes("คนเพิ่ม")
        ) {
          return "addon";
        }
        return "other";
      };

      const items: ReceiptLineItem[] = [];
      const defaultExcluded = new Set<string>();

      // 1. ค่าห้องพักรายวัน
      if (rates.length > 0) {
        rates.forEach((r: any, idx: number) => {
          const dStr = String(r.target_date);
          let amt = Number(r.amount || 0);
          // หากพักคืนเดียวและมีการแก้ค่าห้องใน ledger ให้ยึดตาม ledger
          if (rates.length === 1 && idx === 0) {
            const roomTx = txs.find(
              (t: any) =>
                t.transaction_type === "revenue" &&
                (t.category === "room_charge" || t.category === "ค่าห้องพัก")
            );
            if (roomTx) amt = Number(roomTx.amount || 0);
          }
          const isOccurred = dStr <= todayStr;
          items.push({
            id: `rate_${r.id}`,
            dateStr: dStr,
            title: `ค่าห้องพัก ห้อง ${roomNo}`,
            note: `ประจำคืนวันที่ ${formatThaiDateShort(dStr)}`,
            amount: amt,
            categoryGroup: "room",
            isOccurred,
          });
        });
      } else {
        // กรณีชั่วคราว หรือไม่มีแถวใน booking_daily_rates ให้ดึงจาก ledger_transactions
        txs
          .filter(
            (t: any) =>
              t.transaction_type === "revenue" &&
              Number(t.amount) > 0 &&
              (t.category === "room_charge" || t.category.includes("ค่าห้องพัก"))
          )
          .forEach((t: any) => {
            const dStr = toBizDateStr(t.created_at, true);
            items.push({
              id: `tx_room_${t.id}`,
              dateStr: dStr,
              title: t.category === "room_charge" ? `ค่าห้องพัก ห้อง ${roomNo}` : t.category,
              note: t.notes || undefined,
              amount: Number(t.amount || 0),
              categoryGroup: "room",
              isOccurred: true,
            });
          });
      }

      // 2. รายการใน ledger_transactions ที่ไม่ใช่ค่าห้องหลักของ dailyRates (เช่น พักต่อ, POS, มินิบาร์, บริการเสริมที่ตัดบิลแล้ว, ค่าปรับ)
      txs.forEach((t: any) => {
        if (Number(t.amount) <= 0) return;

        // มัดจำกุญแจ (ซ่อนเป็นค่าเริ่มต้นสำหรับการเบิกบริษัท แต่ติ๊กเปิดได้)
        if (t.transaction_type === "deposit" || String(t.category || "").includes("มัดจำกุญแจ") || t.category === "key_deposit") {
          const dStr = toBizDateStr(t.created_at, false);
          const itemId = `tx_dep_${t.id}`;
          items.push({
            id: itemId,
            dateStr: dStr,
            title: "ค่ามัดจำกุญแจ (Key Deposit)",
            note: "เงินประกันกุญแจห้องพัก",
            amount: Number(t.amount || 0),
            categoryGroup: "deposit",
            isOccurred: true,
          });
          defaultExcluded.add(itemId);
          return;
        }

        if (t.transaction_type !== "revenue") return;

        // ข้ามค่าห้องที่ถูกนับใน dailyRates ไปแล้ว
        if (rates.length > 0 && (t.category === "room_charge" || t.category === "ค่าห้องพัก")) {
          return;
        }
        if (rates.length === 0 && (t.category === "room_charge" || t.category.includes("ค่าห้องพัก"))) {
          return; // นับไปแล้วในข้อ 1
        }

        // ตรวจสอบว่ามีระบุวันที่ใน notes หรือไม่ เช่น "ประจำวันที่ 2026-10-22"
        const dateInNoteMatch = String(t.notes || "").match(/(\d{4}-\d{2}-\d{2})/);
        const dStr = dateInNoteMatch ? dateInNoteMatch[1] : toBizDateStr(t.created_at, false);
        const catGroup = classifyCategory(String(t.category || ""));

        items.push({
          id: `tx_${t.id}`,
          dateStr: dStr,
          title: String(t.category || ""),
          note: t.notes ? String(t.notes).replace("[POST_CHECKIN]", "").trim() || undefined : undefined,
          amount: Number(t.amount || 0),
          categoryGroup: catGroup,
          isOccurred: dStr <= todayStr,
        });
      });

      // 3. รายการบริการเสริมรายวันล่วงหน้า (booking_daily_extras) ที่ยังไม่ถูกสร้างใน ledger_transactions
      const firstStayDate =
        rates[0]?.target_date || extras[0]?.target_date || "";

      extras.forEach((ext: any) => {
        const dStr = String(ext.target_date || "");
        const baseCat = String(ext.category || "").replace(" (Voided)", "").trim();
        const alreadyInLedger = txs.some(
          (t: any) =>
            t.transaction_type === "revenue" &&
            String(t.category || "").replace(" (Voided)", "").trim() === baseCat &&
            (String(t.notes || "").includes(dStr) ||
              (dStr === firstStayDate && !String(t.notes || "").includes("ประจำวันที่ ")))
        );
        if (alreadyInLedger) return;

        items.push({
          id: `ext_${ext.id}`,
          dateStr: dStr,
          title: baseCat,
          note: (ext.description ? String(ext.description).replace("[POST_CHECKIN]", "").trim() : "") || `ประจำวันที่ ${formatThaiDateShort(dStr)}`,
          amount: Number(ext.amount || 0),
          categoryGroup: "addon",
          isOccurred: dStr <= todayStr,
        });
      });

      // เรียงลำดับตามวันที่
      items.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
      setAllItems(items);
      setExcludedItemIds(defaultExcluded);

      // ตั้งค่าเริ่มต้นของ custom dates ให้เลือกทุกวันที่เกิดค่าใช้จ่ายจริง
      const occurredDates = Array.from(new Set(items.filter((i) => i.isOccurred).map((i) => i.dateStr)));
      const allDates = Array.from(new Set(items.map((i) => i.dateStr)));
      setSelectedCustomDates(new Set(occurredDates.length > 0 ? occurredDates : allDates));

      // คำนวณยอดชำระแล้ว
      const rawPaid = txs
        .filter((t: any) => t.transaction_type === "payment" && Number(t.amount) < 0)
        .reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
      const changeRefunded = txs
        .filter((t: any) => Number(t.amount) < 0 && String(t.category || "").includes("คืนเงินทอน"))
        .reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
      setTotalPaidNet(Math.max(0, rawPaid - changeRefunded));

      const methods = new Set<string>();
      txs
        .filter((t: any) => t.transaction_type === "payment" && Number(t.amount) < 0)
        .forEach((t: any) => {
          if (t.category === "cash") methods.add("เงินสด (Cash)");
          else if (t.category === "transfer") methods.add("โอนเงิน (Transfer)");
          else if (t.category === "credit_card") methods.add("บัตรเครดิต (Credit Card)");
        });
      setPaymentMethodsText(Array.from(methods).join(", ") || "-");

      setLoading(false);
    }

    loadReceiptData();
  }, [bookingId, roomNo, todayStr]);

  // รายชื่อวันที่ทั้งหมดที่มีค่าใช้จ่าย
  const availableDates = useMemo(() => {
    const map = new Map<string, { dateStr: string; isOccurred: boolean; totalAmount: number }>();
    allItems.forEach((item) => {
      if (item.categoryGroup === "deposit" && excludedItemIds.has(item.id)) return;
      const prev = map.get(item.dateStr);
      if (!prev) {
        map.set(item.dateStr, {
          dateStr: item.dateStr,
          isOccurred: item.isOccurred,
          totalAmount: item.amount,
        });
      } else {
        prev.totalAmount += item.amount;
        prev.isOccurred = prev.isOccurred || item.isOccurred;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [allItems, excludedItemIds]);

  // กรองรายการตามโหมดวันที่ที่เลือก
  const dateFilteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (dateMode === "up_to_latest") {
        return item.isOccurred;
      }
      if (dateMode === "all_stay") {
        return true;
      }
      if (dateMode === "custom_dates") {
        return selectedCustomDates.has(item.dateStr);
      }
      return true;
    });
  }, [allItems, dateMode, selectedCustomDates]);

  // รายการที่จะแสดงบนใบเสร็จจริง (ไม่ถูกซ่อน)
  const visibleReceiptItems = useMemo(() => {
    return dateFilteredItems.filter((item) => !excludedItemIds.has(item.id));
  }, [dateFilteredItems, excludedItemIds]);

  // รายการที่ถูกซ่อนไว้ (เพื่อแสดงสรุปให้พนักงานเห็นว่าตัดออกเท่าไหร่)
  const hiddenReceiptItems = useMemo(() => {
    return dateFilteredItems.filter((item) => excludedItemIds.has(item.id));
  }, [dateFilteredItems, excludedItemIds]);

  const receiptTotal = useMemo(
    () => visibleReceiptItems.reduce((sum, i) => sum + i.amount, 0),
    [visibleReceiptItems]
  );

  const hiddenTotal = useMemo(
    () => hiddenReceiptItems.reduce((sum, i) => sum + i.amount, 0),
    [hiddenReceiptItems]
  );

  const toggleItem = (id: string) => {
    setExcludedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isCategoryAllVisible = (cat: ReceiptItemCategory) => {
    const itemsInCat = dateFilteredItems.filter((i) => i.categoryGroup === cat);
    if (itemsInCat.length === 0) return false;
    return itemsInCat.every((i) => !excludedItemIds.has(i.id));
  };

  const toggleCategoryGroup = (cat: ReceiptItemCategory) => {
    const itemsInCat = allItems.filter((i) => i.categoryGroup === cat);
    if (itemsInCat.length === 0) return;
    const currentlyAllVisible = isCategoryAllVisible(cat);
    setExcludedItemIds((prev) => {
      const next = new Set(prev);
      itemsInCat.forEach((item) => {
        if (currentlyAllVisible) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
      });
      return next;
    });
  };

  const toggleCustomDate = (dStr: string) => {
    setSelectedCustomDates((prev) => {
      const next = new Set(prev);
      if (next.has(dStr)) next.delete(dStr);
      else next.add(dStr);
      return next;
    });
  };

  const selectSingleDateOnly = (dStr: string) => {
    setDateMode("custom_dates");
    setSelectedCustomDates(new Set([dStr]));
  };

  // จัดกลุ่มรายการที่แสดงตามวันที่เพื่อพิมพ์ลงใบเสร็จอย่างเป็นระเบียบ
  const groupedVisibleByDate = useMemo(() => {
    const groups: Record<string, ReceiptLineItem[]> = {};
    visibleReceiptItems.forEach((item) => {
      if (!groups[item.dateStr]) groups[item.dateStr] = [];
      groups[item.dateStr].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [visibleReceiptItems]);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=850,height=900");
    if (!printWindow) {
      alert("กรุณาอนุญาตให้เปิดหน้าต่างป๊อปอัป (Pop-up) เพื่อพิมพ์ใบเสร็จ");
      return;
    }

    const printedDatesList = groupedVisibleByDate.map(([d]) => formatThaiDateShort(d));
    const dateRangeLabel =
      printedDatesList.length === 0
        ? "-"
        : printedDatesList.length === 1
        ? `ประจำวันที่ ${printedDatesList[0]}`
        : `ตั้งแต่วันที่ ${printedDatesList[0]} ถึง ${printedDatesList[printedDatesList.length - 1]} (${printedDatesList.length} วัน)`;

    const rowsHtml = groupedVisibleByDate
      .map(([dStr, items]) => {
        const subTotal = items.reduce((s, i) => s + i.amount, 0);
        const itemLines = items
          .map(
            (item, idx) => `
            <tr>
              <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 13px;">${idx + 1}</td>
              <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0;">
                <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${escapeHtml(item.title)}</div>
                ${item.note ? `<div style="font-size: 11px; color: #64748b;">${escapeHtml(item.note)}</div>` : ""}
              </td>
              <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #475569;">${formatThaiDateShort(item.dateStr)}</td>
              <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0f172a; font-size: 13px;">฿${item.amount.toLocaleString()}</td>
            </tr>
          `
          )
          .join("");

        return `
          <tr style="background: #f8fafc;">
            <td colspan="3" style="padding: 6px 10px; font-weight: 800; font-size: 12px; color: #334155; border-bottom: 1px solid #cbd5e1;">
              📅 วันที่ ${formatThaiDateFull(dStr)}
            </td>
            <td style="padding: 6px 10px; text-align: right; font-weight: 800; font-size: 12px; color: #334155; border-bottom: 1px solid #cbd5e1;">
              รวมวัน ฿${subTotal.toLocaleString()}
            </td>
          </tr>
          ${itemLines}
        `;
      })
      .join("");

    const paidForThisReceipt = Math.min(receiptTotal, totalPaidNet);
    const remainingForThisReceipt = Math.max(0, receiptTotal - paidForThisReceipt);

    const html = `
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8" />
        <title>ใบเสร็จรับเงิน ห้อง ${escapeHtml(roomNo)}</title>
        <style>
          @page {
            size: ${paperSize === "slip80" ? "80mm auto" : "A4 portrait"};
            margin: ${paperSize === "slip80" ? "4mm" : "14mm"};
          }
          body {
            font-family: 'Sarabun', 'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #0f172a;
            margin: 0;
            padding: ${paperSize === "slip80" ? "6px" : "20px"};
            max-width: ${paperSize === "slip80" ? "300px" : "780px"};
            margin-left: auto;
            margin-right: auto;
          }
          .header-box {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: ${paperSize === "slip80" ? "1fr" : "1fr 1fr"};
            gap: 10px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 16px;
            font-size: 13px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            border: 1px solid #cbd5e1;
          }
          th {
            background: #0f172a;
            color: #ffffff;
            font-size: 12px;
            padding: 8px 10px;
            text-align: left;
          }
          .summary-box {
            margin-left: auto;
            width: ${paperSize === "slip80" ? "100%" : "320px"};
            border: 2px solid #0f172a;
            border-radius: 10px;
            padding: 12px;
            background: #ffffff;
          }
          .sig-grid {
            margin-top: 36px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            text-align: center;
            font-size: 12px;
            color: #475569;
          }
          @media print {
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: flex-end; gap: 8px;">
          <button onclick="window.print()" style="background: #2563eb; color: white; border: 0; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer;">🖨️ สั่งพิมพ์ทันที</button>
          <button onclick="window.close()" style="background: #e2e8f0; color: #334155; border: 0; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer;">ปิดหน้าต่าง</button>
        </div>

        <div class="header-box">
          <div>
            <h1 style="margin: 0; font-size: ${paperSize === "slip80" ? "16px" : "22px"}; font-weight: 900;">${escapeHtml(hotelName)}</h1>
            <div style="font-size: 12px; color: #475569; margin-top: 4px;">${escapeHtml(dateRangeLabel)}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 18px; font-weight: 900; background: #0f172a; color: white; padding: 4px 12px; border-radius: 8px; display: inline-block;">
              ห้อง ${escapeHtml(roomNo)}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              วันที่พิมพ์: ${new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        <div class="meta-grid">
          <div>
            <div><strong>ชื่อผู้เข้าพัก / ลูกค้า:</strong> ${escapeHtml(guestName || "-")}</div>
            ${
              companyOrPayerInfo.trim()
                ? `<div style="margin-top: 4px;"><strong>นามบริษัท / ผู้เบิก:</strong> ${escapeHtml(companyOrPayerInfo)}</div>`
                : ""
            }
          </div>
          <div>
            <div><strong>เช็คอิน:</strong> ${checkInTime ? new Date(checkInTime).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</div>
            <div style="margin-top: 4px;"><strong>เช็คเอาท์:</strong> ${checkOutTime ? new Date(checkOutTime).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 36px;">#</th>
              <th>รายการค่าใช้จ่าย (Description)</th>
              <th style="width: 110px; text-align: center;">วันที่</th>
              <th style="width: 110px; text-align: right;">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="4" style="padding: 20px; text-align: center; color: #94a3b8;">ไม่มีรายการที่เลือกแสดง</td></tr>`}
          </tbody>
        </table>

        <div class="summary-box">
          <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; padding-bottom: 8px; border-bottom: 1px solid #cbd5e1;">
            <span>ยอดรวมสุทธิ (Total)</span>
            <span>฿${receiptTotal.toLocaleString()}</span>
          </div>
          ${
            showPaymentStatusOnReceipt
              ? `
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #059669; font-weight: 700; margin-top: 8px;">
              <span>ชำระแล้ว (${escapeHtml(paymentMethodsText)})</span>
              <span>฿${paidForThisReceipt.toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 800; color: ${remainingForThisReceipt > 0 ? "#dc2626" : "#334155"}; margin-top: 4px;">
              <span>ยอดค้างชำระตามใบเสร็จนี้</span>
              <span>฿${remainingForThisReceipt.toLocaleString()}</span>
            </div>
          `
              : ""
          }
        </div>

        ${
          receiptNote.trim()
            ? `<div style="margin-top: 12px; font-size: 12px; color: #334155; background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px dashed #cbd5e1;"><strong>หมายเหตุ:</strong> ${escapeHtml(receiptNote)}</div>`
            : ""
        }

        <div class="sig-grid">
          <div>
            <div style="border-bottom: 1px dotted #94a3b8; height: 28px; margin-bottom: 6px;"></div>
            <div>ผู้รับเงิน / พนักงานโรงแรม</div>
          </div>
          <div>
            <div style="border-bottom: 1px dotted #94a3b8; height: 28px; margin-bottom: 6px;"></div>
            <div>ผู้จ่ายเงิน / ลูกค้า</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              <span>🖨️</span> ตั้งค่าพิมพ์ใบเสร็จ / ใบสรุปค่าใช้จ่าย (Folio) — ห้อง {roomNo}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              เลือกช่วงวันที่ที่ต้องการพิมพ์ และติ๊กซ่อนรายการที่ลูกค้าจ่ายแยกเอง (เช่น มินิบาร์ หรือบริการเสริม) ได้อิสระ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-full bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 font-bold">กำลังเตรียมข้อมูลใบเสร็จ...</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/60">
            {/* Step 1: เลือกรูปแบบช่วงวันที่ */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>1️⃣</span> เลือกรูปแบบวันที่ในใบเสร็จ
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDateMode("up_to_latest")}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    dateMode === "up_to_latest"
                      ? "border-blue-600 bg-blue-50/70 text-blue-950 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  <div className="font-black text-xs sm:text-sm flex items-center justify-between">
                    <span>📆 รวมทุกวันถึงวันล่าสุด</span>
                    {dateMode === "up_to_latest" && <span className="text-blue-600">✓</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    พิมพ์เฉพาะวันที่เกิดค่าใช้จ่ายจริงแล้วถึงวันนี้ (เหมาะกับลูกค้าที่ยังไม่ออก)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDateMode("all_stay")}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    dateMode === "all_stay"
                      ? "border-blue-600 bg-blue-50/70 text-blue-950 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  <div className="font-black text-xs sm:text-sm flex items-center justify-between">
                    <span>🧾 รวมทุกวัน (ทั้งบิล)</span>
                    {dateMode === "all_stay" && <span className="text-blue-600">✓</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    รวมค่าห้องและบริการเสริมทุกคืนตลอดการเข้าพัก (รวมคืนล่วงหน้า)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDateMode("custom_dates")}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    dateMode === "custom_dates"
                      ? "border-blue-600 bg-blue-50/70 text-blue-950 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  <div className="font-black text-xs sm:text-sm flex items-center justify-between">
                    <span>📅 เลือกเฉพาะวันที่ต้องการ</span>
                    {dateMode === "custom_dates" && <span className="text-blue-600">✓</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    ติ๊กเลือกพิมพ์ใบเสร็จแยกเฉพาะบางวัน หรือรายวันตามต้องการ
                  </p>
                </button>
              </div>

              {/* แถบเลือกวันที่รายวัน */}
              {availableDates.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600">
                      วันที่ที่มีค่าใช้จ่าย (คลิกเพื่อเลือกพิมพ์รายวัน หรือติ๊กเลือกหลายวัน):
                    </span>
                    {dateMode === "custom_dates" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomDates(new Set(availableDates.map((d) => d.dateStr)))}
                          className="text-[11px] font-bold text-blue-600 hover:underline"
                        >
                          เลือกทุกวัน
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCustomDates(
                              new Set(availableDates.filter((d) => d.isOccurred).map((d) => d.dateStr))
                            )
                          }
                          className="text-[11px] font-bold text-emerald-600 hover:underline"
                        >
                          เฉพาะถึงวันนี้
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableDates.map((dObj) => {
                      const isChecked =
                        dateMode === "all_stay"
                          ? true
                          : dateMode === "up_to_latest"
                          ? dObj.isOccurred
                          : selectedCustomDates.has(dObj.dateStr);

                      return (
                        <div
                          key={dObj.dateStr}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                            isChecked
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-slate-50 text-slate-600 border-slate-200"
                          }`}
                        >
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (dateMode !== "custom_dates") {
                                  const initialSet = new Set(
                                    availableDates
                                      .filter((x) => (dateMode === "up_to_latest" ? x.isOccurred : true))
                                      .map((x) => x.dateStr)
                                  );
                                  if (initialSet.has(dObj.dateStr)) initialSet.delete(dObj.dateStr);
                                  else initialSet.add(dObj.dateStr);
                                  setDateMode("custom_dates");
                                  setSelectedCustomDates(initialSet);
                                } else {
                                  toggleCustomDate(dObj.dateStr);
                                }
                              }}
                              className="w-3.5 h-3.5 rounded text-blue-600"
                            />
                            <span>{formatThaiDateShort(dObj.dateStr)}</span>
                            <span className={isChecked ? "text-blue-100" : "text-slate-400"}>
                              (฿{dObj.totalAmount.toLocaleString()})
                            </span>
                            {!dObj.isOccurred && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-[10px]">ล่วงหน้า</span>
                            )}
                          </label>
                          <button
                            type="button"
                            onClick={() => selectSingleDateOnly(dObj.dateStr)}
                            title="พิมพ์เฉพาะวันนี้วันเดียว"
                            className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                              isChecked
                                ? "bg-white/20 hover:bg-white/30 text-white"
                                : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                            }`}
                          >
                            เฉพาะวันนี้
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: ปุ่มลัดซ่อน/แสดงตามหมวดหมู่ + รายการย่อย */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span>2️⃣</span> เลือกรายการที่จะให้แสดงและคำนวณในใบเสร็จ
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    ติ๊กเครื่องหมายถูกออกหน้าหมวดหมู่หรือรายการที่ลูกค้าต้องการจ่ายแยกเอง (ระบบจะซ่อนและตัดออกจากยอดรวมทันที)
                  </p>
                </div>

                {/* ปุ่มลัดซ่อน/แสดงตามหมวดหมู่ */}
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { key: "room", label: "🏠 ค่าห้องพัก" },
                      { key: "addon", label: "➕ บริการเสริม" },
                      { key: "minibar", label: "🥤 มินิบาร์/POS" },
                      { key: "other", label: "⚡ ค่าปรับ/อื่นๆ" },
                      { key: "deposit", label: "🔑 มัดจำกุญแจ" },
                    ] as { key: ReceiptItemCategory; label: string }[]
                  ).map((cat) => {
                    const hasAny = dateFilteredItems.some((i) => i.categoryGroup === cat.key);
                    if (!hasAny) return null;
                    const active = isCategoryAllVisible(cat.key);
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => toggleCategoryGroup(cat.key)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${
                          active
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                            : "bg-slate-100 border-slate-200 text-slate-400 line-through"
                        }`}
                      >
                        <span>{active ? "✓" : "✕"}</span>
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* รายการค่าใช้จ่ายแยกตามวัน */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {dateFilteredItems.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    ไม่มีรายการค่าใช้จ่ายในช่วงวันที่ที่เลือก
                  </div>
                ) : (
                  dateFilteredItems.map((item) => {
                    const isIncluded = !excludedItemIds.has(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                          isIncluded ? "bg-white hover:bg-slate-50" : "bg-slate-100/70 text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => toggleItem(item.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-sm font-bold ${
                                  isIncluded ? "text-slate-800" : "line-through text-slate-400"
                                }`}
                              >
                                {item.title}
                              </span>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                📅 {formatThaiDateShort(item.dateStr)}
                              </span>
                              {!item.isOccurred && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  ล่วงหน้า
                                </span>
                              )}
                              {!isIncluded && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                  ซ่อนจากใบเสร็จ
                                </span>
                              )}
                            </div>
                            {item.note && (
                              <p className="text-xs text-slate-500 truncate mt-0.5">{item.note}</p>
                            )}
                          </div>
                        </div>
                        <div
                          className={`text-sm font-black shrink-0 ${
                            isIncluded ? "text-slate-900" : "line-through text-slate-400"
                          }`}
                        >
                          ฿{item.amount.toLocaleString()}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              {/* แถบสรุปยอดที่แสดง vs ยอดที่ซ่อน */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-emerald-800">
                      ✅ ยอดรวมที่จะพิมพ์ในใบเสร็จ ({visibleReceiptItems.length} รายการ)
                    </p>
                    <p className="text-[11px] text-emerald-600">คำนวณเฉพาะรายการที่ติ๊กถูก</p>
                  </div>
                  <span className="text-xl font-black text-emerald-700">
                    ฿{receiptTotal.toLocaleString()}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-700">
                      🙈 รายการที่ซ่อน / จ่ายแยกเอง ({hiddenReceiptItems.length} รายการ)
                    </p>
                    <p className="text-[11px] text-slate-500">ไม่แสดงและไม่รวมในยอดใบเสร็จ</p>
                  </div>
                  <span className="text-lg font-black text-slate-600">
                    ฿{hiddenTotal.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 3: ข้อมูลหัวใบเสร็จ / บริษัทผู้เบิก (ตัวเลือกเสริม) */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>3️⃣</span> ข้อมูลบนหัวใบเสร็จ & รูปแบบกระดาษ (แก้ไขได้ก่อนพิมพ์)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    ชื่อผู้เข้าพัก / ผู้รับใบเสร็จ
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="ระบุชื่อลูกค้า..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    ชื่อบริษัท / เลขผู้เสียภาษี / ที่อยู่ (สำหรับเบิกบริษัท)
                  </label>
                  <input
                    type="text"
                    value={companyOrPayerInfo}
                    onChange={(e) => setCompanyOrPayerInfo(e.target.value)}
                    placeholder="เช่น บจก. เอบีซี (สำนักงานใหญ่)..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    หัวกระดาษ / ชื่อเอกสาร
                  </label>
                  <input
                    type="text"
                    value={hotelName}
                    onChange={(e) => setHotelName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    หมายเหตุท้ายใบเสร็จ (ถ้ามี)
                  </label>
                  <input
                    type="text"
                    value={receiptNote}
                    onChange={(e) => setReceiptNote(e.target.value)}
                    placeholder="เช่น ชำระค่าห้องพักเรียบร้อยแล้ว..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={showPaymentStatusOnReceipt}
                    onChange={(e) => setShowPaymentStatusOnReceipt(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  <span>แสดงบรรทัดยอดชำระแล้ว / ช่องทางชำระเงินท้ายใบเสร็จ</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">ขนาดกระดาษ:</span>
                  <button
                    type="button"
                    onClick={() => setPaperSize("a4")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                      paperSize === "a4"
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    📄 A4 / A5 มาตรฐาน
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperSize("slip80")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                      paperSize === "slip80"
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    🧾 สลิปย่อ 80mm
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            เลือกแสดง <b>{visibleReceiptItems.length}</b> รายการ • ยอดรวมสุทธิ{" "}
            <b className="text-emerald-700 text-sm">฿{receiptTotal.toLocaleString()}</b>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm transition-colors"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={visibleReceiptItems.length === 0}
              className="px-5 py-2.5 rounded-xl font-black bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm shadow-md flex items-center gap-2 transition-colors"
            >
              <span>🖨️</span> พิมพ์ใบเสร็จ (฿{receiptTotal.toLocaleString()})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatThaiDateShort(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "-";
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function formatThaiDateFull(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "-";
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
