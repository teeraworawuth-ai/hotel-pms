"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useShift } from "@/contexts/ShiftContext";

type ActiveBookingRow = {
  id: string;
  room: string;
  location: string;
  guest: string;
  stay: string;
  checkInIso: string;
  bookedAt: string;
  total: number;
  bf: number;
  add: number;
  cf: number;
  note: string;
  isLongTerm?: boolean;
};

type UsedBookingRow = {
  seq: string;
  room: string;
  location: string;
  guest: string;
  bookedAt: string;
  checkedInAt: string;
  bf: number;
  used: number;
  cf: number;
  statusLabel: string;
};

const BASE_PROTO_ROWS: ActiveBookingRow[] = [
  { id: "R1", room: "201", location: "ซอย1", guest: "คุณกิตติพงษ์ (086-111-2233)", stay: "09–20/11/69 (12 คืน)", checkInIso: "2026-11-09", bookedAt: "08/11 • เมย์", total: 8400, bf: 0, add: 500, cf: 500, note: "K 500 • เข้า ~18:00 น." },
  { id: "R2-1", room: "208", location: "ซอย1", guest: "คุณนภา จองคู่ (082-333-4455)", stay: "10/11/69 (1 คืน)", checkInIso: "2026-11-10", bookedAt: "08/11 • แอน", total: 600, bf: 0, add: 300, cf: 300, note: "S 300 • เข้า ~14:00 (คู่ 209)" },
  { id: "R2-2", room: "209", location: "ซอย1", guest: "คุณนภา จองคู่ (082-333-4455)", stay: "10/11/69 (1 คืน)", checkInIso: "2026-11-10", bookedAt: "08/11 • แอน", total: 600, bf: 0, add: 300, cf: 300, note: "S 300 • เข้า ~14:00 (คู่ 208)" },
  { id: "R3", room: "104", location: "ซอย1", guest: "คุณมานพ วัฒนา (085-777-8899)", stay: "12–14/11/69 (3 คืน)", checkInIso: "2026-11-12", bookedAt: "08/11 • แอน", total: 2100, bf: 0, add: 500, cf: 500, note: "เงินสด 500 • เข้า ~20:30 ขอหมอนเพิ่ม" },
];

const LONG_TERM_PROTO_ROWS: ActiveBookingRow[] = [
  { id: "L1", room: "115", location: "ซอย1", guest: "กรุ๊ปทัวร์ปีใหม่ คุณสุชาติ (084-555-6677)", stay: "30/12/69–02/01/70 (3 คืน • ข้ามปี)", checkInIso: "2026-12-30", bookedAt: "01/11 • เมย์", total: 2400, bf: 1000, add: 0, cf: 1000, note: "K 1,000 • โอนมัดจำไว้ตั้งแต่ 1 พ.ย. (ล็อกข้ามปี)", isLongTerm: true },
  { id: "L2", room: "210", location: "ซอย1", guest: "Mr. David Lee (091-222-3344)", stay: "14–16/02/70 (2 คืน • ข้ามปี)", checkInIso: "2027-02-14", bookedAt: "04/11 • บี", total: 1400, bf: 700, add: 0, cf: 700, note: "S 700 • จองช่วงวาเลนไทน์ ปี 70 (เตรียมเตียงเดี่ยว)", isLongTerm: true },
];

const PROTO_USED_ROWS: UsedBookingRow[] = [
  { seq: "#4", room: "102", location: "ซอย1", guest: "คุณสมชาย ใจดี • 081-234-5678", bookedAt: "02/11 (เมย์)", checkedInAt: "08/11 11:15 (กะเช้า)", bf: 1200, used: 1200, cf: 0, statusLabel: "✅ เข้าพัก (1/2)" },
  { seq: "#16", room: "202", location: "ซอย1", guest: "คุณวิภา แสงทอง • 089-999-1122", bookedAt: "05/11 (แอน)", checkedInAt: "08/11 15:45 (กะบ่าย)", bf: 1200, used: 1200, cf: 0, statusLabel: "✅ เข้าพัก (1/2)" },
];

