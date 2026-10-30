"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  addDaysStr,
  computeShiftDrawer,
  EOD_KEY_PREFIX,
  EOD_LOC_KEY_PREFIX,
  fetchShiftMetadata,
  getBusinessDateStr,
  getShiftCutoffs,
  inferShiftLocation,
} from "@/lib/cashHandover";
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
  primary_location?: string | null;
  shift_location?: string | null; // สถานที่ประจำกะ เช่น ซอย1, ซอย2, ซามีญ่า
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
  locked: boolean; // เลย 06:30 น. ของวันถัดไปแล้ว และไม่ได้ปลดล็อกชั่วคราว → ล็อกการทำรายการ (ยกเว้นปิดกะ)
  isPastLockTime?: boolean; // เลยเวลา 06:30 น. แล้วหรือไม่
  tempUnlocked?: boolean; // กำลังปลดล็อกชั่วคราว 30 นาทีหรือไม่
  tempUnlockUntil?: number | null; // เวลาหมดอายุการปลดล็อกชั่วคราว (ms)
  tempUnlockRemainingMin?: number; // จำนวนนาทีที่เหลือ
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
  primary_location?: string | null;
  can_clean?: boolean;
}

type ShiftContextType = {
  activeShift: Shift | null;
  openShifts: Shift[];
  switchActiveShift: (shiftId: string) => void;
  currentUser: LoggedInUser | null;
  operatorName: string;
  loading: boolean;
  refreshShift: () => Promise<void>;
  shiftLock: ShiftLockState;
  ensureShiftWritable: () => boolean;
  unlockShiftTemporarily: (minutes?: number) => void;
  relockShift: () => void;
  currentBusinessDate: string;
  realClockBusinessDate: string;
  closeDayBusinessDate: string;
  closeDayMismatchReason: string | null;
  getActiveBusinessDate: () => Date;
};

const DEFAULT_LOCK: ShiftLockState = {
  locked: false,
  isPastLockTime: false,
  tempUnlocked: false,
  tempUnlockUntil: null,
  tempUnlockRemainingMin: 0,
  nearLock: false,
  canCloseEod: false,
  businessDate: null,
  lockFrom: null,
  eodAllowedFrom: null,
  message: '',
};

const ShiftContext = createContext<ShiftContextType>({
  activeShift: null,
  openShifts: [],
  switchActiveShift: () => {},
  currentUser: null,
  operatorName: "",
  loading: true,
  refreshShift: async () => {},
  shiftLock: DEFAULT_LOCK,
  ensureShiftWritable: () => true,
  unlockShiftTemporarily: () => {},
  relockShift: () => {},
  currentBusinessDate: getBusinessDateStr(new Date()),
  realClockBusinessDate: getBusinessDateStr(new Date()),
  closeDayBusinessDate: getBusinessDateStr(new Date()),
  closeDayMismatchReason: null,
  getActiveBusinessDate: () => new Date(),
});

export const useShift = () => useContext(ShiftContext);

const TEMP_UNLOCK_STORAGE_KEY = 'shift_temp_unlock_until';

