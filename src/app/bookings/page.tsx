"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export interface BookingReportItem {
  id: string;
  bookingRef: string;
  roomNo: string;
  roomType: string;
  location: string;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  checkInDate: string; // YYYY-MM-DD
  checkInTimeStr: string; // เช่น 14:00 น.
  checkOutDate: string; // YYYY-MM-DD
  checkOutTimeStr: string; // เช่น 12:00 น.
  nights: number;
  channel: string; // เช่น หน้าฟร้อนท์, โทรศัพท์, LINE / Facebook, Agoda, Booking.com
  staffName: string;
  totalPrice: number;
  depositPaid: number;
  paymentMethod: string; // เช่น โอน KBank, เงินสด, บัตรเครดิต
  remainingBalance: number;
  status: "reserved" | "checked_in" | "checked_out" | "cancelled";
  note?: string;
  bookedAtDateStr: string;
}

// ข้อมูลตัวอย่างจำลองการจอง (Mock Data) ตั้งแต่วันนี้เป็นต้นไป เรียงลำดับจากวันที่เข้าพักเร็วที่สุด
const MOCK_BOOKINGS: BookingReportItem[] = [
  {
    id: "mock-1",
    bookingRef: "BK-261128-01",
    roomNo: "102",
    roomType: "เตียงเดี่ยว",
    location: "ซอย1",
    guestName: "คุณกิตติพงษ์ สุวรรณเวช",
    guestPhone: "086-111-2233",
    guestCount: 2,
    checkInDate: "2026-11-28",
    checkInTimeStr: "14:00 น.",
    checkOutDate: "2026-11-29",
    checkOutTimeStr: "12:00 น.",
    nights: 1,
    channel: "โทรศัพท์",
    staffName: "เมย์",
    totalPrice: 600,
    depositPaid: 300,
    paymentMethod: "โอน KBank",
    remainingBalance: 300,
    status: "reserved",
    note: "ขอห้องปลอดบุหรี่ เงียบสงบ ชั้น 1",
    bookedAtDateStr: "26 พ.ย. 69",
  },
  {
    id: "mock-2",
    bookingRef: "BK-261128-02",
    roomNo: "205",
    roomType: "เตียงคู่",
    location: "ซอย1",
    guestName: "คุณนภา จันทร์กระจ่าง (จอง 2 ห้อง)",
    guestPhone: "082-333-4455",
    guestCount: 2,
    checkInDate: "2026-11-28",
    checkInTimeStr: "18:30 น.",
    checkOutDate: "2026-11-30",
    checkOutTimeStr: "12:00 น.",
    nights: 2,
    channel: "LINE",
    staffName: "แอล",
    totalPrice: 1600,
    depositPaid: 800,
    paymentMethod: "โอน SCB",
    remainingBalance: 800,
    status: "reserved",
    note: "เข้าเช็คอินค่ำประมาณ 18:30 น. (คู่ห้อง 206)",
    bookedAtDateStr: "27 พ.ย. 69",
  },
  {
    id: "mock-3",
    bookingRef: "BK-261128-03",
    roomNo: "206",
    roomType: "เตียงคู่",
    location: "ซอย1",
    guestName: "คุณนภา จันทร์กระจ่าง (จอง 2 ห้อง)",
    guestPhone: "082-333-4455",
    guestCount: 2,
    checkInDate: "2026-11-28",
    checkInTimeStr: "18:30 น.",
    checkOutDate: "2026-11-30",
    checkOutTimeStr: "12:00 น.",
    nights: 2,
    channel: "LINE",
    staffName: "แอล",
    totalPrice: 1600,
    depositPaid: 800,
    paymentMethod: "โอน SCB",
    remainingBalance: 800,
    status: "reserved",
    note: "ห้องติดกับ 205 ขอกุญแจสำรอง",
    bookedAtDateStr: "27 พ.ย. 69",
  },
  {
    id: "mock-4",
    bookingRef: "BK-261129-01",
    roomNo: "108",
    roomType: "เตียงเดี่ยว",
    location: "ซอย2",
    guestName: "คุณมานพ วัฒนาเจริญ",
    guestPhone: "085-777-8899",
    guestCount: 1,
    checkInDate: "2026-11-29",
    checkInTimeStr: "13:00 น.",
    checkOutDate: "2026-12-01",
    checkOutTimeStr: "12:00 น.",
    nights: 2,
    channel: "หน้าฟร้อนท์",
    staffName: "เต้ย",
    totalPrice: 1200,
    depositPaid: 500,
    paymentMethod: "เงินสด",
    remainingBalance: 700,
    status: "reserved",
    note: "ขอน้ำดื่มเพิ่ม 2 ขวดตอนเข้าพัก",
    bookedAtDateStr: "27 พ.ย. 69",
  },
  {
    id: "mock-5",
    bookingRef: "BK-261129-02",
    roomNo: "204",
    roomType: "เตียงคู่",
    location: "ซอย2",
    guestName: "คุณอัญชลี ศรีสุข",
    guestPhone: "089-444-5566",
    guestCount: 2,
    checkInDate: "2026-11-29",
    checkInTimeStr: "15:00 น.",
    checkOutDate: "2026-11-30",
    checkOutTimeStr: "12:00 น.",
    nights: 1,
    channel: "Facebook",
    staffName: "เมย์",
    totalPrice: 800,
    depositPaid: 800,
    paymentMethod: "โอน KBank",
    remainingBalance: 0,
    status: "reserved",
    note: "ชำระเต็มจำนวนแล้ว แจ้งว่าจะมาถึงประมาณ 15:00",
    bookedAtDateStr: "28 พ.ย. 69",
  },
  {
    id: "mock-6",
    bookingRef: "BK-261205-01",
    roomNo: "บ้าน 1",
    roomType: "บ้านเดี่ยว",
    location: "ซามีญ่า",
    guestName: "คุณธีระ รัตนประเสริฐ (ครอบครัว)",
    guestPhone: "081-999-0011",
    guestCount: 4,
    checkInDate: "2026-12-05",
    checkInTimeStr: "14:00 น.",
    checkOutDate: "2026-12-07",
    checkOutTimeStr: "12:00 น.",
    nights: 2,
    channel: "โทรศัพท์",
    staffName: "แอล",
    totalPrice: 3600,
    depositPaid: 1800,
    paymentMethod: "โอน PromptPay",
    remainingBalance: 1800,
    status: "reserved",
    note: "ช่วงวันหยุดยาว ขอเตียงเสริม 1 ชุด จอดรถ 2 คัน",
    bookedAtDateStr: "25 พ.ย. 69",
  },
  {
    id: "mock-7",
    bookingRef: "BK-261230-01",
    roomNo: "112",
    roomType: "เตียงเดี่ยว",
    location: "ซอย1",
    guestName: "คุณสุชาติ อนันตชัย (กรุ๊ปปีใหม่)",
    guestPhone: "084-555-6677",
    guestCount: 2,
    checkInDate: "2026-12-30",
    checkInTimeStr: "14:00 น.",
    checkOutDate: "2027-01-02",
    checkOutTimeStr: "12:00 น.",
    nights: 3,
    channel: "LINE",
    staffName: "เมย์",
    totalPrice: 2700,
    depositPaid: 1500,
    paymentMethod: "โอน KBank",
    remainingBalance: 1200,
    status: "reserved",
    note: "จองข้ามปีช่วงเทศกาลปีใหม่ ล็อกห้องชั้นล่าง",
    bookedAtDateStr: "20 พ.ย. 69",
  },
  {
    id: "mock-8",
    bookingRef: "BK-270214-01",
    roomNo: "210",
    roomType: "เตียงคู่พิเศษ",
    location: "ซอย1",
    guestName: "Mr. David Lee",
    guestPhone: "091-222-3344",
    guestCount: 2,
    checkInDate: "2027-02-14",
    checkInTimeStr: "14:00 น.",
    checkOutDate: "2027-02-16",
    checkOutTimeStr: "12:00 น.",
    nights: 2,
    channel: "Agoda",
    staffName: "บี",
    totalPrice: 2000,
    depositPaid: 1000,
    paymentMethod: "บัตรเครดิต",
    remainingBalance: 1000,
    status: "reserved",
    note: "วาเลนไทน์ 70 • ต้องการเซ็ทของขวัญต้อนรับ",
    bookedAtDateStr: "22 พ.ย. 69",
  },
];