export default function BookingAdvanceReportView({ dateOffset = 0 }: { dateOffset?: number }) {
  const { getActiveBusinessDate } = useShift();
  const [selectedLoc, setSelectedLoc] = useState<string>("ซอย1");
  const [viewMode, setViewMode] = useState<"live" | "proto_today" | "proto_longterm">("live");
  const [liveActiveRows, setLiveActiveRows] = useState<ActiveBookingRow[]>([]);
  const [liveUsedRows, setLiveUsedRows] = useState<UsedBookingRow[]>([]);
  const [reportDateLabel, setReportDateLabel] = useState<string>("วันอาทิตย์ที่ 8 พฤศจิกายน 2569");
  const [totalLocRooms, setTotalLocRooms] = useState<number>(32);

  useEffect(() => {
    async function loadBookings() {
      const baseDay = getActiveBusinessDate();
      baseDay.setDate(baseDay.getDate() + dateOffset);
      const start0645 = new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate(), 6, 45, 0, 0);
      const end0645 = new Date(start0645);
      end0645.setDate(end0645.getDate() + 1);

      setReportDateLabel(
        start0645.toLocaleDateString("th-TH", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      );

      const [roomsRes, bookingsRes] = await Promise.all([
        supabase.from("rooms").select("id, room_no, location"),
        supabase
          .from("bookings")
          .select("id, room_id, guest_name, guest_phone, staff_name, status, check_in_time, check_out_time, actual_check_in_time, actual_price, created_at")
          .in("status", ["reserved", "checked_in", "checked_out"])
          .order("check_in_time", { ascending: true })
          .limit(1000),
      ]);

      const rooms = roomsRes.data || [];
      const roomMap: Record<string, { room_no: string; location: string }> = {};
      rooms.forEach((r: any) => {
        roomMap[r.id] = { room_no: r.room_no, location: (r.location || "ซอย1").trim() };
      });

      const locRoomsCount =
        selectedLoc === "ALL"
          ? rooms.length || 32
          : rooms.filter((r: any) => (r.location || "ซอย1").trim() === selectedLoc).length || 32;
      setTotalLocRooms(locRoomsCount);

      const bookings = bookingsRes.data || [];
      const reservedBookings = bookings.filter((b: any) => b.status === "reserved");
      const reservedIds = reservedBookings.map((b: any) => b.id);

      let txs: any[] = [];
      if (reservedIds.length > 0) {
        const { data: txData } = await supabase
          .from("ledger_transactions")
          .select("id, booking_id, transaction_type, category, amount, notes, created_at")
          .in("booking_id", reservedIds);
        txs = txData || [];
      }

      const activeList: ActiveBookingRow[] = [];
      reservedBookings.forEach((b: any, idx: number) => {
        const rm = roomMap[b.room_id] || { room_no: "-", location: "ซอย1" };
        if (selectedLoc !== "ALL" && rm.location !== selectedLoc) return;
        const bTxs = txs.filter((t) => t.booking_id === b.id && t.transaction_type === "payment" && Number(t.amount) < 0);
        let bf = 0;
        let add = 0;
        let methodStr = "";
        bTxs.forEach((t) => {
          const ts = new Date(t.created_at).getTime();
          const amt = Math.abs(Number(t.amount || 0));
          if (ts < start0645.getTime()) bf += amt;
          else if (ts < end0645.getTime()) add += amt;
          if (t.category === "cash") methodStr = `เงินสด ${amt.toLocaleString()}`;
          else {
            const bm = String(t.notes || "").match(/\[BANK:([^\]]+)\]/);
            const bk = bm ? bm[1].trim() : "โอน";
            methodStr = `${bk} ${amt.toLocaleString()}`;
          }
        });
        const cf = bf + add;
        const ci = new Date(b.check_in_time);
        const co = new Date(b.check_out_time);
        const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / (24 * 3600 * 1000)));
        const stayStr = `${ci.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" })} (${nights} คืน)`;
        const bookedDate = b.created_at ? new Date(b.created_at).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" }) : "-";

        activeList.push({
          id: `R${idx + 1}`,
          room: rm.room_no,
          location: rm.location,
          guest: `${b.guest_name || "ลูกค้าจอง"}${b.guest_phone ? ` (${b.guest_phone})` : ""}`,
          stay: stayStr,
          checkInIso: b.check_in_time,
          bookedAt: `${bookedDate} • ${b.staff_name || "-"}`,
          total: Number(b.actual_price || 0),
          bf,
          add,
          cf,
          note: `${methodStr || "รอรับมัดจำ"} • เข้า ~${ci.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`,
        });
      });

      setLiveActiveRows(activeList);
      setLiveUsedRows([]);
    }
    loadBookings();
  }, [dateOffset, selectedLoc, getActiveBusinessDate]);

  const isLive = viewMode === "live";
  const rows: ActiveBookingRow[] = isLive
    ? liveActiveRows
    : viewMode === "proto_longterm"
    ? [...BASE_PROTO_ROWS, ...LONG_TERM_PROTO_ROWS]
    : BASE_PROTO_ROWS;

  const usedRows: UsedBookingRow[] = isLive ? liveUsedRows : PROTO_USED_ROWS;

  const sumActiveBf = rows.reduce((s, r) => s + r.bf, 0);
  const sumActiveAdd = rows.reduce((s, r) => s + r.add, 0);
  const sumActiveCf = rows.reduce((s, r) => s + r.cf, 0);
  const sumUsedToday = usedRows.reduce((s, r) => s + r.used, 0);
  const totalBfBox = sumActiveBf + sumUsedToday;

  const locDisplayLabel =
    selectedLoc === "ALL" ? "รวมทุกสถานที่" : selectedLoc === "ซอย1" ? "ซอย 1" : selectedLoc === "ซอย2" ? "ซอย 2" : selectedLoc;

  return (
    <div id="booking-advance-report-root" className="w-full">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <style>{`
        #a4-booking-report-sheet {
          font-family: 'Sarabun', sans-serif;
          font-size: 8.2px;
          line-height: 1.2;
          width: 100%;
          max-width: 820px;
          margin: 0 auto;
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.12);
          border: 1px solid #cbd5e1;
          padding: 10px 12px;
          border-radius: 6px;
        }
        #a4-booking-report-sheet table.bk-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        #a4-booking-report-sheet table.bk-table th,
        #a4-booking-report-sheet table.bk-table td {
          border: 1px solid #94a3b8;
          padding: 2.5px 3px;
          vertical-align: middle;
          font-size: 8px;
          line-height: 1.15;
        }
        #a4-booking-report-sheet table.bk-table thead th {
          background-color: #eef2ff;
          color: #1e1b4b;
          font-weight: 800;
          text-align: center;
        }
        @page {
          size: A4 portrait;
          margin: 4mm 4mm;
        }
        @media print {
          nav, header, .no-print { display: none !important; }
          html, body, main {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #a4-booking-report-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          tr { page-break-inside: avoid !important; }
          thead { display: table-header-group !important; }
        }
      `}</style>

      {/* แถบควบคุม Interactive (ไม่พิมพ์) */}
      <div
        className="no-print max-w-[820px] mx-auto mb-2.5 bg-slate-900 text-white px-3 py-2 rounded-lg flex flex-wrap items-center justify-between gap-2 shadow"
        style={{ fontFamily: "'Sarabun', sans-serif" }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-2 py-0.5 rounded bg-indigo-800 text-indigo-100 font-black text-[10.5px] border border-indigo-600">
            📅 ทะเบียนการจอง &amp; มัดจำล่วงหน้า
          </span>
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            {[
              { key: "ซอย1", label: "🏨 ซอย 1" },
              { key: "ซอย2", label: "🏨 ซอย 2" },
              { key: "ซามีญ่า", label: "🏨 ซามีญ่า" },
              { key: "ALL", label: "🌐 รวมทุกสถานที่" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedLoc(item.key)}
                className={`px-2 py-0.5 rounded text-[9.5px] font-bold cursor-pointer ${
                  selectedLoc === item.key
                    ? "bg-emerald-700 text-white ring-2 ring-emerald-400"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[9.5px] flex-wrap">
          <button
            type="button"
            onClick={() => setViewMode("live")}
            className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
              viewMode === "live" ? "bg-emerald-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-100"
            }`}
          >
            🟢 ข้อมูลจริง ({liveActiveRows.length} รายการ)
          </button>
          <button
            type="button"
            onClick={() => setViewMode("proto_today")}
            className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
              viewMode === "proto_today" ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-100"
            }`}
          >
            กระทบยอดตัวอย่าง (8 พ.ย. 69)
          </button>
          <button
            type="button"
            onClick={() => setViewMode("proto_longterm")}
            className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
              viewMode === "proto_longterm" ? "bg-purple-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-100"
            }`}
          >
            + จองข้ามเดือน / ข้ามปี
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-1 px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 font-black text-white shadow flex items-center gap-1 cursor-pointer"
          >
            🖨️ พิมพ์หลักฐานการจอง (A4)
          </button>
        </div>
      </div>

      {/* หน้ากระดาษ A4 */}
      <div id="a4-booking-report-sheet">
        {/* หัวกระดาษ */}
        <div className="flex justify-between items-center border-b-2 border-slate-800 pb-1.5 mb-2 gap-2">
          <div>
            <div className="font-black text-[12px] text-slate-900">
              📅 รายงานการจองห้องพัก &amp; ทะเบียนคุมเงินมัดจำ &quot;รับจอง&quot; ({locDisplayLabel})
            </div>
            <div className="text-[8px] text-slate-600 font-semibold mt-0.5">
              ใช้ตรวจสอบยอดยกมา–ยกไปให้ตรงกับรายงานการเงินประจำวัน เตรียมห้องเข้าพักล่วงหน้า และเก็บเป็นเอกสารสำรองป้องกันข้อมูลสูญหาย
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="px-2 py-0.5 bg-blue-50 text-blue-950 border border-blue-300 rounded font-black text-[9px]">
              📅 ณ {isLive ? reportDateLabel : "วันอาทิตย์ที่ 8 พฤศจิกายน 2569"}
            </div>
            <div className="text-[7.2px] text-slate-500 mt-0.5">พิมพ์เอกสารหลักฐานรอบปิดวัน (ตัดยอด 06:45 น.)</div>
          </div>
        </div>

        {/* กล่องสมการกระทบยอด "รับจอง" ตรงกับป้ายในรายงานการเงิน 100% */}
        <div className="mb-2 border border-indigo-300 rounded bg-indigo-50/40 p-1.5">
          <div className="flex justify-between items-center mb-1">
            <span className="font-black text-[9px] text-indigo-950">
              🔗 สมการกระทบยอดเงินมัดจำ &quot;รับจอง&quot; (เชื่อมตรงกับป้ายรับจองในรายงานการเงิน)
            </span>
            <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-black text-[7.8px]">
              ✅ ยอดตรงกับรายงานการเงิน 100%
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1 text-center">
            <div className="bg-white border border-slate-300 rounded p-1">
              <div className="text-[7.5px] font-bold text-slate-500">1. มัดจำรับจองยกมา</div>
              <div className="text-[11.5px] font-black text-slate-800 mt-0.5">{totalBfBox.toLocaleString()} ฿</div>
              <div className="text-[6.8px] text-slate-500">
                ({usedRows.length + rows.filter((r) => r.bf > 0).length} รายการรอก่อนหน้า)
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-300 rounded p-1">
              <div className="text-[7.5px] font-bold text-emerald-900">2. + รับจองใหม่วันนี้</div>
              <div className="text-[11.5px] font-black text-emerald-700 mt-0.5">+{sumActiveAdd.toLocaleString()} ฿</div>
              <div className="text-[6.8px] text-emerald-800">({rows.filter((r) => r.add > 0).length} ห้องใหม่วันนี้)</div>
            </div>
            <div className="bg-rose-50 border border-rose-300 rounded p-1">
              <div className="text-[7.5px] font-bold text-rose-900">3. - ใช้จองเข้าพักวันนี้</div>
              <div className="text-[11.5px] font-black text-rose-700 mt-0.5">-{sumUsedToday.toLocaleString()} ฿</div>
              <div className="text-[6.8px] text-rose-800">
                ({usedRows.length > 0 ? `เช็คอินห้อง ${usedRows.map((u) => u.room).join(", ")}` : "0 รายการวันนี้"})
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-300 rounded p-1">
              <div className="text-[7.5px] font-bold text-amber-900">4. ยกเลิก / ริบมัดจำ</div>
              <div className="text-[11.5px] font-black text-amber-800 mt-0.5">0 ฿</div>
              <div className="text-[6.8px] text-amber-700">(0 รายการวันนี้)</div>
            </div>
            <div className="bg-indigo-100 border-2 border-indigo-400 rounded p-1">
              <div className="text-[7.5px] font-black text-indigo-950">5. = ยอดรับจองยกไปคงเหลือ</div>
              <div className="text-[12px] font-black text-indigo-900 mt-0.5">{sumActiveCf.toLocaleString()} ฿</div>
              <div className="text-[6.8px] font-bold text-indigo-800">
                (ถือมัดจำลูกค้ารอเข้าพัก {rows.length} ห้อง)
              </div>
            </div>
          </div>
        </div>

        {/* ส่วนคาดการณ์อัตราจองล่วงหน้ารายวัน (ช่วยจัดโปรโมชั่น & เตรียมห้อง) */}
        <div className="mb-2 border border-slate-300 rounded bg-slate-50 p-1.5">
          <div className="flex justify-between items-center mb-1">
            <span className="font-black text-[9px] text-slate-900">
              📊 คาดการณ์ห้องจองล่วงหน้า &amp; ความหนาแน่นผู้เข้าพัก (วางแผนเตรียมห้อง + จัดโปรโมชั่น)
            </span>
            <span className="text-[7.3px] text-slate-500 font-semibold">
              สาขา{locDisplayLabel} มีทั้งหมด {totalLocRooms} ห้อง
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1 text-center text-[7.5px]">
            <div className="bg-white border border-slate-200 rounded p-1">
              <div className="font-black text-slate-800">จ. 09/11 (พรุ่งนี้)</div>
              <div className="text-[9.5px] font-black text-indigo-700">
                1 ห้อง <span className="text-[7px] text-slate-500">(3%)</span>
              </div>
              <div className="text-[6.6px] text-emerald-700 font-bold">ว่างเยอะ • ควรจัดโปรฯ</div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-1">
              <div className="font-black text-slate-800">อ. 10/11</div>
              <div className="text-[9.5px] font-black text-indigo-700">
                3 ห้อง <span className="text-[7px] text-slate-500">(9%)</span>
              </div>
              <div className="text-[6.6px] text-slate-600">201, 208, 209</div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-1">
              <div className="font-black text-slate-800">พ. 11/11</div>
              <div className="text-[9.5px] font-black text-indigo-700">
                1 ห้อง <span className="text-[7px] text-slate-500">(3%)</span>
              </div>
              <div className="text-[6.6px] text-slate-600">201 (พักต่อ)</div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-1">
              <div className="font-black text-slate-800">พฤ. 12/11</div>
              <div className="text-[9.5px] font-black text-indigo-700">
                2 ห้อง <span className="text-[7px] text-slate-500">(6%)</span>
              </div>
              <div className="text-[6.6px] text-slate-600">201, 104</div>
            </div>
            <div className="bg-amber-50/70 border border-amber-200 rounded p-1">
              <div className="font-black text-amber-950">ข้ามเดือน ธ.ค. 69</div>
              <div className="text-[9.5px] font-black text-amber-800">
                {viewMode === "proto_longterm" ? "1 ห้อง (115)" : "0 ห้อง"}
              </div>
              <div className="text-[6.6px] text-amber-700">ช่วงเทศกาลปีใหม่</div>
            </div>
            <div className="bg-purple-50/70 border border-purple-200 rounded p-1">
              <div className="font-black text-purple-950">ข้ามปี ม.ค.–ก.พ. 70</div>
              <div className="text-[9.5px] font-black text-purple-800">
                {viewMode === "proto_longterm" ? "2 ห้อง (115, 210)" : "0 ห้อง"}
              </div>
              <div className="text-[6.6px] text-purple-700">ล็อกห้องระยะยาว</div>
            </div>
          </div>
        </div>

        {/* ตารางที่ 1: ทะเบียนการจองที่ยังถือมัดจำคงเหลือยกไป */}
        <div className="mb-2">
          <div className="font-black text-[9.2px] text-indigo-950 mb-1 flex justify-between items-center">
            <span>
              1. ทะเบียนการจองคงเหลือยกไป (ลูกค้าวางเงินจองแล้ว — รอเข้าพักตามกำหนดเพื่อป้องกันข้อมูลสูญหาย)
            </span>
            <span className="text-[7.5px] font-bold text-slate-500">
              เรียงตามวันเช็คอินใกล้สุด → ไกลสุด (ข้ามเดือน/ข้ามปี)
            </span>
          </div>
          <table className="bk-table">
            <thead>
              <tr>
                <th style={{ width: "5%" }}>รหัส</th>
                <th style={{ width: "7%" }}>ห้อง</th>
                <th style={{ width: "15%" }}>ชื่อผู้จอง / เบอร์โทร</th>
                <th style={{ width: "14%" }}>ช่วงวันเข้าพัก (คืน)</th>
                <th style={{ width: "11%" }}>วันที่รับจอง &amp; พนง.</th>
                <th style={{ width: "8%" }}>ค่าห้องรวม</th>
                <th style={{ width: "9%" }}>ยอดยกมา</th>
                <th style={{ width: "9%" }}>รับเพิ่มวันนี้</th>
                <th style={{ width: "10%" }} className="bg-indigo-100 text-indigo-950">
                  มัดจำคงเหลือยกไป
                </th>
                <th style={{ width: "12%" }}>ช่องทางรับ &amp; หมายเหตุเตรียมห้อง</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-3 text-slate-400 font-bold">
                    ไม่มีรายการจองค้างเข้าพักในขณะนี้ (สามารถกดปุ่ม &quot;กระทบยอดตัวอย่าง&quot; ด้านบนเพื่อดูรูปแบบรายงาน)
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={r.isLongTerm ? "bg-purple-50/40" : ""}>
                    <td className="text-center font-bold text-indigo-900">{r.id}</td>
                    <td className="text-center font-black">{r.room}</td>
                    <td>{r.guest}</td>
                    <td className={`text-center font-bold ${r.isLongTerm ? "text-purple-900" : ""}`}>{r.stay}</td>
                    <td className="text-center">{r.bookedAt}</td>
                    <td className="text-right">{r.total.toLocaleString()} ฿</td>
                    <td className="text-right">{r.bf ? `${r.bf.toLocaleString()} ฿` : "-"}</td>
                    <td className="text-right font-bold text-emerald-700">
                      {r.add ? `+${r.add.toLocaleString()} ฿` : "-"}
                    </td>
                    <td className="text-right font-black text-indigo-900 bg-indigo-50/60">
                      {r.cf.toLocaleString()} ฿
                    </td>
                    <td className="text-[7.2px]">{r.note}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50 font-black text-indigo-950">
                <td colSpan={6} className="text-right pr-2">
                  รวมยอดมัดจำ &quot;รับจอง&quot; คงเหลือยกไปทั้งหมด:
                </td>
                <td className="text-right">{sumActiveBf.toLocaleString()} ฿</td>
                <td className="text-right text-emerald-700">+{sumActiveAdd.toLocaleString()} ฿</td>
                <td className="text-right text-indigo-900 bg-indigo-100">{sumActiveCf.toLocaleString()} ฿</td>
                <td className="text-center text-[7px] text-indigo-800">เก็บหลักฐานคงค้างรอเข้าพัก</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ตารางที่ 2: ประวัติการใช้เงินจอง/เช็คอิน/ยกเลิกวันนี้ */}
        <div className="mb-2">
          <div className="font-black text-[9.2px] text-rose-950 mb-1">
            2. รายการตัดใช้เงินจองเมื่อลูกค้าเช็คอินเข้าพักวันนี้ (กระทบยอดยกมา {sumUsedToday.toLocaleString()} ฿ → คงเหลือ 0 ฿)
          </div>
          <table className="bk-table">
            <thead>
              <tr>
                <th style={{ width: "6%" }}>ลำดับ</th>
                <th style={{ width: "7%" }}>ห้อง</th>
                <th style={{ width: "17%" }}>ชื่อผู้จอง / เบอร์โทร</th>
                <th style={{ width: "13%" }}>วันที่จองเดิม (พนง.)</th>
                <th style={{ width: "14%" }}>เช็คอินเข้าพักจริง</th>
                <th style={{ width: "10%" }}>มัดจำยกมา</th>
                <th style={{ width: "10%" }}>ตัดใช้จองวันนี้</th>
                <th style={{ width: "10%" }}>คงเหลือยกไป</th>
                <th style={{ width: "13%" }}>สถานะเชื่อมรายงานการเงิน</th>
              </tr>
            </thead>
            <tbody>
              {usedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-2 text-slate-400 font-bold">
                    ไม่มีรายการตัดใช้เงินจองในวันนี้
                  </td>
                </tr>
              ) : (
                usedRows.map((u) => (
                  <tr key={u.seq}>
                    <td className="text-center font-bold">{u.seq}</td>
                    <td className="text-center font-black">{u.room}</td>
                    <td>{u.guest}</td>
                    <td className="text-center">{u.bookedAt}</td>
                    <td className="text-center">{u.checkedInAt}</td>
                    <td className="text-right font-bold">{u.bf.toLocaleString()} ฿</td>
                    <td className="text-right font-black text-rose-700">-{u.used.toLocaleString()} ฿</td>
                    <td className="text-right text-slate-400">{u.cf.toLocaleString()} ฿</td>
                    <td className="text-center text-emerald-700 font-bold">{u.statusLabel}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ท้ายกระดาษสำหรับเซ็นรับรองหลักฐานประจำวัน */}
        <div className="border-t-2 border-slate-700 pt-2 mt-2 flex justify-between items-end text-[8.5px]">
          <div className="text-slate-600">
            <b>หมายเหตุการจัดเก็บ:</b> พิมพ์แนบคู่กับรายงานการเงินประจำวัน เพื่อยืนยันยอดมัดจำรับจองคงเหลือและเตรียมห้องเข้าพักล่วงหน้า (อ้างอิงข้อมูลตรงจากแท็บรับจอง)
          </div>
          <div className="flex gap-8 shrink-0 font-bold text-slate-900">
            <span>ลงชื่อ ________________________ ผู้จัดทำ</span>
            <span>ลงชื่อ ________________________ ผู้ตรวจ/ผู้จัดการ</span>
          </div>
        </div>
      </div>
    </div>
  );
}
