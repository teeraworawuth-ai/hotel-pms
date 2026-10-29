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
  const [method, setMethod] = useState<"all_except_reserve" | "fixed" | "topup">("all_except_reserve");
  const [fixedAmount, setFixedAmount] = useState<number | "">("");
  const [managerPin, setManagerPin] = useState("");
  const staffSigRef = useRef<SignaturePadHandle>(null);
  const managerSigRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    if (!activeShift) return;
    (async () => {
      setLoading(true);
      const [d, keyDep] = await Promise.all([
        computeShiftDrawer(activeShift),
        fetchActiveKeyDeposits(undefined, activeShift.shift_location || null),
      ]);
      setDrawer(d);
      setReserve(keyDep.total);
      setReserveRooms(keyDep.rooms);
      const diff = (d?.drawer || 0) - keyDep.total;
      if (diff < 0) {
        setMethod("topup");
        setFixedAmount(Math.abs(diff));
      }
      setLoading(false);
    })();
  }, [activeShift?.id, activeShift?.shift_location]);

  if (!activeShift) return null;

  const drawerCash = drawer?.drawer || 0;
  const allExceptReserve = drawerCash - reserve;
  const amount =
    method === "all_except_reserve"
      ? allExceptReserve
      : method === "topup"
      ? -Math.abs(Number(fixedAmount || 0))
      : Math.abs(Number(fixedAmount || 0));
  const isNegative = amount < 0;
  const leftInDrawer = drawerCash - amount;
  const leftAsChange = leftInDrawer - reserve;

  const staffLabel = isNegative
    ? `ลายเซ็นพนักงานผู้รับเงินเข้าลิ้นชัก (${operatorName || activeShift.staff_name})`
    : `ลายเซ็นพนักงานผู้ส่งเงิน (${operatorName || activeShift.staff_name})`;
  const managerLabel = isNegative
    ? "ลายเซ็นผู้จัดการ (ผู้ส่งเงินเติมเข้าลิ้นชัก)"
    : "ลายเซ็นผู้จัดการ (ผู้รับเงิน)";

  const handleConfirm = async () => {
    setError("");
    if (amount === 0) {
      setError("ยอดเงินต้องไม่เป็น 0");
      return;
    }
    if ((method === "fixed" || method === "topup") && (!fixedAmount || Number(fixedAmount) <= 0)) {
      setError(method === "topup" ? "กรุณาระบุจำนวนเงินที่จะเติมเข้าลิ้นชัก" : "กรุณาระบุจำนวนเงินที่จะส่ง");
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
      setError("รหัส PIN ผู้จัดการไม่ถูกต้อง (ต้องเป็นผู้จัดการหรือแอดมิน)");
      return;
    }
    const nowIso = new Date().toISOString();
    const record: CashHandover = {
      id: newHandoverId(),
      business_date: activeShift.business_date || getShiftBusinessDateStr(activeShift.start_time),
      shift_id: activeShift.id,
      shift_staff_name: activeShift.staff_name,
      shift_location: activeShift.shift_location || null,
      kind: "mid_shift",
      method: method === "all_except_reserve" ? "all_except_reserve" : "fixed",
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
      note: isNegative
        ? `ผู้จัดการ (${manager.name}) เติมเงินเข้าลิ้นชัก ${fmt(Math.abs(amount))} • รับโดย ${operatorName || activeShift.staff_name}`
        : null,
      created_at: nowIso,
    };
    const { error: saveErr } = await saveHandover(record);
    if (saveErr) {
      setSaving(false);
      setError("บันทึกไม่สำเร็จ: " + saveErr.message);
      return;
    }
    await logActivity({
      category: "shift",
      action: "create",
      staffName: operatorName || activeShift.staff_name,
      shiftName: activeShift.staff_name,
      target: `${isNegative ? "เติมเงินเข้าลิ้นชัก" : "ส่งเงินระหว่างกะ"} ${activeShift.staff_name}`,
      details: `${isNegative ? "ผู้จัดการเติมเงินสดเข้าลิ้นชัก" : "ส่งเงินสดระหว่างกะ"} ${fmt(Math.abs(amount))} (${
        method === "topup" ? "ผู้จัดการเติมเงิน" : method === "fixed" ? "ระบุจำนวน" : "ทั้งหมดหักมัดจำกุญแจ"
      }) • ผู้จัดการ: ${manager.name} • พนักงาน: ${operatorName || activeShift.staff_name} • เงินในลิ้นชักก่อนทำรายการ ${fmt(drawerCash)} → หลังทำรายการ ${fmt(leftInDrawer)}`,
    });
    setSaving(false);
    await refreshShift();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto shadow-2xl">
        <div className="px-5 py-3.5 bg-emerald-700 text-white">
          <h3 className="text-base font-black">💵 ส่งเงิน / เติมเงินระหว่างกะ (ยังไม่ปิดกะ)</h3>
          <p className="text-xs text-emerald-100 mt-0.5">
            กะ: {activeShift.staff_name} {activeShift.shift_location ? `• 📍${activeShift.shift_location}` : ""}
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 animate-pulse font-bold">กำลังคำนวณเงินสดในลิ้นชัก...</div>
        ) : (
          <div className="p-4 space-y-3">
            {error && <div className="bg-red-50 text-red-600 text-xs p-2.5 rounded-lg font-bold">{error}</div>}

            {/* สรุปเงินสดในลิ้นชัก */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>เงินตั้งต้น</span>
                <span className="font-bold">{fmt(drawer?.initialCash || 0)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>+ รับเงินสด</span>
                <span className="font-bold">+{fmt(drawer?.cashIn || 0)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>- รายจ่าย / คืนเงินสด</span>
                <span className="font-bold">-{fmt((drawer?.expenses || 0) + (drawer?.refunds || 0))}</span>
              </div>
              {(drawer?.handedOut || 0) !== 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>{Number(drawer?.handedOut || 0) >= 0 ? "- ส่งเงินไปแล้ว" : "+ ผู้จัดการเติมเงินแล้ว"}</span>
                  <span className="font-bold">
                    {Number(drawer?.handedOut || 0) >= 0
                      ? `-${fmt(drawer?.handedOut || 0)}`
                      : `+${fmt(Math.abs(drawer?.handedOut || 0))}`}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-black text-slate-900 text-sm pt-1 border-t border-slate-200">
                <span>= เงินสดในลิ้นชักขณะนี้</span>
                <span>{fmt(drawerCash)}</span>
              </div>
              <div className="flex justify-between items-center text-amber-800 font-bold">
                <span className="flex items-center gap-1.5">
                  🔑 มัดจำกุญแจ ({reserveRooms.length} ห้อง)
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

            {/* เลือกวิธีส่งเงิน / เติมเงิน */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setMethod("all_except_reserve")}
                className={`p-2.5 rounded-xl border-2 text-left text-xs font-bold transition-colors ${
                  method === "all_except_reserve"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <div className="font-black">1️⃣ ส่งทั้งหมด</div>
                <div className="text-[10px] font-medium mt-0.5">เหลือเฉพาะมัดจำ</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMethod("fixed");
                  if (allExceptReserve > 0) setFixedAmount(allExceptReserve);
                }}
                className={`p-2.5 rounded-xl border-2 text-left text-xs font-bold transition-colors ${
                  method === "fixed"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <div className="font-black">2️⃣ ส่งระบุยอด</div>
                <div className="text-[10px] font-medium mt-0.5">เหลือไว้เป็นเงินทอน</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMethod("topup");
                  setFixedAmount(allExceptReserve < 0 ? Math.abs(allExceptReserve) : "");
                }}
                className={`p-2.5 rounded-xl border-2 text-left text-xs font-bold transition-colors ${
                  method === "topup"
                    ? "border-rose-500 bg-rose-50 text-rose-900"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <div className="font-black">➕ เติมเงิน</div>
                <div className="text-[10px] font-medium mt-0.5">ผู้จัดการเติมเข้าลิ้นชัก</div>
              </button>
            </div>

            {(method === "fixed" || method === "topup") && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {method === "topup"
                    ? "จำนวนเงินสดที่ผู้จัดการเติมเข้าลิ้นชัก"
                    : "จำนวนเงินสดที่ส่งผู้จัดการรอบนี้"}
                </label>
                <input
                  type="number"
                  min={0}
                  value={fixedAmount}
                  onChange={(e) => setFixedAmount(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                  className={`w-full text-2xl text-center font-black p-2.5 rounded-xl border outline-none ${
                    method === "topup"
                      ? "border-rose-300 bg-rose-50 text-rose-700 focus:ring-2 focus:ring-rose-500"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                  }`}
                  placeholder="ระบุจำนวนเงิน"
                />
              </div>
            )}

            <div
              className={`p-3 rounded-xl border-2 ${
                isNegative ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-emerald-50 border-emerald-300 text-emerald-900"
              }`}
            >
              <div className="flex justify-between items-center font-black text-sm">
                <span>{isNegative ? "➕ ผู้จัดการเติมเงินเข้าลิ้นชัก" : "👉 ยอดส่งผู้จัดการรอบนี้"}</span>
                <span className="text-lg">{fmt(Math.abs(amount))}</span>
              </div>
              <div className="text-xs mt-0.5 opacity-90">
                เงินในลิ้นชักหลังทำรายการ: <b>{fmt(leftInDrawer)}</b> (มัดจำ {fmt(reserve)}
                {leftAsChange !== 0 ? ` • ${leftAsChange > 0 ? "เงินทอน" : "ยังขาดมัดจำ"} ${fmt(Math.abs(leftAsChange))}` : ""})
              </div>
              {method === "fixed" && leftAsChange < 0 && (
                <div className="text-xs mt-1 font-bold text-rose-600">
                  ⚠️ ส่งมากเกินไป เงินในลิ้นชักเหลือน้อยกว่ามัดจำกุญแจ
                </div>
              )}
            </div>

            <SignaturePad ref={staffSigRef} label={staffLabel} />
            <SignaturePad ref={managerSigRef} label={managerLabel} />

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ (ยืนยัน)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center tracking-[0.5em] text-lg p-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none"
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
