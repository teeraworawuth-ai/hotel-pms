"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { supabase } from "@/lib/supabase";

export interface ExtraServiceItem {
  name: string;
  amount: number; // ยอดรวมเงินของบริการนี้ (฿)
  chargeType: "one_time" | "daily"; // "one_time" = ครั้งเดียว, "daily" = รายวัน/ตามวัน/ทุกวัน
  unitPrice?: number; // ราคาต่อหน่วย หรือ ราคาต่อคืน/ต่อวัน
  quantity?: number; // จำนวนหน่วย หรือ จำนวนวัน/คืน
  scheduleNote?: string; // รายละเอียดเช่น "ทุกวัน (2 คืน)", "1 ครั้ง", "2 วัน (฿250/วัน)"
  icon?: string;
}

export interface BookingReportItem {
  id: string;
  bookingRef: string; // เช่น BK-261128-01
  groupBookingRef?: string; // เช่น GRP-261128-02 สำหรับลูกค้าที่จองหลายห้อง
  roomIndexInGroup?: string; // เช่น ห้อง 1/2, ห้อง 2/2
  roomNo: string;
  roomType: string;
  location: string; // "ซอย1" | "ซอย2" | "ซามีญ่า"
  guestName: string;
  guestPhone: string;
  guestCount: number;
  checkInDate: string; // YYYY-MM-DD
  checkInTimeStr: string; // เช่น 14:00 น.
  checkOutDate: string; // YYYY-MM-DD
  checkOutTimeStr: string; // เช่น 12:00 น.
  nights: number;
  staffName: string; // ผู้รับจอง (พนักงานที่ล็อกอิน/บันทึกรายการ)
  baseRoomPrice: number; // ค่าห้องพักรวม
  roomRatePerNight: number; // อัตราค่าห้องต่อคืน
  oneTimeServices: ExtraServiceItem[]; // บริการครั้งเดียว (เตาปิ้งย่าง, อาหาร/เครื่องดื่ม, ค่าทำความสะอาด)
  dailyServices: ExtraServiceItem[]; // บริการรายวัน/ตามวัน/ทุกวัน (เตียงเสริม, มอเตอร์ไซค์เช่า, รถยนต์เช่า)
  keyDeposit: number; // เงินมัดจำกุญแจ
  totalPrice: number; // ยอดรวมสุทธิ (ค่าห้อง + บริการครั้งเดียว + บริการรายวัน)
  depositPaid: number; // เงินมัดจำที่ชำระล่วงหน้าแล้ว
  paymentMethod: string; // ช่องทางการจ่ายมัดจำ เช่น โอน KBank, เงินสด
  remainingBalance: number; // ยอดคงเหลือที่ต้องเรียกเก็บวันเข้าพัก
  status: "reserved" | "checked_in" | "checked_out" | "cancelled";
  note?: string;
  bookedAtDateStr: string;
}