export default function BookingsPage() {
  const [viewMode, setViewMode] = useState<"document" | "table">("document");
  const [dataSource, setDataSource] = useState<"mock" | "live">("mock");
  const [locationFilter, setLocationFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("reserved");
  const [searchTerm, setSearchTerm] = useState("");
  const [liveBookings, setLiveBookings] = useState<BookingReportItem[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);

  // ดึงข้อมูลจริงจาก Supabase เมื่อเลือกโหมด Live
  useEffect(() => {
    async function fetchLiveBookings() {
      if (dataSource !== "live") return;
      setLoadingLive(true);
      try {
        const [roomsRes, bookingsRes, ledgersRes] = await Promise.all([
          supabase.from("rooms").select("id, room_no, room_type, location"),
          supabase
            .from("bookings")
            .select(`
              id, room_id, guest_name, guest_phone, guest_count,
              check_in_time, check_out_time, status, actual_price,
              staff_name, created_at, notes
            `)
            .order("check_in_time", { ascending: true })
            .limit(500),
          supabase
            .from("ledger_transactions")
            .select("booking_id, transaction_type, category, amount, notes")
            .eq("transaction_type", "payment"),
        ]);

        const roomsMap = new Map<string, any>();
        (roomsRes.data || []).forEach((r: any) => roomsMap.set(r.id, r));

        const paymentsMap = new Map<string, { totalPaid: number; method: string }>();
        (ledgersRes.data || []).forEach((t: any) => {
          const prev = paymentsMap.get(t.booking_id) || { totalPaid: 0, method: "" };
          const amt = Math.abs(Number(t.amount || 0));
          prev.totalPaid += amt;
          if (!prev.method) {
            prev.method = t.category === "cash" ? "เงินสด" : "โอน";
          }
          paymentsMap.set(t.booking_id, prev);
        });

        const mapped: BookingReportItem[] = (bookingsRes.data || []).map((b: any, index: number) => {
          const rm = roomsMap.get(b.room_id) || { room_no: "-", room_type: "ทั่วไป", location: "ซอย1" };
          const pay = paymentsMap.get(b.id) || { totalPaid: 0, method: "-" };
          const ci = new Date(b.check_in_time);
          const co = new Date(b.check_out_time);
          const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / (24 * 3600 * 1000)));
          const totalPrice = Number(b.actual_price || 0);
          const depositPaid = pay.totalPaid;
          const remainingBalance = Math.max(0, totalPrice - depositPaid);

          const padZero = (n: number) => String(n).padStart(2, "0");
          const ciDateStr = `${ci.getFullYear()}-${padZero(ci.getMonth() + 1)}-${padZero(ci.getDate())}`;
          const coDateStr = `${co.getFullYear()}-${padZero(co.getMonth() + 1)}-${padZero(co.getDate())}`;

          return {
            id: b.id,
            bookingRef: `BK-${b.id.substring(0, 6).toUpperCase()}`,
            roomNo: rm.room_no,
            roomType: rm.room_type || "ทั่วไป",
            location: rm.location || "ซอย1",
            guestName: b.guest_name || "ไม่ระบุชื่อ",
            guestPhone: b.guest_phone || "-",
            guestCount: b.guest_count || 1,
            checkInDate: ciDateStr,
            checkInTimeStr: `${padZero(ci.getHours())}:${padZero(ci.getMinutes())} น.`,
            checkOutDate: coDateStr,
            checkOutTimeStr: `${padZero(co.getHours())}:${padZero(co.getMinutes())} น.`,
            nights,
            channel: "หน้าฟร้อนท์",
            staffName: b.staff_name || "-",
            totalPrice,
            depositPaid,
            paymentMethod: pay.method,
            remainingBalance,
            status: b.status as any,
            note: b.notes || "",
            bookedAtDateStr: b.created_at
              ? new Date(b.created_at).toLocaleDateString("th-TH", { day: "2-digit", month: "short" })
              : "-",
          };
        });

        setLiveBookings(mapped);
      } catch (err) {
        console.error("Error loading live bookings:", err);
      } finally {
        setLoadingLive(false);
      }
    }

    fetchLiveBookings();
  }, [dataSource]);

  // เลือกชุดข้อมูลตามโหมด (Mock หรือ Live)
  const rawList = dataSource === "mock" ? MOCK_BOOKINGS : liveBookings;

  // กรองข้อมูลตามสถานที่ สถานะ และคำค้นหา
  const filteredBookings = useMemo(() => {
    return rawList
      .filter((b) => {
        if (locationFilter !== "ALL" && b.location !== locationFilter) return false;
        if (statusFilter !== "all" && b.status !== statusFilter) return false;
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchName = b.guestName.toLowerCase().includes(q);
          const matchPhone = b.guestPhone.includes(q);
          const matchRoom = b.roomNo.toLowerCase().includes(q);
          const matchRef = b.bookingRef.toLowerCase().includes(q);
          return matchName || matchPhone || matchRoom || matchRef;
        }
        return true;
      })
      // เรียงลำดับจากวันที่เข้าพักเร็วที่สุดมาไว้ก่อน (Earliest check-in first)
      .sort((a, b) => {
        const timeA = new Date(a.checkInDate).getTime();
        const timeB = new Date(b.checkInDate).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true });
      });
  }, [rawList, locationFilter, statusFilter, searchTerm]);

  // จัดกลุ่มตามวันที่มีการจองจริง (Date Grouping)
  const groupedByDate = useMemo(() => {
    const map = new Map<string, BookingReportItem[]>();
    filteredBookings.forEach((item) => {
      const arr = map.get(item.checkInDate) || [];
      arr.push(item);
      map.set(item.checkInDate, arr);
    });
    return Array.from(map.entries()).sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
  }, [filteredBookings]);

  // คำนวณยอดรวมสรุป
  const summaryTotals = useMemo(() => {
    return filteredBookings.reduce(
      (acc, b) => ({
        count: acc.count + 1,
        totalPrice: acc.totalPrice + b.totalPrice,
        depositPaid: acc.depositPaid + b.depositPaid,
        remainingBalance: acc.remainingBalance + b.remainingBalance,
      }),
      { count: 0, totalPrice: 0, depositPaid: 0, remainingBalance: 0 }
    );
  }, [filteredBookings]);

  const formatThaiDate = (ymdStr: string) => {
    if (!ymdStr) return "-";
    const [y, m, d] = ymdStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString("th-TH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatRelativeDay = (ymdStr: string) => {
    const today = new Date();
    const [y, m, d] = ymdStr.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (diffDays === 0) return "📌 วันนี้";
    if (diffDays === 1) return "⚡ พรุ่งนี้";
    if (diffDays === 2) return "มะรืนนี้";
    if (diffDays > 0) return `อีก ${diffDays} วัน`;
    return `ผ่านมา ${Math.abs(diffDays)} วัน`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "reserved":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">จองแล้ว (รอเข้าพัก)</span>;
      case "checked_in":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">เข้าพักแล้ว</span>;
      case "checked_out":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">เช็คเอาท์แล้ว</span>;
      case "cancelled":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">ยกเลิก</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-4 pb-12">
      {/* ================= แถบควบคุมบนสุด (Interactive Header) ================= */}
      <div className="no-print bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                📅 หน้ารายงานรับจองห้องพัก
              </span>
              <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                รูปแบบเอกสารทางการ
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              รวบรวมข้อมูลการจองห้องพัก เรียงลำดับจากวันที่เข้าพักเร็วที่สุด แสดงเฉพาะวันที่มีลูกค้าจองจริง
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* สลับชุดข้อมูล Mock vs Live */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setDataSource("mock")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  dataSource === "mock"
                    ? "bg-white text-indigo-700 shadow-xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                ✨ ข้อมูลตัวอย่าง ({MOCK_BOOKINGS.length})
              </button>
              <button
                type="button"
                onClick={() => setDataSource("live")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  dataSource === "live"
                    ? "bg-emerald-600 text-white shadow-xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🟢 ข้อมูลจริงในระบบ ({liveBookings.length})
              </button>
            </div>

            {/* สลับมุมมอง เอกสาร vs ตาราง */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode("document")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === "document"
                    ? "bg-blue-600 text-white shadow-xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>📄 รูปแบบเอกสาร A4</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === "table"
                    ? "bg-blue-600 text-white shadow-xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>🔍 ตารางค้นหา</span>
              </button>
            </div>

            {/* ปุ่มพิมพ์เอกสาร A4 */}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <span>🖨️</span>
              <span>พิมพ์เอกสาร A4</span>
            </button>
          </div>
        </div>

        {/* ตัวกรองสถานที่ และคำค้นหา */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-slate-500">สถานที่:</span>
            {[
              { key: "ALL", label: "🌐 ทั้งหมด" },
              { key: "ซอย1", label: "🏨 ซอย 1" },
              { key: "ซอย2", label: "🏨 ซอย 2" },
              { key: "ซามีญ่า", label: "🏨 ซามีญ่า" },
            ].map((loc) => (
              <button
                key={loc.key}
                type="button"
                onClick={() => setLocationFilter(loc.key)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  locationFilter === loc.key
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {loc.label}
              </button>
            ))}

            <span className="font-bold text-slate-500 ml-2">สถานะ:</span>
            {[
              { key: "reserved", label: "รอกำหนดเข้าพัก" },
              { key: "checked_in", label: "เข้าพักแล้ว" },
              { key: "all", label: "รวมทุกสถานะ" },
            ].map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => setStatusFilter(st.key)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  statusFilter === st.key
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 ค้นชื่อลูกค้า, เบอร์โทร, ห้อง..."
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* ================= กล่องสรุปภาพรวมการจอง (Dashboard Cards) ================= */}
      <div className="no-print grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-800">
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>📋 จำนวนห้องจอง</span>
            <span className="text-blue-500">🏨</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            {summaryTotals.count} <span className="text-xs font-normal text-slate-500">ห้อง</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">ใน {groupedByDate.length} วันที่มีการจอง</div>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>💰 รวมมูลค่าห้องพัก</span>
            <span className="text-indigo-500">🏷️</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-indigo-700 mt-1">
            ฿{summaryTotals.totalPrice.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">ราคาห้องพักที่จองทั้งหมด</div>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-emerald-700 flex items-center justify-between">
            <span>💵 รับมัดจำแล้ว</span>
            <span className="text-emerald-500">✅</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">
            ฿{summaryTotals.depositPaid.toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-700 font-medium mt-0.5">เงินมัดจำเข้าบัญชี/ลิ้นชักแล้ว</div>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-amber-700 flex items-center justify-between">
            <span>⏳ ยอดคงเหลือเก็บหน้างาน</span>
            <span className="text-amber-500">💳</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 mt-1">
            ฿{summaryTotals.remainingBalance.toLocaleString()}
          </div>
          <div className="text-[10px] text-amber-700 font-medium mt-0.5">ต้องเก็บเพิ่มตอนเช็คอิน</div>
        </div>
      </div>

      {/* ================= มุมมองที่ 1: รูปแบบเอกสาร A4 (DOCUMENT FORMAT) ================= */}
      {viewMode === "document" && (
        <div id="booking-document-root" className="w-full">
          <style>{`
            #a4-booking-sheet {
              font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif;
              width: 100%;
              max-width: 960px;
              margin: 0 auto;
              background: #ffffff;
              color: #0f172a;
              border: 1px solid #cbd5e1;
              box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.12);
              border-radius: 8px;
              padding: 20px 24px;
            }
            @media print {
              nav, header, .no-print { display: none !important; }
              body, html, main {
                background: #ffffff !important;
                margin: 0 !important;
                padding: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              #a4-booking-sheet {
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                max-width: 100% !important;
                width: 100% !important;
              }
              .page-break { page-break-before: always; }
            }
          `}</style>

          <div id="a4-booking-sheet">
            {/* หัวเอกสารรายงาน */}
            <div className="border-b-2 border-slate-800 pb-3 mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  HOTEL PROPERTY MANAGEMENT SYSTEM • RESERVATION REGISTRY
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                  ใบรายงานการจองห้องพักล่วงหน้า (Booking Reservation Schedule)
                </h1>
                <div className="text-xs text-slate-600 mt-1 flex items-center gap-2 flex-wrap">
                  <span>สถานที่: <b className="text-slate-900">{locationFilter === "ALL" ? "รวมทุกสถานที่ (ซอย 1, ซอย 2, ซามีญ่า)" : locationFilter}</b></span>
                  <span>•</span>
                  <span>สถานะการแสดงผล: <b className="text-indigo-800">{dataSource === "mock" ? "✨ ตัวอย่างจำลองข้อมูล (Sample Mockup)" : "🟢 ข้อมูลจริงในฐานข้อมูล"}</b></span>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <div className="text-[11px] font-bold text-slate-500">วันที่ออกรายงาน:</div>
                <div className="text-sm font-black text-slate-800">
                  {new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  เรียงตามกำหนดเช็คอินเร็วที่สุด → ไกลสุด
                </div>
              </div>
            </div>

            {loadingLive && dataSource === "live" ? (
              <div className="py-16 text-center text-slate-400 font-bold">กำลังดึงข้อมูลการจองจริง...</div>
            ) : groupedByDate.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-xl">
                ไม่พบข้อมูลการจองตามเงื่อนไขที่เลือก
              </div>
            ) : (
              <div className="space-y-6">
                {groupedByDate.map(([dateKey, items], groupIndex) => {
                  const dayTotal = items.reduce((s, it) => s + it.totalPrice, 0);
                  const dayDeposit = items.reduce((s, it) => s + it.depositPaid, 0);
                  const dayRemaining = items.reduce((s, it) => s + it.remainingBalance, 0);

                  return (
                    <div key={dateKey} className="border border-slate-300 rounded-xl overflow-hidden shadow-xs">
                      {/* แถบหัววันที่ของกลุ่มนี้ */}
                      <div className="bg-slate-900 text-white px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-black text-xs">
                            {formatRelativeDay(dateKey)}
                          </span>
                          <span className="font-black text-sm tracking-tight text-white">
                            {formatThaiDate(dateKey)}
                          </span>
                          <span className="text-xs text-slate-400 font-semibold">
                            ({items.length} ห้องจอง)
                          </span>
                        </div>

                        <div className="text-xs text-slate-300 flex items-center gap-3 font-semibold">
                          <span>มูลค่าห้อง: <b className="text-white">฿{dayTotal.toLocaleString()}</b></span>
                          <span>มัดจำ: <b className="text-emerald-400">฿{dayDeposit.toLocaleString()}</b></span>
                          <span>คงเหลือเก็บ: <b className="text-amber-400">฿{dayRemaining.toLocaleString()}</b></span>
                        </div>
                      </div>

                      {/* ตารางรายการจองในวันนี้ */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-black border-b border-slate-300 text-[11px]">
                              <th className="py-2 px-2.5 text-center w-10">ลำดับ</th>
                              <th className="py-2 px-2.5 text-center w-20">ห้อง / ที่ตั้ง</th>
                              <th className="py-2 px-3">ข้อมูลลูกค้าผู้จอง</th>
                              <th className="py-2 px-2.5 text-center w-28">ระยะเวลาเข้าพัก</th>
                              <th className="py-2 px-2.5 text-center w-24">ช่องทาง / ผู้รับจอง</th>
                              <th className="py-2 px-2.5 text-right w-20">ราคาห้อง</th>
                              <th className="py-2 px-2.5 text-right w-24">มัดจำแล้ว</th>
                              <th className="py-2 px-2.5 text-right w-24">คงเหลือเก็บ</th>
                              <th className="py-2 px-3">หมายเหตุ / คำขอพิเศษ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {items.map((item, idx) => (
                              <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                                <td className="py-2 px-2.5 text-center text-slate-400 font-bold">
                                  {idx + 1}
                                </td>
                                <td className="py-2 px-2.5 text-center">
                                  <div className="font-black text-sm text-slate-900 bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5">
                                    {item.roomNo}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                    {item.location} • {item.roomType}
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <div className="font-bold text-slate-800 text-[12.5px] leading-tight">
                                    {item.guestName}
                                  </div>
                                  <div className="text-[11px] text-indigo-700 font-semibold mt-0.5 flex items-center gap-1.5">
                                    <span>📞 {item.guestPhone}</span>
                                    <span>•</span>
                                    <span className="text-slate-500">👥 {item.guestCount} ท่าน</span>
                                  </div>
                                  <div className="text-[9.5px] text-slate-400 font-mono mt-0.5">
                                    รหัส: {item.bookingRef}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-center">
                                  <div className="font-bold text-slate-800">
                                    {item.nights} คืน
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-medium">
                                    ออก: {item.checkOutDate.substring(5)} ({item.checkOutTimeStr})
                                  </div>
                                  <div className="text-[9.5px] text-emerald-700 font-semibold mt-0.5">
                                    ถึงราว: {item.checkInTimeStr}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-center">
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {item.channel}
                                  </span>
                                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                    รับจอง: {item.staffName}
                                  </div>
                                  <div className="text-[9px] text-slate-400">
                                    เมื่อ {item.bookedAtDateStr}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-right font-black text-slate-800">
                                  ฿{item.totalPrice.toLocaleString()}
                                </td>
                                <td className="py-2 px-2.5 text-right">
                                  <div className="font-black text-emerald-700">
                                    ฿{item.depositPaid.toLocaleString()}
                                  </div>
                                  <div className="text-[9.5px] text-emerald-600 font-medium">
                                    {item.paymentMethod}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-right">
                                  <div className={`font-black ${item.remainingBalance > 0 ? "text-amber-700" : "text-slate-400"}`}>
                                    ฿{item.remainingBalance.toLocaleString()}
                                  </div>
                                  {item.remainingBalance > 0 ? (
                                    <span className="text-[9px] text-amber-600 font-semibold">เก็บหน้างาน</span>
                                  ) : (
                                    <span className="text-[9px] text-emerald-600 font-semibold">ครบแล้ว</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-slate-600 text-[11px] leading-snug">
                                  {item.note || "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {/* สรุปรวมท้ายเอกสาร */}
                <div className="border-t-2 border-slate-800 pt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-slate-600">
                    <div>รวมรายการที่ต้องเตรียมห้องเข้าพักทั้งหมด: <b className="text-slate-900">{summaryTotals.count} ห้อง</b></div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      เอกสารนี้พิมพ์จากระบบ Hotel PMS สำหรับใช้เตรียมห้อง จัดตารางแม่บ้าน และตรวจสอบยอดเงินมัดจำ
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold">รวมมัดจำที่รับแล้ว:</div>
                      <div className="text-base font-black text-emerald-700">
                        ฿{summaryTotals.depositPaid.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold">รวมยอดคงเหลือต้องเก็บ:</div>
                      <div className="text-base font-black text-amber-700">
                        ฿{summaryTotals.remainingBalance.toLocaleString()}
                      </div>
                    </div>
                    <div className="pl-3 border-l border-slate-300">
                      <div className="text-[10px] text-slate-500 font-bold">รวมมูลค่าห้องทั้งหมด:</div>
                      <div className="text-lg font-black text-indigo-900">
                        ฿{summaryTotals.totalPrice.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= มุมมองที่ 2: ตารางค้นหา (SEARCH & FILTER TABLE) ================= */}
      {viewMode === "table" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-center">ห้อง</th>
                  <th className="px-4 py-3">ลูกค้า / ข้อมูลติดต่อ</th>
                  <th className="px-4 py-3">วันเวลาเช็คอิน</th>
                  <th className="px-4 py-3">วันเวลาเช็คเอาท์</th>
                  <th className="px-4 py-3 text-right">ราคาห้อง</th>
                  <th className="px-4 py-3 text-right">มัดจำแล้ว</th>
                  <th className="px-4 py-3 text-right">คงเหลือเก็บ</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400 font-bold">
                      ไม่พบข้อมูลการจอง
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-center font-black text-slate-800">
                        <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200">
                          {b.roomNo}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">{b.location}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{b.guestName}</div>
                        <div className="text-xs text-slate-500">{b.guestPhone} • {b.guestCount} ท่าน</div>
                        <div className="text-[10px] text-slate-400">รับจองโดย: {b.staffName} ({b.channel})</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{b.checkInDate}</div>
                        <div className="text-xs text-emerald-600 font-semibold">{b.checkInTimeStr}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{b.checkOutDate}</div>
                        <div className="text-xs text-slate-500">{b.checkOutTimeStr} ({b.nights} คืน)</div>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-800">
                        ฿{b.totalPrice.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        ฿{b.depositPaid.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600">
                        ฿{b.remainingBalance.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(b.status)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
