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
  EOD_LOC_KEY_PREFIX,
  fetchLastClosedDrawer,
  fetchShiftMetadata,
  getShiftBusinessDateStr,
  inferShiftLocation,
  LastClosedDrawerInfo,
  markLastClosedDrawerConsumed,
  newHandoverId,
  resolveBusinessDateForNewShift,
  saveHandover,
  saveLastClosedDrawer,
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
  const { activeShift, openShifts, switchActiveShift, currentUser, operatorName, loading, refreshShift, shiftLock } = useShift();
  const { getNow } = useSimulatedTime();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Open Shift State
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [shiftLocation, setShiftLocation] = useState<string>("");
  const [availableLocations, setAvailableLocations] = useState<string[]>(["ซอย1", "ซอย2", "ซามีญ่า"]);
  const [initialCash, setInitialCash] = useState<number | "">(0);
  const [suggestedReserve, setSuggestedReserve] = useState<number | null>(null);
  const [suggestedReserveRoomsCount, setSuggestedReserveRoomsCount] = useState<number>(0);
  const [lastClosedDrawer, setLastClosedDrawer] = useState<LastClosedDrawerInfo | null>(null);
  const [openCashConfirmed, setOpenCashConfirmed] = useState<boolean>(false);
  const [openCashMode, setOpenCashMode] = useState<"matched" | "custom">("matched");
  const [errorMsg, setErrorMsg] = useState("");

  // Close Shift State
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeDrawer, setCloseDrawer] = useState<ShiftDrawer | null>(null);
  const [closeReserve, setCloseReserve] = useState(0);
  const [closeReserveRooms, setCloseReserveRooms] = useState<HeldKeyDepositRoom[]>([]);
  const [carriedToNextShift, setCarriedToNextShift] = useState<number | "">(0);
  const [negCloseMode, setNegCloseMode] = useState<"manager_topup" | "leave_as_is">("manager_topup");
  const [actualSend, setActualSend] = useState<number | "">("");
  const [closePin, setClosePin] = useState("");
  const [isEndOfDay, setIsEndOfDay] = useState(false);
  const staffSigRef = useRef<SignaturePadHandle>(null);

  const isMgr = !currentUser || currentUser.role === "admin" || currentUser.role === "manager";
  const staffPrimaryLocation =
    currentUser?.role === "staff"
      ? currentUser.primary_location ||
        currentUser.locations?.[0] ||
        inferShiftLocation(currentUser.name, null, currentUser.locations)
      : null;

  // โหลดรายชื่อสถานที่จากตาราง rooms
  useEffect(() => {
    supabase
      .from("rooms")
      .select("location")
      .then(({ data }) => {
        if (data && data.length > 0) {
          const locs = Array.from(new Set(data.map((r: any) => r.location).filter(Boolean))) as string[];
          if (locs.length > 0) setAvailableLocations(locs.sort());
        }
      });
  }, []);

  // เปิดหน้าต่างเปิดกะ: ตั้งชื่อและสถานที่เริ่มต้นตามพนักงานที่ล็อกอินอยู่ (สำหรับ staff ล็อกเป็นสถานที่หลักทันที)
  useEffect(() => {
    if (!showOpenModal) return;
    const defaultName = name || currentUser?.name || "";
    if (!name && currentUser?.name) setName(currentUser.name);

    if (currentUser?.role === "staff" && staffPrimaryLocation) {
      setShiftLocation(staffPrimaryLocation);
      return;
    }

    const allowedLocs =
      currentUser?.role === "staff" && currentUser?.locations && currentUser.locations.length > 0
        ? availableLocations.filter((l) => currentUser.locations!.includes(l))
        : availableLocations;
    const openLocSet = new Set(openShifts.map((s) => s.shift_location).filter(Boolean));
    const inferred = inferShiftLocation(defaultName, null, allowedLocs);
    const firstUnopened = allowedLocs.find((l) => !openLocSet.has(l));
    const chosenLoc =
      (inferred && !openLocSet.has(inferred) ? inferred : null) ||
      firstUnopened ||
      inferred ||
      allowedLocs[0] ||
      availableLocations[0] ||
      "ซอย1";
    setShiftLocation(chosenLoc);
  }, [showOpenModal, staffPrimaryLocation]);

  // เมื่อเปลี่ยนชื่อในหน้าเปิดกะ (เฉพาะกรณี Admin/Manager เป็นคนเปิดกะ): หากชื่อตรงกับสถานที่ ให้เลือกสถานที่นั้นให้อัตโนมัติ
  useEffect(() => {
    if (!showOpenModal || !name.trim()) return;
    if (currentUser?.role === "staff" && staffPrimaryLocation) {
      setShiftLocation(staffPrimaryLocation);
      return;
    }
    const inferred = inferShiftLocation(name, null);
    if (inferred && availableLocations.includes(inferred)) {
      setShiftLocation(inferred);
    }
  }, [name, showOpenModal, availableLocations, currentUser?.role, staffPrimaryLocation]);

  // เปิดหน้าต่างเปิดกะ หรือเปลี่ยนสถานที่: ดึงมัดจำกุญแจคงเหลือ + เงินทอนส่งต่อจากกะก่อนหน้าของสถานที่นั้น
  useEffect(() => {
    if (!showOpenModal) return;
    const loc = shiftLocation || staffPrimaryLocation || "ซอย1";
    Promise.all([
      fetchActiveKeyDeposits(undefined, loc),
      fetchLastClosedDrawer(loc),
    ]).then(([r, lastDrawer]) => {
      setSuggestedReserve(r.total);
      setSuggestedReserveRoomsCount(r.rooms.length);
      setLastClosedDrawer(lastDrawer);
      const unconsumedCarry =
        lastDrawer && !lastDrawer.consumed_by_shift_id ? Math.max(0, Number(lastDrawer.carried_cash || 0)) : 0;
      const expectedTotal =
        lastDrawer && !lastDrawer.consumed_by_shift_id && Number.isFinite(Number(lastDrawer.total_in_drawer))
          ? Math.max(0, Number(lastDrawer.total_in_drawer))
          : r.total + unconsumedCarry;
      setInitialCash(expectedTotal);
      setOpenCashMode("matched");
      // หากยอดคาดหมายเป็น 0 ให้ถือว่ายืนยันได้ทันที แต่ถ้ามีเงินส่งต่อหรือมัดจำในลิ้นชัก ให้พนักงานกดปุ่มยืนยันตรวจนับเงินก่อน
      setOpenCashConfirmed(expectedTotal === 0);
    });
  }, [showOpenModal, shiftLocation, staffPrimaryLocation]);

  // ตรวจสอบแบบ Real-time ทันทีเมื่อกดปุ่ม "เปิดกะ" เพื่อป้องกันการเปิดกะซ้ำซ้อนในสถานที่เดียวกัน (Layer 2)
  const handleRequestOpenModal = async () => {
    setErrorMsg("");
    try {
      const { data: existingOpenShifts } = await supabase
        .from("shifts")
        .select("id, staff_name, start_time")
        .eq("status", "open");

      if (existingOpenShifts && existingOpenShifts.length > 0 && currentUser?.role === "staff" && staffPrimaryLocation) {
        const meta = await fetchShiftMetadata(existingOpenShifts);
        const conflict = existingOpenShifts.find((s) => {
          const loc = meta[s.id]?.shift_location || inferShiftLocation(s.staff_name, null);
          return loc === staffPrimaryLocation;
        });
        if (conflict) {
          localStorage.setItem("active_shift_id", conflict.id);
          await refreshShift();
          alert(
            `ℹ️ สถานที่ "${staffPrimaryLocation}" มีกะของ ${conflict.staff_name} เปิดใช้งานอยู่แล้ว\nระบบได้เชื่อมเข้ากะปัจจุบันให้เรียบร้อยครับ (ไม่ต้องเปิดกะซ้ำ)`
          );
          return;
        }
      }
    } catch (e) {}
    setShowOpenModal(true);
  };

  // เปิดหน้าต่างปิดกะ: คำนวณเงินในลิ้นชัก + มัดจำกุญแจคงเหลือปัจจุบัน (เฉพาะสถานที่ของกะนั้น)
  useEffect(() => {
    if (!showCloseModal || !activeShift) return;
    (async () => {
      setCloseLoading(true);
      const [d, keyDep] = await Promise.all([
        computeShiftDrawer(activeShift),
        fetchActiveKeyDeposits(undefined, activeShift.shift_location || null),
      ]);
      setCloseDrawer(d);
      setCloseReserve(keyDep.total);
      setCloseReserveRooms(keyDep.rooms);
      setCarriedToNextShift(0);
      const initNet = (d?.drawer || 0) - keyDep.total;
      setNegCloseMode("manager_topup");
      setActualSend(initNet);
      setCloseLoading(false);
    })();
  }, [showCloseModal, activeShift?.id, activeShift?.shift_location]);

  const unconsumedCarryFromPrev =
    lastClosedDrawer && !lastClosedDrawer.consumed_by_shift_id
      ? Math.max(0, Number(lastClosedDrawer.carried_cash || 0))
      : 0;
  const expectedOpenDrawerTotal =
    lastClosedDrawer && !lastClosedDrawer.consumed_by_shift_id && Number.isFinite(Number(lastClosedDrawer.total_in_drawer))
      ? Math.max(0, Number(lastClosedDrawer.total_in_drawer))
      : (suggestedReserve || 0) + unconsumedCarryFromPrev;
  const prevDrawerShortfall = Math.max(0, (suggestedReserve || 0) - expectedOpenDrawerTotal);
  const openCashDiff = (initialCash === "" ? 0 : Number(initialCash)) - expectedOpenDrawerTotal;

  const handleOpenShift = async () => {
    setErrorMsg("");
    if (initialCash === "") {
      setErrorMsg("กรุณาระบุเงินสดตั้งต้นในลิ้นชัก (ใส่ 0 ก็ได้)");
      return;
    }
    if (expectedOpenDrawerTotal > 0 && !openCashConfirmed) {
      setErrorMsg(
        `กรุณาตรวจนับเงินสดในลิ้นชักแล้วกดปุ่ม "✅ นับเงินในลิ้นชักครบตรงกัน (${fmt(expectedOpenDrawerTotal)})" หรือระบุยอดที่นับได้จริงเพื่อยืนยันก่อนเปิดกะ`
      );
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

    let chosenLocation = shiftLocation || inferShiftLocation(staffData.name, null) || availableLocations[0] || "ซอย1";

    // ตรวจสอบสิทธิ์สถานที่หลักของพนักงาน (กรณีเป็น staff บังคับเปิดกะได้เฉพาะสถานที่หลักประจำตัว)
    if (String(staffData.role).toLowerCase() === "staff") {
      const [{ data: locSetting }, { data: primSetting }] = await Promise.all([
        supabase.from("system_settings").select("value").eq("key", "staff_locations").maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "staff_primary_locations").maybeSingle(),
      ]);
      const staffAllowed: string[] = locSetting?.value?.[staffData.id] || [];
      const savedPrim: string | undefined = primSetting?.value?.[staffData.id];
      const staffPrimary =
        (savedPrim && staffAllowed.includes(savedPrim) ? savedPrim : null) ||
        staffAllowed[0] ||
        inferShiftLocation(staffData.name, null, staffAllowed);

      if (staffPrimary && chosenLocation !== staffPrimary) {
        setErrorMsg(
          `พนักงาน ${staffData.name} มีสถานที่หลักประจำตัวคือ "⭐ ${staffPrimary}" จึงเปิดกะได้เฉพาะที่ "${staffPrimary}" เท่านั้น`
        );
        setShiftLocation(staffPrimary);
        return;
      }
      if (staffAllowed.length > 0 && !staffAllowed.includes(chosenLocation)) {
        setErrorMsg(`พนักงาน ${staffData.name} ไม่มีสิทธิ์เปิดกะที่ "${chosenLocation}" (สิทธิ์ที่มี: ${staffAllowed.join(", ")})`);
        return;
      }
    }

    // ตรวจสอบว่ามีกะที่เปิดค้างอยู่ใน "สถานที่เดียวกัน" หรือไม่ (แต่ละสถานที่เปิดกะแยกกันได้อิสระ)
    const { data: existingOpenShifts } = await supabase
      .from("shifts")
      .select("id, staff_name, start_time")
      .eq("status", "open");

    if (existingOpenShifts && existingOpenShifts.length > 0) {
      const meta = await fetchShiftMetadata(existingOpenShifts);
      const conflict = existingOpenShifts.find((s) => {
        const loc = meta[s.id]?.shift_location || inferShiftLocation(s.staff_name, null);
        return loc === chosenLocation;
      });
      if (conflict) {
        localStorage.setItem("active_shift_id", conflict.id);
        setShowOpenModal(false);
        setName("");
        setPin("");
        await refreshShift();
        alert(
          `ℹ️ สถานที่ "${chosenLocation}" มีกะของ ${conflict.staff_name} เปิดใช้งานอยู่แล้ว\nระบบได้เชื่อมเข้ากะปัจจุบันให้เรียบร้อยครับ (ป้องกันการเปิดกะซ้ำซ้อน)`
        );
        return;
      }
    }

    const nowOpenIso = getNow().toISOString();
    const newShiftBD = await resolveBusinessDateForNewShift(getNow(), chosenLocation);

    const { data: insertedShift, error: shiftError } = await supabase
      .from("shifts")
      .insert({
        staff_id: staffData.id,
        staff_name: staffData.name,
        start_time: nowOpenIso,
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

    // ผูกวันธุรกิจและสถานที่เข้ากับกะโดยตรง
    await saveShiftBusinessDate(insertedShift.id, newShiftBD, chosenLocation);

    // Layer 3: ป้องกันกรณี 2 เครื่องกดปุ่มยืนยันเปิดกะในเสี้ยววินาทีเดียวกันเป๊ะ (Millisecond Race Condition)
    const { data: postInsertOpenShifts } = await supabase
      .from("shifts")
      .select("id, staff_name, start_time")
      .eq("status", "open")
      .order("start_time", { ascending: true });

    if (postInsertOpenShifts && postInsertOpenShifts.length > 1) {
      const postMeta = await fetchShiftMetadata(postInsertOpenShifts);
      const sameLocShifts = postInsertOpenShifts
        .filter((s) => {
          const loc = postMeta[s.id]?.shift_location || inferShiftLocation(s.staff_name, null);
          return loc === chosenLocation;
        })
        .sort((a, b) => {
          const tDiff = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
          if (tDiff !== 0) return tDiff;
          return String(a.id).localeCompare(String(b.id));
        });

      if (sameLocShifts.length > 1 && sameLocShifts[0].id !== insertedShift.id) {
        // มีอีกเครื่องเปิดกะที่สถานที่เดียวกันก่อนเสี้ยววินาที → ยกเลิกแถวที่ซ้ำนี้และเชื่อมเข้ากับกะหลักทันที
        await supabase.from("shifts").delete().eq("id", insertedShift.id);
        await supabase.from("system_settings").delete().eq("key", `shift_bd_${insertedShift.id}`);
        localStorage.setItem("active_shift_id", sameLocShifts[0].id);
        setShowOpenModal(false);
        setName("");
        setPin("");
        await refreshShift();
        alert(
          `ℹ️ ระบบตรวจพบว่า ${sameLocShifts[0].staff_name} เพิ่งเปิดกะที่ "${chosenLocation}" พร้อมกันพอดี\nจึงเชื่อมเข้ากะของ ${sameLocShifts[0].staff_name} ให้อัตโนมัติเพื่อไม่ให้เกิดกะซ้ำซ้อนครับ`
        );
        return;
      }
    }

    localStorage.setItem("active_shift_id", insertedShift.id);
    await markLastClosedDrawerConsumed(chosenLocation, insertedShift.id, Number(initialCash || 0), nowOpenIso);

    await logActivity({
      category: "shift",
      action: "create",
      staffName: staffData.name,
      shiftName: `${staffData.name} (${chosenLocation})`,
      target: `เปิดกะ ${staffData.name} • ${chosenLocation}`,
      details: `เปิดกะการทำงานที่ "${chosenLocation}" โดย ${staffData.name} (เงินสดตั้งต้นในลิ้นชัก ${fmt(Number(initialCash || 0))} • มัดจำกุญแจ ${fmt(
        suggestedReserve || 0
      )} + เงินส่งต่อจากกะก่อนหน้า ${fmt(unconsumedCarryFromPrev)} = ยอดที่ควรมี ${fmt(expectedOpenDrawerTotal)}${
        openCashDiff !== 0 ? ` • ⚠️ ต่างจากยอดส่งต่อ ${openCashDiff > 0 ? "+" : ""}${fmt(openCashDiff)}` : " • ✅ ยืนยันนับเงินตรงกัน"
      })`,
    });

    setShowOpenModal(false);
    setName("");
    setPin("");
    setInitialCash(0);
    setOpenCashConfirmed(false);
    refreshShift();
  };

  const resetCloseState = () => {
    setShowCloseModal(false);
    setClosePin("");
    setCarriedToNextShift(0);
    setNegCloseMode("manager_topup");
    setActualSend("");
    setIsEndOfDay(false);
    setErrorMsg("");
    staffSigRef.current?.clear();
  };

  const drawerCash = closeDrawer?.drawer || 0;
  const netCashBeforeCarry = drawerCash - closeReserve;
  const isShortForReserve = netCashBeforeCarry < 0;
  const carriedNum = isShortForReserve
    ? 0
    : carriedToNextShift === ""
    ? 0
    : Math.max(0, Number(carriedToNextShift || 0));
  const requiredSend = isShortForReserve
    ? negCloseMode === "leave_as_is"
      ? 0
      : netCashBeforeCarry
    : netCashBeforeCarry - carriedNum;
  const nextShiftDrawerTotal = isShortForReserve
    ? negCloseMode === "leave_as_is"
      ? Math.max(0, drawerCash)
      : closeReserve
    : closeReserve + carriedNum;
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

    const nowIso = getNow().toISOString();
    const countedDrawer = drawerCash + sendDiff;

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
    const shiftLoc = activeShift.shift_location || inferShiftLocation(activeShift.staff_name, null);
    const handoverNote = isShortForReserve
      ? negCloseMode === "leave_as_is"
        ? `ยังไม่เติมมัดจำที่ขาด ${fmt(Math.abs(netCashBeforeCarry))} (ทิ้งเงินไว้เท่าที่มี ${fmt(nextShiftDrawerTotal)})`
        : `ผู้จัดการเติมเงินมัดจำที่ขาด ${fmt(Math.abs(netCashBeforeCarry))} (ครบมัดจำ ${fmt(closeReserve)})`
      : carriedNum > 0
      ? `เหลือเงินทอนส่งต่อกะหน้า ${fmt(carriedNum)} (รวมในลิ้นชัก ${fmt(nextShiftDrawerTotal)})`
      : null;
    const record: CashHandover = {
      id: newHandoverId(),
      business_date: businessDate,
      shift_id: activeShift.id,
      shift_staff_name: activeShift.staff_name,
      shift_location: shiftLoc,
      kind: "shift_close",
      drawer_cash: drawerCash,
      key_reserve: closeReserve,
      key_reserve_rooms: closeReserveRooms.length,
      carried_to_next_shift: carriedNum,
      next_shift_drawer_total: nextShiftDrawerTotal,
      required_amount: requiredSend,
      actual_amount: actualSendNum,
      staff_name: activeShift.staff_name,
      staff_signature: staffSig,
      staff_signed_at: nowIso,
      manager_name: null,
      manager_signature: null,
      manager_signed_at: null,
      note: handoverNote,
      created_at: nowIso,
    };
    await saveHandover(record);
    await saveLastClosedDrawer({
      shift_id: activeShift.id,
      staff_name: activeShift.staff_name,
      shift_location: shiftLoc || "ซอย1",
      closed_at: nowIso,
      business_date: businessDate,
      key_reserve: closeReserve,
      key_reserve_rooms: closeReserveRooms.length,
      carried_cash: carriedNum,
      total_in_drawer: nextShiftDrawerTotal,
      sent_to_manager: actualSendNum,
      consumed_by_shift_id: null,
    });

    if (effectiveEndOfDay) {
      if (shiftLoc) {
        await supabase
          .from("system_settings")
          .upsert(
            {
              key: `${EOD_LOC_KEY_PREFIX}${shiftLoc}_${businessDate}`,
              value: { shift_id: activeShift.id, location: shiftLoc, closed_at: nowIso },
            },
            { onConflict: "key" }
          );
      }
      // ปิดรอบวันให้ "วันธุรกิจของกะนี้" เท่านั้น (แม้จะกดปิดหลัง 06:45 น. ก็ไม่ไปปิดวันใหม่)
      await supabase
        .from("system_settings")
        .upsert(
          { key: `${EOD_KEY_PREFIX}${businessDate}`, value: { shift_id: activeShift.id, location: shiftLoc, closed_at: nowIso } },
          { onConflict: "key" }
        );
    }

    await logActivity({
      category: "shift",
      action: "update",
      staffName: operatorName || activeShift.staff_name,
      shiftName: shiftLoc ? `${activeShift.staff_name} (${shiftLoc})` : activeShift.staff_name,
      target: `ปิดกะ ${activeShift.staff_name}${shiftLoc ? ` • ${shiftLoc}` : ""}`,
      details: `ปิดกะและส่งเงิน ${activeShift.staff_name}${shiftLoc ? ` (${shiftLoc})` : ""} (เงินในลิ้นชักตามระบบ ${fmt(drawerCash)}, กันมัดจำกุญแจ ${fmt(
        closeReserve
      )}${carriedNum > 0 ? `, เหลือเงินสดส่งต่อกะถัดไป ${fmt(carriedNum)} [รวมในลิ้นชัก ${fmt(nextShiftDrawerTotal)}]` : ""}, ต้องส่งผู้จัดการ ${fmt(
        requiredSend
      )}, ส่งจริง ${fmt(actualSendNum)}, ${sendDiff >= 0 ? "เกิน" : "ขาด"} ${fmt(
        Math.abs(sendDiff)
      )}${effectiveEndOfDay ? ` • ปิดรอบวัน EOD (${businessDate})` : ""}) • รอผู้จัดการเซ็นรับ`,
    });

    // ปิดกะแล้วออกจากระบบทันที ป้องกันคนอื่นใช้งานต่อในชื่อกะเดิม
    localStorage.removeItem("active_shift_id");
    localStorage.removeItem("auth_user");
    window.location.href = "/";
  };

  if (loading) return <div className="text-xs opacity-50">Checking shift...</div>;

  const isRealShift = !!activeShift && activeShift.id !== "dummy-shift-id";

  return (
    <div>
      {!activeShift ? (
        <button
          onClick={handleRequestOpenModal}
          className={`bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95 ${
            compact ? "px-3 py-1.5 rounded-xl text-xs" : "px-4 py-1.5 rounded-full text-sm animate-pulse"
          }`}
        >
          <span>
            เปิดกะ{staffPrimaryLocation ? ` (⭐ ${staffPrimaryLocation})` : compact ? "" : " (Open Shift)"}
          </span>
        </button>
      ) : compact ? (
        <div className="flex items-center gap-1 text-[11px] flex-wrap">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
            <span className="text-emerald-500 text-[9px]">🟢</span>
            <span className="font-bold text-slate-800">{activeShift.staff_name}</span>
            {activeShift.shift_location && (
              <span className="px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 font-black text-[9.5px]">
                📍{activeShift.shift_location}
              </span>
            )}
            {currentUser?.name && currentUser.name !== activeShift.staff_name && (
              <span className="text-indigo-700 font-bold">({currentUser.name})</span>
            )}
            {isMgr && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-emerald-600 font-bold" title="เงินสดในลิ้นชักตามระบบ">
                  ฿{activeShift.expected_cash.toLocaleString()}
                </span>
              </>
            )}
          </div>
          {isMgr && openShifts.length > 1 && (
            <select
              value={activeShift.id}
              onChange={(e) => switchActiveShift(e.target.value)}
              className="border border-indigo-200 bg-indigo-50 text-indigo-800 rounded-lg px-1.5 py-1 text-[10.5px] font-bold outline-none"
              title="สลับกะที่กำลังเปิดอยู่"
            >
              {openShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  📍{s.shift_location || "-"} ({s.staff_name})
                </option>
              ))}
            </select>
          )}
          {isMgr && openShifts.length < availableLocations.length && (
            <button
              type="button"
              onClick={() => setShowOpenModal(true)}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-1 rounded-lg text-[10.5px] font-bold"
              title="เปิดกะเพิ่มสำหรับสถานที่อื่น"
            >
              +กะอื่น
            </button>
          )}
          {!hideExpense && isRealShift && <ShiftExpenseButton compact />}
          {isRealShift && (
            <button
              onClick={() => setShowHandoverModal(true)}
              className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2 py-1 rounded-lg text-[11px] font-bold transition-colors active:scale-95"
              title="ส่งเงินระหว่างกะ (ยังไม่ปิดกะ)"
            >
              💵 ส่งเงิน
            </button>
          )}
          <button
            onClick={() => setShowCloseModal(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white px-2 py-1 rounded-lg text-[11px] font-bold transition-colors active:scale-95"
          >
            ปิดกะ
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500 font-medium flex items-center justify-end gap-1">
              <span>กะปัจจุบัน:</span>
              <span className="text-slate-800 font-bold">{activeShift.staff_name}</span>
              {activeShift.shift_location && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-black text-[10px]">
                  📍{activeShift.shift_location}
                </span>
              )}
              {currentUser?.name && currentUser.name !== activeShift.staff_name && (
                <span className="text-indigo-700 font-bold ml-1">(ผู้ใช้: {currentUser.name})</span>
              )}
            </div>
            {isMgr && (
              <div className="text-[10px] text-emerald-600 font-bold">
                เงินในลิ้นชัก{activeShift.shift_location ? ` (${activeShift.shift_location})` : ""}: ฿{activeShift.expected_cash.toLocaleString()}
              </div>
            )}
          </div>
          {isMgr && openShifts.length > 1 && (
            <select
              value={activeShift.id}
              onChange={(e) => switchActiveShift(e.target.value)}
              className="border border-indigo-200 bg-indigo-50 text-indigo-800 rounded-full px-2.5 py-1 text-xs font-bold outline-none"
              title="สลับกะที่กำลังเปิดอยู่"
            >
              {openShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  📍{s.shift_location || "-"} ({s.staff_name})
                </option>
              ))}
            </select>
          )}
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

              {errorMsg && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4 font-bold">{errorMsg}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อพนักงาน (Staff Name)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={currentUser?.role === "staff" && !!currentUser.name}
                    className="w-full uppercase p-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-600 font-bold"
                    placeholder="เช่น ซอย2"
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
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    สถานที่ประจำกะ (ลิ้นชักเงินสด)
                  </label>
                  {currentUser?.role === "staff" && staffPrimaryLocation ? (
                    <div className="space-y-2">
                      <div className="p-3 rounded-xl bg-indigo-600 text-white border-2 border-indigo-700 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">⭐</span>
                          <div>
                            <div className="text-sm font-black">สถานที่หลัก: {staffPrimaryLocation}</div>
                            <div className="text-[11px] text-indigo-100">ล็อกสถานที่เปิดกะตามบัญชีผู้ใช้งาน</div>
                          </div>
                        </div>
                        <span className="bg-amber-300 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full">
                          สถานที่หลัก
                        </span>
                      </div>
                      {(currentUser.locations?.length || 0) > 1 && (
                        <p className="text-[11px] text-slate-500">
                          💡 สถานที่รอง ({currentUser.locations?.filter((l) => l !== staffPrimaryLocation).join(", ")}) สามารถกดสลับดูห้องและรับจองข้ามสถานที่ได้หลังจากเปิดกะแล้ว
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {availableLocations.map((loc) => {
                        const alreadyOpen = openShifts.find((s) => s.shift_location === loc);
                        const active = shiftLocation === loc;
                        return (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => setShiftLocation(loc)}
                            className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center ${
                              active
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                : alreadyOpen
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            <span>📍 {loc}</span>
                            {alreadyOpen && (
                              <span className={`text-[9px] ${active ? "text-emerald-100" : "text-amber-700"}`}>
                                เปิดอยู่ ({alreadyOpen.staff_name})
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* กล่องตรวจสอบและยืนยันเงินสดในลิ้นชักจากกะก่อนหน้า */}
                <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-950">
                      📦 เงินในลิ้นชักจากกะก่อน {shiftLocation ? `(${shiftLocation})` : ""}
                    </span>
                    {lastClosedDrawer && !lastClosedDrawer.consumed_by_shift_id && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-700 text-white">
                        จากกะ {lastClosedDrawer.staff_name}
                      </span>
                    )}
                  </div>

                  <div className="bg-white rounded-lg border border-emerald-200/80 p-2.5 space-y-1 text-xs">
                    <div className="flex justify-between text-amber-800 font-semibold">
                      <span>🔑 มัดจำกุญแจ ({suggestedReserveRoomsCount} ห้อง)</span>
                      <span className="font-bold">{fmt(suggestedReserve || 0)}</span>
                    </div>
                    {prevDrawerShortfall > 0 ? (
                      <div className="flex justify-between text-rose-600 font-semibold">
                        <span>⚠️ กะก่อนยังไม่เติมเงินมัดจำ</span>
                        <span className="font-bold">-{fmt(prevDrawerShortfall)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-indigo-800 font-semibold">
                        <span>🪙 เงินทอนส่งต่อ</span>
                        <span className="font-bold">+{fmt(unconsumedCarryFromPrev)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 font-black text-slate-900 text-sm">
                      <span>= เงินที่ต้องมีในลิ้นชัก</span>
                      <span className="text-emerald-700 text-base">{fmt(expectedOpenDrawerTotal)}</span>
                    </div>
                  </div>

                  {/* ปุ่มยืนยันการตรวจนับเงินตอนเปิดกะ */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setInitialCash(expectedOpenDrawerTotal);
                        setOpenCashMode("matched");
                        setOpenCashConfirmed(true);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-xs font-black border-2 transition-all flex items-center justify-center gap-1 ${
                        openCashConfirmed && openCashMode === "matched" && Number(initialCash || 0) === expectedOpenDrawerTotal
                          ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                          : "bg-white hover:bg-emerald-100 text-emerald-900 border-emerald-300"
                      }`}
                    >
                      <span>✅ นับเงินตรง ({fmt(expectedOpenDrawerTotal)})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setOpenCashMode("custom");
                        setOpenCashConfirmed(true);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 ${
                        openCashMode === "custom"
                          ? "bg-amber-600 text-white border-amber-700"
                          : "bg-white hover:bg-amber-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      <span>⚠️ ยอดไม่ตรง (ระบุเอง)</span>
                    </button>
                  </div>

                  {openCashMode === "custom" && (
                    <div className="pt-1 space-y-1">
                      <label className="block text-xs font-bold text-slate-700">
                        ระบุเงินสดที่นับได้จริงในลิ้นชัก {shiftLocation ? `(${shiftLocation})` : ""}
                      </label>
                      <input
                        type="number"
                        value={initialCash}
                        onChange={(e) => {
                          setInitialCash(e.target.value === "" ? "" : Number(e.target.value));
                          setOpenCashConfirmed(true);
                        }}
                        className="w-full p-2 rounded-xl border border-amber-300 bg-white font-black text-base text-slate-900 focus:border-amber-500 outline-none"
                      />
                      {initialCash !== "" && openCashDiff !== 0 && (
                        <p className={`text-[11px] font-bold ${openCashDiff > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {openCashDiff > 0 ? "เกินจากยอดส่งต่อ (+)" : "ขาดจากยอดส่งต่อ (-)"}: {fmt(Math.abs(openCashDiff))}
                        </p>
                      )}
                    </div>
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
            <div className="px-5 py-3.5 bg-slate-800 text-white">
              <h3 className="text-base font-black">🔒 ปิดกะและส่งเงิน (Close Shift)</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                พนักงาน: {activeShift.staff_name} {activeShift.shift_location ? `• 📍${activeShift.shift_location}` : ""}
              </p>
            </div>

            {closeLoading ? (
              <div className="p-8 text-center text-slate-500 animate-pulse font-bold">กำลังคำนวณเงินสดในลิ้นชัก...</div>
            ) : (
              <div className="p-4 space-y-3">
                {errorMsg && <div className="bg-red-50 text-red-600 text-xs p-2.5 rounded-lg font-bold">{errorMsg}</div>}

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>เงินตั้งต้น</span>
                    <span className="font-bold">{fmt(closeDrawer?.initialCash || 0)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>+ รับเงินสด</span>
                    <span className="font-bold">+{fmt(closeDrawer?.cashIn || 0)}</span>
                  </div>
                  {(closeDrawer?.expenses || 0) > 0 || (closeDrawer?.refunds || 0) > 0 ? (
                    <>
                      {(closeDrawer?.expenses || 0) > 0 && (
                        <div className="flex justify-between text-rose-600">
                          <span>- ค่าใช้จ่ายเงินสด</span>
                          <span className="font-bold">-{fmt(closeDrawer?.expenses || 0)}</span>
                        </div>
                      )}
                      {(closeDrawer?.refunds || 0) > 0 && (
                        <div className="flex justify-between text-rose-600">
                          <span>- คืนเงินสด/มัดจำ</span>
                          <span className="font-bold">-{fmt(closeDrawer?.refunds || 0)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex justify-between text-rose-600">
                      <span>- รายจ่าย / คืนเงินสด</span>
                      <span className="font-bold">-฿0</span>
                    </div>
                  )}
                  {(closeDrawer?.handedOut || 0) !== 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>- ส่งเงินระหว่างกะแล้ว</span>
                      <span className="font-bold">-{fmt(closeDrawer?.handedOut || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-slate-900 text-sm pt-1 border-t border-slate-200">
                    <span>= เงินสดในลิ้นชัก</span>
                    <span>{fmt(drawerCash)}</span>
                  </div>
                  <div className="flex justify-between text-amber-800 font-bold">
                    <span>- หักมัดจำกุญแจ ({closeReserveRooms.length} ห้อง)</span>
                    <span>-{fmt(closeReserve)}</span>
                  </div>
                  {carriedNum > 0 && (
                    <div className="flex justify-between text-indigo-700 font-bold">
                      <span>- เงินทอนทิ้งไว้กะหน้า</span>
                      <span>-{fmt(carriedNum)}</span>
                    </div>
                  )}
                  <div
                    className={`flex justify-between font-black text-sm pt-1 border-t border-slate-200 ${
                      isShortForReserve ? "text-rose-700" : "text-emerald-700"
                    }`}
                  >
                    <span>
                      {isShortForReserve
                        ? "⚠️ ขาดเงินมัดจำ (ต้องเติม)"
                        : "👉 ยอดต้องส่งผู้จัดการ"}
                    </span>
                    <span>{fmt(Math.abs(isShortForReserve ? netCashBeforeCarry : requiredSend))}</span>
                  </div>
                  <div className="mt-1 pt-1.5 border-t border-dashed border-slate-200 flex justify-between items-center text-xs font-black text-indigo-900 bg-indigo-50/80 px-2.5 py-1.5 rounded-lg">
                    <span>📌 เงินทิ้งไว้ในลิ้นชักให้กะหน้า</span>
                    <span>
                      {fmt(nextShiftDrawerTotal)}
                      {carriedNum > 0 ? ` (มัดจำ ${fmt(closeReserve)} + ทอน ${fmt(carriedNum)})` : ""}
                    </span>
                  </div>
                </div>

                {isShortForReserve ? (
                  /* กรณีเงินสดในลิ้นชักน้อยกว่ามัดจำกุญแจ (ติดลบ): ให้เลือก 2 ปุ่มสั้นๆ เข้าใจง่าย */
                  <div className="rounded-xl border-2 border-rose-200 bg-rose-50/60 p-3 space-y-2">
                    <div className="text-xs font-black text-rose-950">
                      🛠️ มีเงินในลิ้นชัก {fmt(drawerCash)} (ขาดค่ามัดจำ {fmt(Math.abs(netCashBeforeCarry))}) เลือกวิธีปิดกะ:
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNegCloseMode("manager_topup");
                          setActualSend(netCashBeforeCarry);
                        }}
                        className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                          negCloseMode === "manager_topup"
                            ? "bg-rose-600 text-white border-rose-700 shadow-xs"
                            : "bg-white hover:bg-rose-50 text-slate-800 border-slate-200"
                        }`}
                      >
                        <div className="text-xs font-black">➕ ผู้จัดการเติม {fmt(Math.abs(netCashBeforeCarry))}</div>
                        <div className={`text-[10px] mt-0.5 ${negCloseMode === "manager_topup" ? "text-rose-100" : "text-slate-500"}`}>
                          ลิ้นชักครบมัดจำ {fmt(closeReserve)}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setNegCloseMode("leave_as_is");
                          setActualSend(0);
                        }}
                        className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                          negCloseMode === "leave_as_is"
                            ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                            : "bg-white hover:bg-indigo-50 text-slate-800 border-slate-200"
                        }`}
                      >
                        <div className="text-xs font-black">⏭️ ยังไม่เติม (ส่ง ฿0)</div>
                        <div className={`text-[10px] mt-0.5 ${negCloseMode === "leave_as_is" ? "text-indigo-100" : "text-slate-500"}`}>
                          ทิ้งเงินไว้เท่าที่มี {fmt(Math.max(0, drawerCash))}
                        </div>
                      </button>
                    </div>

                    <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800">
                      {negCloseMode === "manager_topup" ? (
                        <span className="text-emerald-700">
                          ✅ ผู้จัดการเติมเงิน <b>{fmt(Math.abs(netCashBeforeCarry))}</b> เข้าลิ้นชัก (ผู้จัดการกดเซ็นในหน้ารายงาน) • ทิ้งเงินไว้ <b>{fmt(closeReserve)}</b>
                        </span>
                      ) : (
                        <span className="text-indigo-800">
                          ✅ ยังไม่เติมเงิน • ทิ้งเงินที่มีในลิ้นชัก <b>{fmt(Math.max(0, drawerCash))}</b> ไว้ให้กะหน้า
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* กรณีปกติ (มีเงินสดเท่ากับหรือมากกว่ามัดจำกุญแจ) */
                  <>
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                      <label className="block text-xs font-black text-indigo-950">
                        🪙 เงินทอนทิ้งไว้ให้กะหน้า
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCarriedToNextShift(0);
                            setActualSend(Math.max(0, netCashBeforeCarry));
                          }}
                          className={`py-2 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                            carriedNum === 0
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                              : "bg-white hover:bg-indigo-50 text-slate-700 border-slate-200"
                          }`}
                        >
                          💵 ส่งผู้จัดการทั้งหมด
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const allCarry = Math.max(0, netCashBeforeCarry);
                            setCarriedToNextShift(allCarry);
                            setActualSend(0);
                          }}
                          className={`py-2 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                            netCashBeforeCarry > 0 && carriedNum === Math.max(0, netCashBeforeCarry)
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                              : "bg-white hover:bg-indigo-50 text-indigo-900 border-indigo-200"
                          }`}
                        >
                          🔄 ทิ้งไว้กะหน้าทั้งหมด ({fmt(Math.max(0, netCashBeforeCarry))})
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-600 shrink-0">ระบุเงินทอน:</span>
                        <input
                          type="number"
                          min={0}
                          value={carriedToNextShift}
                          onChange={(e) => {
                            const val = e.target.value === "" ? "" : Math.max(0, Number(e.target.value));
                            setCarriedToNextShift(val);
                            const numVal = val === "" ? 0 : val;
                            setActualSend(Math.max(0, netCashBeforeCarry - numVal));
                          }}
                          className="flex-1 text-right font-black text-sm p-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-900 focus:ring-1 focus:ring-indigo-500 outline-none"
                          placeholder="0"
                        />
                        <span className="text-xs font-bold text-slate-600">บาท</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        💵 ยอดส่งผู้จัดการจริง
                      </label>
                      <input
                        type="number"
                        value={actualSend}
                        onChange={(e) => setActualSend(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full text-2xl text-center font-black p-2.5 rounded-xl border border-blue-200 bg-blue-50 focus:ring-2 focus:ring-blue-500 outline-none text-blue-700"
                        placeholder={String(Math.max(0, requiredSend))}
                      />
                      {actualSend !== "" && sendDiff !== 0 && (
                        <p className={`text-xs mt-1 font-bold ${sendDiff > 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {sendDiff > 0 ? "เงินเกิน (+)" : "เงินขาด (-)"}: {fmt(Math.abs(sendDiff))}
                        </p>
                      )}
                      {actualSend !== "" && sendDiff === 0 && (
                        <p className="text-xs mt-1 font-bold text-emerald-600">
                          ✅ ยอดตรงตามระบบ (ทิ้งไว้ในลิ้นชัก {fmt(nextShiftDrawerTotal)})
                        </p>
                      )}
                    </div>
                  </>
                )}

                <SignaturePad ref={staffSigRef} label="ลายเซ็นพนักงานผู้ส่งกะ" />
                <p className="text-[11px] text-slate-500 -mt-2">
                  * ผู้จัดการกดเซ็นในหน้ารายงาน (กล่องเงินสด)
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