// ข้อมูลตัวอย่างจำลองการจอง (Mock Data) ครอบคลุม:
// 1. วันเดียวกัน (28 พ.ย. 69) มีการจองพร้อมกันทั้ง 3 สถานที่ (ซอย 1, ซอย 2, ซามีญ่า)
// 2. ลูกค้าคนเดียวกันจองหลายห้อง (คุณนภา จองคู่ห้อง 205 และ 206)
// 3. การแจกแจงบริการครั้งเดียว vs บริการรายวัน/ทุกวัน (เตียงเสริม, เตาปิ้งย่าง, มอเตอร์ไซค์, รถยนต์)
// 4. แสดงเฉพาะชื่อพนักงานผู้รับจอง (ไม่นำช่องทางการจองมาปน)
// 5. รองรับการจัดกลุ่มแยกตามสถานที่ หรือ รวมตารางเดียวในวันเดียวกัน
const MOCK_BOOKINGS: BookingReportItem[] = [
  // =================== วันที่ 28 พ.ย. 2569: สาขา ซอย 1 ===================
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
    staffName: "เมย์",
    baseRoomPrice: 600,
    roomRatePerNight: 600,
    oneTimeServices: [],
    dailyServices: [],
    keyDeposit: 200,
    totalPrice: 600,
    depositPaid: 300,
    paymentMethod: "โอน KBank",
    remainingBalance: 300,
    status: "reserved",
    note: "ขอห้องปลอดบุหรี่ ชั้น 1",
    bookedAtDateStr: "26 พ.ย. 69",
  },
  {
    id: "mock-2",
    bookingRef: "BK-261128-02A",
    groupBookingRef: "GRP-261128-02",
    roomIndexInGroup: "ห้อง 1 จาก 2",
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
    staffName: "แอล",
    baseRoomPrice: 1600,
    roomRatePerNight: 800,
    oneTimeServices: [],
    dailyServices: [
      {
        name: "เตียงเสริม",
        amount: 600,
        chargeType: "daily",
        unitPrice: 300,
        quantity: 2,
        scheduleNote: "ทุกวัน (2 คืน • ฿300/คืน)",
        icon: "🛏️",
      },
    ],
    keyDeposit: 200,
    totalPrice: 2200,
    depositPaid: 1000,
    paymentMethod: "โอน SCB",
    remainingBalance: 1200,
    status: "reserved",
    note: "จองคู่กับห้อง 206 • ขอเตียงเสริม 1 ชุดในห้องนี้",
    bookedAtDateStr: "27 พ.ย. 69",
  },
  {
    id: "mock-3",
    bookingRef: "BK-261128-02B",
    groupBookingRef: "GRP-261128-02",
    roomIndexInGroup: "ห้อง 2 จาก 2",
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
    staffName: "แอล",
    baseRoomPrice: 1600,
    roomRatePerNight: 800,
    oneTimeServices: [
      {
        name: "เซ็ตอาหารว่างต้อนรับ",
        amount: 200,
        chargeType: "one_time",
        unitPrice: 200,
        quantity: 1,
        scheduleNote: "บริการครั้งเดียว",
        icon: "☕",
      },
    ],
    dailyServices: [],
    keyDeposit: 200,
    totalPrice: 1800,
    depositPaid: 900,
    paymentMethod: "โอน SCB",
    remainingBalance: 900,
    status: "reserved",
    note: "ห้องติดกับ 205 • ใช้รหัสจองกลุ่มเดียวกัน",
    bookedAtDateStr: "27 พ.ย. 69",
  },

  // =================== วันที่ 28 พ.ย. 2569: สาขา ซอย 2 ===================
  {
    id: "mock-4",
    bookingRef: "BK-261128-03",
    roomNo: "108",
    roomType: "เตียงเดี่ยว",
    location: "ซอย2",
    guestName: "คุณมานพ วัฒนาเจริญ",
    guestPhone: "085-777-8899",
    guestCount: 1,
    checkInDate: "2026-11-28",
    checkInTimeStr: "13:00 น.",
    checkOutDate: "2026-11-30",
    checkOutTimeStr: "12:00 น.",
    nights: 2,
    staffName: "เต้ย",
    baseRoomPrice: 1200,
    roomRatePerNight: 600,
    oneTimeServices: [],
    dailyServices: [
      {
        name: "เช่ารถมอเตอร์ไซค์",
        amount: 500,
        chargeType: "daily",
        unitPrice: 250,
        quantity: 2,
        scheduleNote: "รายวัน (2 วัน • ฿250/วัน)",
        icon: "🛵",
      },
    ],
    keyDeposit: 200,
    totalPrice: 1700,
    depositPaid: 800,
    paymentMethod: "เงินสด",
    remainingBalance: 900,
    status: "reserved",
    note: "ขอน้ำดื่มเพิ่ม 2 ขวด • เช่ารถมอเตอร์ไซค์ 2 วัน",
    bookedAtDateStr: "27 พ.ย. 69",
  },
  {
    id: "mock-5",
    bookingRef: "BK-261128-04",
    roomNo: "204",
    roomType: "เตียงคู่",
    location: "ซอย2",
    guestName: "คุณอัญชลี ศรีสุข",
    guestPhone: "089-444-5566",
    guestCount: 2,
    checkInDate: "2026-11-28",
    checkInTimeStr: "15:00 น.",
    checkOutDate: "2026-11-29",
    checkOutTimeStr: "12:00 น.",
    nights: 1,
    staffName: "เมย์",
    baseRoomPrice: 800,
    roomRatePerNight: 800,
    oneTimeServices: [],
    dailyServices: [],
    keyDeposit: 200,
    totalPrice: 800,
    depositPaid: 800,
    paymentMethod: "โอน KBank",
    remainingBalance: 0,
    status: "reserved",
    note: "ชำระเต็มจำนวนแล้ว แจ้งว่าจะมาถึงประมาณ 15:00",
    bookedAtDateStr: "28 พ.ย. 69",
  },

  // =================== วันที่ 28 พ.ย. 2569: สาขา ซามีญ่า ===================
  {
    id: "mock-6",
    bookingRef: "BK-261128-05",
    roomNo: "บ้าน 1",
    roomType: "บ้านเดี่ยวริมสวน",
    location: "ซามีญ่า",
    guestName: "คุณธีระ รัตนประเสริฐ (ครอบครัว)",
    guestPhone: "081-999-0011",
    guestCount: 4,
    checkInDate: "2026-11-28",
    checkInTimeStr: "14:00 น.",
    checkOutDate: "2026-11-30",
    checkOutTimeStr: "12:00 น.",
    nights: 2,
    staffName: "แอล",
    baseRoomPrice: 3600,
    roomRatePerNight: 1800,
    oneTimeServices: [
      {
        name: "เตาปิ้งย่างบาร์บีคิวพร้อมถ่าน",
        amount: 200,
        chargeType: "one_time",
        unitPrice: 200,
        quantity: 1,
        scheduleNote: "บริการครั้งเดียว",
        icon: "🔥",
      },
    ],
    dailyServices: [
      {
        name: "เตียงเสริม",
        amount: 600,
        chargeType: "daily",
        unitPrice: 300,
        quantity: 2,
        scheduleNote: "ทุกวัน (2 คืน • ฿300/คืน)",
        icon: "🛏️",
      },
    ],
    keyDeposit: 500,
    totalPrice: 4400,
    depositPaid: 2200,
    paymentMethod: "โอน PromptPay",
    remainingBalance: 2200,
    status: "reserved",
    note: "ครอบครัว 4 ท่าน • เตียงเสริม + เตาปิ้งย่างบาร์บีคิว",
    bookedAtDateStr: "25 พ.ย. 69",
  },
  {
    id: "mock-7",
    bookingRef: "BK-261128-06",
    roomNo: "บ้าน 2",
    roomType: "บ้านเดี่ยววิวสระ",
    location: "ซามีญ่า",
    guestName: "คุณพิมพา ชัยมงคล (คณะเพื่อน)",
    guestPhone: "083-456-7890",
    guestCount: 3,
    checkInDate: "2026-11-28",
    checkInTimeStr: "16:00 น.",
    checkOutDate: "2026-11-29",
    checkOutTimeStr: "12:00 น.",
    nights: 1,
    staffName: "บี",
    baseRoomPrice: 2300,
    roomRatePerNight: 2300,
    oneTimeServices: [
      {
        name: "ค่าทำความสะอาดพิเศษ",
        amount: 150,
        chargeType: "one_time",
        unitPrice: 150,
        quantity: 1,
        scheduleNote: "บริการครั้งเดียว",
        icon: "🧹",
      },
    ],
    dailyServices: [],
    keyDeposit: 500,
    totalPrice: 2450,
    depositPaid: 1400,
    paymentMethod: "โอน KBank",
    remainingBalance: 1050,
    status: "reserved",
    note: "ขอเช็คอินช่วงเย็น 16:00 • สั่งน้ำแข็งเพิ่ม 1 ถัง",
    bookedAtDateStr: "27 พ.ย. 69",
  },

  // =================== วันอื่นๆ (อนาคต) ===================
  {
    id: "mock-8",
    bookingRef: "BK-261129-01",
    roomNo: "104",
    roomType: "เตียงเดี่ยว",
    location: "ซอย1",
    guestName: "คุณปรีชา สมบูรณ์สุข",
    guestPhone: "087-222-3344",
    guestCount: 2,
    checkInDate: "2026-11-29",
    checkInTimeStr: "14:00 น.",
    checkOutDate: "2026-11-30",
    checkOutTimeStr: "12:00 น.",
    nights: 1,
    staffName: "เต้ย",
    baseRoomPrice: 600,
    roomRatePerNight: 600,
    oneTimeServices: [],
    dailyServices: [],
    keyDeposit: 200,
    totalPrice: 600,
    depositPaid: 300,
    paymentMethod: "โอน SCB",
    remainingBalance: 300,
    status: "reserved",
    note: "ขอห้องใกล้บันได",
    bookedAtDateStr: "27 พ.ย. 69",
  },
  {
    id: "mock-9",
    bookingRef: "BK-261129-02",
    roomNo: "201",
    roomType: "เตียงคู่",
    location: "ซอย2",
    guestName: "คุณศิริพร บุญส่ง",
    guestPhone: "089-666-7788",
    guestCount: 2,
    checkInDate: "2026-11-29",
    checkInTimeStr: "15:30 น.",
    checkOutDate: "2026-12-01",
    checkOutTimeStr: "12:00 น.",
    nights: 2,
    staffName: "เมย์",
    baseRoomPrice: 1600,
    roomRatePerNight: 800,
    oneTimeServices: [],
    dailyServices: [],
    keyDeposit: 200,
    totalPrice: 1600,
    depositPaid: 800,
    paymentMethod: "โอน KBank",
    remainingBalance: 800,
    status: "reserved",
    note: "เข้าพัก 2 คืน",
    bookedAtDateStr: "28 พ.ย. 69",
  },
  {
    id: "mock-10",
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
    staffName: "เต้ย",
    baseRoomPrice: 2700,
    roomRatePerNight: 900,
    oneTimeServices: [],
    dailyServices: [
      {
        name: "เตียงเสริม",
        amount: 900,
        chargeType: "daily",
        unitPrice: 300,
        quantity: 3,
        scheduleNote: "ทุกวัน (3 คืน • ฿300/คืน)",
        icon: "🛏️",
      },
    ],
    keyDeposit: 200,
    totalPrice: 3600,
    depositPaid: 2000,
    paymentMethod: "โอน KBank",
    remainingBalance: 1600,
    status: "reserved",
    note: "จองข้ามปีช่วงเทศกาลปีใหม่ ล็อกห้องชั้นล่าง",
    bookedAtDateStr: "20 พ.ย. 69",
  },
  {
    id: "mock-11",
    bookingRef: "BK-261230-02",
    roomNo: "บ้าน 1",
    roomType: "บ้านเดี่ยว",
    location: "ซามีญ่า",
    guestName: "คุณเอกชัย มั่งคั่ง (เคาท์ดาวน์ปีใหม่)",
    guestPhone: "081-333-5566",
    guestCount: 6,
    checkInDate: "2026-12-30",
    checkInTimeStr: "15:00 น.",
    checkOutDate: "2027-01-02",
    checkOutTimeStr: "12:00 น.",
    nights: 3,
    staffName: "แอล",
    baseRoomPrice: 6000,
    roomRatePerNight: 2000,
    oneTimeServices: [
      {
        name: "เตาปิ้งย่างบาร์บีคิวชุดใหญ่",
        amount: 300,
        chargeType: "one_time",
        unitPrice: 300,
        quantity: 1,
        scheduleNote: "บริการครั้งเดียว",
        icon: "🔥",
      },
    ],
    dailyServices: [],
    keyDeposit: 500,
    totalPrice: 6300,
    depositPaid: 4000,
    paymentMethod: "โอน SCB",
    remainingBalance: 2300,
    status: "reserved",
    note: "ปีใหม่ 6 ท่าน • เตาปิ้งย่างชุดใหญ่",
    bookedAtDateStr: "21 พ.ย. 69",
  },
  {
    id: "mock-12",
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
    staffName: "บี",
    baseRoomPrice: 2000,
    roomRatePerNight: 1000,
    oneTimeServices: [
      {
        name: "ไวน์ฉลองวาเลนไทน์",
        amount: 600,
        chargeType: "one_time",
        unitPrice: 600,
        quantity: 1,
        scheduleNote: "บริการครั้งเดียว",
        icon: "🍾",
      },
    ],
    dailyServices: [
      {
        name: "เช่ารถยนต์ขับเอง",
        amount: 1600,
        chargeType: "daily",
        unitPrice: 800,
        quantity: 2,
        scheduleNote: "รายวัน (2 วัน • ฿800/วัน)",
        icon: "🚗",
      },
    ],
    keyDeposit: 300,
    totalPrice: 4200,
    depositPaid: 2500,
    paymentMethod: "บัตรเครดิต",
    remainingBalance: 1700,
    status: "reserved",
    note: "วาเลนไทน์ 70 • ต้องการบริการเช่ารถยนต์รับส่ง",
    bookedAtDateStr: "22 พ.ย. 69",
  },
];

