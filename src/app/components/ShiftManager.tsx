"use client";

import { useEffect, useRef, useState } from "react";
import { useShift } from "@/contexts/ShiftContext";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activityLog";
import { fetchActiveKeyDeposits, HeldKeyDepositRoom } from "@/lib/keyDeposit";
import {
  CashHandover,
  computeShiftDrawer,
  EOD_KEY_PREFIX,
  getShiftBusinessDateStr,
  newHandoverId,
  resolveBusinessDateForNewShift,
  saveHandover,
  saveShiftBusinessDate,
  ShiftDrawer,
} from "@/lib/cashHandover";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";
import SignaturePad, { SignaturePadHandle } from "./SignaturePad";
import CashHandoverModal from "./CashHandoverModal";
import ShiftExpenseButton from "./ShiftExpenseModal";

interface ShiftManagerProps {
  compact?: boolean;
  hideExpense?: boolean;
}

const fmt = (n: number) => `฿${Number(n || 0).toLocaleString()}`;

export default function ShiftManager({ compact = false, hideExpense = false }: ShiftManagerProps = {}) {
  const { activeShift, currentUser, operatorName, loading, refreshShift, shiftLock } = useShift();
  const { getNow } = useSimulatedTime();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Open Shift State
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [initialCash, setInitialCash] = useState<number | "">(0);
  const [suggestedReserve, setSuggestedReserve] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Close Shift State
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeDrawer, setCloseDrawer] = useState<ShiftDrawer | null>(null);
  const [closeReserve, setCloseReserve] = useState(0);
  const [closeReserveRooms, setCloseReserveRooms] = useState<HeldKeyDepositRoom[]>([]);
  const [actualSend, setActualSend] = useState<number | "">("");
  const [closePin, setClosePin] = useState("");
  const [isEndOfDay, setIsEndOfDay] = useState(false);
  const staffSigRef = useRef<SignaturePadHandle>(null);

  // เปิดหน้าต่างเปิดกะ: แนะนำเงินสดตั้งต้น = มัดจำกุญแจคงเหลือที่ส่งต่อจากกะก่อน
  useEffect(() => {
    if (!showOpenModal) return;
    fetchActiveKeyDeposits().then((r) => {
      setSuggestedReserve(r.total);
      setInitialCash(r.total);
    });
  }, [showOpenModal]);

  // เปิดหน้าต่างปิดกะ: คำนวณเงินในลิ้นชัก + มัดจำกุญแจคงเหลือปัจจุบัน
  useEffect(() => {
    if (!showCloseModal || !activeShift) return;
    (async () => {
      setCloseLoading(true);
      const [d, keyDep] = await Promise.all([computeShiftDrawer(activeShift), fetchActiveKeyDeposits()]);
      setCloseDrawer(d);
      setCloseReserve(keyDep.total);
      setCloseReserveRooms(keyDep.rooms);
      setCloseLoading(false);
    })();
  }, [showCloseModal, activeShift?.id]);

  const handleOpenShift = async () => {
    setErrorMsg("");
    if (initialCash === "") {
      setErrorMsg("กรุณาระบุเงินสดตั้งต้นในลิ้นชัก (ใส่ 0 ก็ได้)");
      return;
    }
    const upperName = name.toUpperCase();
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .select("*")
      .eq("name", upperName)
      .eq("pin", pin)
      .single();

    if (staffError || !staffData) {
      setErrorMsg("ชื่อพนักงานหรือรหัส PIN ไม่ถูกต้อง");
      return;
    }

    // ตรวจสอบว่ามีกะที่เปิดค้างอยู่แล้วหรือไม่ (ป้องกันการเปิดกะซ้อนจากหลายแท็บ/อุปกรณ์)
    const { data: existingOpenShifts } = await supabase
      .from("shifts")
      .select("id, staff_name")
      .eq("status", "open")
      .limit(1);

    if (existingOpenShifts && existingOpenShifts.length > 0) {
      setErrorMsg(`มีกะของ ${existingOpenShifts[0].staff_name} เปิดใช้งานอยู่แล้ว กรุณารีเฟรชหรือปิดกะเดิมก่อน`);
      refreshShift();
      return;
    }

    const newShiftBD = await resolveBusinessDateForNewShift(getNow());

    const { data: insertedShift, error: shiftError } = await supabase
      .from("shifts")
      .insert({
        staff_id: staffData.id,
        staff_name: staffData.name,
        initial_cash: initialCash,
        expected_cash: initialCash,
        status: "open",
      })
      .select("id")
      .single();

    if (shiftError || !insertedShift) {
      setErrorMsg("เกิดข้อผิดพลาดในการเปิดกะ");
      return;
    }

    // ผูกวันธุรกิจเข้ากับกะโดยตรง (กะที่เปิดหลังปิดรอบวันเมื่อวานแล้ว = กะแรกของวันใหม่)
    await saveShiftBusinessDate(insertedShift.id, newShiftBD);

    await logActivity({
      category: "shift",
      action: "create",
      staffName: staffData.name,
      shiftName: staffData.name,
      target: `เปิดกะ ${staffData.name}`,
      details: `เปิดกะการทำงานโดย ${staffData.name} (เงินสดตั้งต้นในลิ้นชัก ${fmt(Number(initialCash || 0))}${
        suggestedReserve !== null ? ` • มัดจำกุญแจคงเหลือ ${fmt(suggestedReserve)}` : ""
      })`,
    });

    setShowOpenModal(false);
    setName("");
    setPin("");
    setInitialCash(0);
    refreshShift();
  };

  const resetCloseState = () => {
    setShowCloseModal(false);
    setClosePin("");
    setActualSend("");
    setIsEndOfDay(false);
    setErrorMsg("");
    staffSigRef.current?.clear();
  };

  const drawerCash = closeDrawer?.drawer || 0;
  const requiredSend = drawerCash - closeReserve;
  const actualSendNum = actualSend === "" ? 0 : Number(actualSend);
  const sendDiff = actualSendNum - requiredSend; // + เกิน / - ขาด
  // กติกาปิดรอบวัน: ติ๊กได้ตั้งแต่ 05:30 น. ของวันถัดไป / ตั้งแต่ 06:30 น. บังคับเป็นกะสุดท้ายของวันอัตโนมัติ
  const effectiveEndOfDay = shiftLock.locked ? true : shiftLock.canCloseEod && isEndOfDay;

  // เปิดหน้าต่างปิดกะในช่วง 05:30+ → ติ๊ก "กะสุดท้ายของวัน" ให้เป็นค่าเริ่มต้น
  useEffect(() => {
    if (showCloseModal && shiftLock.canCloseEod) setIsEndOfDay(true);
  }, [showCloseModal, shiftLock.canCloseEod]);

  const handleCloseShift = async () => {
    setErrorMsg("");
    if (!activeShift) return;
    if (actualSend === "") {
      setErrorMsg("กรุณากรอกยอดเงินสดที่ส่งจริง (ใส่ 0 ได้หากไม่มีเงินส่ง)");
      return;
    }
    const staffSig = staffSigRef.current?.toDataURL() || null;
    if (!staffSig) {
      setErrorMsg("กรุณาเซ็นชื่อผู้ส่งกะก่อนยืนยัน");
      return;
    }
    setCloseSaving(true);

    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .select("*")
      .eq("name", activeShift.staff_name)
      .eq("pin", closePin)
      .single();

    if (staffError || !staffData) {
      setCloseSaving(false);
      setErrorMsg("รหัส PIN ไม่ถูกต้อง (ต้องเป็น PIN ของพนักงานเจ้าของกะ)");
      return;
    }

    const nowIso = new Date().toISOString();
    const countedDrawer = actualSendNum + closeReserve;

    const { error: shiftError } = await supabase
      .from("shifts")
      .update({
        end_time: nowIso,
        expected_cash: drawerCash,
        final_cash: countedDrawer,
        discrepancy: sendDiff,
        status: "closed",
        signature_data: staffSig,
      })
      .eq("id", activeShift.id);

    if (shiftError) {
      setCloseSaving(false);
      setErrorMsg("เกิดข้อผิดพลาดในการปิดกะ");
      return;
    }

    const businessDate = activeShift.business_date || getShiftBusinessDateStr(activeShift.start_time);
    const record: CashHandover = {
      id: newHandoverId(),
      business_date: businessDate,
      shift_id: activeShift.id,
      shift_staff_name: activeShift.staff_name,
      kind: "shift_close",
      drawer_cash: drawerCash,
      key_reserve: closeReserve,
      key_reserve_rooms: closeReserveRooms.length,
      required_amount: requiredSend,
      actual_amount: actualSendNum,
      staff_name: activeShift.staff_name,
      staff_signature: staffSig,
      staff_signed_at: nowIso,
      manager_name: null,
      manager_signature: null,
      manager_signed_at: null,
      created_at: nowIso,
    };
    await saveHandover(record);

    if (effectiveEndOfDay) {
      // ปิดรอบวันให้ "วันธุรกิจของกะนี้" เท่านั้น (แม้จะกดปิดหลัง 06:45 น. ก็ไม่ไปปิดวันใหม่)
      await supabase
        .from("system_settings")
        .upsert(
          { key: `${EOD_KEY_PREFIX}${businessDate}`, value: { shift_id: activeShift.id, closed_at: nowIso } },
          { onConflict: "key" }
        );
    }

    await logActivity({
      category: "shift",
      action: "update",
      staffName: operatorName || activeShift.staff_name,
      shiftName: activeShift.staff_name,
      target: `ปิดกะ ${activeShift.staff_name}`,
      details: `ปิดกะและส่งเงิน ${activeShift.staff_name} (เงินในลิ้นชักตามระบบ ${fmt(drawerCash)}, กันมัดจำกุญแจ ${fmt(
        closeReserve
      )}, ต้องส่ง ${fmt(requiredSend)}, ส่งจริง ${fmt(actualSendNum)}, ${sendDiff >= 0 ? "เกิน" : "ขาด"} ${fmt(
        Math.abs(sendDiff)
      )}${effectiveEndOfDay ? ` • ปิดรอบวัน EOD (${businessDate})` : ""}) • รอผู้จัดการเซ็นรับ`,
    });

    // ปิดกะแล้วออกจากระบบทันที ป้องกันคนอื่นใช้งานต่อในชื่อกะเดิม
    localStorage.removeItem("auth_user");
    window.location.href = "/";
  };

  if (loading) return <div className="text-xs opacity-50">Checking shift...</div>;

  const isRealShift = !!activeShift && activeShift.id !== "dummy-shift-id";

  return (
    <div>
      {!activeShift ? (
        <button
          onClick={() => setShowOpenModal(true)}
          className={`bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95 ${
            compact ? "px-3 py-1.5 rounded-xl text-xs" : "px-4 py-1.5 rounded-full text-sm animate-pulse"
          }`}
        >
          <span>เปิดกะ {compact ? "" : "(Open Shift)"}</span>
        </button>
      ) : compact ? (
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 sm:px-2.5 py-1 rounded-xl">
            <span className="text-slate-500 font-medium">กะ:</span>
            <span className="font-bold text-slate-800">{activeShift.staff_name}</span>
            {currentUser?.name && currentUser.name !== activeShift.staff_name && (
              <span className="text-indigo-700 font-bold">({currentUser.name})</span>
            )}
            <span className="text-slate-300">|</span>
            <span className="text-emerald-600 font-bold" title="เงินสดในลิ้นชักตามระบบ">
              ฿{activeShift.expected_cash.toLocaleString()}
            </span>
          </div>
          {!hideExpense && isRealShift && <ShiftExpenseButton compact />}
          {isRealShift && (
            <button
              onClick={() => setShowHandoverModal(true)}
              className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2 sm:px-2.5 py-1 rounded-xl text-xs font-bold transition-colors active:scale-95"
              title="ส่งเงินระหว่างกะ (ยังไม่ปิดกะ)"
            >
              💵 ส่งเงิน
            </button>
          )}
          <button
            onClick={() => setShowCloseModal(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white px-2.5 sm:px-3 py-1 rounded-xl text-xs font-bold transition-colors active:scale-95"
          >
            ปิดกะ
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500 font-medium">
              กะปัจจุบัน: <span className="text-slate-800 font-bold">{activeShift.staff_name}</span>
              {currentUser?.name && currentUser.name !== activeShift.staff_name && (
                <span className="text-indigo-700 font-bold ml-1">(ผู้ใช้: {currentUser.name})</span>
              )}
            </div>
            <div className="text-[10px] text-emerald-600 font-bold">
              เงินในลิ้นชัก: ฿{activeShift.expected_cash.toLocaleString()}
            </div>
          </div>
          {isRealShift && (
            <button
              onClick={() => setShowExpenseModal(true)}
              className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1.5 rounded-full text-sm font-bold shadow-sm"
            >
              บันทึกรายจ่าย
            </button>
          )}
          {isRealShift && (
            <button
              onClick={() => setShowHandoverModal(true)}
              className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-3 py-1.5 rounded-full text-sm font-bold shadow-sm"
            >
              💵 ส่งเงิน
            </button>
          )}
          <button
            onClick={() => setShowCloseModal(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-full text-sm font-bold shadow-sm"
          >
            ปิดกะ
          </button>
        </div>
      )}

      {showExpenseModal && (
        <ShiftExpenseButton hideTrigger openExternally onCloseExternal={() => setShowExpenseModal(false)} />
      )}
      {showHandoverModal && <CashHandoverModal onClose={() => setShowHandoverModal(false)} />}

      {/* OPEN SHIFT MODAL */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-black text-slate-800 mb-4">เปิดกะ (Open Shift)</h3>

              {errorMsg && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{errorMsg}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อพนักงาน (Staff Name)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full uppercase p-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น ADMIN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN 4 หลัก</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-center tracking-[0.5em] text-xl p-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    placeholder="••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">เงินสดตั้งต้นในลิ้นชัก (นับจริง)</label>
                  <input
                    type="number"
                    value={initialCash}
                    onChange={(e) => setInitialCash(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  {suggestedReserve !== null && (
                    <p className="text-[11px] text-amber-700 mt-1 font-bold">
                      🔑 ควรมีเงินสดสำรองมัดจำกุญแจในลิ้นชักอย่างน้อย {fmt(suggestedReserve)} (ตามห้องที่ยังไม่เช็คเอาท์)
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowOpenModal(false)}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl"
              >
                ยกเลิก
              </button>
              <button onClick={handleOpenShift} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl">
                ยืนยันการเปิดกะ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE SHIFT MODAL */}
      {showCloseModal && activeShift && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[95vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 bg-slate-800 text-white">
              <h3 className="text-lg font-black">🔒 ปิดกะและส่งเงิน (Close Shift)</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                พนักงาน: {activeShift.staff_name} • ยืนยันแล้วระบบจะออกจากระบบให้ทันที
              </p>
            </div>

            {closeLoading ? (
              <div className="p-8 text-center text-slate-500 animate-pulse font-bold">กำลังคำนวณเงินสดในลิ้นชัก...</div>
            ) : (
              <div className="p-5 space-y-4">
                {errorMsg && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg font-bold">{errorMsg}</div>}

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>เงินสดตั้งต้นในลิ้นชัก</span>
                    <span className="font-bold">{fmt(closeDrawer?.initialCash || 0)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>+ รับเงินสดในกะนี้</span>
                    <span className="font-bold">+{fmt(closeDrawer?.cashIn || 0)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600">
                    <span>- ค่าใช้จ่ายเงินสด</span>
                    <span className="font-bold">-{fmt(closeDrawer?.expenses || 0)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600">
                    <span>- คืนเงินสด (มัดจำกุญแจ/เงินทอน)</span>
                    <span className="font-bold">-{fmt(closeDrawer?.refunds || 0)}</span>
                  </div>
                  {(closeDrawer?.handedOut || 0) !== 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>- ส่งเงินระหว่างกะไปแล้ว</span>
                      <span className="font-bold">-{fmt(closeDrawer?.handedOut || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>= เงินสดในลิ้นชักตามระบบ</span>
                    <span>{fmt(drawerCash)}</span>
                  </div>
                  <div className="flex justify-between text-amber-800 font-bold">
                    <span>- กันเงินมัดจำกุญแจคงเหลือ ({closeReserveRooms.length} ห้อง) ทิ้งไว้ให้กะถัดไป</span>
                    <span>-{fmt(closeReserve)}</span>
                  </div>
                  <div
                    className={`flex justify-between font-black text-base pt-1.5 border-t border-slate-200 ${
                      requiredSend >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    <span>{requiredSend >= 0 ? "👉 ยอดเงินสดที่ต้องส่ง" : "⚠️ เงินสดขาด (ผู้จัดการต้องเติม)"}</span>
                    <span>{fmt(Math.abs(requiredSend))}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    ยอดเงินสดที่ส่งจริง (หลังกันมัดจำกุญแจไว้ในลิ้นชักแล้ว)
                  </label>
                  <input
                    type="number"
                    value={actualSend}
                    onChange={(e) => setActualSend(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full text-2xl text-center font-black p-3 rounded-xl border border-blue-200 bg-blue-50 focus:ring-2 focus:ring-blue-500 outline-none text-blue-700"
                    placeholder={String(Math.max(0, requiredSend))}
                  />
                  {actualSend !== "" && sendDiff !== 0 && (
                    <p className={`text-xs mt-1 font-bold ${sendDiff > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {sendDiff > 0 ? "เงินสดเกิน (+)" : "เงินสดขาด (-)"}: {fmt(Math.abs(sendDiff))}
                    </p>
                  )}
                </div>

                <SignaturePad ref={staffSigRef} label="ลายเซ็นพนักงานผู้ส่งกะ" />
                <p className="text-[11px] text-slate-500 -mt-2">
                  * ผู้จัดการจะเซ็นรับภายหลังในหน้ารายงาน (กล่องเงินสด) เมื่อเปิดตู้/ซองรับเงิน
                </p>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN ยืนยัน (เจ้าของกะ)</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={closePin}
                    onChange={(e) => setClosePin(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-center tracking-[0.5em] text-xl p-3 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none"
                    placeholder="••••"
                  />
                </div>

                <label
                  className={`flex items-start gap-3 border p-3.5 rounded-xl ${
                    shiftLock.canCloseEod && !shiftLock.locked
                      ? "bg-indigo-50 border-indigo-100 cursor-pointer"
                      : "bg-slate-50 border-slate-200 cursor-not-allowed"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={effectiveEndOfDay}
                    disabled={!shiftLock.canCloseEod || shiftLock.locked}
                    onChange={(e) => setIsEndOfDay(e.target.checked)}
                    className="w-5 h-5 mt-0.5 text-indigo-600 rounded"
                  />
                  <span className="text-sm font-bold text-indigo-800">
                    นี่คือกะสุดท้ายของวัน (สรุปปิดยอดประจำวัน)
                    {shiftLock.businessDate && (
                      <span className="block text-[11px] font-semibold text-slate-500 mt-0.5">
                        ปิดรอบวันธุรกิจ{" "}
                        {new Date(`${shiftLock.businessDate}T00:00:00`).toLocaleDateString("th-TH", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {!shiftLock.canCloseEod && " • ติ๊กได้ตั้งแต่ 05:30 น. ของวันถัดไป"}
                        {shiftLock.locked && " • เลย 06:30 น. แล้ว ระบบบังคับเป็นกะสุดท้ายของวันอัตโนมัติ"}
                      </span>
                    )}
                  </span>
                </label>
              </div>
            )}

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex gap-3 sticky bottom-0">
              <button
                onClick={resetCloseState}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCloseShift}
                disabled={closeLoading || closeSaving || actualSend === "" || closePin.length < 4}
                className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-xl disabled:opacity-50"
              >
                {closeSaving ? "กำลังปิดกะ..." : "ยืนยันส่งกะ & ออกจากระบบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