export const ShiftProvider = ({ children }: { children: React.ReactNode }) => {
  const { getNow } = useSimulatedTime();
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [openShifts, setOpenShifts] = useState<Shift[]>([]);
  const [currentUser, setCurrentUser] = useState<LoggedInUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [closedEodDates, setClosedEodDates] = useState<Set<string>>(new Set());
  const [closedLocEodKeys, setClosedLocEodKeys] = useState<Set<string>>(new Set());
  const [tempUnlockUntil, setTempUnlockUntil] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = Number(localStorage.getItem(TEMP_UNLOCK_STORAGE_KEY) || 0);
    return raw > Date.now() ? raw : null;
  });

  const refreshShift = async () => {
    setLoading(true);

    // Check AuthUser for logged-in user and Housekeeper Dummy Shift
    const saved = localStorage.getItem('auth_user');
    const preferredShiftId = localStorage.getItem('active_shift_id');
    let parsedUser: LoggedInUser | null = null;
    if (saved) {
      try {
        const user = JSON.parse(saved);
        parsedUser = user;
      } catch (e) {}
    }

    // ดึงกะที่กำลังเปิดอยู่ทั้งหมด + ดึงรายการวันธุรกิจที่ปิดรอบวัน (EOD) + สิทธิ์สถานที่ล่าสุด
    const [
      { data: openRows, error },
      { data: eodRows },
      { data: locEodRows },
      { data: staffLocRow },
      { data: staffPrimRow },
    ] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .eq('status', 'open')
        .order('start_time', { ascending: false }),
      supabase
        .from('system_settings')
        .select('key')
        .like('key', `${EOD_KEY_PREFIX}%`),
      supabase
        .from('system_settings')
        .select('key')
        .like('key', `${EOD_LOC_KEY_PREFIX}%`),
      supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'staff_locations')
        .maybeSingle(),
      supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'staff_primary_locations')
        .maybeSingle(),
    ]);

    if (eodRows) {
      setClosedEodDates(new Set(eodRows.map((r: any) => String(r.key).slice(EOD_KEY_PREFIX.length))));
    }
    if (locEodRows) {
      setClosedLocEodKeys(new Set(locEodRows.map((r: any) => String(r.key).slice(EOD_LOC_KEY_PREFIX.length))));
    }

    if (parsedUser) {
      if (parsedUser.role === 'staff' || parsedUser.role === 'housekeeper') {
        const latestLocs: string[] = staffLocRow?.value?.[parsedUser.id] || parsedUser.locations || [];
        const savedPrim: string | undefined = staffPrimRow?.value?.[parsedUser.id];
        const effectivePrim =
          (savedPrim && latestLocs.includes(savedPrim) ? savedPrim : null) ||
          latestLocs[0] ||
          parsedUser.primary_location ||
          inferShiftLocation(parsedUser.name, null, latestLocs);
        parsedUser = {
          ...parsedUser,
          locations: latestLocs,
          primary_location: effectivePrim,
        };
        try {
          localStorage.setItem('auth_user', JSON.stringify(parsedUser));
        } catch (e) {}
      }
      setCurrentUser(parsedUser);

      if (parsedUser.role === 'housekeeper') {
        setActiveShift({
          id: 'dummy-shift-id',
          staff_id: parsedUser.id,
          staff_name: parsedUser.name,
          operator_name: parsedUser.name,
          staff_role: 'housekeeper',
          housekeeper_only: true,
          can_clean: true,
          locations: parsedUser.locations || [],
          primary_location: parsedUser.primary_location || parsedUser.locations?.[0] || null,
          shift_location: parsedUser.primary_location || parsedUser.locations?.[0] || null,
          start_time: new Date().toISOString(),
          end_time: null,
          initial_cash: 0,
          expected_cash: 0,
          final_cash: null,
          discrepancy: null,
          status: 'open',
          signature_data: null,
        });
        setOpenShifts([]);
        setLoading(false);
        return;
      }
    } else {
      setCurrentUser(null);
    }

    const list = ((openRows as Shift[]) || []);
    if (error || list.length === 0) {
      setOpenShifts([]);
      setActiveShift(null);
    } else {
      const metaMap = await fetchShiftMetadata(list);
      const enrichedList: Shift[] = list.map((s) => ({
        ...s,
        business_date: metaMap[s.id]?.business_date,
        shift_location: metaMap[s.id]?.shift_location || inferShiftLocation(s.staff_name, null),
      }));

      // กรองกะที่ผู้ใช้งานคนนี้มีสิทธิ์เข้าถึง
      const isMgr = parsedUser?.role === 'admin' || parsedUser?.role === 'manager';
      const userLocs = parsedUser?.locations || [];
      const userPrimaryLoc =
        parsedUser?.primary_location ||
        userLocs[0] ||
        inferShiftLocation(parsedUser?.name, null, userLocs);

      const accessibleShifts = isMgr
        ? enrichedList
        : enrichedList.filter((s) => {
            if (parsedUser && (s.staff_id === parsedUser.id || s.staff_name === parsedUser.name)) return true;
            // สำหรับ staff: ให้ผูกกับกะของสถานที่หลักของตนเองเป็นหลัก
            if (userPrimaryLoc && s.shift_location) {
              return s.shift_location === userPrimaryLoc;
            }
            if (!s.shift_location) return true;
            return userLocs.length === 0 || userLocs.includes(s.shift_location);
          });

      setOpenShifts(accessibleShifts);

      // เลือกกะหลักสำหรับหน้าจอปัจจุบัน:
      // 1) สำหรับ staff ที่มีสถานที่หลัก: เลือกกะของสถานที่หลักก่อนเสมอ
      // 2) กะที่เลือกค้างไว้ในเครื่องนี้ (preferredShiftId)
      // 3) กะที่พนักงานคนนี้เป็นคนเปิดเอง
      // 4) กะล่าสุดที่เข้าถึงได้
      let chosen: Shift | undefined =
        (!isMgr && userPrimaryLoc ? accessibleShifts.find((s) => s.shift_location === userPrimaryLoc) : undefined) ||
        accessibleShifts.find((s) => preferredShiftId && s.id === preferredShiftId) ||
        (parsedUser
          ? accessibleShifts.find((s) => s.staff_id === parsedUser.id || s.staff_name === parsedUser.name)
          : undefined) ||
        (userPrimaryLoc ? accessibleShifts.find((s) => s.shift_location === userPrimaryLoc) : undefined) ||
        accessibleShifts[0];

      if (!chosen) {
        setActiveShift(null);
      } else {
        const shiftData: Shift = { ...chosen };

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
          shiftData.primary_location = parsedUser.primary_location || parsedUser.locations?.[0] || null;
          if (parsedUser.can_clean !== undefined) shiftData.can_clean = parsedUser.can_clean;
        } else {
          shiftData.operator_name = shiftData.staff_name;
        }

        // คำนวณยอดเงินสดในลิ้นชักจาก Ledger
        const drawer = await computeShiftDrawer(shiftData);
        shiftData.expected_cash = drawer.drawer;
      
        // อัปเดตตาราง shifts ด้วยเพื่อความแน่ใจ
        supabase.from('shifts').update({ expected_cash: shiftData.expected_cash }).eq('id', shiftData.id).then();
        
        setActiveShift(shiftData);
      }
    }
    setLoading(false);
  };

  const switchActiveShift = (shiftId: string) => {
    localStorage.setItem('active_shift_id', shiftId);
    refreshShift();
  };

  useEffect(() => {
    refreshShift();

    // ซิงค์สถานะกะแบบ Real-time: หากมีพนักงานอีกเครื่องเปิด/ปิดกะของสถานที่เดียวกัน หน้าจอนี้จะเชื่อมกะให้อัตโนมัติทันทีโดยไม่เปิดกะซ้ำซ้อน
    const shiftChannel = supabase
      .channel('shifts-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        refreshShift();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(shiftChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const operatorName = currentUser?.name || activeShift?.operator_name || activeShift?.staff_name || "";

  // นาฬิกาสำหรับตรวจล็อกกะข้ามวัน (อัปเดตทุก 20 วินาที)
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClockTick((x) => x + 1), 20000);
    return () => clearInterval(t);
  }, []);

  const unlockShiftTemporarily = React.useCallback((minutes: number = 30) => {
    const until = Date.now() + minutes * 60 * 1000;
    try {
      localStorage.setItem(TEMP_UNLOCK_STORAGE_KEY, String(until));
    } catch (e) {}
    setTempUnlockUntil(until);
  }, []);

  const relockShift = React.useCallback(() => {
    try {
      localStorage.removeItem(TEMP_UNLOCK_STORAGE_KEY);
    } catch (e) {}
    setTempUnlockUntil(null);
  }, []);

  const computeLock = (): ShiftLockState => {
    const isReal = !!activeShift && activeShift.id !== 'dummy-shift-id' && !activeShift.housekeeper_only;
    if (!isReal || !activeShift?.business_date) {
      return {
        locked: false,
        isPastLockTime: false,
        tempUnlocked: false,
        tempUnlockUntil: null,
        tempUnlockRemainingMin: 0,
        nearLock: false,
        canCloseEod: false,
        businessDate: activeShift?.business_date || null,
        lockFrom: null,
        eodAllowedFrom: null,
        message: '',
      };
    }
    const bd = activeShift.business_date;
    const { lockFrom, eodAllowedFrom } = getShiftCutoffs(bd);
    const nowMs = getNow().getTime();
    const isPastLockTime = nowMs >= lockFrom.getTime();
    const nowRealMs = Date.now();
    const isTempUnlocked = isPastLockTime && !!tempUnlockUntil && tempUnlockUntil > nowRealMs;
    const tempUnlockRemainingMin =
      isTempUnlocked && tempUnlockUntil ? Math.max(1, Math.ceil((tempUnlockUntil - nowRealMs) / 60000)) : 0;
    const locked = isPastLockTime && !isTempUnlocked;
    const canCloseEod = nowMs >= eodAllowedFrom.getTime();
    const bdLabel = new Date(`${bd}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    return {
      locked,
      isPastLockTime,
      tempUnlocked: isTempUnlocked,
      tempUnlockUntil: isTempUnlocked ? tempUnlockUntil : null,
      tempUnlockRemainingMin,
      nearLock: !isPastLockTime && canCloseEod,
      canCloseEod,
      businessDate: bd,
      lockFrom,
      eodAllowedFrom,
      message: locked
        ? `🔒 เลยเวลาตัดรอบวันใหม่ (06:30 น.) แล้ว\nกะของ ${activeShift.staff_name} (วันที่ ${bdLabel}) ยังไม่ได้ปิด\n\nกรุณา "ปิดกะ" (กะสุดท้ายของวัน) แล้วเปิดกะของวันใหม่ หรือกดปุ่ม "🔓 ปลดล็อกชั่วคราว 30 นาที" เพื่อทำรายการต่อก่อนปิดกะ`
        : '',
    };
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shiftLock = React.useMemo(computeLock, [activeShift, clockTick, getNow, tempUnlockUntil]);

  /** คืนค่า true ถ้าทำรายการได้ / หากถูกล็อก ให้ถามว่าต้องการปลดล็อกชั่วคราว 30 นาทีเพื่อทำรายการต่อทันทีหรือไม่ */
  const ensureShiftWritable = () => {
    const s = computeLock();
    if (s.locked) {
      const wantUnlock = window.confirm(
        `${s.message}\n\n👉 กด "ตกลง (OK)" เพื่อปลดล็อกชั่วคราว 30 นาที แล้วทำรายการนี้ต่อทันที`
      );
      if (wantUnlock) {
        unlockShiftTemporarily(30);
        return true;
      }
      return false;
    }
    return true;
  };

  // วันธุรกิจตามนาฬิกาจริง (เปลี่ยนวันที่เวลา 06:45 น. อัตโนมัติ)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const realClockBusinessDate = React.useMemo(() => {
    return getBusinessDateStr(getNow());
  }, [clockTick, getNow]);

  // คำนวณวันธุรกิจปัจจุบันของโรงแรม:
  // - ปกติเปลี่ยนวันที่ 06:45 น.
  // - แต่ถ้าตั้งแต่ 05:30 น. เป็นต้นไป มีการปิดกะสุดท้ายของเมื่อวานแล้ว (หรือเปิดกะใหม่ของวันใหม่แล้ว) ให้ถือเป็นวันใหม่ทันทีโดยไม่ต้องรอถึง 06:45 น.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentBusinessDate = React.useMemo(() => {
    const now = getNow();
    const clockBD = getBusinessDateStr(now);
    const nextBD = addDaysStr(clockBD, 1);
    if (activeShift?.business_date === nextBD) return nextBD;
    if (activeShift && activeShift.id !== 'dummy-shift-id' && !activeShift.housekeeper_only && activeShift.business_date === clockBD) {
      return clockBD;
    }
    const { eodAllowedFrom } = getShiftCutoffs(clockBD);
    const focusLoc = activeShift?.shift_location || currentUser?.primary_location || currentUser?.locations?.[0] || null;
    const hasAnyLocEodForClockBD = Array.from(closedLocEodKeys).some((k) => k.endsWith(`_${clockBD}`));
    const isEodClosedForLoc = focusLoc
      ? closedLocEodKeys.has(`${focusLoc}_${clockBD}`) || (!hasAnyLocEodForClockBD && closedEodDates.has(clockBD))
      : closedEodDates.has(clockBD);
    if (now.getTime() >= eodAllowedFrom.getTime() && isEodClosedForLoc) {
      return nextBD;
    }
    return clockBD;
  }, [activeShift, currentUser, closedEodDates, closedLocEodKeys, clockTick, getNow]);

  // วันของส่วน Close Day (รอบวันของกะที่เปิดอยู่ หรือสถานะการตัดรอบวัน)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { closeDayBusinessDate, closeDayMismatchReason } = React.useMemo(() => {
    const isReal = !!activeShift && activeShift.id !== 'dummy-shift-id' && !activeShift.housekeeper_only;
    if (isReal && activeShift?.business_date) {
      const shiftBD = activeShift.business_date;
      if (shiftBD < realClockBusinessDate) {
        const label = new Date(`${shiftBD}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        return {
          closeDayBusinessDate: shiftBD,
          closeDayMismatchReason: `ยังไม่ได้ปิดกะสุดท้าย (Close Day) ของวันที่ ${label}${activeShift.shift_location ? ` (${activeShift.shift_location})` : ''} เพื่อเริ่มวันใหม่`,
        };
      }
      if (shiftBD > realClockBusinessDate) {
        return {
          closeDayBusinessDate: shiftBD,
          closeDayMismatchReason: `ปิดกะสุดท้าย (Close Day) ล่วงหน้าและเริ่มกะวันใหม่แล้ว (รอเวลา 06:45 น. นาฬิกาหลักจะตรงกัน)`,
        };
      }
      return {
        closeDayBusinessDate: shiftBD,
        closeDayMismatchReason: null,
      };
    }

    // กรณีไม่มีกะเปิดอยู่: ตรวจว่ามีกะของวันก่อนหน้าที่ยังเปิดค้างอยู่ในระบบหรือไม่
    const oldOpenShift = openShifts.find(s => s.business_date && s.business_date < realClockBusinessDate);
    if (oldOpenShift && oldOpenShift.business_date) {
      const label = new Date(`${oldOpenShift.business_date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      return {
        closeDayBusinessDate: oldOpenShift.business_date,
        closeDayMismatchReason: `กะของวันที่ ${label}${oldOpenShift.shift_location ? ` (${oldOpenShift.shift_location})` : ''} ยังเปิดค้างอยู่ ยังไม่ได้ปิดกะสุดท้าย (Close Day)`,
      };
    }

    return {
      closeDayBusinessDate: currentBusinessDate,
      closeDayMismatchReason:
        currentBusinessDate !== realClockBusinessDate
          ? `ปิดกะสุดท้าย (Close Day) เริ่มวันใหม่ล่วงหน้าแล้ว (ก่อน 06:45 น.)`
          : null,
    };
  }, [activeShift, openShifts, realClockBusinessDate, currentBusinessDate]);

  const getActiveBusinessDate = React.useCallback(() => {
    const [y, m, d] = currentBusinessDate.split("-").map(Number);
    const now = getNow();
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  }, [currentBusinessDate, getNow]);

  return (
    <ShiftContext.Provider
      value={{
        activeShift,
        openShifts,
        switchActiveShift,
        currentUser,
        operatorName,
        loading,
        refreshShift,
        shiftLock,
        ensureShiftWritable,
        unlockShiftTemporarily,
        relockShift,
        currentBusinessDate,
        realClockBusinessDate,
        closeDayBusinessDate,
        closeDayMismatchReason,
        getActiveBusinessDate,
      }}
    >
      {children}
    </ShiftContext.Provider>
  );
};
