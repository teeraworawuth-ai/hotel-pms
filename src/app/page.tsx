"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useShift } from "@/contexts/ShiftContext";

export default function HomeDashboard() {
  const { activeShift, operatorName } = useShift();
  const [counts, setCounts] = useState({
    total: 0,
    available: 0,
    occupied: 0,
    reserved: 0,
    dirty: 0,
    cleaning: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSummary = async () => {
      setLoading(true);
      const { data: rooms } = await supabase
        .from("rooms")
        .select("id, status");
      if (rooms) {
        const next = {
          total: rooms.length,
          available: 0,
          occupied: 0,
          reserved: 0,
          dirty: 0,
          cleaning: 0,
        };
        rooms.forEach((r: any) => {
          const st = r.status || "available";
          if (st === "occupied") next.occupied++;
          else if (st === "reserved") next.reserved++;
          else if (st === "dirty") next.dirty++;
          else if (st === "cleaning") next.cleaning++;
          else next.available++;
        });
        setCounts(next);
      }
      setLoading(false);
    };
    loadSummary();
  }, []);

  return (
    <div className="space-y-6 pb-16">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
            ⚡ ภาพรวมระบบโรงแรม (Hotel PMS)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ผู้ใช้งานปัจจุบัน:{" "}
            <span className="font-bold text-indigo-700">
              {operatorName || activeShift?.staff_name || "Admin"}
            </span>
            {activeShift ? (
              <span className="ml-2 text-emerald-700 font-semibold">
                • กะเปิดอยู่ ({activeShift.staff_name} • เงินสดคาดหวัง ฿
                {Number(activeShift.expected_cash || 0).toLocaleString()})
              </span>
            ) : (
              <span className="ml-2 text-amber-600 font-semibold">
                • ยังไม่ได้เปิดกะ
              </span>
            )}
          </p>
        </div>
        <Link
          href="/checkin"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all"
        >
          <span>🚪 เปิดกระดานห้องพัก (Check-in)</span>
        </Link>
      </div>

      {/* สถานะห้องพักล่าสุด */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-500">ห้องทั้งหมด</div>
          <div className="text-2xl font-black text-slate-800 mt-1">
            {loading ? "..." : counts.total}
          </div>
        </div>
        <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 shadow-xs">
          <div className="text-xs font-bold text-emerald-700">ว่างพร้อมขาย</div>
          <div className="text-2xl font-black text-emerald-800 mt-1">
            {loading ? "..." : counts.available}
          </div>
        </div>
        <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 shadow-xs">
          <div className="text-xs font-bold text-blue-700">มีแขกพักอยู่</div>
          <div className="text-2xl font-black text-blue-800 mt-1">
            {loading ? "..." : counts.occupied}
          </div>
        </div>
        <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-200 shadow-xs">
          <div className="text-xs font-bold text-purple-700">จองวันนี้</div>
          <div className="text-2xl font-black text-purple-800 mt-1">
            {loading ? "..." : counts.reserved}
          </div>
        </div>
        <div className="bg-orange-50/70 p-4 rounded-2xl border border-orange-200 shadow-xs">
          <div className="text-xs font-bold text-orange-700">รอทำความสะอาด</div>
          <div className="text-2xl font-black text-orange-800 mt-1">
            {loading ? "..." : counts.dirty}
          </div>
        </div>
        <div className="bg-yellow-50/70 p-4 rounded-2xl border border-yellow-300 shadow-xs">
          <div className="text-xs font-bold text-yellow-800">กำลังทำความสะอาด</div>
          <div className="text-2xl font-black text-yellow-900 mt-1">
            {loading ? "..." : counts.cleaning}
          </div>
        </div>
      </div>

      {/* ทางลัดเมนูหลัก */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/checkin"
          className="bg-white hover:bg-indigo-50/40 p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 shadow-xs transition-all group"
        >
          <div className="text-lg font-black text-slate-800 group-hover:text-indigo-700">
            🚪 กระดานเช็คอิน / ห้องพัก
          </div>
          <p className="text-xs text-slate-500 mt-1">
            รับเช็คอิน จองล่วงหน้า จัดการบิล บริการเสริม มัดจำกุญแจ และเช็คเอาท์
          </p>
        </Link>

        <Link
          href="/audit"
          className="bg-white hover:bg-emerald-50/40 p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 shadow-xs transition-all group"
        >
          <div className="text-lg font-black text-slate-800 group-hover:text-emerald-700">
            📊 รายงานประจำวัน & Audit
          </div>
          <p className="text-xs text-slate-500 mt-1">
            สรุปรายได้-รับชำระเงินประจำวัน ตรวจสอบความผิดปกติจากมิเตอร์ไฟ และรายงานผู้เข้าพัก
          </p>
        </Link>

        <Link
          href="/activity-log"
          className="bg-white hover:bg-indigo-50/40 p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 shadow-xs transition-all group"
        >
          <div className="text-lg font-black text-slate-800 group-hover:text-indigo-700">
            📜 ประวัติการใช้งาน (Log 30 วัน)
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ตรวจสอบประวัติการเพิ่ม/แก้ไขบริการเสริม เช็คอิน การเงิน กะทำงาน และตั้งค่าระบบย้อนหลัง 30 วัน
          </p>
        </Link>

        <Link
          href="/energy"
          className="bg-white hover:bg-amber-50/40 p-5 rounded-2xl border border-slate-200 hover:border-amber-300 shadow-xs transition-all group"
        >
          <div className="text-lg font-black text-slate-800 group-hover:text-amber-700">
            ⚡ มิเตอร์ไฟฟ้า & IoT (Energy)
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ดูกราฟการใช้ไฟฟ้ารายห้อง ตรวจสอบเซ็นเซอร์ออฟไลน์ และสรุปค่าไฟ
          </p>
        </Link>

        <Link
          href="/bookings"
          className="bg-white hover:bg-purple-50/40 p-5 rounded-2xl border border-slate-200 hover:border-purple-300 shadow-xs transition-all group"
        >
          <div className="text-lg font-black text-slate-800 group-hover:text-purple-700">
            🔍 ค้นหาประวัติการจอง (Bookings)
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ค้นหารายชื่อลูกค้า เบอร์โทรศัพท์ และประวัติการเข้าพักทั้งหมด
          </p>
        </Link>

        <Link
          href="/smart-pricing"
          className="bg-white hover:bg-blue-50/40 p-5 rounded-2xl border border-slate-200 hover:border-blue-300 shadow-xs transition-all group"
        >
          <div className="text-lg font-black text-slate-800 group-hover:text-blue-700">
            🏷️ ปฏิทินแผนราคา (Smart Pricing)
          </div>
          <p className="text-xs text-slate-500 mt-1">
            กำหนดแผนราคารายวัน ราคาวันหยุด และตั้งค่าห้องพัก/พนักงานในหน้า Settings
          </p>
        </Link>
      </div>
    </div>
  );
}
