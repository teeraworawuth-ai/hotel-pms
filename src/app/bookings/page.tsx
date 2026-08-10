"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Booking {
  id: string;
  room_id: string;
  guest_name: string;
  guest_phone: string;
  check_in_time: string;
  check_out_time: string;
  status: string;
  actual_price: number;
  rooms?: {
    room_no: string;
  };
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchBookings = async () => {
    setLoading(true);
    let query = supabase
      .from("bookings")
      .select(`
        id,
        room_id,
        guest_name,
        guest_phone,
        check_in_time,
        check_out_time,
        status,
        actual_price,
        rooms (
          room_no
        )
      `)
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (searchTerm) {
      query = query.or(`guest_name.ilike.%${searchTerm}%,guest_phone.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
    } else {
      setBookings(data as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    // ใช้ Debounce 500ms ป้องกันการยิง Database รัวๆ ตอนกำลังพิมพ์
    const delayDebounceFn = setTimeout(() => {
      fetchBookings();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, statusFilter]);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <span className="px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-700">เข้าพักแล้ว</span>;
      case 'reserved': return <span className="px-2 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-700">จองแล้ว</span>;
      case 'completed': return <span className="px-2 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">เช็คเอาท์แล้ว</span>;
      case 'cancelled': return <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">ยกเลิก</span>;
      default: return <span className="px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleString('th-TH', { 
      day: 'numeric', month: 'short', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">ค้นหาการจอง</h1>
          <p className="text-slate-500 text-sm mt-1">ดูประวัติการเข้าพักและค้นหาข้อมูลลูกค้า</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">ค้นหาชื่อหรือเบอร์โทร</label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input
              type="text"
              placeholder="พิมพ์ชื่อลูกค้า หรือ เบอร์โทรศัพท์ (บางส่วนได้)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-700"
            />
          </div>
        </div>
        
        <div className="sm:w-64">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">สถานะ</label>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700"
          >
            <option value="all">ทั้งหมด</option>
            <option value="reserved">จองแล้ว (Reserved)</option>
            <option value="active">เข้าพักแล้ว (Active)</option>
            <option value="completed">เช็คเอาท์แล้ว (Completed)</option>
            <option value="cancelled">ยกเลิก (Cancelled)</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
              <tr>
                <th className="px-6 py-4">ห้อง</th>
                <th className="px-6 py-4">ลูกค้า</th>
                <th className="px-6 py-4">เช็คอิน</th>
                <th className="px-6 py-4">เช็คเอาท์</th>
                <th className="px-6 py-4 text-right">ราคา</th>
                <th className="px-6 py-4 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">กำลังค้นหาข้อมูล...</td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                      {searchTerm ? 'ไม่พบข้อมูลที่ค้นหา' : 'ไม่มีข้อมูลการจอง'}
                    </div>
                  </td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">
                      {booking.rooms?.room_no || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">{booking.guest_name || 'ไม่ระบุชื่อ'}</div>
                      <div className="text-xs text-slate-500">{booking.guest_phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {formatDate(booking.check_in_time)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {formatDate(booking.check_out_time)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-emerald-600">
                      ฿{booking.actual_price?.toLocaleString() || '0'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(booking.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
