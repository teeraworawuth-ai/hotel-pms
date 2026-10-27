"use client";

import { useEffect, useRef, useState } from "react";
import { useShift } from "@/contexts/ShiftContext";
import { logActivity } from "@/lib/activityLog";
import { fetchActiveKeyDeposits, HeldKeyDepositRoom } from "@/lib/keyDeposit";
import {
  CashHandover,
  computeShiftDrawer,
  getShiftBusinessDateStr,
  newHandoverId,
  saveHandover,
  ShiftDrawer,
  verifyManagerPin,
} from "@/lib/cashHandover";
import SignaturePad, { SignaturePadHandle } from "./SignaturePad";

const fmt = (n: number) => `฿${Number(n || 0).toLocaleString()}`;

/**
 * ส่งเงินระหว่างกะ (ยังไม่ปิดกะ) — ส่งเสร็จแล้วพนักงานทำงานต่อได้
 * วิธีที่ 1: ส่งเงินสดทั้งหมด หักเหลือไว้เฉพาะเงินมัดจำกุญแจคงเหลือปัจจุบัน
 * วิธีที่ 2: ส่งเงินสดแบบระบุจำนวน (เช่น เก็บเฉพาะแบงก์พัน เหลือไว้เป็นเงินทอน)
 */
export default function CashHandoverModal({ onClose }: { onClose: () => void }) {
  const { activeShift, operatorName, refreshShift } = useShift();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<ShiftDrawer | null>(null);
  const [reserve, setReserve] = useState(0);
  const [reserveRooms, setReserveRooms] = useState<HeldKeyDepositRoom[]>([]);
  const [showRooms, setShowRooms] = useState(false);
  const [method, setMethod] = useState<"all_except_reserve" | "fixed">("all_except_reserve");
  const [fixedAmount, setFixedAmount] = useState<number | "">("");
  const [managerPin, setManagerPin] = useState("");
  const staffSigRef = useRef<SignaturePadHandle>(null);
  const managerSigRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    if (!activeShift) return;
    (async () => {
      setLoading(true);
      const [d, keyDep] = await Promise.all([computeShiftDrawer(activeShift), fetchActiveKeyDeposits()]);
      setDrawer(d);
      setReserve(keyDep.total);
      setReserveRooms(keyDep.rooms);
      setLoading(false);
    })();
  }, [activeShift?.id]);

  if (!activeShift) return null;

  const drawerCash = drawer?.drawer || 0;
  const allExceptReserve = drawerCash - reserve;
  const amount = method === "all_except_reserve" ? allExceptReserve : Number(fixedAmount || 0);
  const isNegative = amount < 0;
  const leftInDrawer = drawerCash - amount;
  const leftAsChange = leftInDrawer - reserve;

  const staffLabel = isNegative ? "ลายเซ็นพนักงาน (ผู้รับเงิน)" : "ลายเซ็นพนักงาน (ผู้ส่งเงิน)";
  const managerLabel = isNegative ? "ลายเซ็นผู้จัดการ (ผู้ส่งเงิน)" : "ลายเซ็นผู้จัดการ (ผู้รับเงิน)";

  const handleConfirm = async () => {
    setError("");
    if (amount === 0) {
      setError("ยอดเงินที่ส่งต้องไม่เป็น 0");
      return;
    }
    if (method === "fixed" && (!fixedAmount || Number(fixedAmount) <= 0)) {
      setError("กรุณาระบุจำนวนเงินที่จะส่ง");
      return;
    }
    const staffSig = staffSigRef.current?.toDataURL() || null;
    const managerSig = managerSigRef.current?.toDataURL() || null;
    if (!staffSig || !managerSig) {
      setError("กรุณาให้พนักงานและผู้จัดการเซ็นชื่อให้ครบทั้ง 2 ช่อง");
      return;
    }
    setSaving(true);
    const manager = await verifyManagerPin(managerPin);
    if (!manager) {
      setSaving(false);
      setError("รหัส PIN ผู้จัดการไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็นผู้จัดการ/แอดมิน)");
      return;
    }
    const nowIso = new Date().toISOString();
    const record: CashHandover = {
      id: newHandoverId(),
      business_date: getShiftBusinessDateStr(activeShift.start_time),
      shift_id: activeShift.id,
      shift_staff_name: activeShift.staff_name,
      kind: "mid_shift",
      method,
      drawer_cash: drawerCash,
      key_reserve: reserve,
      key_reserve_rooms: reserveRooms.length,
      required_amount: amount,
      actual_amount: amount,
      staff_name: operatorName || activeShift.staff_name,
      staff_signature: staffSig,
      staff_signed_at: nowIso,
      manager_name: manager.name,
      manager_signature: managerSig,
      manager_signed_at: nowIso,
      created_at: nowIso,
    };
    const { error: saveErr } = await saveHandover(record);
    if (saveErr) {
      setSaving(false);
      setError("บันทึกการส่งเงินไม่สำเร็จ: " + saveErr.message);
      return;
    }
    await logActivity({
      category: "shift",
      action: "create",
      staffName: operatorName || activeShift.staff_name,
      shiftName: activeShift.staff_name,
      target: `ส่งเงินระหว่างกะ ${activeShift.staff_name}`,
      details: `${isNegative ? "ผู้จัดการเติมเงินสดเข้าลิ้นชัก" : "ส่งเงินสดระหว่างกะ"} ${fmt(Math.abs(amount))} (${
        method === "fixed" ? "ระบุจำนวน" : "ทั้งหมดหักมัดจำกุญแจ"
      }) • ผู้จัดการ: ${manager.name} • เงินในลิ้นชักก่อนส่ง ${fmt(drawerCash)} • มัดจำกุญแจคงเหลือ ${fmt(reserve)}`,
    });
    setSaving(false);
    await refreshShift();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto shadow-2xl">
        <div className="px-5 py-4 bg-emerald-700 text-white">
          <h3 className="text-lg font-black">💵 ส่งเงินระหว่างกะ (ยังไม่ปิดกะ)</h3>
          <p className="text-xs text-emerald-100 mt-0.5">
            กะ: {activeShift.staff_name} • ส่งเสร็จแล้วยังทำงานต่อได้ตามปกติ
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 animate-pulse font-bold">กำลังคำนวณเงินสดในลิ้นชัก...</div>
        ) : (
          <div className="p-5 space-y-4">
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg font-bold">{error}</div>}

            {/* สรุปเงินสดในลิ้นชัก */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>เงินสดตั้งต้นในลิ้นชัก</span>
                <span className="font-bold">{fmt(drawer?.initialCash || 0)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>+ รับเงินสดในกะนี้</span>
                <span className="font-bold">+{fmt(drawer?.cashIn || 0)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>- ค่าใช้จ่าย / คืนเงินสดในกะนี้</span>
                <span className="font-bold">-{fmt((drawer?.expenses || 0) + (drawer?.refunds || 0))}</span>
              </div>
              {(drawer?.handedOut || 0) !== 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>- ส่งเงินไปแล้วในกะนี้</span>
                  <span className="font-bold">-{fmt(drawer?.handedOut || 0)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-slate-900 pt-1.5 border-t border-slate-200">
                <span>= เงินสดที่มีในลิ้นชักขณะนี้</span>
                <span>{fmt(drawerCash)}</span>
              </div>
              <div className="flex justify-between items-center text-amber-800 font-bold">
                <span className="flex items-center gap-1.5">
                  🔑 มัดจำกุญแจคงเหลือปัจจุบัน ({reserveRooms.length} ห้อง)
                  <button
                    type="button"
                    onClick={() => setShowRooms((p) => !p)}
                    className="text-[11px] underline text-amber-700"
                  >
                    {showRooms ? "ซ่อน" : "ดูห้อง"}
                  </button>
                </span>
                <span>{fmt(reserve)}</span>
              </div>
              {showRooms && (
                <div className="grid grid-cols-2 gap-1 text-[11px] bg-white rounded-lg p-2 border border-amber-200">
                  {reserveRooms.length === 0 ? (
                    <span className="text-slate-400">ไม่มีห้องที่ถือมัดจำ</span>
                  ) : (
                    reserveRooms.map((r) => (
                      <span key={r.bookingId} className="flex justify-between">
                        <span>ห้อง {r.roomNo}</span>
                        <b>{fmt(r.amount)}</b>
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* เลือกวิธีส่งเงิน */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("all_except_reserve")}
                className={`p-3 rounded-xl border-2 text-left text-xs font-bold transition-colors ${
                  method === "all_except_reserve"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <div className="text-sm">1️⃣ ส่งทั้งหมด</div>
                <div className="font-medium mt-0.5">หักเหลือไว้เฉพาะมัดจำกุญแจ</div>
              </button>
              <button
                type="button"
                onClick={() => setMethod("fixed")}
                className={`p-3 rounded-xl border-2 text-left text-xs font-bold transition-colors ${
                  method === "fixed" ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-600"
                }`}
              >
                <div className="text-sm">2️⃣ ระบุจำนวน</div>
                <div className="font-medium mt-0.5">เช่น เก็บเฉพาะแบงก์พัน เหลือไว้ทอน</div>
              </button>
            </div>

            {method === "fixed" && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">จำนวนเงินสดที่ส่งรอบนี้</label>
                <input
                  type="number"
                  value={fixedAmount}
                  onChange={(e) => setFixedAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-2xl text-center font-black p-3 rounded-xl border border-emerald-300 bg-emerald-50 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="เช่น 3000"
                />
              </div>
            )}

            <div
              className={`p-3.5 rounded-xl border-2 ${
                isNegative ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-emerald-50 border-emerald-300 text-emerald-900"
              }`}
            >
              <div className="flex justify-between items-center font-black text-base">
                <span>{isNegative ? "⚠️ ผู้จัดการต้องเติมเงินสดเข้าลิ้นชัก" : "👉 ยอดเงินสดที่ส่งผู้จัดการรอบนี้"}</span>
                <span className="text-xl">{fmt(Math.abs(amount))}</span>
              </div>
              <div className="text-xs mt-1 opacity-90">
                เหลือเงินสดในลิ้นชักหลังส่ง {fmt(leftInDrawer)} (กันมัดจำกุญแจ {fmt(reserve)}
                {leftAsChange !== 0 ? ` • ${leftAsChange > 0 ? "เหลือเป็นเงินทอน" : "ขาดจากยอดมัดจำ"} ${fmt(Math.abs(leftAsChange))}` : ""})
              </div>
              {method === "fixed" && leftAsChange < 0 && (
                <div className="text-xs mt-1 font-bold text-rose-600">
                  ⚠️ ยอดที่ส่งมากเกินไป ทำให้เงินสดในลิ้นชักน้อยกว่ายอดมัดจำกุญแจที่ต้องคืนลูกค้า
                </div>
              )}
            </div>

            <SignaturePad ref={staffSigRef} label={staffLabel} />
            <SignaturePad ref={managerSigRef} label={managerLabel} />

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ (ยืนยันการรับ-ส่งเงิน)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center tracking-[0.5em] text-xl p-3 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none"
                placeholder="••••"
              />
            </div>
          </div>
        )}

        <div className="bg-slate-50 p-4 border-t border-slate-100 flex gap-3 sticky bottom-0">
          <button onClick={onClose} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl">
            ยกเลิก
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || saving || !managerPin}
            className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "ยืนยันส่งเงิน"}
          </button>
        </div>
      </div>
    </div>
  );
}