export default function BookingsPage() {
  const [viewMode, setViewMode] = useState<"document" | "table">("document");
  const [dataSource, setDataSource] = useState<"mock" | "live">("mock");
  const [locationFilter, setLocationFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("reserved");
  const [searchTerm, setSearchTerm] = useState("");
  // โหมดการจัดกลุ่มในแต่ละวัน: "by_location" (แยกหมวดตามสถานที่) หรือ "unified" (รวมตารางเดียว)
  const [groupModeInDate, setGroupModeInDate] = useState<"by_location" | "unified">("by_location");
  const [liveBookings, setLiveBookings] = useState<BookingReportItem[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<BookingReportItem | null>(null);

  // ดึงข้อมูลจริงจาก Supabase เมื่อสลับมาใช้โหมด Live
  useEffect(() => {
    async function fetchLiveBookings() {
      if (dataSource !== "live") return;
      setLoadingLive(true);
      try {
        const [roomsRes, bookingsRes, ledgersRes, extrasRes] = await Promise.all([
          supabase.from("rooms").select("id, room_no, room_type, location"),
          supabase
            .from("bookings")
            .select(`
              id, room_id, guest_name, guest_phone, guest_count,
              check_in_time, check_out_time, status, actual_price,
              staff_name, created_at, key_deposit
            `)
            .order("check_in_time", { ascending: true })
            .limit(500),
          supabase
            .from("ledger_transactions")
            .select("booking_id, transaction_type, category, amount, notes")
            .eq("transaction_type", "payment"),
          supabase
            .from("booking_daily_extras")
            .select("booking_id, category, amount, unit_price, quantity, target_date, notes"),
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

        // จัดกลุ่มบริการเสริมรายวันจาก booking_daily_extras
        const extrasByBooking = new Map<string, any[]>();
        (extrasRes.data || []).forEach((ex: any) => {
          if (!ex.booking_id) return;
          const list = extrasByBooking.get(ex.booking_id) || [];
          list.push(ex);
          extrasByBooking.set(ex.booking_id, list);
        });

        // ตรวจสอบกรณีลูกค้าคนเดียวกันจองหลายห้อง
        const phoneToBookings = new Map<string, any[]>();
        (bookingsRes.data || []).forEach((b: any) => {
          if (b.guest_phone && b.guest_phone !== "-") {
            const arr = phoneToBookings.get(b.guest_phone) || [];
            arr.push(b);
            phoneToBookings.set(b.guest_phone, arr);
          }
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

          // ตรวจสอบการจองกลุ่มหลายห้อง
          const samePhoneGroup = b.guest_phone ? phoneToBookings.get(b.guest_phone) || [] : [];
          const isMultiRoom = samePhoneGroup.length > 1;
          const groupIndex = isMultiRoom ? samePhoneGroup.findIndex((item) => item.id === b.id) + 1 : 0;

          // แยกประเภทบริการครั้งเดียว vs บริการรายวัน/ทุกวัน
          const oneTimeServices: ExtraServiceItem[] = [];
          const dailyServices: ExtraServiceItem[] = [];

          const dbExtras = extrasByBooking.get(b.id) || [];
          if (dbExtras.length > 0) {
            dbExtras.forEach((ex: any) => {
              const name = ex.category || ex.notes || "บริการเสริม";
              const amt = Number(ex.amount || 0);
              const uPrice = Number(ex.unit_price || amt);
              const qty = Number(ex.quantity || 1);
              dailyServices.push({
                name,
                amount: amt,
                chargeType: "daily",
                unitPrice: uPrice,
                quantity: qty,
                scheduleNote: `รายวัน (${qty} วัน • ฿${uPrice}/วัน)`,
                icon: name.includes("เตียง") ? "🛏️" : name.includes("มอเตอร์ไซค์") ? "🛵" : "🔄",
              });
            });
          }

          // ตรวจสอบหมายเหตุเพิ่มเติม
          const notesStr = String(b.notes || "");
          if (notesStr.includes("เตาปิ้งย่าง")) {
            oneTimeServices.push({
              name: "เตาปิ้งย่างบาร์บีคิว",
              amount: 200,
              chargeType: "one_time",
              unitPrice: 200,
              quantity: 1,
              scheduleNote: "บริการครั้งเดียว",
              icon: "🔥",
            });
          }
          if (notesStr.includes("เตียงเสริม") && dailyServices.length === 0) {
            dailyServices.push({
              name: "เตียงเสริม",
              amount: 300 * nights,
              chargeType: "daily",
              unitPrice: 300,
              quantity: nights,
              scheduleNote: `ทุกวัน (${nights} คืน • ฿300/คืน)`,
              icon: "🛏️",
            });
          }

          const allExtrasTotal =
            oneTimeServices.reduce((s, e) => s + e.amount, 0) +
            dailyServices.reduce((s, e) => s + e.amount, 0);
          const baseRoomPrice = Math.max(0, totalPrice - allExtrasTotal);
          const roomRatePerNight = Math.round(baseRoomPrice / nights);

          return {
            id: b.id,
            bookingRef: `BK-${ciDateStr.slice(2, 4)}${ciDateStr.slice(5, 7)}${ciDateStr.slice(8, 10)}-${String(index + 1).padStart(2, "0")}`,
            groupBookingRef: isMultiRoom ? `GRP-${b.guest_phone.slice(-4)}` : undefined,
            roomIndexInGroup: isMultiRoom ? `ห้อง ${groupIndex}/${samePhoneGroup.length}` : undefined,
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
            staffName: b.staff_name || "พนักงาน",
            baseRoomPrice,
            roomRatePerNight,
            oneTimeServices,
            dailyServices,
            keyDeposit: Number(b.key_deposit ?? 200),
            totalPrice,
            depositPaid,
            paymentMethod: pay.method || "โอน",
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

  // สลับชุดข้อมูล Mock หรือ Live
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
          const matchGroup = b.groupBookingRef?.toLowerCase().includes(q);
          const matchStaff = b.staffName.toLowerCase().includes(q);
          const matchLocation = b.location.toLowerCase().includes(q);
          return matchName || matchPhone || matchRoom || matchRef || matchGroup || matchStaff || matchLocation;
        }
        return true;
      })
      // เรียงลำดับจากวันที่เข้าพักเร็วที่สุดมาก่อน (Earliest check-in first)
      .sort((a, b) => {
        const timeA = new Date(a.checkInDate).getTime();
        const timeB = new Date(b.checkInDate).getTime();
        if (timeA !== timeB) return timeA - timeB;
        // เรียงตามสถานที่ก่อน (ซอย1 -> ซอย2 -> ซามีญ่า) แล้วตามด้วยเบอร์ห้อง
        if (a.location !== b.location) {
          const locOrder: Record<string, number> = { ซอย1: 1, ซอย2: 2, ซามีญ่า: 3 };
          return (locOrder[a.location] || 99) - (locOrder[b.location] || 99);
        }
        return a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true });
      });
  }, [rawList, locationFilter, statusFilter, searchTerm]);

  // จัดกลุ่มตามวันที่มีการจองจริง พร้อมจัดกลุ่มย่อยตามสถานที่ในแต่ละวัน
  const groupedByDate = useMemo(() => {
    const dateMap = new Map<string, BookingReportItem[]>();
    filteredBookings.forEach((item) => {
      const arr = dateMap.get(item.checkInDate) || [];
      arr.push(item);
      dateMap.set(item.checkInDate, arr);
    });

    const sortedDates = Array.from(dateMap.entries()).sort(([dateA], [dateB]) => dateA.localeCompare(dateB));

    return sortedDates.map(([dateKey, items]) => {
      const dayTotal = items.reduce((s, it) => s + it.totalPrice, 0);
      const dayDeposit = items.reduce((s, it) => s + it.depositPaid, 0);
      const dayRemaining = items.reduce((s, it) => s + it.remainingBalance, 0);

      // จัดกลุ่มย่อยตามสถานที่ในวันนี้ (ซอย 1, ซอย 2, ซามีญ่า)
      const locOrder = ["ซอย1", "ซอย2", "ซามีญ่า"];
      const locMap = new Map<string, BookingReportItem[]>();
      items.forEach((item) => {
        const arr = locMap.get(item.location) || [];
        arr.push(item);
        locMap.set(item.location, arr);
      });

      const locationGroups = Array.from(locMap.entries())
        .sort(([locA], [locB]) => {
          const idxA = locOrder.indexOf(locA) !== -1 ? locOrder.indexOf(locA) : 99;
          const idxB = locOrder.indexOf(locB) !== -1 ? locOrder.indexOf(locB) : 99;
          return idxA - idxB;
        })
        .map(([loc, locItems]) => ({
          location: loc,
          items: locItems,
          total: locItems.reduce((s, it) => s + it.totalPrice, 0),
          deposit: locItems.reduce((s, it) => s + it.depositPaid, 0),
          remaining: locItems.reduce((s, it) => s + it.remainingBalance, 0),
        }));

      return {
        dateKey,
        items,
        dayTotal,
        dayDeposit,
        dayRemaining,
        locationGroups,
      };
    });
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

  const getLocationLabel = (loc: string) => {
    switch (loc) {
      case "ซอย1":
        return "ซอย 1";
      case "ซอย2":
        return "ซอย 2";
      case "ซามีญ่า":
        return "ซามีญ่า";
      default:
        return loc;
    }
  };

  // จัดรูปแบบวันที่ออกเป็น วว/ดด/ปปปป พ.ศ. คั่นด้วย Slash (/) สำหรับรายงานการจองล่วงหน้าโดยเฉพาะ
  const formatBuddhistSlashDate = (ymdStr: string) => {
    if (!ymdStr) return "-";
    const parts = ymdStr.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parts[1];
      const d = parts[2];
      const bYear = y > 2400 ? y : y + 543;
      return `${d}/${m}/${bYear}`;
    }
    return ymdStr;
  };

  const getLocationBadgeStyle = (loc: string) => {
    switch (loc) {
      case "ซอย1":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "ซอย2":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "ซามีญ่า":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "reserved":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
            จองแล้ว (รอเข้าพัก)
          </span>
        );
      case "checked_in":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
            เข้าพักแล้ว
          </span>
        );
      case "checked_out":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
            เช็คเอาท์แล้ว
          </span>
        );
      case "cancelled":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
            ยกเลิก
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">
            {status}
          </span>
        );
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
                ใบรายงานทางการ & เอกสารสำรอง
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              จัดลำดับวันเข้าพักเร็วที่สุด รองรับหลายสถานที่ในวันเดียวกัน (ซอย 1, ซอย 2, ซามีญ่า) แจกแจงบริการครั้งเดียว vs รายวัน และพิมพ์สำรองข้อมูลออฟไลน์
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

            {/* สลับมุมมอง เอกสาร A4 vs ตาราง */}
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
              title="พิมพ์เอกสาร A4 เก็บไว้เป็นสำรองกรณีระบบหรืออินเทอร์เน็ตขัดข้อง"
            >
              <span>🖨️</span>
              <span>พิมพ์เอกสารสำรอง (A4)</span>
            </button>
          </div>
        </div>

        {/* ตัวกรองสถานที่, โหมดการจัดกลุ่มในวัน, และคำค้นหา */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-500">สถานที่:</span>
            {[
              { key: "ALL", label: "🌐 ทั้งหมด (รวม 3 สาขา)" },
              { key: "ซอย1", label: "🏨 ซอย 1" },
              { key: "ซอย2", label: "🏨 ซอย 2" },
              { key: "ซามีญ่า", label: "🏡 ซามีญ่า" },
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

            {/* ปุ่มสลับรูปแบบการจัดกลุ่มสถานที่ในวันเดียวกัน */}
            {viewMode === "document" && (
              <div className="flex items-center gap-1 ml-1 sm:ml-2 pl-2 border-l border-slate-300">
                <span className="font-bold text-slate-500">จัดกลุ่มในวัน:</span>
                <button
                  type="button"
                  onClick={() => setGroupModeInDate("by_location")}
                  className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                    groupModeInDate === "by_location"
                      ? "bg-indigo-700 text-white shadow-2xs font-black"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  title="แยกหมวดหมู่ตามสถานที่ (ซอย 1 / ซอย 2 / ซามีญ่า) ใต้หัววันที่เดียวกัน"
                >
                  <span>🏢</span>
                  <span>แยกตามสถานที่</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGroupModeInDate("unified")}
                  className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                    groupModeInDate === "unified"
                      ? "bg-indigo-700 text-white shadow-2xs font-black"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  title="รวมรายการทุกสถานที่ในตารางเดียวต่อเนื่องกัน"
                >
                  <span>📋</span>
                  <span>รวมตารางเดียว</span>
                </button>
              </div>
            )}
          </div>

          <div className="w-full sm:w-80">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 ค้นเลขที่จอง, ชื่อลูกค้า, ห้อง, สถานที่, ผู้รับจอง..."
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
            <span>💰 รวมมูลค่าห้อง & บริการ</span>
            <span className="text-indigo-500">🏷️</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-indigo-700 mt-1">
            ฿{summaryTotals.totalPrice.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">รวมค่าห้องและบริการเสริมทั้งหมด</div>
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
            <span>⏳ คงเหลือเก็บหน้างาน</span>
            <span className="text-amber-500">💳</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 mt-1">
            ฿{summaryTotals.remainingBalance.toLocaleString()}
          </div>
          <div className="text-[10px] text-amber-700 font-medium mt-0.5">ต้องเรียกเก็บตอนเช็คอิน</div>
        </div>
      </div>

      {/* ================= มุมมองที่ 1: รูปแบบเอกสาร A4 (DOCUMENT FORMAT) ================= */}
      {viewMode === "document" && (
        <div id="booking-document-root" className="w-full">
          <style>{`
            #a4-booking-sheet {
              font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif;
              width: 100%;
              max-width: 1560px;
              margin: 0 auto;
              background: #ffffff;
              color: #0f172a;
              border: 1px solid #cbd5e1;
              box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.12);
              border-radius: 12px;
              padding: 20px 24px;
            }
            @media print {
              @page {
                size: A4 landscape;
                margin: 8mm 6mm;
              }
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
              table {
                page-break-inside: auto;
              }
              tr {
                page-break-inside: avoid;
                break-inside: avoid;
              }
              thead {
                display: table-header-group;
              }
              tfoot {
                display: table-footer-group;
              }
              .page-break { page-break-before: always; }
            }
          `}</style>

          <div id="a4-booking-sheet">
            {/* หัวเอกสารรายงานสำหรับใช้งานและพิมพ์สำรอง */}
            <div className="border-b-2 border-slate-800 pb-3 mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  HOTEL PROPERTY MANAGEMENT SYSTEM • RESERVATION MASTER SHEET
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                  ใบรายงานการจองห้องพักล่วงหน้า (ตารางสรุปการจอง & เอกสารสำรองออฟไลน์)
                </h1>
                <div className="text-xs text-slate-600 mt-1 flex items-center gap-2 flex-wrap">
                  <span>สถานที่: <b className="text-slate-900">{locationFilter === "ALL" ? "รวมทุกสถานที่ (ซอย 1, ซอย 2, ซามีญ่า)" : locationFilter}</b></span>
                  <span>•</span>
                  <span>สถานะการแสดงผล: <b className="text-indigo-800">{dataSource === "mock" ? "✨ ตัวอย่างจำลองข้อมูล (Sample Mockup)" : "🟢 ข้อมูลจริงในฐานข้อมูล"}</b></span>
                  <span>•</span>
                  <span className="text-emerald-700 font-bold">📄 พิมพ์เก็บเป็นหลักฐานสำรองกรณีระบบขัดข้องได้ทันที</span>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <div className="text-[11px] font-bold text-slate-500">วันที่พิมพ์เอกสาร:</div>
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
                {groupedByDate.map((dateObj) => {
                  const { dateKey, items, dayTotal, dayDeposit, dayRemaining, locationGroups } = dateObj;

                  // ฟังก์ชันเรนเดอร์แถวของรายการจอง (ปรับความสูงแถวให้กระชับ เพื่อกวาดสายตาง่าย)
                  const renderRow = (item: BookingReportItem, idx: number) => {
                    const isMultiRoomGroup = Boolean(item.groupBookingRef);
                    const hasOneTime = item.oneTimeServices && item.oneTimeServices.length > 0;
                    const hasDaily = item.dailyServices && item.dailyServices.length > 0;
                    const hasExtras = hasOneTime || hasDaily;

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isMultiRoomGroup ? "bg-indigo-50/30 hover:bg-indigo-50/60" : "hover:bg-blue-50/40"
                        }`}
                      >
                        {/* ลำดับ */}
                        <td className="py-1.5 px-1 text-center text-slate-400 font-bold text-[11px]">
                          {idx + 1}
                        </td>

                        {/* เลขที่จอง (Booking Ref) - คลิกเพื่อดูใบยืนยันการจอง */}
                        <td className="py-1.5 px-2 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedVoucher(item)}
                            className="font-mono font-black text-[10.5px] text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-2 py-0.5 tracking-wider inline-flex items-center gap-1 cursor-pointer transition-all shadow-2xs whitespace-nowrap"
                            title="แตะเพื่อเปิดดู / พิมพ์ใบยืนยันการจอง"
                          >
                            <span>🔖</span>
                            <span>{item.bookingRef}</span>
                          </button>

                          {/* ป้ายแสดงกลุ่มเมื่อลูกค้าคนเดียวกันจองหลายห้อง */}
                          {item.groupBookingRef && (
                            <div className="mt-0.5">
                              <span className="inline-block px-1 py-0 rounded text-[8.5px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                                👥 {item.roomIndexInGroup || "จองกลุ่ม"}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* ห้องพัก / ที่ตั้ง */}
                        <td className="py-1.5 px-1.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="font-black text-xs text-slate-900 bg-slate-100 border border-slate-300 rounded px-1.5 py-0.2">
                              {item.roomNo}
                            </span>
                            <span
                              className={`inline-block px-1 py-0 rounded text-[9px] font-bold border ${getLocationBadgeStyle(
                                item.location
                              )}`}
                            >
                              {getLocationLabel(item.location)}
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-400 font-medium leading-none mt-0.5">{item.roomType}</div>
                        </td>

                        {/* ข้อมูลลูกค้าผู้จอง */}
                        <td className="py-1.5 px-3 min-w-[200px] max-w-[250px]">
                          <div className="font-bold text-slate-800 text-[11.5px] leading-tight truncate" title={item.guestName}>
                            {item.guestName}
                          </div>
                          <div className="text-[10px] text-indigo-700 font-semibold leading-tight mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                            <span>📞 {item.guestPhone}</span>
                            <span>•</span>
                            <span className="text-slate-500">👥 {item.guestCount} ท่าน</span>
                          </div>
                        </td>

                        {/* ระยะเวลาเข้าพัก (แสดงวันที่ออกเป็น วว/ดด/ปปปป พ.ศ.) */}
                        <td className="py-1.5 px-2 text-center leading-tight whitespace-nowrap">
                          <div className="font-bold text-slate-800 text-[11px]">
                            {item.nights} คืน <span className="text-[9.5px] text-emerald-700 font-semibold">(เข้า {item.checkInTimeStr})</span>
                          </div>
                          <div className="text-[9.5px] text-slate-500 font-medium mt-0.5">
                            ออก: {formatBuddhistSlashDate(item.checkOutDate)}
                          </div>
                        </td>

                        {/* แจกแจงค่าบริการเสริม (ครั้งเดียว vs รายวัน/ทุกวัน) */}
                        <td className="py-1.5 px-2.5">
                          {hasExtras ? (
                            <div className="flex flex-wrap items-center gap-1">
                              {/* 1. บริการครั้งเดียว (One-time) */}
                              {hasOneTime &&
                                item.oneTimeServices.map((ex, eIdx) => (
                                  <span
                                    key={`ot-${eIdx}`}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[9px] font-semibold"
                                  >
                                    <span>{ex.icon || "⚡"}</span>
                                    <span>{ex.name}</span>
                                    <b className="text-amber-800">(+{ex.amount.toLocaleString()}฿)</b>
                                  </span>
                                ))}

                              {/* 2. บริการตามวัน / ทุกวัน / ต่อคืน (Daily / Per-Night) */}
                              {hasDaily &&
                                item.dailyServices.map((ex, eIdx) => (
                                  <span
                                    key={`dl-${eIdx}`}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-blue-50 text-blue-900 border border-blue-200 text-[9px] font-semibold"
                                  >
                                    <span>{ex.icon || "🔄"}</span>
                                    <span>{ex.name}</span>
                                    <b className="text-blue-800">({ex.scheduleNote || `+${ex.amount.toLocaleString()}฿`})</b>
                                  </span>
                                ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px] italic">- ไม่มี -</span>
                          )}
                        </td>

                        {/* ผู้รับจอง (แสดงชื่อพนักงานผู้รับจองอย่างชัดเจน ไม่นำช่องทางมาปน) */}
                        <td className="py-1.5 px-1.5 text-center">
                          <div className="inline-block px-1.5 py-0.5 rounded text-[10.5px] font-black bg-slate-100 text-slate-800 border border-slate-300">
                            {item.staffName}
                          </div>
                        </td>

                        {/* แจกแจงยอดรวม (หากยอดรวมตรงกับค่าห้อง ไม่ต้องใส่วงเล็บค่าห้องซ้ำซ้อน) */}
                        <td className="py-1.5 px-1.5 text-right leading-tight">
                          <div className="font-black text-slate-900 text-[11.5px]">
                            ฿{item.totalPrice.toLocaleString()}
                          </div>
                          {item.totalPrice !== item.baseRoomPrice && (
                            <div className="text-[9px] text-slate-500 font-medium">
                              (ห้อง ฿{item.baseRoomPrice.toLocaleString()})
                            </div>
                          )}
                        </td>

                        {/* มัดจำแล้ว */}
                        <td className="py-1.5 px-1.5 text-right leading-tight">
                          <div className="font-black text-emerald-700 text-[11.5px]">
                            ฿{item.depositPaid.toLocaleString()}
                          </div>
                          <div className="text-[9px] text-emerald-600 font-medium">
                            {item.paymentMethod}
                          </div>
                        </td>

                        {/* คงเหลือเก็บหน้างาน */}
                        <td className="py-1.5 px-1.5 text-right leading-tight">
                          <div className={`font-black text-[11.5px] ${item.remainingBalance > 0 ? "text-amber-700" : "text-slate-400"}`}>
                            ฿{item.remainingBalance.toLocaleString()}
                          </div>
                          {item.remainingBalance > 0 ? (
                            <span className="text-[8.5px] text-amber-600 font-bold">เก็บหน้างาน</span>
                          ) : (
                            <span className="text-[8.5px] text-emerald-600 font-bold">ชำระครบ</span>
                          )}
                        </td>

                        {/* หมายเหตุ / คำขอพิเศษ (แสดงไฮไลต์เด่นชัด) */}
                        <td className="py-1.5 px-2 text-[10.5px] leading-snug">
                          {item.note ? (
                            <div className="inline-flex items-start gap-1 bg-amber-50 border border-amber-200 text-amber-950 px-1.5 py-0.5 rounded text-[10px] font-semibold max-w-[240px]">
                              <span>💬</span>
                              <span className="break-words">{item.note}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  };

                  return (
                    <div key={dateKey} className="border border-slate-300 rounded-xl overflow-hidden shadow-xs">
                      {/* แถบหัววันที่ของกลุ่มนี้ */}
                      <div className="bg-slate-900 text-white px-3.5 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-black text-xs">
                            {formatRelativeDay(dateKey)}
                          </span>
                          <span className="font-black text-sm tracking-tight text-white">
                            {formatThaiDate(dateKey)}
                          </span>
                          <span className="text-xs text-slate-400 font-semibold">
                            (รวม {items.length} ห้องจอง)
                          </span>

                          {/* แสดงป้ายสรุปจำนวนห้องตามสถานที่ในแถบหัววัน */}
                          <div className="flex items-center gap-1.5 ml-1">
                            {locationGroups.map((lg) => (
                              <span
                                key={lg.location}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200 border border-white/20"
                              >
                                <span>{lg.location === "ซามีญ่า" ? "🏡" : "🏨"}</span>
                                <span>{getLocationLabel(lg.location)}:</span>
                                <b className="text-white">{lg.items.length} ห้อง</b>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="text-xs text-slate-300 flex items-center gap-3 font-semibold">
                          <span>มูลค่ารวม: <b className="text-white">฿{dayTotal.toLocaleString()}</b></span>
                          <span>มัดจำ: <b className="text-emerald-400">฿{dayDeposit.toLocaleString()}</b></span>
                          <span>คงเหลือเก็บ: <b className="text-amber-400">฿{dayRemaining.toLocaleString()}</b></span>
                        </div>
                      </div>

                      {/* ตารางรายการจองในวันนี้ */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-black border-b border-slate-300 text-[11px]">
                              <th className="py-2 px-1.5 text-center w-7">ลำดับ</th>
                              <th className="py-2 px-2 text-center w-28">เลขที่จอง (Ref)</th>
                              <th className="py-2 px-2 text-center w-24">ห้อง / ที่ตั้ง</th>
                              <th className="py-2 px-3 min-w-[200px] w-56">ข้อมูลลูกค้าผู้จอง</th>
                              <th className="py-2 px-2 text-center w-28">ระยะเวลาเข้าพัก</th>
                              <th className="py-2 px-3 w-56">แจกแจงค่าบริการเสริม (ครั้งเดียว / รายวัน)</th>
                              <th className="py-2 px-2 text-center w-16">ผู้รับจอง</th>
                              <th className="py-2 px-2 text-right w-24">แจกแจงยอดรวม</th>
                              <th className="py-2 px-2 text-right w-20">มัดจำแล้ว</th>
                              <th className="py-2 px-2 text-right w-20">คงเหลือเก็บ</th>
                              <th className="py-2 px-2.5">หมายเหตุ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {/* รูปแบบที่ 1: แยกหมวดหมู่ตามสถานที่ (ซอย 1 / ซอย 2 / ซามีญ่า) */}
                            {groupModeInDate === "by_location" && locationGroups.length > 0 ? (
                              locationGroups.map((lg) => (
                                <Fragment key={`${dateKey}-${lg.location}`}>
                                  {/* แถบคั่นหมวดสถานที่พร้อมสรุปยอดของสาขานั้น */}
                                  <tr className="bg-slate-200/90 text-slate-900 font-black border-y-2 border-slate-300">
                                    <td colSpan={11} className="py-1 px-3">
                                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm">
                                            {lg.location === "ซามีญ่า" ? "🏡" : "🏨"}
                                          </span>
                                          <span className="font-black text-slate-900 tracking-wide">
                                            สาขา {getLocationLabel(lg.location)}
                                          </span>
                                          <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-white text-slate-800 border border-slate-300 shadow-2xs">
                                            {lg.items.length} ห้อง
                                          </span>
                                        </div>
                                        <div className="text-[10.5px] text-slate-700 font-semibold flex items-center gap-3">
                                          <span>ยอดรวมสาขา: <b className="text-slate-900">฿{lg.total.toLocaleString()}</b></span>
                                          <span>มัดจำ: <b className="text-emerald-700">฿{lg.deposit.toLocaleString()}</b></span>
                                          <span>คงเหลือเก็บ: <b className="text-amber-700">฿{lg.remaining.toLocaleString()}</b></span>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* แถวรายการของสาขานี้ */}
                                  {lg.items.map((item, idx) => renderRow(item, idx))}
                                </Fragment>
                              ))
                            ) : (
                              /* รูปแบบที่ 2: รวมทุกสถานที่ในตารางเดียว */
                              items.map((item, idx) => renderRow(item, idx))
                            )}
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
                      เอกสารนี้พิมพ์จากระบบ Hotel PMS สำหรับใช้เตรียมห้อง จัดตารางแม่บ้าน ตรวจสอบยอดมัดจำ และเป็นเอกสารสำรองข้อมูลเมื่อระบบขัดข้อง
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
                      <div className="text-[10px] text-slate-500 font-bold">รวมมูลค่าห้อง & บริการ:</div>
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
                  <th className="px-4 py-3 text-center">เลขที่จอง</th>
                  <th className="px-4 py-3 text-center">ห้อง</th>
                  <th className="px-4 py-3 text-center">สถานที่</th>
                  <th className="px-4 py-3">ลูกค้า / ข้อมูลติดต่อ</th>
                  <th className="px-4 py-3">ผู้รับจอง</th>
                  <th className="px-4 py-3">แจกแจงบริการครั้งเดียว / รายวัน</th>
                  <th className="px-4 py-3">วันเวลาเช็คอิน</th>
                  <th className="px-4 py-3">วันเวลาเช็คเอาท์</th>
                  <th className="px-4 py-3 text-right">ราคารวม</th>
                  <th className="px-4 py-3 text-right">มัดจำแล้ว</th>
                  <th className="px-4 py-3 text-right">คงเหลือเก็บ</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-12 text-center text-slate-400 font-bold">
                      ไม่พบข้อมูลการจอง
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedVoucher(b)}
                          className="font-mono font-black text-xs text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded px-2 py-0.5 tracking-wider cursor-pointer"
                        >
                          {b.bookingRef}
                        </button>
                        {b.groupBookingRef && (
                          <div className="text-[10px] text-indigo-700 font-bold mt-0.5">
                            {b.roomIndexInGroup}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-black text-slate-800">
                        <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200">
                          {b.roomNo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${getLocationBadgeStyle(
                            b.location
                          )}`}
                        >
                          {getLocationLabel(b.location)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{b.guestName}</div>
                        <div className="text-xs text-slate-500">{b.guestPhone} • {b.guestCount} ท่าน</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200">
                          {b.staffName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {b.oneTimeServices.length > 0 && (
                            <div className="text-xs text-amber-900">
                              <span className="font-bold">⚡ ครั้งเดียว:</span>{" "}
                              {b.oneTimeServices.map((ex) => `${ex.name} (+฿${ex.amount})`).join(", ")}
                            </div>
                          )}
                          {b.dailyServices.length > 0 && (
                            <div className="text-xs text-blue-900">
                              <span className="font-bold">🔄 รายวัน/ทุกวัน:</span>{" "}
                              {b.dailyServices.map((ex) => `${ex.name} (${ex.scheduleNote || `+฿${ex.amount}`})`).join(", ")}
                            </div>
                          )}
                          {b.oneTimeServices.length === 0 && b.dailyServices.length === 0 && (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{b.checkInDate}</div>
                        <div className="text-xs text-emerald-600 font-semibold">{b.checkInTimeStr}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{formatBuddhistSlashDate(b.checkOutDate)}</div>
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

      {/* ================= โมดอลใบยืนยันการจอง / บัตรหลักฐานการจอง (BOOKING CONFIRMATION SLIP / VOUCHER) ================= */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            {/* หัวบัตร Voucher */}
            <div className="bg-slate-900 text-white p-5 relative">
              <button
                type="button"
                onClick={() => setSelectedVoucher(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
              <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                HOTEL RESERVATION CONFIRMATION VOUCHER
              </div>
              <h2 className="text-lg font-black mt-0.5">ใบยืนยันหลักฐานการจองห้องพัก</h2>
              <div className="mt-3 bg-white/10 p-2.5 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-300 font-bold">เลขที่การจอง (Booking Reference):</div>
                  <div className="font-mono text-xl font-black text-amber-300 tracking-wider">
                    {selectedVoucher.bookingRef}
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white">
                    ยืนยันการจองแล้ว
                  </span>
                  <div className="text-[10px] text-slate-300 mt-1">ผู้รับจอง: <b className="text-white">{selectedVoucher.staffName}</b></div>
                </div>
              </div>
            </div>

            {/* เนื้อหาหลักฐานการจอง */}
            <div className="p-5 space-y-4 text-xs text-slate-700 max-h-[75vh] overflow-y-auto">
              {/* ข้อมูลลูกค้า */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">ชื่อผู้เข้าพัก (Guest Name)</div>
                    <div className="text-sm font-black text-slate-900">{selectedVoucher.guestName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">เบอร์โทรติดต่อ</div>
                    <div className="text-xs font-bold text-indigo-700">📞 {selectedVoucher.guestPhone}</div>
                  </div>
                </div>

                {selectedVoucher.groupBookingRef && (
                  <div className="pt-1.5 border-t border-slate-200 text-[11px] font-bold text-indigo-800 flex items-center gap-1.5">
                    <span>👥 รายการนี้เป็นส่วนหนึ่งของการจองหลายห้อง:</span>
                    <span className="bg-indigo-100 px-1.5 py-0.2 rounded font-mono">
                      {selectedVoucher.groupBookingRef} ({selectedVoucher.roomIndexInGroup})
                    </span>
                  </div>
                )}
              </div>

              {/* ข้อมูลห้องพัก & กำหนดเวลา */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-blue-50/60 p-2.5 rounded-2xl border border-blue-200">
                  <div className="text-[10px] text-blue-700 font-bold">ห้องพักที่จัดสรร</div>
                  <div className="text-lg font-black text-blue-950 mt-0.5">ห้อง {selectedVoucher.roomNo}</div>
                  <div className="text-[10px] text-blue-800 font-medium">{getLocationLabel(selectedVoucher.location)} • {selectedVoucher.roomType}</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold">จำนวนเข้าพัก</div>
                  <div className="text-lg font-black text-slate-800 mt-0.5">{selectedVoucher.nights} คืน</div>
                  <div className="text-[10px] text-slate-600 font-medium">👥 {selectedVoucher.guestCount} ท่าน</div>
                </div>
              </div>

              {/* วันที่เช็คอิน / เช็คเอาต์ */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex justify-between items-center text-center">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold">เช็คอิน (Check-in)</div>
                  <div className="font-bold text-slate-800 mt-0.5">{selectedVoucher.checkInDate}</div>
                  <div className="text-[10px] text-emerald-600 font-semibold">{selectedVoucher.checkInTimeStr}</div>
                </div>
                <div className="text-slate-300 font-black text-lg">➔</div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold">เช็คเอาต์ (Check-out)</div>
                  <div className="font-bold text-slate-800 mt-0.5">{selectedVoucher.checkOutDate}</div>
                  <div className="text-[10px] text-slate-500 font-semibold">{selectedVoucher.checkOutTimeStr}</div>
                </div>
              </div>

              {/* รายละเอียดค่าใช้จ่ายและบริการเสริมอย่างละเอียด (Detailed Breakdown) */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                <div className="text-[11px] font-black text-slate-800 border-b border-slate-200 pb-1.5 flex justify-between items-center">
                  <span>📋 แจกแจงรายการค่าใช้จ่ายและบริการ</span>
                  <span className="text-[10px] text-slate-500 font-normal">ราคา/หน่วย</span>
                </div>

                {/* ค่าห้องหลัก */}
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-slate-800">ค่าห้องพักหลัก</span>
                    <span className="text-[10.5px] text-slate-500 ml-1.5">
                      ({selectedVoucher.nights} คืน x ฿{selectedVoucher.roomRatePerNight.toLocaleString()}/คืน)
                    </span>
                  </div>
                  <span className="font-bold text-slate-900">
                    ฿{selectedVoucher.baseRoomPrice.toLocaleString()}
                  </span>
                </div>

                {/* บริการครั้งเดียว */}
                {selectedVoucher.oneTimeServices.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-150 space-y-1">
                    <div className="text-[10px] font-black text-amber-800 uppercase">⚡ บริการครั้งเดียว (One-time services)</div>
                    {selectedVoucher.oneTimeServices.map((ex, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs pl-2">
                        <span className="text-slate-700">{ex.icon || "•"} {ex.name}</span>
                        <span className="font-bold text-amber-900">+฿{ex.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* บริการรายวัน / ทุกวัน */}
                {selectedVoucher.dailyServices.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-150 space-y-1">
                    <div className="text-[10px] font-black text-blue-800 uppercase">🔄 บริการตามวัน / ทุกวัน (Daily services)</div>
                    {selectedVoucher.dailyServices.map((ex, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs pl-2">
                        <div>
                          <span className="text-slate-700">{ex.icon || "•"} {ex.name}</span>
                          <span className="text-[10px] text-blue-600 font-medium ml-1.5">({ex.scheduleNote})</span>
                        </div>
                        <span className="font-bold text-blue-900">+฿{ex.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* เงินมัดจำกุญแจ */}
                {selectedVoucher.keyDeposit > 0 && (
                  <div className="pt-1.5 border-t border-slate-150 flex justify-between items-center text-xs text-slate-600">
                    <span>🔑 เงินมัดจำกุญแจ (คืนเงินเมื่อเช็คเอาท์):</span>
                    <span className="font-semibold text-slate-700">฿{selectedVoucher.keyDeposit.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* ยอดเงิน & มัดจำ */}
              <div className="bg-slate-900 text-white p-3.5 rounded-2xl space-y-1.5">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>ราคารวมค่าห้อง + บริการทั้งหมด:</span>
                  <span className="font-bold text-white">฿{selectedVoucher.totalPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-400">
                  <span>ชำระเงินมัดจำล่วงหน้าแล้ว ({selectedVoucher.paymentMethod}):</span>
                  <span className="font-bold">-฿{selectedVoucher.depositPaid.toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-slate-700 flex justify-between items-center">
                  <span className="font-black text-xs text-amber-300">ยอดคงเหลือชำระวันเช็คอิน:</span>
                  <span className="text-lg font-black text-amber-300">
                    ฿{selectedVoucher.remainingBalance.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* หมายเหตุ */}
              {selectedVoucher.note && (
                <div className="text-[11px] text-slate-500 italic bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  💬 คำขอพิเศษ / หมายเหตุ: {selectedVoucher.note}
                </div>
              )}
            </div>

            {/* ปุ่มปิดและพิมพ์ */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedVoucher(null)}
                className="flex-1 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>🖨️ พิมพ์หลักฐาน (Voucher)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
