"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { computeShiftDrawer, fetchShiftBusinessDates, getShiftCutoffs } from "@/lib/cashHandover";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";

export interface Shift {
  id: string;
  staff_id: string;
  staff_name: string;
  operator_name?: string;
  staff_role?: string;
  housekeeper_only?: boolean;
  can_clean?: boolean;
  locations?: string[];
  start_time: string;
  end_time: string | null;
  initial_cash: number;
  expected_cash: number;
  final_cash: number | null;
  discrepancy: number | null;
  status: 'open' | 'closed';
  signature_data: string | null;
  business_date?: string; // วันธุรกิจที่ผูกกับกะ (YYYY-MM-DD)
}

export interface ShiftLockState {
  locked: boolean; // เลย 06:30 น. ของวันถัดไปแล้ว → ล็อกการทำรายการ (ยกเว้นปิดกะ)
  nearLock: boolean; // 05:30–06:29 น. → ปิดกะสุดท้ายได้แล้ว ใกล้ถึงเวลาล็อก
  canCloseEod: boolean; // ติ๊ก "กะสุดท้ายของวัน" ได้แล้ว
  businessDate: string | null;
  lockFrom: Date | null;
  eodAllowedFrom: Date | null;
  message: string;
}

export interface LoggedInUser {
  id: string;
  name: string;
  role: string;
  locations?: string[];
  can_clean?: boolean;
}

type ShiftContextType = {
  activeShift: Shift | null;
  currentUser: LoggedInUser | null;
  operatorName: string;
  loading: boolean;
  refreshShift: () => Promise<void>;
  shiftLock: ShiftLockState;
  ensureShiftWritable: () => boolean;
};

const DEFAULT_LOCK: ShiftLockState = { locked: false, nearLock: false, canCloseEod: false, businessDate: null, lockFrom: null, eodAllowedFrom: null, message: '' };

const ShiftContext = createContext<ShiftContextType>({
  activeShift: null,
  currentUser: null,
  operatorName: "",
  loading: true,
  refreshShift: async () => {},
  shiftLock: DEFAULT_LOCK,
  ensureShiftWritable: () => true,
});

export const useShift = () => useContext(ShiftContext);

export const ShiftProvider = ({ children }: { children: React.ReactNode }) => {
  const { getNow } = useSimulatedTime();
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [currentUser, setCurrentUser] = useState<LoggedInUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshShift = async () => {
    setLoading(true);

    // Check AuthUser for logged-in user and Housekeeper Dummy Shift
    const saved = localStorage.getItem('auth_user');
    let parsedUser: LoggedInUser | null = null;
    if (saved) {
      try {
        const user = JSON.parse(saved);
        parsedUser = user;
        setCurrentUser(user);
        if (user.role === 'housekeeper') {
          // Dummy shift for housekeeper so cleaning is never blocked
          setActiveShift({
            id: 'dummy-shift-id',
            staff_id: user.id,
            staff_name: user.name,
            operator_name: user.name,
            staff_role: 'housekeeper',
            housekeeper_only: true,
            can_clean: true,
            locations: user.locations || [],
            start_time: new Date().toISOString(),
            end_time: null,
            initial_cash: 0,
            expected_cash: 0,
            final_cash: null,
            discrepancy: null,
            status: 'open',
            signature_data: null
          });
          setLoading(false);
          return;
        }
      } catch (e) {}
    } else {
      setCurrentUser(null);
    }

    // หา shift ที่กำลังเปิดอยู่ (ล่าสุด)
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('status', 'open')
      .order('start_time', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      setActiveShift(null);
    } else {
      
      const shiftData = data as Shift;

      // ดึง Role ของพนักงานที่เปิดกะ
      const { data: staffData } = await supabase
        .from('staff')
        .select('role')
        .eq('id', shiftData.staff_id)
        .single();
      
      if (staffData) {
        shiftData.staff_role = staffData.role;
      }

      // แนบสิทธิ์และชื่อของ staff ที่ล็อกอินอยู่ปัจจุบัน (ซับของกะ)
      if (parsedUser) {
        shiftData.operator_name = parsedUser.name;
        if (parsedUser.role) shiftData.staff_role = parsedUser.role;
        if (parsedUser.locations) shiftData.locations = parsedUser.locations;
        if (parsedUser.can_clean !== undefined) shiftData.can_clean = parsedUser.can_clean;
      } else {
        shiftData.operator_name = shiftData.staff_name;
      }

      // คำนวณยอดเงินสดในลิ้นชักจาก Ledger (รับเงินสด - ค่าใช้จ่าย/คืนเงินสด - ยอดที่ส่งเงินระหว่างกะไปแล้ว)
      const [drawer, bdMap] = await Promise.all([
        computeShiftDrawer(shiftData),
        fetchShiftBusinessDates([shiftData]),
      ]);
      shiftData.expected_cash = drawer.drawer;
      shiftData.business_date = bdMap[shiftData.id];
    
      // อัปเดตตาราง shifts ด้วยเพื่อความแน่ใจ
      supabase.from('shifts').update({ expected_cash: shiftData.expected_cash }).eq('id', shiftData.id).then();
      
      setActiveShift(shiftData);
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshShift();
  }, []);

  const operatorName = currentUser?.name || activeShift?.operator_name || activeShift?.staff_name || "";

  // นาฬิกาสำหรับตรวจล็อกกะข้ามวัน (อัปเดตทุก 20 วินาที รองรับเวลาจำลอง)
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClockTick((x) => x + 1), 20000);
    return () => clearInterval(t);
  }, []);

  const computeLock = (): ShiftLockState => {
    const isReal = !!activeShift && activeShift.id !== 'dummy-shift-id' && !activeShift.housekeeper_only;
    if (!isReal || !activeShift?.business_date) {
      return { locked: false, nearLock: false, canCloseEod: false, businessDate: activeShift?.business_date || null, lockFrom: null, eodAllowedFrom: null, message: '' };
    }
    const bd = activeShift.business_date;
    const { lockFrom, eodAllowedFrom } = getShiftCutoffs(bd);
    const nowMs = getNow().getTime();
    const locked = nowMs >= lockFrom.getTime();
    const canCloseEod = nowMs >= eodAllowedFrom.getTime();
    const bdLabel = new Date(`${bd}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    return {
      locked,
      nearLock: !locked && canCloseEod,
      canCloseEod,
      businessDate: bd,
      lockFrom,
      eodAllowedFrom,
      message: locked
        ? `🔒 เลยเวลาตัดรอบวันใหม่ (06:30 น.) แล้ว\nกะของ ${activeShift.staff_name} (วันที่ ${bdLabel}) ยังไม่ได้ปิด\n\nกรุณา "ปิดกะ" (กะสุดท้ายของวัน) แล้วเปิดกะของวันใหม่ก่อนทำรายการ รับเงิน / เช็คอิน / เพิ่มค่าบริการ-มินิบาร์ / ค่าใช้จ่าย`
        : '',
    };
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shiftLock = React.useMemo(computeLock, [activeShift, clockTick, getNow]);

  /** คืนค่า true ถ้าทำรายการได้ / false (พร้อมแจ้งเตือน) ถ้ากะถูกล็อกข้ามวัน */
  const ensureShiftWritable = () => {
    const s = computeLock();
    if (s.locked) {
      alert(s.message);
      return false;
    }
    return true;
  };

  return (
    <ShiftContext.Provider value={{ activeShift, currentUser, operatorName, loading, refreshShift, shiftLock, ensureShiftWritable }}>
      {children}
    </ShiftContext.Provider>
  );
};
