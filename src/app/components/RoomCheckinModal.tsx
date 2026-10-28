"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { RoomStatus } from "../checkin/page";

type LedgerTransaction = { id: string, category: string, amount: number, created_at: string, notes?: string };
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";
import BillingModal from "./BillingModal";
import CheckoutSummaryModal from "./CheckoutSummaryModal";
import TransferTimePicker from "./TransferTimePicker";
import { useShift } from "@/contexts/ShiftContext";
import { logActivity, fetchActivityLogs, ActivityLogEntry, ACTIVITY_ACTION_LABELS } from "@/lib/activityLog";


export type RatePlan = {
  id: string;
  name: string;
};
export type DailyRate = {
  date: string;
  targetPrice: number;
  actualPrice: number | '';
  isOverride: boolean;
  ratePlanName?: string;
};

export type FieldEditEntry = {
  oldValue: string;
  newValue: string;
  by: string;
  at: string;
};

export type BookingMeta = {
  history?: Record<string, FieldEditEntry[]>;
  targetPrices?: {
    totalTargetPrice: number;
    dailyTargets?: Record<string, number>;
    timeBand?: string;
    stayType?: 'overnight' | 'short_stay';
  };
};

interface ModalProps {
  room: RoomStatus;
  dateOffset: number;
  onClose: () => void;
  onUpdate: () => void;
}

export default function RoomCheckinModal({ room, dateOffset, onClose, onUpdate }: ModalProps) {
  const { getNow } = useSimulatedTime();
  const { activeShift, operatorName, ensureShiftWritable, currentBusinessDate } = useShift();
  const displayDate = getNow();
  if (displayDate.getHours() < 6 || (displayDate.getHours() === 6 && displayDate.getMinutes() < 45)) {
    displayDate.setDate(displayDate.getDate() - 1);
  }
  displayDate.setDate(displayDate.getDate() + dateOffset);
  const displayDateStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, '0')}-${String(displayDate.getDate()).padStart(2, '0')}`;
  const [showBilling, setShowBilling] = useState(false);
  const [showCheckoutSummary, setShowCheckoutSummary] = useState(false);
  const [newBookingId, setNewBookingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [guestCount, setGuestCount] = useState<number | ''>(room.guest_count || 2);
  const [guestName, setGuestName] = useState<string>(room.guest_name === 'ไม่ระบุชื่อ' ? "" : (room.guest_name || ""));
  const [guestPhone, setGuestPhone] = useState<string>(room.guest_phone || "");
  const [skipPhone, setSkipPhone] = useState<boolean>(false);
  const [pendingCheckInAfterPhone, setPendingCheckInAfterPhone] = useState<{ isReservationForToday: boolean } | null>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const submitLockRef = useRef(false);
  const [extrasManagerUnlocked, setExtrasManagerUnlocked] = useState(false);
  const [extrasManagerName, setExtrasManagerName] = useState('');
  const [extrasEditNote, setExtrasEditNote] = useState('');
  const [showExtrasPinPrompt, setShowExtrasPinPrompt] = useState(false);
  const [extrasPin, setExtrasPin] = useState('');
  const [extrasPinError, setExtrasPinError] = useState('');
  const [bookingMeta, setBookingMeta] = useState<BookingMeta>({});
  const [savedDailyRates, setSavedDailyRates] = useState<{ target_date: string; amount: number; is_manual_override?: boolean }[]>([]);
  const [initialSnapshot, setInitialSnapshot] = useState<{
    guestPhone: string;
    guestName: string;
    stayType: 'overnight' | 'short_stay';
    nights: number;
    hours: number;
    actualPrice: number;
    dailyRates: Record<string, number>;
    keyDepositEnabled: boolean;
    keyDepositAmount: number;
  } | null>(null);
  // จองแล้ว/เข้าพักแล้ว: ล็อกข้อมูลลูกค้าและราคา เว้นแต่ Admin/Manager ปลดล็อกด้วย PIN ทุกครั้ง
  const isExistingBooking = room.status === 'occupied' || room.status === 'reserved';
  const isBookingLocked = isExistingBooking && !extrasManagerUnlocked;
    const [nights, setNights] = useState<number | ''>(() => {
    if (room.status === 'reserved' || room.status === 'occupied') {
      if (room.check_in_time && room.check_out_time) {
        const inTime = new Date(room.check_in_time);
        const outTime = new Date(room.check_out_time);
        const diff = outTime.getTime() - inTime.getTime();
        const n = Math.round(diff / (1000 * 60 * 60 * 24));
        if (n > 0) return n;
      }
    }
    if (dateOffset === 0) {
      const h = getNow().getHours();
      if (h >= 0 && h < 7) return 0; // Late night defaults to 0 nights (checkout today noon)
    }
    return 1;
  });
  const [hours, setHours] = useState<number | ''>(3);
  const [extendHours, setExtendHours] = useState<number | ''>(1);
  const [extendNights, setExtendNights] = useState<number | ''>(1);
  const [activeTab, setActiveTab] = useState<'overnight' | 'short_stay'>('overnight');
  
  // Rate Plan State
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string>('');
  const [dailyBreakdown, setDailyBreakdown] = useState<DailyRate[]>([]);
  const [totalTargetPrice, setTotalTargetPrice] = useState(0);
  const [ratePlanTempPrices, setRatePlanTempPrices] = useState<Record<string, Record<string, number>>>({});
  const [shortStayBase3Hr, setShortStayBase3Hr] = useState<number>(room.price_temp || 350);

  // ปัดเศษขึ้นให้ลงท้ายด้วย 50 หรือ 00 เสมอ (ยึดจากฐาน 3 ชม. แรก)
  const roundUpToEasyChange = (rawVal: number): number => {
    if (rawVal <= 0) return 0;
    return Math.ceil(rawVal / 50) * 50;
  };

  // Fetch Base Data on Mount
    const [yieldRules, setYieldRules] = useState<any>(null);
    const [availablePercent, setAvailablePercent] = useState(100);

    useEffect(() => {
      const fetchBaseData = async () => {
        // 1. Fetch Rate Plans
        const { data: plans } = await supabase.from('rate_plans').select('id, name').order('created_at', { ascending: true });
        if (plans) setRatePlans(plans);

        // 2. Fetch Global Yield Rules, Bank Accounts & Short-Stay Temp Prices
        const [rulesRes, bankRes, tempPricesRes] = await Promise.all([
          supabase.from('system_settings').select('value').eq('key', 'yield_management_rules').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'bank_accounts').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'rate_plan_temp_prices').maybeSingle()
        ]);
        if (rulesRes.data && rulesRes.data.value) setYieldRules(rulesRes.data.value);
        if (bankRes.data && Array.isArray(bankRes.data.value) && bankRes.data.value.length > 0) {
          setBankAccounts(bankRes.data.value);
          setSelectedBank(bankRes.data.value[0]);
        }
        if (tempPricesRes.data && tempPricesRes.data.value) {
          setRatePlanTempPrices(tempPricesRes.data.value as Record<string, Record<string, number>>);
        }

        // 3. Fetch Occupancy
        const { data: rooms } = await supabase.from('rooms').select('status');
        if (rooms && rooms.length > 0) {
          const available = rooms.filter(r => r.status === 'available' || r.status === 'dirty').length;
          setAvailablePercent((available / rooms.length) * 100);
        }
      };
      fetchBaseData();
    }, []);

    // Recalculate Daily Breakdown / Short-Stay Target Price when Dates, Hours, or Tab change
    useEffect(() => {
      const generateBreakdown = async () => {
        const startDate = (isExistingBooking && room.check_in_time) ? new Date(room.check_in_time) : new Date(displayDateStr);
        if (isExistingBooking && room.check_in_time && (startDate.getHours() < 6 || (startDate.getHours() === 6 && startDate.getMinutes() < 45))) {
          startDate.setDate(startDate.getDate() - 1);
        }
        if (!isExistingBooking && dateOffset > 0) startDate.setHours(14, 0, 0, 0);
        const todayDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        const fallbackPlanId = ratePlans.length > 0 ? ratePlans[0].id : null;

        if (activeTab === 'short_stay') {
          setDailyBreakdown([]);
          const { data: todaySetting } = await supabase
            .from('daily_pricing_settings')
            .select('rate_plan_id')
            .eq('target_date', todayDateStr)
            .maybeSingle();

          const activePlanId = todaySetting?.rate_plan_id || fallbackPlanId;
          let base3Hr = Number(room.price_temp || 350);

          if (activePlanId && ratePlanTempPrices?.[activePlanId]?.[room.room_type] && Number(ratePlanTempPrices[activePlanId][room.room_type]) > 0) {
            base3Hr = Number(ratePlanTempPrices[activePlanId][room.room_type]);
          } else {
            // ค้นหาจาก Rate Plan อื่นที่มีการตั้งราคาชั่วคราวของประเภทห้องนี้ไว้
            for (const p of ratePlans) {
              const pTemp = ratePlanTempPrices?.[p.id]?.[room.room_type];
              if (pTemp && Number(pTemp) > 0) {
                base3Hr = Number(pTemp);
                break;
              }
            }
          }

          setShortStayBase3Hr(base3Hr);
          const numHours = Math.max(3, Number(hours) || 3);
          const extraHourRate = roundUpToEasyChange(base3Hr / 3);
          const calcTarget = base3Hr + (numHours - 3) * extraHourRate;

          const isUnchangedExistingShortStay =
            isExistingBooking &&
            bookingMeta?.targetPrices?.stayType === 'short_stay' &&
            numHours === (initialSnapshot?.hours || 3);

          const effectiveTarget =
            isUnchangedExistingShortStay && bookingMeta?.targetPrices?.totalTargetPrice
              ? Number(bookingMeta.targetPrices.totalTargetPrice)
              : calcTarget;

          setTotalTargetPrice(effectiveTarget);

          if (isUnchangedExistingShortStay && room.actual_price !== undefined && room.actual_price !== null) {
            setActualPrice(Number(room.actual_price));
          } else {
            setActualPrice(effectiveTarget);
          }
          return;
        }
        
        const numNights = Math.max(1, Number(nights) || 0);
        const targetDates: string[] = [];
        for (let i = 0; i < numNights; i++) {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + i);
          targetDates.push(d.toLocaleDateString('en-CA'));
        }

        const { data: dailySettings } = await supabase
          .from('daily_pricing_settings')
          .select('*')
          .in('target_date', targetDates);

        // 3. Fetch Base Prices and Calendar Prices for all relevant rate plans
        const relevantPlanIds = new Set(dailySettings?.map(s => s.rate_plan_id) || []);
        if (fallbackPlanId) relevantPlanIds.add(fallbackPlanId);

        const { data: baseData } = await supabase
          .from('rate_plan_room_types')
          .select('rate_plan_id, base_price')
          .eq('room_type', room.room_type)
          .in('rate_plan_id', Array.from(relevantPlanIds));

        const { data: calendarData } = await supabase
          .from('rate_plan_calendar')
          .select('rate_plan_id, target_date, price')
          .eq('room_type', room.room_type)
          .in('rate_plan_id', Array.from(relevantPlanIds))
          .in('target_date', targetDates);

        const breakdown: DailyRate[] = [];
        let total = 0;

        for (let i = 0; i < numNights; i++) {
          const currentDate = new Date(startDate);
          currentDate.setDate(startDate.getDate() + i);
          const dateStr = targetDates[i];
          
          const setting = dailySettings?.find(s => s.target_date === dateStr);
          const activePlanId = setting ? setting.rate_plan_id : fallbackPlanId;
          const activePlanName = ratePlans.find(rp => rp.id === activePlanId)?.name || 'Default';

          let targetPrice = room.price_night || 0;
          
          if (activePlanId) {
            const calPrice = calendarData?.find(c => c.rate_plan_id === activePlanId && c.target_date === dateStr);
            if (calPrice) {
              targetPrice = Number(calPrice.price);
            } else {
              const baseP = baseData?.find(b => b.rate_plan_id === activePlanId);
              if (baseP) targetPrice = Number(baseP.base_price);
            }
          }

          let finalPrice = targetPrice;
          let rulesApplied = [];

          // APPLY SMART RULES
          if (setting && yieldRules) {
            // 1. Occupancy Sale
            if (setting.enable_occupancy_sale && availablePercent >= yieldRules.sale_threshold_percent) {
              const discount = targetPrice * (yieldRules.sale_adjustment_percent / 100);
              finalPrice -= discount;
              rulesApplied.push('🔥');
            }
            // 2. Occupancy Surge
            if (setting.enable_occupancy_surge && availablePercent <= yieldRules.surge_threshold_percent) {
              const surge = targetPrice * (yieldRules.surge_adjustment_percent / 100);
              finalPrice += surge;
              rulesApplied.push('📈');
            }
            // 3. Time Discount
            if (setting.enable_time_discount) {
              const now = new Date();
              const [h, m] = yieldRules.time_discount_start_time.split(':').map(Number);
              if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
                const discount = targetPrice * (yieldRules.time_discount_percent / 100);
                finalPrice -= discount;
                rulesApplied.push('🌙');
              }
            }
          }

          finalPrice = Math.round(finalPrice);
          const storedTarget = bookingMeta?.targetPrices?.dailyTargets?.[dateStr];
          const effectiveTargetPrice = storedTarget !== undefined ? Number(storedTarget) : finalPrice;
          total += effectiveTargetPrice;

          const savedRate = savedDailyRates.find(r => r.target_date === dateStr);
          let dayActualPrice = effectiveTargetPrice;
          let isOverride = false;
          if (savedRate !== undefined) {
            dayActualPrice = Number(savedRate.amount);
            isOverride = Boolean(savedRate.is_manual_override) || dayActualPrice !== effectiveTargetPrice;
          } else if (isExistingBooking && numNights === 1 && room.actual_price !== undefined && room.actual_price !== null) {
            dayActualPrice = Number(room.actual_price);
            isOverride = dayActualPrice !== effectiveTargetPrice;
          }

          breakdown.push({
            date: dateStr,
            ratePlanName: activePlanName + (rulesApplied.length > 0 ? ` ${rulesApplied.join('')}` : ''),
            targetPrice: effectiveTargetPrice,
            actualPrice: dayActualPrice,
            isOverride
          });
        }
        setDailyBreakdown(breakdown);
      };
      
      generateBreakdown();
    }, [activeTab, nights, hours, displayDateStr, dateOffset, room, yieldRules, ratePlans, ratePlanTempPrices, availablePercent, savedDailyRates, bookingMeta]);

  useEffect(() => {
    if (activeTab === 'overnight') {
      const totalAct = dailyBreakdown.reduce((sum, d) => sum + (d.actualPrice === '' ? 0 : d.actualPrice), 0);
      const totalTgt = dailyBreakdown.reduce((sum, d) => sum + d.targetPrice, 0);
      setActualPrice(totalAct);
      setTotalTargetPrice(totalTgt);
    }
  }, [dailyBreakdown, activeTab]);

  const updateDailyActualPrice = (dateStr: string, newPrice: string) => {
    const val = newPrice === '' ? '' : Number(newPrice);
    setDailyBreakdown(prev => prev.map(d => 
      d.date === dateStr ? { ...d, actualPrice: val, isOverride: true } : d
    ));
  };


  const [actualPrice, setActualPrice] = useState<number | ''>(room.actual_price || room.price_night || '');
  const [payCash, setPayCash] = useState<number | ''>('');
  const [payTransfer, setPayTransfer] = useState<number | ''>('');
  const [payCredit, setPayCredit] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'credit'>('cash');
  const [bankAccounts, setBankAccounts] = useState<string[]>(['SCB', 'KBANK']);
  const [selectedBank, setSelectedBank] = useState<string>('SCB');
  const [receivedCash, setReceivedCash] = useState<number | ''>('');
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [showDailyDetails, setShowDailyDetails] = useState(false);
  const [discount, setDiscount] = useState<number | ''>('');
  const [isScanningSlip, setIsScanningSlip] = useState(false);
  const [pastPayments, setPastPayments] = useState<LedgerTransaction[]>([]);
  const [staffName, setStaffName] = useState<string>(room.staff_name || operatorName || activeShift?.staff_name || '');

  useEffect(() => {
    if (!isExistingBooking && !staffName && (operatorName || activeShift?.staff_name)) {
      setStaffName(operatorName || activeShift?.staff_name || '');
    }
  }, [operatorName, activeShift?.staff_name, isExistingBooking]);

  const effectiveStaffName = (staffName && staffName.trim())
    ? staffName.trim()
    : (operatorName || activeShift?.staff_name || 'Admin');
  // ผู้ใช้ที่ล็อกอินอยู่จริง (ซับของกะ) — ใช้บันทึกผู้ทำรายการชำระเงิน/แก้ไข/Log แทนชื่อพนักงานเดิมของการจอง
  const actorName = operatorName || activeShift?.staff_name || 'Admin';

  const handleDiscountChange = (newDiscountStr: string) => {
    const disc = newDiscountStr === '' ? '' : Number(newDiscountStr);
    setDiscount(disc);
    const dVal = Number(disc) || 0;
    const base = totalTargetPrice || Number(actualPrice) || 0;
    const newPrice = Math.max(0, base - dVal);
    setActualPrice(newPrice);
    if (dailyBreakdown.length === 1) {
      updateDailyActualPrice(dailyBreakdown[0].date, String(newPrice));
    }
  };

  const handleActualPriceChange = (newPriceStr: string) => {
    const p = newPriceStr === '' ? '' : Number(newPriceStr);
    setActualPrice(p);
    const base = totalTargetPrice || 0;
    if (base > 0 && p !== '') {
      setDiscount(base > Number(p) ? base - Number(p) : '');
    }
    if (dailyBreakdown.length === 1 && p !== '') {
      updateDailyActualPrice(dailyBreakdown[0].date, String(p));
    }
  };

  const handleNightsChange = (delta: number) => {
    const current = Number(nights) || 0;
    const nextVal = Math.max(dateOffset === 0 ? 0 : 1, current + delta);
    setNights(nextVal);
  };

  const handleHoursChange = (delta: number) => {
    const current = Number(hours) || 3;
    const nextVal = Math.max(3, current + delta);
    setHours(nextVal);
  };
  
  // States for Key Deposit & Daily Extras
  const [keyDepositEnabled, setKeyDepositEnabled] = useState<boolean>(true);
  const [initialKeyDepositStatus, setInitialKeyDepositStatus] = useState<boolean>(true);
  const [existingDepositTx, setExistingDepositTx] = useState<{ id: string; amount: number } | null>(null);
  const [keyDepositAmount, setKeyDepositAmount] = useState<number | ''>(room.key_deposit !== undefined && room.key_deposit !== null ? room.key_deposit : 200);
  
  const [extraSettings, setExtraSettings] = useState<any[]>([]);
  const [posCategoryMap, setPosCategoryMap] = useState<Record<string, 'addon' | 'minibar' | 'fine' | 'other'>>({});
  const refreshExtraSettings = async () => {
    const [extraRes, posRes, catRes] = await Promise.all([
      supabase.from('extra_charge_settings').select('*').eq('is_active', true).order('created_at', { ascending: true }),
      supabase.from('pos_items').select('*').eq('is_active', true),
      supabase.from('system_settings').select('value').eq('key', 'pos_category_map').maybeSingle()
    ]);

    let extrasList = extraRes.data || [];
    const posList = posRes.data || [];
    const rawCatMap = (catRes.data?.value as Record<string, any>) || {};
    const normalizedCatMap: Record<string, 'addon' | 'minibar' | 'fine' | 'other'> = {};
    Object.entries(rawCatMap).forEach(([k, v]) => {
      if (v === 'minibar' || v === 'addon' || v === 'fine' || v === 'other') {
        normalizedCatMap[k] = v;
      } else {
        normalizedCatMap[k] = 'addon';
      }
    });
    setPosCategoryMap(normalizedCatMap);

    // ซิงค์รายการจาก pos_items เดิมเข้าสู่ extra_charge_settings อัตโนมัติหากยังไม่มีชื่อซ้ำ
    const existingNames = new Set(extrasList.map((e: any) => String(e.name || '').trim()));
    const missingPosItems = posList.filter((p: any) => p.name && !existingNames.has(String(p.name).trim()));
    if (missingPosItems.length > 0) {
      const inserts = missingPosItems.map((p: any) => ({
        name: String(p.name).trim(),
        price: Number(p.default_price || 0),
        charge_type: 'one_time',
        ui_type: 'quick_button',
        is_active: true
      }));
      const { data: newlyInserted } = await supabase.from('extra_charge_settings').insert(inserts).select('*');
      if (newlyInserted && newlyInserted.length > 0) {
        extrasList = [...extrasList, ...newlyInserted];
      }
    }
    setExtraSettings(extrasList);
  };
  useEffect(() => {
    refreshExtraSettings();
  }, []);

  const syncExtraPosCategoryMap = async (name: string, oldName?: string, reportCategory: 'addon' | 'minibar' | 'fine' | 'other' = 'addon') => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'pos_category_map')
        .maybeSingle();
      const currentMap: Record<string, string> = (data?.value as Record<string, string>) || {};
      if (oldName && oldName !== name && currentMap[oldName]) {
        delete currentMap[oldName];
      }
      currentMap[name] = reportCategory;
      await supabase
        .from('system_settings')
        .upsert({ key: 'pos_category_map', value: currentMap }, { onConflict: 'key' });
      setPosCategoryMap(prev => {
        const next = { ...prev };
        if (oldName && oldName !== name) delete next[oldName];
        next[name] = reportCategory;
        return next;
      });
    } catch (e) {
      console.error('Failed to sync pos_category_map:', e);
    }
  };

  // States for managing extra_charge_settings directly inside "+ รายการอื่นๆ / จัดการ ▾"
  const [showAddonsSection, setShowAddonsSection] = useState(false);
  const [showOtherExtrasMenu, setShowOtherExtrasMenu] = useState(false);
  const [showManageQuickButtonsInMenu, setShowManageQuickButtonsInMenu] = useState(false);
  const [editingExtraSettingId, setEditingExtraSettingId] = useState<string | null>(null);
  const [editExtraSettingName, setEditExtraSettingName] = useState('');
  const [editExtraSettingPrice, setEditExtraSettingPrice] = useState<number | ''>('');
  const [editExtraSettingChargeType, setEditExtraSettingChargeType] = useState<'one_time' | 'per_night'>('one_time');
  const [editExtraSettingUiType, setEditExtraSettingUiType] = useState<'quick_button' | 'dropdown'>('dropdown');
  const [editExtraSettingReportCat, setEditExtraSettingReportCat] = useState<'addon' | 'minibar' | 'fine' | 'other'>('addon');
  const [showAddNewExtraSettingForm, setShowAddNewExtraSettingForm] = useState(false);
  const [newExtraSettingName, setNewExtraSettingName] = useState('');
  const [newExtraSettingPrice, setNewExtraSettingPrice] = useState<number | ''>('');
  const [newExtraSettingChargeType, setNewExtraSettingChargeType] = useState<'one_time' | 'per_night'>('one_time');
  const [newExtraSettingUiType, setNewExtraSettingUiType] = useState<'quick_button' | 'dropdown'>('dropdown');
  const [newExtraSettingReportCat, setNewExtraSettingReportCat] = useState<'addon' | 'minibar' | 'fine' | 'other'>('addon');
  const [extraSettingSaving, setExtraSettingSaving] = useState(false);
  const [showAddonRecentLogs, setShowAddonRecentLogs] = useState(false);
  const [addonRecentLogs, setAddonRecentLogs] = useState<ActivityLogEntry[]>([]);
  const [loadingAddonLogs, setLoadingAddonLogs] = useState(false);

  const loadRecentAddonLogs = async () => {
    setLoadingAddonLogs(true);
    try {
      const logs = await fetchActivityLogs(7);
      setAddonRecentLogs(logs.filter(l => l.category === 'addons').slice(0, 15));
    } finally {
      setLoadingAddonLogs(false);
    }
  };

  const handleCreateExtraSetting = async () => {
    const trimmed = newExtraSettingName.trim();
    const numPrice = Number(newExtraSettingPrice);
    if (!trimmed || !numPrice || numPrice <= 0) return;
    setExtraSettingSaving(true);
    try {
      const { error } = await supabase.from('extra_charge_settings').insert({
        name: trimmed,
        price: numPrice,
        charge_type: newExtraSettingChargeType,
        ui_type: newExtraSettingUiType,
        is_active: true
      });
      if (!error) {
        await syncExtraPosCategoryMap(trimmed, undefined, newExtraSettingReportCat);
        await logActivity({
          category: 'addons',
          action: 'create',
          staffName: actorName,
          shiftName: activeShift?.staff_name || null,
          target: trimmed,
          details: `เพิ่มรายการ "${trimmed}" ราคา ฿${numPrice.toLocaleString()} (${newExtraSettingChargeType === 'per_night' ? 'ระบุวัน/รายคืน' : 'ครั้งเดียว'} • ${newExtraSettingUiType === 'quick_button' ? 'ปุ่มลัดด้านบน' : 'ในตัวเลือก'})`
        });
        await refreshExtraSettings();
        if (showAddonRecentLogs) await loadRecentAddonLogs();
        setNewExtraSettingName('');
        setNewExtraSettingPrice('');
        setShowAddNewExtraSettingForm(false);
      } else {
        alert('ไม่สามารถเพิ่มรายการได้: ' + error.message);
      }
    } finally {
      setExtraSettingSaving(false);
    }
  };

  const handleStartEditExtraSetting = (item: any) => {
    setEditingExtraSettingId(item.id);
    setEditExtraSettingName(item.name);
    setEditExtraSettingPrice(Number(item.price));
    setEditExtraSettingChargeType(item.charge_type === 'per_night' ? 'per_night' : 'one_time');
    setEditExtraSettingUiType(item.ui_type === 'quick_button' ? 'quick_button' : 'dropdown');
    setEditExtraSettingReportCat(posCategoryMap[item.name] || 'addon');
  };

  const handleSaveEditExtraSetting = async (oldItem: any) => {
    const trimmed = editExtraSettingName.trim();
    const numPrice = Number(editExtraSettingPrice);
    if (!trimmed || !numPrice || numPrice <= 0) return;
    setExtraSettingSaving(true);
    try {
      const { error } = await supabase
        .from('extra_charge_settings')
        .update({
          name: trimmed,
          price: numPrice,
          charge_type: editExtraSettingChargeType,
          ui_type: editExtraSettingUiType
        })
        .eq('id', oldItem.id);
      if (!error) {
        await syncExtraPosCategoryMap(trimmed, oldItem.name, editExtraSettingReportCat);
        await logActivity({
          category: 'addons',
          action: 'update',
          staffName: actorName,
          shiftName: activeShift?.staff_name || null,
          target: trimmed,
          details: `แก้ไขรายการ "${oldItem.name}" (฿${Number(oldItem.price).toLocaleString()}) -> "${trimmed}" (฿${numPrice.toLocaleString()}) [${editExtraSettingChargeType === 'per_night' ? 'ระบุวัน/รายคืน' : 'ครั้งเดียว'} • ${editExtraSettingUiType === 'quick_button' ? 'ปุ่มลัดด้านบน' : 'ในตัวเลือก'}]`
        });
        await refreshExtraSettings();
        if (showAddonRecentLogs) await loadRecentAddonLogs();
        setEditingExtraSettingId(null);
      } else {
        alert('ไม่สามารถแก้ไขรายการได้: ' + error.message);
      }
    } finally {
      setExtraSettingSaving(false);
    }
  };

  const handleToggleExtraSettingUiType = async (item: any) => {
    const nextUi = item.ui_type === 'quick_button' ? 'dropdown' : 'quick_button';
    setExtraSettingSaving(true);
    try {
      const { error } = await supabase
        .from('extra_charge_settings')
        .update({ ui_type: nextUi })
        .eq('id', item.id);
      if (!error) {
        await logActivity({
          category: 'addons',
          action: 'toggle',
          staffName: actorName,
          shiftName: activeShift?.staff_name || null,
          target: item.name,
          details: `ย้ายปุ่ม "${item.name}" จาก ${item.ui_type === 'quick_button' ? 'ปุ่มลัดด้านบน' : 'ในตัวเลือก (+ รายการอื่นๆ)'} -> ${nextUi === 'quick_button' ? 'ปุ่มลัดด้านบน' : 'ในตัวเลือก (+ รายการอื่นๆ)'}`
        });
        await refreshExtraSettings();
        if (showAddonRecentLogs) await loadRecentAddonLogs();
      }
    } finally {
      setExtraSettingSaving(false);
    }
  };

  const handleToggleExtraSettingDefaultChargeType = async (item: any) => {
    const nextCharge = item.charge_type === 'per_night' ? 'one_time' : 'per_night';
    setExtraSettingSaving(true);
    try {
      const { error } = await supabase
        .from('extra_charge_settings')
        .update({ charge_type: nextCharge })
        .eq('id', item.id);
      if (!error) {
        await logActivity({
          category: 'addons',
          action: 'toggle',
          staffName: actorName,
          shiftName: activeShift?.staff_name || null,
          target: item.name,
          details: `เปลี่ยนค่าเริ่มต้น "${item.name}" เป็นแบบ ${nextCharge === 'per_night' ? 'ระบุวัน (รายคืน)' : 'ครั้งเดียว'}`
        });
        await refreshExtraSettings();
        if (showAddonRecentLogs) await loadRecentAddonLogs();
      }
    } finally {
      setExtraSettingSaving(false);
    }
  };

  const handleDeleteExtraSetting = async (item: any) => {
    if (!window.confirm(`ยืนยันการลบรายการบริการเสริม "${item.name}" (฿${Number(item.price).toLocaleString()}) ออกจากตัวเลือก?`)) return;
    setExtraSettingSaving(true);
    try {
      const { error } = await supabase
        .from('extra_charge_settings')
        .update({ is_active: false })
        .eq('id', item.id);
      if (!error) {
        await logActivity({
          category: 'addons',
          action: 'delete',
          staffName: actorName,
          shiftName: activeShift?.staff_name || null,
          target: item.name,
          details: `ลบรายการบริการเสริม "${item.name}" (ราคาเดิม ฿${Number(item.price).toLocaleString()})`
        });
        await refreshExtraSettings();
        if (showAddonRecentLogs) await loadRecentAddonLogs();
      }
    } finally {
      setExtraSettingSaving(false);
    }
  };

  const [dailyExtras, setDailyExtras] = useState<any[]>([]);
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [extraForm, setExtraForm] = useState({ category: 'เตียงเสริม/อุปกรณ์', description: '', amount: 0, applyToAll: false, targetDate: '' });
  const [paymentTime, setPaymentTime] = useState<string>('');
  
  const extraLineTotal = (ext: any) => {
    if (ext.isPerNight && Array.isArray(ext.dailySchedule) && ext.dailySchedule.length > 0) {
      return ext.dailySchedule.reduce((sum: number, day: any) => {
        if (!day.enabled || day.isVoided) return sum;
        return sum + Number(ext.price || 0) * (Number(day.qty) || 1);
      }, 0);
    }
    if (ext.isSaved && ext.savedAmount !== undefined && !ext.isModified) return Number(ext.savedAmount);
    const q = Number(ext.qty) || 1;
    return ext.isPerNight ? (Number(ext.price) * q * Math.max(1, Number(nights) || 1)) : (Number(ext.price) * q);
  };

  // Sync per-night extra schedules whenever dailyBreakdown changes
  useEffect(() => {
    if (activeTab !== 'overnight' || dailyBreakdown.length === 0) return;
    const currentDates = dailyBreakdown.map(d => d.date);
    setDailyExtras(prev => prev.map(ext => {
      if (!ext.isPerNight) return ext;
      const existingSchedule: any[] = Array.isArray(ext.dailySchedule) ? ext.dailySchedule : [];
      const nextSchedule = currentDates.map(dateStr => {
        const found = existingSchedule.find(s => s.date === dateStr);
        if (found) return found;
        return {
          date: dateStr,
          enabled: true,
          qty: Number(ext.qty) || 1,
          isSaved: false,
          isVoided: false
        };
      });
      return {
        ...ext,
        dailySchedule: nextSchedule
      };
    }));
  }, [dailyBreakdown, activeTab]);

  // สลับรูปแบบการคิดเงินของรายการเสริมที่เพิ่มลงบิลแล้ว: ครั้งเดียว <-> ระบุวัน (รายคืน)
  const handleToggleExtraChargeMode = (extraId: string, toPerNight: boolean) => {
    const currentDates = dailyBreakdown.length > 0
      ? dailyBreakdown.map(d => d.date)
      : [displayDateStr];
    setDailyExtras(prev => prev.map(ext => {
      if (ext.id !== extraId) return ext;
      if (toPerNight) {
        const baseQty = Math.max(1, Number(ext.qty) || 1);
        const existingSchedule: any[] = Array.isArray(ext.dailySchedule) ? ext.dailySchedule : [];
        const nextSchedule = currentDates.map(dateStr => {
          const found = existingSchedule.find(s => s.date === dateStr);
          if (found) return found;
          return {
            date: dateStr,
            enabled: true,
            qty: baseQty,
            isSaved: false,
            isVoided: false
          };
        });
        return {
          ...ext,
          isPerNight: true,
          dailySchedule: nextSchedule,
          isModified: ext.isSaved ? true : undefined
        };
      } else {
        return {
          ...ext,
          isPerNight: false,
          isModified: ext.isSaved ? true : undefined
        };
      }
    }));
  };

  const handleChangeExtraQty = (id: string, delta: number) => {
    setDailyExtras(prev => prev.map(e => {
      if (e.id === id) {
        const newQty = Math.max(1, (e.qty || 1) + delta);
        const updatedSchedule = Array.isArray(e.dailySchedule)
          ? e.dailySchedule.map((d: any) => d.isVoided ? d : { ...d, qty: newQty })
          : undefined;
        return { ...e, qty: newQty, dailySchedule: updatedSchedule, isModified: e.isSaved ? true : undefined };
      }
      return e;
    }));
  };

  const handleToggleExtraDay = (extraId: string, dateStr: string) => {
    setDailyExtras(prev => prev.map(ext => {
      if (ext.id !== extraId || !Array.isArray(ext.dailySchedule)) return ext;
      return {
        ...ext,
        isModified: ext.isSaved ? true : undefined,
        dailySchedule: ext.dailySchedule.map((d: any) =>
          d.date === dateStr ? { ...d, enabled: !d.enabled } : d
        )
      };
    }));
  };

  const handleChangeExtraDayQty = (extraId: string, dateStr: string, delta: number) => {
    setDailyExtras(prev => prev.map(ext => {
      if (ext.id !== extraId || !Array.isArray(ext.dailySchedule)) return ext;
      return {
        ...ext,
        isModified: ext.isSaved ? true : undefined,
        dailySchedule: ext.dailySchedule.map((d: any) =>
          d.date === dateStr ? { ...d, qty: Math.max(1, (Number(d.qty) || 1) + delta) } : d
        )
      };
    }));
  };

  const handleVerifyExtrasPin = async () => {
    if (!extrasPin) return;
    setLoading(true);
    setExtrasPinError('');
    const { data: staffData, error } = await supabase.from('staff').select('role, name').eq('pin', extrasPin).single();
    setLoading(false);
    if (error || !staffData || (staffData.role !== 'admin' && staffData.role !== 'manager')) {
      setExtrasPinError('รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็น Admin/Manager)');
      return;
    }
    setShowExtrasPinPrompt(false);
    setExtrasPin('');
    setExtrasManagerUnlocked(true);
    setExtrasManagerName(staffData.name || staffData.role);
  };

  const [showCustomExtraForm, setShowCustomExtraForm] = useState(false);
  const [customExtraName, setCustomExtraName] = useState('');
  const [customExtraPrice, setCustomExtraPrice] = useState<number | ''>('');
  const [customExtraChargeType, setCustomExtraChargeType] = useState<'one_time' | 'per_night'>('one_time');

  const handleAddExtra = (setting: any) => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    const qty = 1;
    const isPerNight = setting.charge_type === 'per_night';
    const currentDates = dailyBreakdown.length > 0
      ? dailyBreakdown.map(d => d.date)
      : [displayDateStr];

    if (isPerNight) {
      const existingIdx = dailyExtras.findIndex(e => e.name === setting.name && e.isPerNight);
      if (existingIdx !== -1) {
        setDailyExtras(prev => prev.map((e, idx) => {
          if (idx !== existingIdx) return e;
          const sched = (Array.isArray(e.dailySchedule) && e.dailySchedule.length > 0
            ? e.dailySchedule
            : currentDates.map(d => ({ date: d, enabled: true, qty: 1 })))
            .map((day: any) => day.isVoided ? day : { ...day, enabled: true, qty: (Number(day.qty) || 1) + 1 });
          return { ...e, qty: (Number(e.qty) || 1) + 1, dailySchedule: sched, isModified: e.isSaved ? true : undefined };
        }));
        return;
      }
    } else {
      const existingOneTimeIdx = dailyExtras.findIndex(e => e.name === setting.name && !e.isPerNight);
      if (existingOneTimeIdx !== -1) {
        setDailyExtras(prev => prev.map((e, idx) =>
          idx === existingOneTimeIdx
            ? { ...e, qty: (Number(e.qty) || 1) + 1, isModified: e.isSaved ? true : undefined }
            : e
        ));
        return;
      }
    }

    const dailySchedule = isPerNight
      ? currentDates.map(d => ({ date: d, enabled: true, qty: 1, isSaved: false, isVoided: false }))
      : undefined;

    setDailyExtras([...dailyExtras, {
      id: Date.now().toString(),
      name: setting.name,
      price: Number(setting.price),
      qty,
      isPerNight,
      dailySchedule,
      amount: isPerNight ? Number(setting.price) * currentDates.length : Number(setting.price)
    }]);
  };

  const handleAddCustomExtraInline = () => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    const trimmed = customExtraName.trim();
    const numPrice = Number(customExtraPrice);
    if (!trimmed || !numPrice || numPrice <= 0) return;
    handleAddExtra({
      name: trimmed,
      price: numPrice,
      charge_type: customExtraChargeType
    });
    setCustomExtraName('');
    setCustomExtraPrice('');
    setShowCustomExtraForm(false);
  };
  
  const handleRemoveExtra = (id: string) => {
    setDailyExtras(dailyExtras.filter(e => e.id !== id));
  };

  const getTotalExtrasAmount = () => dailyExtras.reduce((sum, ext) => sum + extraLineTotal(ext), 0);
  const totalToPay = Number(actualPrice || 0) + (keyDepositEnabled ? Number(keyDepositAmount || 0) : 0) + getTotalExtrasAmount();
  const totalPaid = Math.max(0, pastPayments.reduce((sum, p) => {
    if (String(p.category || '').includes('คืนเงินทอน')) return sum - Math.abs(Number(p.amount));
    return sum + Math.abs(Number(p.amount));
  }, 0));
  const remainingBalance = totalToPay - totalPaid;

  const renderFieldHistory = (fieldKey: string) => {
    const entries = bookingMeta?.history?.[fieldKey];
    if (!entries || entries.length === 0) return null;
    return (
      <div className="mt-1 space-y-0.5 pl-1">
        {entries.map((entry, idx) => (
          <div key={idx} className="text-[11px] text-slate-400/90 flex items-center gap-1.5">
            <span className="line-through">{entry.oldValue || '-'}</span>
            <span className="text-[10px] text-slate-400/75 no-underline">(แก้โดย {entry.by})</span>
          </div>
        ))}
      </div>
    );
  };
  
  // สถานะสำหรับการย้ายห้อง
  const [isChangingRoom, setIsChangingRoom] = useState(false);
  const [showVoidPinPrompt, setShowVoidPinPrompt] = useState(false);
  const [voidPin, setVoidPin] = useState('');
  const [showVoidPanel, setShowVoidPanel] = useState(false);
  const [voidRefundAmount, setVoidRefundAmount] = useState<number | ''>('');
  const [voidReason, setVoidReason] = useState('');
  const [voidRoomStatus, setVoidRoomStatus] = useState<'available' | 'dirty'>('available');
  const [voidError, setVoidError] = useState('');

  const [availableRooms, setAvailableRooms] = useState<{id: string, room_no: string, price_night: number, price_temp: number, location?: string, sort_order?: number}[]>([]);
  const [targetRoomId, setTargetRoomId] = useState<string>('');
  const [oldRoomStatus, setOldRoomStatus] = useState<'dirty' | 'available'>('dirty');
  const [priceDecision, setPriceDecision] = useState<'keep' | 'update'>('keep');

  // สำหรับเลื่อนวัน/ย้ายห้อง (Reschedule)
  const [isReschedulingBooking, setIsReschedulingBooking] = useState(false);
  const [rescheduleCheckIn, setRescheduleCheckIn] = useState<string>('');
  const [rescheduleCheckOut, setRescheduleCheckOut] = useState<string>('');
  const [availableRoomsForReschedule, setAvailableRoomsForReschedule] = useState<{id: string, room_no: string, price_night: number, price_temp: number, location?: string}[]>([]);
  const [rescheduleTargetRoomId, setRescheduleTargetRoomId] = useState<string>('');

  const [dynamicPricingDetails] = useState<{
    base: number;
    weekendSurcharge: number;
    holidaySurcharge: number;
    lowOccupancySurcharge: number;
    total: number;
    isSurgeDisabled: boolean;
    surgeDisableTimeString?: string;
  } | null>(null);

  const [currentLateFee, setCurrentLateFee] = useState<number>(0);
  const [lateCheckoutApplied, setLateCheckoutApplied] = useState(false);
  const lateFeeLockRef = useRef(false);

  useEffect(() => {
    async function checkAndApplyLateFee() {
      if (room.status !== 'occupied' || !room.check_out_time || !room.booking_id || !activeShift) return;
      if (lateFeeLockRef.current) return;
      
      const coTime = new Date(room.check_out_time).getTime();
      // ใช้เวลาจริงเสมอ ไม่ใช้ Simulated Time
      // เพื่อป้องกัน Simulator ทำให้เกิดค่าปรับปลอม
      const nowTime = new Date().getTime();
      if (nowTime <= coTime) return; // Not late (real-time check)
      
      const overdueMinutes = (nowTime - coTime) / (1000 * 60);

      // ถ้าเกิน 225 นาที (15:45) บังคับพักต่ออัตโนมัติ
      if (overdueMinutes >= 225) {
         lateFeeLockRef.current = true;
         try {
           const coDate = new Date(coTime);
           const coDateStr = `${coDate.getFullYear()}-${String(coDate.getMonth() + 1).padStart(2, '0')}-${String(coDate.getDate()).padStart(2, '0')}`;
           const newCheckout = new Date(coTime);
           newCheckout.setDate(newCheckout.getDate() + 1);
           const addRate = Number(room.price_night || 0);

           // 1. Void ค่าปรับออกช้า (คง amount เดิมไว้ แต่เปลี่ยน category)
           await supabase.from('ledger_transactions').update({ category: 'ค่าปรับออกช้า (Voided)' }).eq('booking_id', room.booking_id).eq('category', 'ค่าปรับออกช้า');

           // 2. หากมีตาราง booking_daily_rates ให้เพิ่มแถวของคืนที่บังคับพักต่อด้วย (กันซ้ำด้วย target_date)
           const { data: existRates } = await supabase
             .from('booking_daily_rates')
             .select('id, target_date')
             .eq('booking_id', room.booking_id);
           const alreadyHasDate = (existRates || []).some(r => r.target_date === coDateStr);

           if (!alreadyHasDate) {
             if (existRates && existRates.length > 0) {
               await supabase.from('booking_daily_rates').insert({
                 booking_id: room.booking_id,
                 target_date: coDateStr,
                 amount: addRate,
                 is_manual_override: false
               });
             }
             await supabase.from('ledger_transactions').insert({
               shift_id: activeShift.id,
               staff_name: activeShift.staff_name,
               room_id: room.id,
               booking_id: room.booking_id,
               transaction_type: 'revenue',
               category: existRates && existRates.length > 0 ? 'room_charge' : 'ค่าห้องพัก (บังคับพักต่อ)',
               notes: `บังคับพักต่อ (เกิน 15:45 น. • ประจำวันที่ ${coDateStr})`,
               amount: addRate
             });
           }

           // 3. อัปเดตเวลาออกและราคารวม
           const nextActual = Number(room.actual_price || 0) + (alreadyHasDate ? 0 : addRate);
           if (dateOffset === 0) {
             await supabase.from('rooms').update({ check_out_time: newCheckout.toISOString(), stay_type: 'overnight', actual_price: nextActual }).eq('id', room.id);
           }
           await supabase.from('bookings').update({ check_out_time: newCheckout.toISOString(), actual_price: nextActual }).eq('room_id', room.id).eq('id', room.booking_id);
           
           onUpdate();
         } finally {
           lateFeeLockRef.current = false;
         }
         return; 
      }

      // 12:00 ถึง 12:44 (ผ่อนผัน 44 นาที) ยังไม่มีค่าปรับ
      if (overdueMinutes < 45) {
         setCurrentLateFee(0);
         return;
      }
      
      let hoursLate = 1; // 12:45 - 13:44
      if (overdueMinutes >= 165) hoursLate = 3; // 14:45 - 15:44
      else if (overdueMinutes >= 105) hoursLate = 2; // 13:45 - 14:44
      
      const type = (room.room_type || '').toLowerCase();
      let baseHour1 = 150, addHour = 100; // Single
      if (type.includes('บ้าน')) { baseHour1 = 400; addHour = 300; }
      else if (type.includes('คู่')) { baseHour1 = 250; addHour = 200; }

      let expectedFee = 0;
      if (hoursLate === 1) expectedFee = baseHour1;
      else if (hoursLate === 2) expectedFee = baseHour1 + addHour;
      else if (hoursLate >= 3) expectedFee = baseHour1 + (addHour * 2);

      setCurrentLateFee(expectedFee);

      // Check ledger
      const { data: ledgers } = await supabase
        .from('ledger_transactions')
        .select('id, amount')
        .eq('booking_id', room.booking_id)
        .eq('category', 'ค่าปรับออกช้า');
        
      const currentAppliedFee = ledgers?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;

      if (currentAppliedFee !== expectedFee) {
        if (ledgers && ledgers.length > 0) {
           await supabase.from('ledger_transactions').update({ amount: expectedFee }).eq('id', ledgers[0].id);
        } else {
           await supabase.from('ledger_transactions').insert({
             shift_id: activeShift.id,
             staff_name: activeShift.staff_name,
             room_id: room.id,
             booking_id: room.booking_id,
             transaction_type: 'revenue',
             category: 'ค่าปรับออกช้า',
             amount: expectedFee
           });
        }
        setLateCheckoutApplied(prev => !prev);
      }
    }
    checkAndApplyLateFee();
  }, [room.status, room.check_out_time, room.booking_id, activeShift]);
  // คำนวณ Time Band
  const now = getNow();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const nowCalendarDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // หากปิดกะสุดท้ายตั้งแต่ 05:30 น. และเริ่มวันใหม่แล้ว ให้ช่วง 05:30-06:44 นับเป็นเข้าพักก่อนเวลาของวันใหม่ (early_in) แทนรอบดึกของเมื่อวาน
  const isNewDayStartedEarly = currentBusinessDate === nowCalendarDateStr;
  let timeBand = 'normal';
  if (dateOffset === 0) {
    const totalMinutes = currentHour * 60 + currentMinute;
    if (totalMinutes < 6 * 60 + 45 && !isNewDayStartedEarly) { // 00:00 ถึง 06:44 (กรณีที่ยังไม่ปิดกะสุดท้ายเริ่มวันใหม่)
      timeBand = 'late_night';
    } else if (totalMinutes < 9 * 60 + 45) { // 06:45 ถึง 09:44 (หรือ 05:30-06:44 หลังเปิดกะวันใหม่แล้ว)
      timeBand = 'early_in';
    }
  }

  const getNextNoon = (startDate: Date, nightsCount: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + nightsCount);
    d.setHours(12, 0, 0, 0);
    return d;
  };


  const handleScanSlip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsScanningSlip(true);
    try {
      const formData = new FormData();
      formData.append('slip', file);
      
      const res = await fetch('/api/ocr-slip', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('AI Error');
      const data = await res.json();
      
      if (data.amount) {
        setPayTransfer(Number(data.amount));
        if (Number(data.amount) === totalToPay) {
           setPayCash('');
           setPayCredit('');
        }
      }
      if (data.date && data.time) {
        setPaymentTime(`${data.date}T${data.time}`);
      }
      alert(`AI ดึงข้อมูลสำเร็จ!
ธนาคาร: ${data.sender_bank || '-'}
ยอดเงิน: ${data.amount || '-'}`);
    } catch (err) {
      alert('AI ไม่สามารถอ่านข้อมูลสลิปนี้ได้ หรือ API Error');
    } finally {
      setIsScanningSlip(false);
    }
  };

  const handleCheckIn = async (type: 'overnight' | 'short_stay', isReservationForToday: boolean = false) => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    if (!activeShift) {
      alert('กรุณาเปิดกะก่อนทำการจองหรือ Check-in');
      return;
    }
    if (!skipPhone && (!guestPhone.trim() || guestPhone.length !== 10 || !/^\d+$/.test(guestPhone))) {
      setPendingCheckInAfterPhone({ isReservationForToday });
      alert('กรุณากรอกเบอร์โทรศัพท์ลูกค้า (ตัวเลข 10 หลัก) ให้ถูกต้อง\nหรือกด "ไม่ระบุเบอร์" หากลูกค้าไม่สะดวกให้เบอร์');
      setTimeout(() => {
        phoneInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        phoneInputRef.current?.focus();
      }, 50);
      return;
    }
    setPendingCheckInAfterPhone(null);
    if (submitLockRef.current) return; // กันกดซ้ำรัวๆ ก่อน state loading อัปเดต
    submitLockRef.current = true;
    setLoading(true);
    const startDate = (dateOffset === 0 && !isReservationForToday) ? getNow() : new Date(displayDateStr);
    if (dateOffset > 0 || isReservationForToday) {
      // ถ้าจองล่วงหน้า หรือจองของวันนี้ที่ยังไม่มาถึง ให้เวลาเริ่มคือ 14:00 น. ของวันนั้น
      startDate.setHours(14, 0, 0, 0);
    }

    let checkoutDate = new Date(startDate);

    if (type === 'overnight') {
      checkoutDate = getNextNoon(startDate, Number(nights) || 0);
    } else {
      checkoutDate = new Date(startDate.getTime() + (Number(hours) || 1) * 60 * 60 * 1000);
    }

    // 0. กันจองซ้อนทับ: ห้องนี้ต้องไม่มีการจอง/เข้าพักอื่นที่ช่วงเวลาทับซ้อนกัน
    const { data: overlaps } = await supabase
      .from('bookings')
      .select('id, guest_name, check_in_time, check_out_time, status')
      .eq('room_id', room.id)
      .in('status', ['reserved', 'checked_in'])
      .lt('check_in_time', checkoutDate.toISOString())
      .gt('check_out_time', startDate.toISOString())
      .limit(1);
    if (overlaps && overlaps.length > 0) {
      const o = overlaps[0];
      alert(`ห้อง ${room.room_no} มีการจอง/เข้าพักทับซ้อนช่วงเวลานี้แล้ว\nผู้เข้าพัก: ${o.guest_name || '(ไม่ระบุชื่อ)'}\n${new Date(o.check_in_time).toLocaleString('th-TH')} - ${new Date(o.check_out_time).toLocaleString('th-TH')}\n\nกรุณาเลือกห้องหรือช่วงวันอื่น`);
      setLoading(false);
      submitLockRef.current = false;
      return;
    }

    // 1. บันทึกลงตาราง Bookings (ประวัติ/สมุดจอง)
    const { data: insertedBooking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        room_id: room.id,
        guest_name: guestName.trim() || 'ไม่ระบุชื่อ',
        guest_phone: guestPhone.trim(),
        check_in_time: startDate.toISOString(),
        check_out_time: checkoutDate.toISOString(),
        status: (dateOffset === 0 && !isReservationForToday) ? 'checked_in' : 'reserved',
        actual_check_in_time: (dateOffset === 0 && !isReservationForToday) ? startDate.toISOString() : null,
        guest_count: Number(guestCount) || 1,
        actual_price: actualPrice === '' ? null : Number(actualPrice),
        staff_name: effectiveStaffName
      })
      .select('id')
      .single();

    // 1.5 บันทึกรายได้และรายการต่างๆ (Revenue & Extras)
    if (insertedBooking) {
        // --- 1. บันทึกมัดจำกุญแจ (ถ้ามี) ---
        if (keyDepositEnabled && Number(keyDepositAmount) > 0) {
          await supabase.from('ledger_transactions').insert({
            shift_id: activeShift.id,
            staff_name: effectiveStaffName,
            room_id: room.id,
            booking_id: insertedBooking.id,
            transaction_type: 'deposit',
            category: 'ค่ามัดจำกุญแจ',
            amount: Number(keyDepositAmount)
          });
        }

        if (type === 'overnight') {
          const firstNightDate = dailyBreakdown.length > 0 ? dailyBreakdown[0].date : startDate.toLocaleDateString('en-CA');

          // --- 1.6 บันทึก Extra Charges (แยกบริการเสริมรายวันลง booking_daily_extras และตัดเข้าบิลเฉพาะคืนแรก) ---
          if (dailyExtras.length > 0) {
            const dailyExtraInserts: any[] = [];
            const firstNightLedgerExtras: any[] = [];

            dailyExtras.forEach(ext => {
              if (ext.isPerNight && Array.isArray(ext.dailySchedule) && ext.dailySchedule.length > 0) {
                const activeDays = ext.dailySchedule.filter((d: any) => d.enabled && !d.isVoided && (Number(d.qty) || 0) > 0);
                activeDays.forEach((d: any) => {
                  const dayAmt = Number(ext.price || 0) * (Number(d.qty) || 1);
                  dailyExtraInserts.push({
                    booking_id: insertedBooking.id,
                    target_date: d.date,
                    category: ext.name,
                    description: `บริการเสริมรายวัน (${d.date})${(Number(d.qty) || 1) > 1 ? ` x${d.qty}` : ''}`,
                    amount: dayAmt
                  });
                  if (d.date === firstNightDate && dayAmt > 0) {
                    firstNightLedgerExtras.push({
                      shift_id: activeShift.id,
                      staff_name: effectiveStaffName,
                      room_id: room.id,
                      booking_id: insertedBooking.id,
                      transaction_type: 'revenue',
                      category: ext.name,
                      notes: `ประจำวันที่ ${d.date}${(Number(d.qty) || 1) > 1 ? ` (x${d.qty})` : ''}`,
                      amount: dayAmt
                    });
                  }
                });
              } else {
                const amt = extraLineTotal(ext);
                if (amt > 0) {
                  firstNightLedgerExtras.push({
                    shift_id: activeShift.id,
                    staff_name: effectiveStaffName,
                    room_id: room.id,
                    booking_id: insertedBooking.id,
                    transaction_type: 'revenue',
                    category: ext.name,
                    notes: ext.isPerNight ? '(' + (nights || 1) + ' คืน)' : ((Number(ext.qty) || 1) > 1 ? `(x${ext.qty})` : null),
                    amount: amt
                  });
                }
              }
            });

            if (dailyExtraInserts.length > 0) {
              await supabase.from('booking_daily_extras').insert(dailyExtraInserts);
            }
            if (firstNightLedgerExtras.length > 0) {
              await supabase.from('ledger_transactions').insert(firstNightLedgerExtras);
            }
          }

          if (dailyBreakdown.length > 0) {
            // --- 2. บันทึกราคาห้องพักรายวัน (Booking Daily Rates) ---
            const inserts = dailyBreakdown.map(d => ({
              booking_id: insertedBooking.id,
              target_date: d.date,
              amount: d.actualPrice === '' ? 0 : d.actualPrice,
              original_rate_plan_id: selectedRatePlanId || null,
              is_manual_override: d.isOverride
            }));
            const { error: ratesError } = await supabase.from('booking_daily_rates').insert(inserts);
            if (ratesError) console.error('booking_daily_rates insert error:', ratesError);

            // --- 4. บันทึกบัญชี (Ledger) สำหรับ "คืนแรก" ทันที ---
            const firstNightPrice = dailyBreakdown[0].actualPrice === '' ? 0 : dailyBreakdown[0].actualPrice;
            if (firstNightPrice > 0) {
              await supabase.from('ledger_transactions').insert({
                shift_id: activeShift.id,
                staff_name: effectiveStaffName,
                room_id: room.id,
                booking_id: insertedBooking.id,
                transaction_type: 'revenue',
                category: 'room_charge',
                amount: Number(firstNightPrice)
              });
            }
          }
        } else {
          // --- กรณี Short Stay ---
          if (actualPrice !== '') {
            await supabase.from('ledger_transactions').insert({
              shift_id: activeShift.id,
              staff_name: effectiveStaffName,
              room_id: room.id,
              booking_id: insertedBooking.id,
              transaction_type: 'revenue',
              category: 'room_charge',
              amount: Number(actualPrice)
            });
          }
        }

        // --- 5. บันทึกการรับชำระเงิน (Payment) แยกช่องทาง ---
        let cash = 0;
        let transfer = 0;
        let credit = 0;

        if (isSplitPayment) {
          cash = Number(payCash) || 0;
          transfer = Number(payTransfer) || 0;
          credit = Number(payCredit) || 0;
        } else {
          if (paymentMethod === 'cash') cash = totalToPay;
          else if (paymentMethod === 'transfer') transfer = totalToPay;
          else if (paymentMethod === 'credit') credit = totalToPay;
        }
        
        
    
        const paymentInserts = [];
        if (cash > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: effectiveStaffName, room_id: room.id, booking_id: insertedBooking.id, transaction_type: 'payment', category: 'cash', amount: -cash });
        if (transfer > 0) {
          const transferNote = `[BANK:${selectedBank || 'SCB'}]${paymentTime ? ` โอนเวลา: ${paymentTime.replace('T', ' ')}` : ''}`;
          paymentInserts.push({ shift_id: activeShift.id, staff_name: effectiveStaffName, room_id: room.id, booking_id: insertedBooking.id, transaction_type: 'payment', category: 'transfer', amount: -transfer, notes: transferNote });
        }
        if (credit > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: effectiveStaffName, room_id: room.id, booking_id: insertedBooking.id, transaction_type: 'payment', category: 'credit_card', amount: -credit });
        
        if (paymentInserts.length > 0) {
          await supabase.from('ledger_transactions').insert(paymentInserts);
        }

        // --- 6. บันทึกราคาเป้าหมายและข้อมูลตั้งต้น (Booking Meta) เพื่อใช้คำนวณส่วนลด/รายได้ส่วนเพิ่มในรายงานประจำวัน ---
        const dailyTargets: Record<string, number> = {};
        dailyBreakdown.forEach(d => { dailyTargets[d.date] = d.targetPrice; });
        const targetTotal = type === 'overnight'
          ? (dailyBreakdown.length > 0 ? Number(totalTargetPrice || 0) : Number(room.price_night || 0))
          : Number(totalTargetPrice || shortStayBase3Hr || room.price_temp || 0);
        await supabase.from('system_settings').upsert({
          key: `booking_meta_${insertedBooking.id}`,
          value: {
            history: {},
            targetPrices: {
              totalTargetPrice: targetTotal,
              dailyTargets,
              timeBand,
              stayType: type
            }
          }
        }, { onConflict: 'key' });

    }
    // 2. ถ้าเป็นการ Check-in จริงๆ ใน "วันนี้" (ไม่ใช่แค่จอง) ให้บันทึกลงตาราง Rooms ด้วย
    if (dateOffset === 0 && !isReservationForToday && !bookingError) {
      await supabase
        .from('rooms')
        .update({
          status: 'occupied',
          stay_type: type,
          check_in_time: startDate.toISOString(),
          check_out_time: checkoutDate.toISOString(),
          guest_count: Number(guestCount) || 1,
          current_status: `มีแขก (${type === 'overnight' ? 'ค้างคืน' : 'ชั่วคราว'})`,
          actual_price: actualPrice === '' ? null : Number(actualPrice),
          staff_name: effectiveStaffName
        })
        .eq('id', room.id);
    }

    setLoading(false);
    submitLockRef.current = false;
    if (bookingError) {
      alert('บันทึกการจอง/เช็คอินไม่สำเร็จ: ' + bookingError.message);
    }
    if (!bookingError && insertedBooking) {
      const actionType = (dateOffset === 0 && !isReservationForToday) ? 'checkin' : 'reserve';
      const extrasDesc = dailyExtras.length > 0
        ? ` | บริการเสริม: ${dailyExtras.map(e => `${e.name}(฿${extraLineTotal(e)})`).join(', ')}`
        : '';
      await logActivity({
        category: 'checkin',
        action: actionType,
        staffName: effectiveStaffName,
        shiftName: activeShift?.staff_name || null,
        roomNo: room.room_no,
        target: `ห้อง ${room.room_no} (${guestName.trim() || 'ไม่ระบุชื่อ'})`,
        details: `${actionType === 'checkin' ? 'เช็คอิน' : 'จองห้องพัก'} ห้อง ${room.room_no} (${type === 'overnight' ? `ค้างคืน ${nights} คืน` : `ชั่วคราว ${hours} ชม.`}) ราคาค่าห้อง ฿${Number(actualPrice || 0).toLocaleString()}${keyDepositEnabled && Number(keyDepositAmount) > 0 ? ` + มัดจำ ฿${Number(keyDepositAmount).toLocaleString()}` : ''}${extrasDesc}`
      });
      setNewBookingId(insertedBooking.id);
      onClose();
    } else {
      onUpdate();
    }
  };

  const handleSaveManagerEdits = async () => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    if (!room.booking_id) return;
    if (!skipPhone && (!guestPhone.trim() || guestPhone.length !== 10 || !/^\d+$/.test(guestPhone))) {
      alert('กรุณากรอกเบอร์โทรศัพท์ลูกค้า (ตัวเลข 10 หลัก) ให้ถูกต้อง\nหรือกด "ไม่ระบุเบอร์" หากลูกค้าไม่สะดวกให้เบอร์');
      setTimeout(() => {
        phoneInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        phoneInputRef.current?.focus();
      }, 50);
      return;
    }

    setLoading(true);
    const nowIso = getNow().toISOString();
    const editor = extrasManagerName || effectiveStaffName;
    const nextHistory: Record<string, FieldEditEntry[]> = { ...(bookingMeta.history || {}) };
    const pushHist = (key: string, oldVal: string, newVal: string) => {
      if (oldVal === newVal) return;
      nextHistory[key] = [...(nextHistory[key] || []), { oldValue: oldVal, newValue: newVal, by: editor, at: nowIso }];
    };

    const oldDepAmt = initialSnapshot ? (initialSnapshot.keyDepositEnabled ? Number(initialSnapshot.keyDepositAmount || 0) : 0) : (initialKeyDepositStatus ? Number(existingDepositTx?.amount || 0) : 0);
    const newDepAmt = keyDepositEnabled ? Number(keyDepositAmount || 0) : 0;

    if (initialSnapshot) {
      pushHist('guest_phone', initialSnapshot.guestPhone || 'ไม่ระบุเบอร์', guestPhone.trim() || 'ไม่ระบุเบอร์');
      pushHist('guest_name', initialSnapshot.guestName || '(ไม่ระบุชื่อ)', guestName.trim() || '(ไม่ระบุชื่อ)');
      pushHist('stay_type', initialSnapshot.stayType === 'overnight' ? 'ค้างคืน' : 'ชั่วคราว', activeTab === 'overnight' ? 'ค้างคืน' : 'ชั่วคราว');
      const oldDur = initialSnapshot.stayType === 'overnight' ? `${initialSnapshot.nights} คืน` : `${initialSnapshot.hours} ชม.`;
      const newDur = activeTab === 'overnight' ? `${nights === '' ? 0 : nights} คืน` : `${hours === '' ? 1 : hours} ชม.`;
      pushHist('nights', oldDur, newDur);
      if (Number(initialSnapshot.actualPrice || 0) !== Number(actualPrice || 0)) {
        pushHist('actual_price', `฿${Number(initialSnapshot.actualPrice || 0).toLocaleString()}`, `฿${Number(actualPrice || 0).toLocaleString()}`);
      }
      dailyBreakdown.forEach(day => {
        const oldDay = initialSnapshot.dailyRates[day.date];
        if (oldDay !== undefined && Number(oldDay) !== Number(day.actualPrice || 0)) {
          pushHist(`daily_rate_${day.date}`, `฿${Number(oldDay).toLocaleString()}`, `฿${Number(day.actualPrice || 0).toLocaleString()}`);
        }
      });
    }
    if (oldDepAmt !== newDepAmt) {
      pushHist('key_deposit', oldDepAmt > 0 ? `฿${oldDepAmt.toLocaleString()}` : 'ไม่เก็บมัดจำ (฿0)', newDepAmt > 0 ? `฿${newDepAmt.toLocaleString()}` : 'ไม่เก็บมัดจำ (฿0)');
    }

    const baseInDate = room.check_in_time ? new Date(room.check_in_time) : new Date(displayDateStr);
    const updatedCheckout = activeTab === 'overnight'
      ? getNextNoon(baseInDate, Number(nights) || 0)
      : new Date(baseInDate.getTime() + (Number(hours) || 1) * 3600000);

    await supabase.from('bookings').update({
      guest_name: guestName.trim() || 'ไม่ระบุชื่อ',
      guest_phone: guestPhone.trim(),
      check_out_time: updatedCheckout.toISOString(),
      actual_price: actualPrice === '' ? 0 : Number(actualPrice),
      staff_name: staffName || null
    }).eq('id', room.booking_id);

    if (room.status === 'occupied' && dateOffset === 0) {
      await supabase.from('rooms').update({
        stay_type: activeTab,
        check_out_time: updatedCheckout.toISOString(),
        actual_price: actualPrice === '' ? 0 : Number(actualPrice),
        staff_name: staffName || null,
        key_deposit: newDepAmt
      }).eq('id', room.id);
    }

    if (activeTab === 'overnight' && dailyBreakdown.length > 0) {
      await supabase.from('booking_daily_rates').delete().eq('booking_id', room.booking_id);
      const rateInserts = dailyBreakdown.map(d => ({
        booking_id: room.booking_id,
        target_date: d.date,
        amount: d.actualPrice === '' ? 0 : Number(d.actualPrice),
        original_rate_plan_id: selectedRatePlanId || null,
        is_manual_override: d.isOverride
      }));
      await supabase.from('booking_daily_rates').insert(rateInserts);
      setSavedDailyRates(rateInserts);

      // Sync per-night extras in booking_daily_extras when edited by Manager/Admin
      const perNightExtras = dailyExtras.filter(e => e.isPerNight && Array.isArray(e.dailySchedule));
      for (const ext of perNightExtras) {
        for (const day of ext.dailySchedule) {
          const dayAmt = Number(ext.price || 0) * (Number(day.qty) || 1);
          if (day.dbId) {
            if (!day.enabled && !day.isVoided) {
              await supabase.from('booking_daily_extras').update({
                category: `${ext.name} (Voided)`,
                description: `ยกเลิกโดย ${editor} (${day.date})`
              }).eq('id', day.dbId);
              pushHist(`extra_${day.date}`, `${ext.name} (${day.date}) ฿${dayAmt.toLocaleString()}`, `ยกเลิก ฿0`);
            } else if (day.enabled && !day.isVoided) {
              await supabase.from('booking_daily_extras').update({
                amount: dayAmt,
                description: `บริการเสริมรายวัน (${day.date})${(Number(day.qty) || 1) > 1 ? ` x${day.qty}` : ''}`
              }).eq('id', day.dbId);
            }
          } else if (day.enabled && !day.isVoided && dayAmt > 0) {
            await supabase.from('booking_daily_extras').insert({
              booking_id: room.booking_id,
              target_date: day.date,
              category: ext.name,
              description: `บริการเสริมรายวัน (${day.date})${(Number(day.qty) || 1) > 1 ? ` x${day.qty}` : ''}`,
              amount: dayAmt
            });
          }
        }
      }
    }

    const expectedFirstCharge = activeTab === 'overnight' && dailyBreakdown.length > 0
      ? Number(dailyBreakdown[0].actualPrice || 0)
      : Number(actualPrice || 0);
    const { data: roomTxs } = await supabase
      .from('ledger_transactions')
      .select('id, amount, category')
      .eq('booking_id', room.booking_id)
      .in('category', ['room_charge', 'ค่าห้องพัก']);
    const activeRoomTx = roomTxs?.find(t => !t.category.includes('Voided'));
    if (activeRoomTx && Number(activeRoomTx.amount) !== expectedFirstCharge) {
      pushHist(`tx_${activeRoomTx.id}`, `฿${Number(activeRoomTx.amount).toLocaleString()}`, `฿${expectedFirstCharge.toLocaleString()}`);
      await supabase.from('ledger_transactions').update({
        amount: expectedFirstCharge,
        notes: `แก้ไขราคาโดย ${editor} (เดิม ฿${Number(activeRoomTx.amount).toLocaleString()})`
      }).eq('id', activeRoomTx.id);
    }

    if (oldDepAmt !== newDepAmt) {
      if (newDepAmt > 0) {
        if (existingDepositTx) {
          await supabase.from('ledger_transactions').update({
            amount: newDepAmt,
            notes: `แก้มัดจำจาก ฿${oldDepAmt.toLocaleString()} โดย ${editor}`
          }).eq('id', existingDepositTx.id);
          setExistingDepositTx({ id: existingDepositTx.id, amount: newDepAmt });
        } else if (activeShift) {
          const { data: insDep } = await supabase.from('ledger_transactions').insert({
            shift_id: activeShift.id,
            staff_name: activeShift.staff_name,
            room_id: room.id,
            booking_id: room.booking_id,
            transaction_type: 'deposit',
            category: 'ค่ามัดจำกุญแจ',
            amount: newDepAmt,
            notes: `เพิ่มมัดจำโดย ${editor}`
          }).select('id, amount').single();
          if (insDep) setExistingDepositTx({ id: insDep.id, amount: Number(insDep.amount) });
        }
        setInitialKeyDepositStatus(true);
      } else {
        if (existingDepositTx) {
          await supabase.from('ledger_transactions').update({
            category: 'ค่ามัดจำกุญแจ (Voided)',
            notes: `ยกเลิกมัดจำโดย ${editor}`
          }).eq('id', existingDepositTx.id);
          setExistingDepositTx(null);
        }
        setInitialKeyDepositStatus(false);
      }
      await supabase.from('rooms').update({ key_deposit: newDepAmt }).eq('id', room.id);
    }

    const dailyTargets: Record<string, number> = { ...(bookingMeta.targetPrices?.dailyTargets || {}) };
    dailyBreakdown.forEach(d => { dailyTargets[d.date] = d.targetPrice; });
    const updatedMeta: BookingMeta = {
      ...bookingMeta,
      history: nextHistory,
      targetPrices: {
        totalTargetPrice: activeTab === 'overnight' ? Number(totalTargetPrice || 0) : Number(totalTargetPrice || shortStayBase3Hr || room.price_temp || 0),
        dailyTargets,
        timeBand: bookingMeta.targetPrices?.timeBand || timeBand,
        stayType: activeTab
      }
    };
    await supabase.from('system_settings').upsert({
      key: `booking_meta_${room.booking_id}`,
      value: updatedMeta
    }, { onConflict: 'key' });
    setBookingMeta(updatedMeta);

    const newDailyRatesMap: Record<string, number> = {};
    dailyBreakdown.forEach(d => { newDailyRatesMap[d.date] = Number(d.actualPrice || 0); });
    setInitialSnapshot({
      guestPhone: guestPhone.trim(),
      guestName: guestName.trim(),
      stayType: activeTab,
      nights: Number(nights) || 0,
      hours: Number(hours) || 1,
      actualPrice: Number(actualPrice || 0),
      dailyRates: newDailyRatesMap,
      keyDepositEnabled,
      keyDepositAmount: newDepAmt
    });
    setExtrasManagerUnlocked(false);
    await logActivity({
      category: 'checkin',
      action: 'update',
      staffName: editor,
      shiftName: activeShift?.staff_name || null,
      roomNo: room.room_no,
      target: `ห้อง ${room.room_no} (${guestName.trim() || 'ไม่ระบุชื่อ'})`,
      details: `แก้ไขข้อมูลการเข้าพักห้อง ${room.room_no} (ราคาค่าห้อง: ฿${Number(actualPrice || 0).toLocaleString()}, มัดจำ: ฿${newDepAmt.toLocaleString()}${extrasEditNote.trim() ? `, หมายเหตุ: ${extrasEditNote.trim()}` : ''})`
    });
    setLoading(false);
    onUpdate();
  };

  const handleAdditionalPayment = async () => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    if (!activeShift) {
      alert('กรุณาเปิดกะก่อนทำรายการ');
      return;
    }
    if (!room.booking_id) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    
    setLoading(true);
    if (extrasManagerUnlocked) {
      await handleSaveManagerEdits();
    }

    let cash = 0;
    let transfer = 0;
    let credit = 0;

    if (isSplitPayment) {
      cash = Number(payCash) || 0;
      transfer = Number(payTransfer) || 0;
      credit = Number(payCredit) || 0;
    } else {
      if (paymentMethod === 'cash') cash = remainingBalance;
      else if (paymentMethod === 'transfer') transfer = remainingBalance;
      else if (paymentMethod === 'credit') credit = remainingBalance;
    }
    

    // Sync Key Deposit Charge for existing bookings (กรณีพนักงานแก้ไขมัดจำในสถานะจอง)
    const oldDepAmt = initialKeyDepositStatus ? Number(existingDepositTx?.amount || 0) : 0;
    const newDepAmt = keyDepositEnabled ? Number(keyDepositAmount || 0) : 0;
    if (oldDepAmt !== newDepAmt) {
      if (newDepAmt > 0) {
        if (existingDepositTx) {
          await supabase.from('ledger_transactions').update({ amount: newDepAmt, notes: `แก้มัดจำจาก ฿${oldDepAmt.toLocaleString()} โดย ${actorName}` }).eq('id', existingDepositTx.id);
          setExistingDepositTx({ id: existingDepositTx.id, amount: newDepAmt });
        } else {
          const { data: insDep } = await supabase.from('ledger_transactions').insert({
            shift_id: activeShift.id, staff_name: actorName,
            room_id: room.id, booking_id: room.booking_id,
            transaction_type: 'deposit', category: 'ค่ามัดจำกุญแจ', amount: newDepAmt
          }).select('id, amount').single();
          if (insDep) setExistingDepositTx({ id: insDep.id, amount: Number(insDep.amount) });
        }
        setInitialKeyDepositStatus(true);
      } else {
        if (existingDepositTx) {
          await supabase.from('ledger_transactions').update({ category: 'ค่ามัดจำกุญแจ (Voided)', notes: `ยกเลิกมัดจำโดย ${actorName}` }).eq('id', existingDepositTx.id);
          setExistingDepositTx(null);
        }
        setInitialKeyDepositStatus(false);
      }
      await supabase.from('rooms').update({ key_deposit: newDepAmt }).eq('id', room.id);

      const nowIso = getNow().toISOString();
      const nextHistory: Record<string, FieldEditEntry[]> = { ...(bookingMeta.history || {}) };
      nextHistory.key_deposit = [
        ...(nextHistory.key_deposit || []),
        {
          oldValue: oldDepAmt > 0 ? `฿${oldDepAmt.toLocaleString()}` : 'ไม่เก็บมัดจำ (฿0)',
          newValue: newDepAmt > 0 ? `฿${newDepAmt.toLocaleString()}` : 'ไม่เก็บมัดจำ (฿0)',
          by: actorName,
          at: nowIso
        }
      ];
      const updatedMeta: BookingMeta = { ...bookingMeta, history: nextHistory };
      await supabase.from('system_settings').upsert({ key: `booking_meta_${room.booking_id}`, value: updatedMeta }, { onConflict: 'key' });
      setBookingMeta(updatedMeta);
    }
    const paymentInserts: any[] = [];
    let newExtrasTotal = 0;
    const firstNightDate = dailyBreakdown.length > 0 ? dailyBreakdown[0].date : displayDateStr;
    
    // Process new extras
    const newExtras = dailyExtras.filter(e => !e.isSaved);
    if (newExtras.length > 0) {
      const dailyExtraInserts: any[] = [];
      newExtras.forEach(ext => {
        if (ext.isPerNight && Array.isArray(ext.dailySchedule) && ext.dailySchedule.length > 0) {
          const activeDays = ext.dailySchedule.filter((d: any) => d.enabled && !d.isVoided && (Number(d.qty) || 0) > 0);
          activeDays.forEach((d: any) => {
            const dayAmt = Number(ext.price || 0) * (Number(d.qty) || 1);
            dailyExtraInserts.push({
              booking_id: room.booking_id,
              target_date: d.date,
              category: ext.name,
              description: `บริการเสริมรายวัน (${d.date})${(Number(d.qty) || 1) > 1 ? ` x${d.qty}` : ''}`,
              amount: dayAmt
            });
            if (d.date === firstNightDate && dayAmt > 0) {
              paymentInserts.push({
                shift_id: activeShift.id,
                staff_name: actorName,
                room_id: room.id,
                booking_id: room.booking_id,
                transaction_type: 'revenue',
                category: ext.name,
                notes: `ประจำวันที่ ${d.date}${(Number(d.qty) || 1) > 1 ? ` (x${d.qty})` : ''}`,
                amount: dayAmt
              });
            }
          });
          newExtrasTotal += extraLineTotal(ext);
        } else {
          paymentInserts.push({
            shift_id: activeShift.id,
            staff_name: actorName,
            room_id: room.id,
            booking_id: room.booking_id,
            transaction_type: 'revenue',
            category: ext.name,
            notes: ext.isPerNight ? '(' + (nights || 1) + ' คืน)' : null,
            amount: extraLineTotal(ext)
          });
          newExtrasTotal += extraLineTotal(ext);
        }
      });
      if (dailyExtraInserts.length > 0) {
        await supabase.from('booking_daily_extras').insert(dailyExtraInserts);
      }
    }

    // Process manager modified saved extras
    if (extrasManagerUnlocked && extrasEditNote.trim()) {
      const modifiedExtras = dailyExtras.filter(e => e.isSaved && e.isModified);
      for (const ext of modifiedExtras) {
        const oldAmount = ext.savedAmount || 0;
        const newAmount = extraLineTotal(ext);
        if (oldAmount !== newAmount) {
          // 1. Void old ledger entry
          await supabase.from('ledger_transactions').update({ category: ext.name + ' (Voided)' }).eq('id', ext.id);
          // 2. Insert new entry
          paymentInserts.push({
            shift_id: activeShift.id,
            staff_name: actorName,
            room_id: room.id,
            booking_id: room.booking_id,
            transaction_type: 'revenue',
            category: ext.name,
            notes: (ext.isPerNight ? '(' + (nights || 1) + ' คืน) ' : '') + 'แก้โดย ' + extrasManagerName + ': ' + extrasEditNote,
            amount: newAmount
          });
          newExtrasTotal += (newAmount - oldAmount);
        }
      }
    }
    if (cash > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: actorName, room_id: room.id, booking_id: room.booking_id, transaction_type: 'payment', category: 'cash', amount: -cash });
    if (transfer > 0) {
      const transferNote = `[BANK:${selectedBank || 'SCB'}]${paymentTime ? ` โอนเวลา: ${paymentTime.replace('T', ' ')}` : ''}`;
      paymentInserts.push({ shift_id: activeShift.id, staff_name: actorName, room_id: room.id, booking_id: room.booking_id, transaction_type: 'payment', category: 'transfer', amount: -transfer, notes: transferNote });
    }
    if (credit > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: actorName, room_id: room.id, booking_id: room.booking_id, transaction_type: 'payment', category: 'credit_card', amount: -credit });
    
    if (paymentInserts.length > 0) {
      await supabase.from('ledger_transactions').insert(paymentInserts);
      
      const totalNewPayment = cash + transfer + credit;
      const { data: booking } = await supabase.from('bookings').select('unpaid_balance').eq('id', room.booking_id).single();
      if (booking) {
        const newBalance = (booking.unpaid_balance || 0) - (totalNewPayment - newExtrasTotal);
        await supabase.from('bookings').update({ unpaid_balance: newBalance }).eq('id', room.booking_id);
      }
      setDailyExtras(prev => prev.map(e => ({...e, isSaved: true})));
    }
    
    
    setPayCash('');
    setPayTransfer('');
    setPayCredit('');
    setPaymentTime('');
    setDailyExtras([]); // clear extras after save
    setLoading(false);
    submitLockRef.current = false;

    onUpdate();
  };

  useEffect(() => {
    if (room.booking_id) {
      Promise.all([
        supabase.from('ledger_transactions').select('id, category, amount, created_at, notes, transaction_type').eq('booking_id', room.booking_id).order('created_at', { ascending: true }),
        supabase.from('booking_daily_rates').select('target_date, amount, is_manual_override').eq('booking_id', room.booking_id).order('target_date', { ascending: true }),
        supabase.from('booking_daily_extras').select('*').eq('booking_id', room.booking_id).order('target_date', { ascending: true }),
        supabase.from('bookings').select('guest_name, guest_phone, check_in_time, check_out_time, actual_price, guest_count, staff_name').eq('id', room.booking_id).maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', `booking_meta_${room.booking_id}`).maybeSingle()
      ]).then(([txRes, ratesRes, extrasRes, bookingRes, metaRes]) => {
        const data = txRes.data || [];
        const ratesData = ratesRes.data || [];
        const extrasData = extrasRes.data || [];
        const bRow = bookingRes.data;
        const meta: BookingMeta = (metaRes.data?.value as BookingMeta) || {};

        setBookingMeta(meta);
        setSavedDailyRates(ratesData);

        if (bRow?.staff_name) {
          setStaffName(bRow.staff_name);
        }

        const rawPayments = data.filter(d => d.transaction_type === 'payment' && !d.category.includes('Voided'));
        const changeRefunds = data.filter(d => d.category.includes('คืนเงินทอน') && !d.category.includes('Voided') && Number(d.amount) < 0);
        setPastPayments([...rawPayments, ...changeRefunds]);
        
        // Check if active key deposit charge exists
        const activeDeposits = data.filter(d => !d.category.includes('Voided') && Number(d.amount) > 0 && (d.transaction_type === 'deposit' || d.category === 'ค่ามัดจำกุญแจ' || d.category === 'key_deposit'));
        const keyDepositTx = activeDeposits.length > 0 ? activeDeposits[activeDeposits.length - 1] : null;
        let initDepEnabled = false;
        let initDepAmt = 0;
        if (keyDepositTx) {
          initDepEnabled = true;
          initDepAmt = Number(keyDepositTx.amount);
          setKeyDepositEnabled(true); setInitialKeyDepositStatus(true);
          setExistingDepositTx({ id: keyDepositTx.id, amount: initDepAmt });
          if (initDepAmt > 0) setKeyDepositAmount(initDepAmt);
        } else {
          setKeyDepositEnabled(false); setInitialKeyDepositStatus(false);
          setExistingDepositTx(null);
        }
        
        // Load existing extra charges from booking_daily_extras (per-night) + ledger_transactions (one-time)
        const stayDates = ratesData.length > 0
          ? ratesData.map(r => r.target_date)
          : Array.from(new Set(extrasData.map((e: any) => e.target_date)));

        const groupedByCat: Record<string, any[]> = {};
        extrasData.forEach((row: any) => {
          const baseName = String(row.category || '').replace(' (Voided)', '').trim();
          if (!baseName) return;
          if (!groupedByCat[baseName]) groupedByCat[baseName] = [];
          groupedByCat[baseName].push(row);
        });

        const reconstructedPerNightExtras: any[] = Object.entries(groupedByCat).map(([baseName, rows]) => {
          const matchedSetting = extraSettings.find(s => s.name === baseName);
          const firstRowAmt = Number(rows[0]?.amount || 0);
          const qtyMatch = rows[0]?.description?.match(/x(\d+)/);
          const firstRowQty = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
          const unitPrice = matchedSetting ? Number(matchedSetting.price) : Math.round(firstRowAmt / firstRowQty);

          const allDates = stayDates.length > 0 ? stayDates : Array.from(new Set(rows.map(r => r.target_date)));
          const dailySchedule = allDates.map(d => {
            const r = rows.find(row => row.target_date === d);
            if (!r) {
              return { date: d, enabled: false, qty: 1, isSaved: true, isVoided: false };
            }
            const isVoid = String(r.category || '').includes('(Voided)');
            const rQtyMatch = r.description?.match(/x(\d+)/);
            const rQty = rQtyMatch ? Math.max(1, Number(rQtyMatch[1])) : (unitPrice > 0 ? Math.max(1, Math.round(Number(r.amount) / unitPrice)) : 1);
            return {
              date: d,
              enabled: !isVoid,
              qty: rQty,
              dbId: r.id,
              isSaved: true,
              isVoided: isVoid,
              voidNote: r.description
            };
          });

          const savedTotal = dailySchedule.reduce((s, d) => (!d.enabled || d.isVoided) ? s : s + unitPrice * d.qty, 0);
          return {
            id: `daily_ext_${baseName}`,
            name: baseName,
            price: unitPrice,
            qty: 1,
            isPerNight: true,
            dailySchedule,
            savedAmount: savedTotal,
            isSaved: true
          };
        });

        const perNightCategorySet = new Set(Object.keys(groupedByCat));
        const allowedExtraNames = extraSettings.map(s => s.name);
        const existingOneTimeExtras = data.filter(d => 
          d.transaction_type === 'revenue' && 
          !d.category.includes('(Voided)') &&
          !perNightCategorySet.has(d.category.trim()) &&
          (allowedExtraNames.includes(d.category) || (!['room_charge', 'ค่าห้องพัก', 'ค่ามัดจำกุญแจ', 'key_deposit', 'early_in_fee', 'late_out_fee'].includes(d.category) && !d.category.includes('ค่าห้องพัก') && !d.category.includes('ออกช้า')))
        ).map(d => ({
          id: d.id,
          name: d.category,
          price: d.amount,
          qty: 1,
          isPerNight: !!d.notes?.includes('คืน'),
          savedAmount: d.amount,
          isSaved: true
        }));

        const allLoadedExtras = [...reconstructedPerNightExtras, ...existingOneTimeExtras];
        if (allLoadedExtras.length > 0) {
          setDailyExtras(allLoadedExtras);
        }

        const resolvedStayType: 'overnight' | 'short_stay' = meta.targetPrices?.stayType || (room.stay_type === 'short_stay' ? 'short_stay' : 'overnight');
        setActiveTab(resolvedStayType);

        let resolvedNights = Number(nights) || 1;
        let resolvedHours = Number(hours) || 3;
        if (resolvedStayType === 'short_stay' && bRow?.check_in_time && bRow?.check_out_time) {
          const diffHours = Math.max(1, Math.round((new Date(bRow.check_out_time).getTime() - new Date(bRow.check_in_time).getTime()) / (1000 * 60 * 60)));
          resolvedHours = diffHours;
          setHours(diffHours);
        } else if (ratesData.length > 0) {
          resolvedNights = ratesData.length;
          setNights(resolvedNights);
        } else if (bRow?.check_in_time && bRow?.check_out_time) {
          const diffDays = Math.round((new Date(bRow.check_out_time).getTime() - new Date(bRow.check_in_time).getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0) {
            resolvedNights = diffDays;
            setNights(diffDays);
          }
        }

        const resolvedPhone = bRow?.guest_phone ?? room.guest_phone ?? '';
        const rawResolvedName = bRow?.guest_name ?? room.guest_name ?? '';
        const resolvedName = rawResolvedName === 'ไม่ระบุชื่อ' ? '' : rawResolvedName;
        const resolvedPrice = bRow?.actual_price !== undefined && bRow?.actual_price !== null ? Number(bRow.actual_price) : Number(room.actual_price || 0);
        if (!resolvedPhone) setSkipPhone(true);
        if (bRow?.guest_phone !== undefined) setGuestPhone(resolvedPhone);
        if (bRow?.guest_name !== undefined) setGuestName(resolvedName);
        if (bRow?.actual_price !== undefined && bRow?.actual_price !== null) setActualPrice(resolvedPrice);

        const dailyMap: Record<string, number> = {};
        ratesData.forEach(r => { dailyMap[r.target_date] = Number(r.amount); });

        setInitialSnapshot({
          guestPhone: resolvedPhone,
          guestName: resolvedName,
          stayType: resolvedStayType,
          nights: resolvedNights,
          hours: resolvedHours,
          actualPrice: resolvedPrice,
          dailyRates: dailyMap,
          keyDepositEnabled: initDepEnabled,
          keyDepositAmount: initDepAmt
        });
      });
    } else {
      setKeyDepositEnabled(true); setInitialKeyDepositStatus(true);
    }
  }, [room.booking_id]);

  const handleCheckInReserved = async () => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    if (!room.booking_id) {
      alert('ไม่พบข้อมูลการจอง');
      return;
    }
    setLoading(true);

    const cash = Number(payCash) || 0;
    const transfer = Number(payTransfer) || 0;
    const credit = Number(payCredit) || 0;
    const hasUnsavedExtras = dailyExtras.some(e => !e.isSaved || e.isModified);
    const keyDepChanged =
      keyDepositEnabled !== initialKeyDepositStatus ||
      (keyDepositEnabled && Number(keyDepositAmount || 0) !== Number(existingDepositTx?.amount || 0));

    if (cash > 0 || transfer > 0 || credit > 0 || hasUnsavedExtras || extrasManagerUnlocked || keyDepChanged || (!isSplitPayment && remainingBalance > 0)) {
      await handleAdditionalPayment();
    }

    // 1. Update Booking Status
    const { error: bookingError } = await supabase
      .from('bookings')
      .update({ status: 'checked_in', actual_check_in_time: getNow().toISOString() })
      .eq('id', room.booking_id);

    // 2. Update Rooms Table (To activate IoT)
    if (!bookingError) {
      await supabase
        .from('rooms')
        .update({
          status: 'occupied',
          stay_type: 'overnight',
          check_in_time: getNow().toISOString(), // actual check-in time instead of booked time
          check_out_time: room.check_out_time, // original checkout time
          guest_count: room.guest_count,
          current_status: `มีแขก (ค้างคืน)`,
          actual_price: room.actual_price,
          staff_name: room.staff_name || null
        })
        .eq('id', room.id);

      await logActivity({
        category: 'checkin',
        action: 'checkin',
        staffName: actorName,
        shiftName: activeShift?.staff_name || null,
        roomNo: room.room_no,
        target: `ห้อง ${room.room_no} (${guestName.trim() || room.guest_name || 'ไม่ระบุชื่อ'})`,
        details: `เช็คอินจากรายการจองล่วงหน้า ห้อง ${room.room_no}`
      });
    }
    
    setLoading(false);
    onClose();
  };

  
  const handleVerifyVoidPin = async () => {
    if (!voidPin) return;
    setLoading(true);
    setVoidError('');
    const { data: staffData, error } = await supabase.from('staff').select('role').eq('pin', voidPin).single();
    setLoading(false);
    if (error || !staffData || (staffData.role !== 'admin' && staffData.role !== 'manager')) {
      setVoidError('รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็น Admin/Manager)');
      return;
    }
    // Success
    setShowVoidPinPrompt(false);
    setVoidPin('');
    setShowVoidPanel(true);
  };

  const handleExecuteVoid = async () => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    if (!voidReason.trim()) {
      setVoidError('กรุณาระบุสาเหตุการยกเลิก');
      return;
    }
    setLoading(true);
    const refundAmt = Number(voidRefundAmount) || 0;
    const nowIso = getNow().toISOString();

    // 1. ยกเลิกรายการรายได้และมัดจำเดิม (คงรายการรับเงินเดิมไว้เพื่อไม่ให้ยอดลิ้นชักกะก่อนหน้าหรือวันก่อนหน้าเพี้ยน)
    const { data: txs } = await supabase.from('ledger_transactions').select('*').eq('booking_id', room.booking_id);

    if (txs) {
      let totalPayments = 0;
      for (const tx of txs) {
        if (tx.category.includes('(Voided)')) continue;
        if (tx.transaction_type === 'payment' && Number(tx.amount) < 0) {
          totalPayments += Math.abs(Number(tx.amount));
        } else if (tx.category.includes('คืนเงินทอน') && Number(tx.amount) < 0) {
          totalPayments -= Math.abs(Number(tx.amount));
        } else {
          await supabase.from('ledger_transactions').update({ category: tx.category + ' (Voided)' }).eq('id', tx.id);
        }
      }
      totalPayments = Math.max(0, totalPayments);

      // ลบตารางราคารายคืนและบริการเสริมรายคืนของบิลที่ยกเลิก เพื่อไม่ให้ถูกรับรู้เป็นรายได้ในรายงานประจำวัน
      if (room.booking_id) {
        await supabase.from('booking_daily_rates').delete().eq('booking_id', room.booking_id);
        await supabase.from('booking_daily_extras').delete().eq('booking_id', room.booking_id);
      }

      const penalty = Math.max(0, totalPayments - refundAmt);
      const effectiveRefund = Math.min(totalPayments, Math.max(0, refundAmt));
      const newRows: any[] = [];

      if (effectiveRefund > 0 && activeShift) {
        newRows.push({
          shift_id: activeShift.id === 'dummy-shift-id' ? null : activeShift.id,
          staff_name: actorName,
          room_id: room.id,
          booking_id: room.booking_id,
          transaction_type: 'deposit',
          category: 'คืนเงินทอน (ยกเลิกห้องพัก)',
          amount: -effectiveRefund,
          notes: `คืนเงินสดจากการยกเลิกห้องพัก (${voidReason.trim()})`
        });
      }

      if (penalty > 0 && activeShift) {
        newRows.push({
          shift_id: activeShift.id === 'dummy-shift-id' ? null : activeShift.id,
          staff_name: actorName,
          room_id: room.id,
          booking_id: room.booking_id,
          transaction_type: 'revenue',
          category: 'รายได้ค่าปรับยกเลิกห้อง',
          amount: penalty,
          notes: `ค่าปรับยกเลิกห้องพัก (${voidReason.trim()})`
        });
      }

      if (newRows.length > 0) {
        await supabase.from('ledger_transactions').insert(newRows);
      }
    }

    // 2. บันทึกเวลาที่ยกเลิกลงใน booking_meta เพื่อให้รายงานประจำวันคำนวณย้อนหลังได้ถูกต้อง
    if (room.booking_id) {
      const updatedMeta: BookingMeta = { ...bookingMeta, cancelledAt: nowIso } as any;
      await supabase.from('system_settings').upsert({
        key: `booking_meta_${room.booking_id}`,
        value: updatedMeta
      }, { onConflict: 'key' });
    }

    // 3. Update Booking status
    await supabase.from('bookings').update({ 
      status: 'cancelled', 
      check_out_time: nowIso, 
      remarks: 'Void Reason: ' + voidReason 
    }).eq('id', room.booking_id);
    
    // 4. Update Room status
    await supabase.from('rooms').update({ 
      status: voidRoomStatus,
      current_status: voidRoomStatus === 'available' ? 'ว่าง' : 'รอทำความสะอาด',
      stay_type: null,
      check_in_time: null,
      check_out_time: null,
      guest_count: 0,
      actual_price: null,
      staff_name: null,
      booking_id: null
    }).eq('id', room.id);
    
    await logActivity({
      category: 'checkin',
      action: 'cancel',
      staffName: actorName,
      shiftName: activeShift?.staff_name || null,
      roomNo: room.room_no,
      target: `ห้อง ${room.room_no}`,
      details: `ยกเลิกการเข้าพัก/การจอง (Void) ห้อง ${room.room_no} คืนเงิน ฿${refundAmt.toLocaleString()} (สาเหตุ: ${voidReason.trim()})`
    });
    setLoading(false);
    onUpdate();
    onClose();
  };


  const handleCheckOut = async (skipBalanceCheck: boolean = false) => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    const isCancelling = room.status === 'reserved';

    // กรณีกดยกเลิกห้องที่จองไว้ (reserved) แต่มีการรับเงินมัดจำการจองไว้แล้ว -> ให้ผ่านหน้าต่างยืนยันคืนเงิน/หักค่าปรับเพื่อความถูกต้องของบัญชี
    if (isCancelling && totalPaid > 0) {
      setVoidRefundAmount(totalPaid);
      setVoidRoomStatus('available');
      setVoidReason('ลูกค้ายกเลิกการจอง');
      setVoidError('');
      setShowVoidPanel(true);
      return;
    }

    if (!isCancelling && !skipBalanceCheck && room.unpaid_balance && room.unpaid_balance > 0) {
      if (activeShift?.staff_role === 'staff') {
        const confirmBypass = window.confirm(`ลูกค้ามียอดค้างชำระ ${room.unpaid_balance.toLocaleString()} บาท\n\n(โหมดทดลองใช้งาน) ระบบอนุญาตให้ข้ามการชำระเงินชั่วคราว คุณต้องการเช็คเอาต์เลยหรือไม่?`);
        if (!confirmBypass) return;
      } else {
        alert(`ลูกค้ามียอดค้างชำระ ${room.unpaid_balance.toLocaleString()} บาท กรุณากด "จัดการบิล / ชำระเงิน" เพื่อรับชำระให้ครบก่อน Check-out`);
        return;
      }
    }
    
    setLoading(true);

    // 1. อัปเดตตาราง Rooms (เคลียร์ห้อง)
    if (dateOffset === 0) {
      await supabase
        .from('rooms')
        .update({
          status: isCancelling ? 'available' : 'dirty',
          stay_type: null,
          check_in_time: null,
          check_out_time: null,
          guest_count: 0,
          actual_price: null,
          staff_name: null,
          current_status: isCancelling ? 'ว่าง' : 'รอทำความสะอาด'
        })
        .eq('id', room.id);
    }

    // 2. อัปเดตตาราง Bookings (ตั้งสถานะเป็น checked_out หรือ cancelled ถ้าเป็นอนาคตหรือการยกเลิก)
    const startOfDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate(), 23, 59, 59);
    
    const isCheckout = !isCancelling && dateOffset <= 0;
    const nowIso = getNow().toISOString();
    const bookingUpdate: any = {
      status: isCheckout ? 'checked_out' : 'cancelled',
    };
    if (isCheckout) {
      bookingUpdate.actual_check_out_time = nowIso;
    }

    if (room.booking_id) {
      if (isCancelling) {
        await supabase.from('booking_daily_rates').delete().eq('booking_id', room.booking_id);
        await supabase.from('booking_daily_extras').delete().eq('booking_id', room.booking_id);
        const { data: revTxs } = await supabase.from('ledger_transactions').select('id, category').eq('booking_id', room.booking_id);
        for (const t of revTxs || []) {
          if (!String(t.category || '').includes('(Voided)')) {
            await supabase.from('ledger_transactions').update({ category: `${t.category} (Voided)` }).eq('id', t.id);
          }
        }
        const updatedMeta: BookingMeta = { ...bookingMeta, cancelledAt: nowIso } as any;
        await supabase.from('system_settings').upsert({ key: `booking_meta_${room.booking_id}`, value: updatedMeta }, { onConflict: 'key' });
      }
      await supabase.from('bookings').update(bookingUpdate).eq('id', room.booking_id);
    }
    await supabase
      .from('bookings')
      .update(bookingUpdate)
      .eq('room_id', room.id)
      .eq('status', isCheckout ? 'checked_in' : 'reserved')
      .lte('check_in_time', endOfDay.toISOString())
      .gt('check_out_time', startOfDay.toISOString());

    setLoading(false);
    onUpdate();
  };

  const fetchAvailableRooms = async () => {
    setLoading(true);
    
    // 1. Fetch system_settings for location order
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .single();

    const savedOrder = settingsData?.value as string[] || [];

    // 2. Fetch available rooms
    const { data: roomsData } = await supabase
      .from('rooms')
      .select('id, room_no, price_night, price_temp, location, sort_order')
      .eq('status', 'available');
    
    if (roomsData) {
      // 3. Sort rooms based on location order then room sort_order
      const sortedRooms = roomsData.sort((a, b) => {
        const locA = a.location || "ไม่มีสถานที่";
        const locB = b.location || "ไม่มีสถานที่";
        
        let locIndexA = savedOrder.indexOf(locA);
        let locIndexB = savedOrder.indexOf(locB);
        
        // If location is not in savedOrder, put it at the end
        if (locIndexA === -1) locIndexA = 9999;
        if (locIndexB === -1) locIndexB = 9999;

        if (locIndexA !== locIndexB) {
          return locIndexA - locIndexB;
        }
        
        // Same location, sort by sort_order
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      setAvailableRooms(sortedRooms);
      if (sortedRooms.length > 0) setTargetRoomId(sortedRooms[0].id);
    }
    setLoading(false);
  };

  const fetchAvailableRoomsForDate = async (inDateStr: string, outDateStr: string) => {
    setLoading(true);
    const inDate = new Date(inDateStr);
    const outDate = new Date(outDateStr);
    
    const { data: settingsData } = await supabase.from("system_settings").select("value").eq("key", "locations_order").single();
    const savedOrder = settingsData?.value as string[] || [];

    const { data: roomsData } = await supabase.from('rooms').select('id, room_no, price_night, price_temp, location, sort_order');
    
    const { data: overlappingBookings } = await supabase.from('bookings')
      .select('room_id, id')
      .neq('status', 'cancelled')
      .lt('check_in_time', outDate.toISOString())
      .gt('check_out_time', inDate.toISOString());

    if (roomsData) {
      const bookedRoomIds = (overlappingBookings || []).filter(b => b.id !== room.booking_id).map(b => b.room_id);
      
      const available = roomsData.filter(r => !bookedRoomIds.includes(r.id));
      
      const sortedRooms = available.sort((a, b) => {
        const locA = a.location || "ไม่มีสถานที่";
        const locB = b.location || "ไม่มีสถานที่";
        let locIndexA = savedOrder.indexOf(locA);
        let locIndexB = savedOrder.indexOf(locB);
        if (locIndexA === -1) locIndexA = 9999;
        if (locIndexB === -1) locIndexB = 9999;
        if (locIndexA !== locIndexB) return locIndexA - locIndexB;
        return (a.sort_order || 999) - (b.sort_order || 999);
      });

      setAvailableRoomsForReschedule(sortedRooms);
      if (sortedRooms.length > 0) {
        const currentRoomAvailable = sortedRooms.find(r => r.id === room.id);
        setRescheduleTargetRoomId(currentRoomAvailable ? currentRoomAvailable.id : sortedRooms[0].id);
      } else {
        setRescheduleTargetRoomId('');
      }
    }
    setLoading(false);
  };

  const handleCheckInChange = (newDateStr: string) => {
    if (!newDateStr) return;
    const oldIn = new Date(rescheduleCheckIn);
    const newIn = new Date(newDateStr);
    
    if (!isNaN(oldIn.getTime()) && rescheduleCheckOut) {
      const outDate = new Date(rescheduleCheckOut);
      const diffMs = newIn.getTime() - oldIn.getTime();
      outDate.setTime(outDate.getTime() + diffMs);
      
      const yyyy = outDate.getFullYear();
      const mm = String(outDate.getMonth() + 1).padStart(2, '0');
      const dd = String(outDate.getDate()).padStart(2, '0');
      setRescheduleCheckOut(`${yyyy}-${mm}-${dd}`);
    }
    setRescheduleCheckIn(newDateStr);
  };

  useEffect(() => {
    if (isReschedulingBooking && rescheduleCheckIn && rescheduleCheckOut) {
      fetchAvailableRoomsForDate(rescheduleCheckIn, rescheduleCheckOut);
    }
  }, [rescheduleCheckIn, rescheduleCheckOut, isReschedulingBooking]);

  const handleRescheduleBooking = async () => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    if (!room.booking_id) {
      alert("ไม่พบรหัสการจอง");
      return;
    }
    if (!rescheduleCheckIn || !rescheduleCheckOut) {
      alert("กรุณาเลือกวันที่เช็คอินและเช็คเอาท์");
      return;
    }
    setLoading(true);

    const targetRoom = availableRoomsForReschedule.find(r => r.id === rescheduleTargetRoomId);
    if (!targetRoom) {
      setLoading(false);
      return;
    }

    const newCheckInDate = new Date(rescheduleCheckIn);
    newCheckInDate.setHours(14, 0, 0, 0);
    const newCheckOutDate = new Date(rescheduleCheckOut);
    newCheckOutDate.setHours(12, 0, 0, 0);
    const newNightsCount = Math.max(1, Math.round((newCheckOutDate.getTime() - newCheckInDate.getTime()) / (1000 * 60 * 60 * 24)));

    let newActualPrice = room.actual_price;
    if (priceDecision === 'update') {
      newActualPrice = room.stay_type === 'overnight' ? Number(targetRoom.price_night || 0) * newNightsCount : targetRoom.price_temp;
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        room_id: targetRoom.id,
        check_in_time: newCheckInDate.toISOString(),
        check_out_time: newCheckOutDate.toISOString(),
        actual_price: newActualPrice
      })
      .eq('id', room.booking_id);

    if (!updateError) {
      // อัปเดต room_id ใน ledger_transactions
      await supabase
        .from('ledger_transactions')
        .update({ room_id: targetRoom.id })
        .eq('booking_id', room.booking_id);

      // อัปเดตตาราง booking_daily_rates และ booking_daily_extras ให้ตรงกับวันที่เข้าพักใหม่
      const { data: oldRates } = await supabase
        .from('booking_daily_rates')
        .select('*')
        .eq('booking_id', room.booking_id)
        .order('target_date', { ascending: true });

      if (oldRates && oldRates.length > 0) {
        const oldFirstDate = new Date(oldRates[0].target_date);
        const diffDays = Math.round((new Date(rescheduleCheckIn).getTime() - oldFirstDate.getTime()) / (1000 * 60 * 60 * 24));
        await supabase.from('booking_daily_rates').delete().eq('booking_id', room.booking_id);
        const newRateInserts = Array.from({ length: newNightsCount }, (_, idx) => {
          const d = new Date(rescheduleCheckIn);
          d.setDate(d.getDate() + idx);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const prevRate = oldRates[idx] || oldRates[oldRates.length - 1];
          const nightAmt = priceDecision === 'update' ? Number(targetRoom.price_night || 0) : Number(prevRate?.amount || targetRoom.price_night || 0);
          return {
            booking_id: room.booking_id,
            target_date: dateStr,
            amount: nightAmt,
            original_rate_plan_id: prevRate?.original_rate_plan_id || null,
            is_manual_override: Boolean(prevRate?.is_manual_override)
          };
        });
        await supabase.from('booking_daily_rates').insert(newRateInserts);

        if (priceDecision === 'update') {
          await supabase
            .from('ledger_transactions')
            .update({ amount: Number(targetRoom.price_night || 0) })
            .eq('booking_id', room.booking_id)
            .in('category', ['room_charge', 'ค่าห้องพัก']);
        }

        if (diffDays !== 0) {
          const { data: oldExtras } = await supabase
            .from('booking_daily_extras')
            .select('*')
            .eq('booking_id', room.booking_id);
          for (const ex of oldExtras || []) {
            const ed = new Date(ex.target_date);
            ed.setDate(ed.getDate() + diffDays);
            const nextDateStr = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
            await supabase.from('booking_daily_extras').update({ target_date: nextDateStr }).eq('id', ex.id);
          }
        }
      }

      await logActivity({
        category: 'checkin',
        action: 'move',
        staffName: actorName,
        shiftName: activeShift?.staff_name || null,
        roomNo: room.room_no,
        target: `ห้อง ${room.room_no} -> ${targetRoom.room_no}`,
        details: `เลื่อนวัน/ย้ายห้องจองจาก ${room.room_no} ไป ${targetRoom.room_no} (${rescheduleCheckIn} ถึง ${rescheduleCheckOut})`
      });
      setLoading(false);
      alert("ย้ายการจองสำเร็จ");
      onUpdate();
    } else {
      setLoading(false);
      alert("เกิดข้อผิดพลาดในการย้ายการจอง");
    }
  };

  const handleChangeRoom = async () => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    if (!targetRoomId) return;
    setLoading(true);

    const targetRoom = availableRooms.find(r => r.id === targetRoomId);
    if (!targetRoom) {
      setLoading(false);
      return;
    }

    const activeBookingId = room.booking_id;
    let newActualPrice = room.actual_price;
    if (priceDecision === 'update') {
      if (room.stay_type === 'overnight' && savedDailyRates.length > 0) {
        const pastSum = savedDailyRates
          .filter(r => r.target_date < displayDateStr)
          .reduce((s, r) => s + Number(r.amount || 0), 0);
        const remainingCount = Math.max(1, savedDailyRates.filter(r => r.target_date >= displayDateStr).length);
        newActualPrice = pastSum + remainingCount * Number(targetRoom.price_night || 0);
      } else {
        newActualPrice = room.stay_type === 'overnight' ? targetRoom.price_night : targetRoom.price_temp;
      }
    }

    // 1. อัปเดตตาราง Rooms (ห้องใหม่)
    const { error: err1 } = await supabase
      .from('rooms')
      .update({
        status: 'occupied',
        stay_type: room.stay_type,
        check_in_time: room.check_in_time,
        check_out_time: room.check_out_time,
        guest_count: room.guest_count,
        actual_price: newActualPrice,
        staff_name: room.staff_name,
        current_status: `ย้ายมาจาก ${room.room_no}`
      })
      .eq('id', targetRoomId);
    
    if (err1) {
      alert('Error updating new room: ' + err1.message);
      setLoading(false);
      return;
    }

    // 2. อัปเดตตาราง Rooms (ห้องเก่า)
    const { error: err2 } = await supabase
      .from('rooms')
      .update({
        status: oldRoomStatus,
        stay_type: null,
        check_in_time: null,
        check_out_time: null,
        guest_count: 0,
        actual_price: null,
        staff_name: null,
        current_status: oldRoomStatus === 'dirty' ? 'รอทำความสะอาด (หลังย้าย)' : 'ว่าง (สะอาดย้ายห้อง)'
      })
      .eq('id', room.id);

    if (err2) {
      alert('Error updating old room: ' + err2.message);
      setLoading(false);
      return;
    }

    // 3. อัปเดตตาราง Bookings, Ledger และ Daily Rates (ย้ายบิลไปห้องใหม่)
    if (activeBookingId) {
      await supabase
        .from('bookings')
        .update({ room_id: targetRoomId, actual_price: newActualPrice })
        .eq('id', activeBookingId);

      await supabase
        .from('ledger_transactions')
        .update({ room_id: targetRoomId })
        .eq('booking_id', activeBookingId);

      if (priceDecision === 'update') {
        const nextUnitRate = room.stay_type === 'overnight' ? Number(targetRoom.price_night || 0) : Number(targetRoom.price_temp || 0);
        if (room.stay_type === 'overnight') {
          await supabase
            .from('booking_daily_rates')
            .update({ amount: nextUnitRate, is_manual_override: true })
            .eq('booking_id', activeBookingId)
            .gte('target_date', displayDateStr);
        }
        const { data: roomTxs } = await supabase
          .from('ledger_transactions')
          .select('id, created_at, category')
          .eq('booking_id', activeBookingId)
          .in('category', ['room_charge', 'ค่าห้องพัก'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (roomTxs && roomTxs.length > 0) {
          await supabase
            .from('ledger_transactions')
            .update({ amount: nextUnitRate })
            .eq('id', roomTxs[0].id);
        }
      }
    }

    await logActivity({
      category: 'checkin',
      action: 'move',
      staffName: actorName,
      shiftName: activeShift?.staff_name || null,
      roomNo: room.room_no,
      target: `ห้อง ${room.room_no} -> ${targetRoom.room_no}`,
      details: `ย้ายห้องพักจาก ${room.room_no} ไปยังห้อง ${targetRoom.room_no} (ราคา: ฿${Number(newActualPrice || 0).toLocaleString()})`
    });
    setLoading(false);
    onUpdate();
  };

  const handleClean = async () => {
    setLoading(true);
    await supabase
      .from('rooms')
      .update({
        status: 'available',
        current_status: 'ว่าง (สะอาด)'
      })
      .eq('id', room.id);
    
    setLoading(false);
    onUpdate();
  };

  const handleExtend = async (type: 'nights' | 'hours') => {
    if (!ensureShiftWritable()) return; // ล็อกกะข้ามวัน (เลย 06:30 น. ต้องปิดกะก่อน)
    if (!room.check_out_time || !activeShift || !room.booking_id) return;
    setLoading(true);
    
    const prevCheckout = new Date(room.check_out_time);
    const currentCheckout = new Date(room.check_out_time);
    const nNights = Number(extendNights) || 1;
    const nightRate = Number(room.price_night || 0);
    let nextActualPrice = Number(room.actual_price || 0);
    
    if (type === 'nights') {
      currentCheckout.setDate(currentCheckout.getDate() + nNights);
      nextActualPrice += nightRate * nNights;
      
      // 1. Void รายการ "ค่าปรับออกช้า" ทั้งหมดของ booking นี้ (คง amount เดิมไว้)
      await supabase
        .from('ledger_transactions')
        .update({ category: 'ค่าปรับออกช้า (Voided)' })
        .eq('booking_id', room.booking_id)
        .eq('category', 'ค่าปรับออกช้า');

      // 2. เพิ่มแถวใน booking_daily_rates สำหรับแต่ละคืนที่พักต่อ เพื่อให้รับรู้รายได้รายคืนและกันตัดซ้ำตอน 09:45 น.
      const { data: existingRates } = await supabase
        .from('booking_daily_rates')
        .select('target_date')
        .eq('booking_id', room.booking_id);
      const existingDateSet = new Set((existingRates || []).map(r => r.target_date));
      const newRateRows: any[] = [];
      const ledgerToInsert: any[] = [];

      for (let i = 0; i < nNights; i++) {
        const d = new Date(prevCheckout);
        d.setDate(d.getDate() + i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!existingDateSet.has(dateStr)) {
          newRateRows.push({
            booking_id: room.booking_id,
            target_date: dateStr,
            amount: nightRate,
            is_manual_override: false
          });
        }
        // หากวันที่พักต่อเป็นของวันนี้หรือก่อนหน้า ให้ตัดเข้า ledger_transactions ทันที (คืนในอนาคตจะถูกตัดตอน 09:45 อัตโนมัติ)
        if (dateStr <= displayDateStr) {
          ledgerToInsert.push({
            shift_id: activeShift.id,
            staff_name: activeShift.staff_name,
            room_id: room.id,
            booking_id: room.booking_id,
            transaction_type: 'revenue',
            category: 'room_charge',
            notes: `พักต่อประจำวันที่ ${dateStr}`,
            amount: nightRate
          });
        }
      }

      if (newRateRows.length > 0) {
        await supabase.from('booking_daily_rates').insert(newRateRows);
      }
      if (ledgerToInsert.length > 0) {
        await supabase.from('ledger_transactions').insert(ledgerToInsert);
      }
    } else {
      currentCheckout.setHours(currentCheckout.getHours() + (Number(extendHours) || 1));
    }

    // อัปเดตเวลาออกในตาราง rooms (ถ้าเป็นวันนี้)
    if (dateOffset === 0) {
      await supabase
        .from('rooms')
        .update({
          check_out_time: currentCheckout.toISOString(),
          stay_type: type === 'nights' ? 'overnight' : room.stay_type,
          actual_price: nextActualPrice
        })
        .eq('id', room.id);
    }

    // อัปเดตเวลาออกและราคาในตาราง bookings
    await supabase
      .from('bookings')
      .update({
        check_out_time: currentCheckout.toISOString(),
        actual_price: nextActualPrice
      })
      .eq('id', room.booking_id);

    setLoading(false);
    onUpdate();
  };

  // ถ้าย้อนอดีต ให้ดูได้อย่างเดียว
  if (dateOffset < 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
          <h2 className="text-xl font-black text-slate-800 mb-4">ประวัติห้อง {room.room_no}</h2>
          {room.status === 'occupied' ? (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
              <p className="text-sm font-medium">แขกเข้าพัก: {room.guest_count} คน</p>
              <p className="text-sm text-slate-500">ชื่อ: {room.guest_name}</p>
              <p className="text-sm text-slate-500">เข้า: {new Date(room.check_in_time!).toLocaleString('th-TH')}</p>
              <p className="text-sm text-slate-500">ออก: {new Date(room.check_out_time!).toLocaleString('th-TH')}</p>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-4">ไม่มีประวัติการเข้าพักในวันนี้</div>
          )}
          <button onClick={onClose} className="mt-6 w-full py-3 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold transition-colors">ปิด</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-full flex flex-col overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="p-1 -ml-1 text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">เช็คอิน</h2>
            {dateOffset > 0 && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold ml-1">จองล่วงหน้า</span>}
          </div>
          <div className="px-3.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-700 shadow-xs flex items-center gap-1.5">
            <span className="text-slate-400 font-normal">ห้อง</span>
            <span className="text-slate-900 font-black text-sm">{room.room_no}</span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto">
          
          {/* 1. ห้องว่าง / จองแล้ว / กำลังพัก (Form View) */}
          {(!room.status || room.status === 'available' || room.status === 'reserved' || room.status === 'occupied') && (
            <div className="space-y-4">
              {timeBand === 'early_in' && activeTab === 'overnight' && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-xl text-xs font-medium">
                  ⚠️ <b>เตือน:</b> เข้าพักก่อนเวลา (06:45-09:44) ต้องเรียกเก็บเงินค่าเข้าพักก่อนเวลาเพิ่มเติม (ราคาชั่วคราว + ราคาปกติ)
                </div>
              )}

              {timeBand === 'late_night' && activeTab === 'overnight' && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 p-2.5 rounded-xl text-xs font-medium">
                  ℹ️ <b>รอบดึก:</b> เช็คอินรอบนี้ถือเป็นของเมื่อวาน ค่าเริ่มต้นคือ 0 คืน (ออก 12:00 น. วันนี้) 
                  หากต้องการให้ออกพรุ่งนี้ กรุณาเปลี่ยนเป็น 1 หรือ 2 คืน
                </div>
              )}

              {isExistingBooking && (
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs">
                  {extrasManagerUnlocked ? (
                    <>
                      <span className="font-bold text-amber-700">🔓 โหมดแก้ไขข้อมูล (โดย {extrasManagerName})</span>
                      <button
                        type="button"
                        onClick={() => setExtrasManagerUnlocked(false)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
                      >
                        🔒 ล็อกกลับ
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-500 font-medium">ข้อมูลถูกล็อกหลังบันทึกแล้ว</span>
                      <button
                        type="button"
                        onClick={() => { setExtrasPin(''); setExtrasPinError(''); setShowExtrasPinPrompt(true); }}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 transition-colors"
                      >
                        🔑 ปลดล็อกแก้ไข (Admin/Manager)
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* เบอร์โทรลูกค้า */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-sm font-semibold text-slate-700">
                    เบอร์โทรลูกค้า {skipPhone ? <span className="text-xs font-medium text-slate-400">(ไม่ระบุเบอร์โทร)</span> : <span className="text-rose-500">*</span>}
                  </label>
                  {!isBookingLocked && (
                    <button
                      type="button"
                      onClick={() => setSkipPhone(!skipPhone)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border transition-colors ${skipPhone ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    >
                      {skipPhone ? '🔓 ไม่ระบุเบอร์ (กดเพื่อยกเลิก)' : '🔒 ไม่ระบุเบอร์'}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-indigo-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </span>
                  <input 
                    ref={phoneInputRef}
                    type="tel" maxLength={10}
                    value={guestPhone} 
                    onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, ''))} 
                    disabled={isBookingLocked}
                    placeholder={skipPhone ? 'ไม่ระบุเบอร์โทร' : '081-234-5678'}
                    className="w-full border border-slate-300/80 rounded-2xl pl-11 pr-4 py-3 text-base font-bold text-slate-800 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 bg-white disabled:opacity-50 transition-all shadow-xs"
                  />
                </div>
                {pendingCheckInAfterPhone && (skipPhone || (guestPhone.trim().length === 10 && /^\d{10}$/.test(guestPhone.trim()))) && (
                  <div className="mt-2.5 p-3 rounded-2xl bg-indigo-50/80 border border-indigo-200 shadow-sm space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        const isRes = pendingCheckInAfterPhone.isReservationForToday;
                        setPendingCheckInAfterPhone(null);
                        handleCheckIn(activeTab, isRes);
                      }}
                      disabled={loading}
                      className="w-full py-4 text-white font-bold rounded-2xl text-lg transition-all active:scale-98 bg-indigo-700 hover:bg-indigo-800 shadow-lg shadow-indigo-700/25 flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>
                        {loading ? 'กำลังบันทึก...' : pendingCheckInAfterPhone.isReservationForToday ? 'ยืนยันจองไว้ก่อน (ยังไม่เข้าพัก)' : dateOffset > 0 ? 'ยืนยันจองล่วงหน้า' : 'ยืนยันเช็คอิน'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingCheckInAfterPhone(null)}
                      disabled={loading}
                      className="w-full py-2.5 text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold transition-all"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
                {renderFieldHistory('guest_phone')}
              </div>

              {/* ชื่อลูกค้า */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  ชื่อลูกค้า
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-indigo-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input 
                    type="text" 
                    value={guestName} 
                    onChange={(e) => setGuestName(e.target.value)} 
                    disabled={isBookingLocked}
                    placeholder="ไม่ระบุชื่อ"
                    title="ปล่อยว่างไว้ = บันทึกเป็น “ไม่ระบุชื่อ” (กดที่ช่องเพื่อพิมพ์ชื่อได้)"
                    className="w-full border border-slate-300/80 rounded-2xl pl-11 pr-4 py-3 text-base font-bold text-slate-800 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 bg-white placeholder-shown:bg-slate-200 placeholder-shown:border-slate-300 placeholder:text-slate-500 focus:bg-white focus:placeholder:text-slate-300 disabled:opacity-50 transition-all shadow-xs cursor-text"
                  />
                </div>
                {renderFieldHistory('guest_name')}
              </div>

              {/* ประเภทการเข้าพัก */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทการเข้าพัก</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setActiveTab('overnight')}
                    disabled={isBookingLocked}
                    className={`py-3 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-base transition-all ${
                      activeTab === 'overnight'
                        ? 'bg-indigo-700 text-white shadow-md shadow-indigo-700/20'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>🌙</span>
                    <span>ค้างคืน</span>
                  </button>
                  {dateOffset === 0 && (
                    <button 
                      type="button"
                      onClick={() => setActiveTab('short_stay')}
                      disabled={isBookingLocked}
                      className={`py-3 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-base transition-all ${
                        activeTab === 'short_stay'
                          ? 'bg-indigo-700 text-white shadow-md shadow-indigo-700/20'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <svg className="w-5 h-5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" strokeWidth="2" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 7v5l3 2" />
                      </svg>
                      <span>ชั่วคราว</span>
                    </button>
                  )}
                </div>
                {renderFieldHistory('stay_type')}
              </div>

              {/* Stepper จำนวนคืน / ชั่วโมง */}
              <div>
                <div className="border border-slate-200 rounded-2xl p-2.5 px-4 bg-white flex items-center justify-between shadow-xs">
                  <div>
                    <span className="text-sm font-bold text-slate-800">
                      {activeTab === 'overnight' ? 'จำนวนคืน' : 'จำนวนชั่วโมง'}
                    </span>
                    {activeTab === 'overnight' ? (
                      <p className="text-[11px] text-slate-400 font-medium">
                        ออก: {getNextNoon((isExistingBooking && room.check_in_time) ? new Date(room.check_in_time) : displayDate, Number(nights) || 0).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} 12:00 น.
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 font-medium">
                        ออก: {new Date(((isExistingBooking && room.check_in_time) ? new Date(room.check_in_time) : getNow()).getTime() + (Number(hours) || 3) * 3600000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น. • 3 ชม. แรก ฿{shortStayBase3Hr.toLocaleString()} (+฿{roundUpToEasyChange(shortStayBase3Hr / 3).toLocaleString()}/ชม.)
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => activeTab === 'overnight' ? handleNightsChange(-1) : handleHoursChange(-1)}
                      disabled={isBookingLocked || (activeTab === 'overnight' ? (Number(nights) <= (dateOffset === 0 ? 0 : 1)) : Number(hours) <= 3)}
                      className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-indigo-50 text-indigo-700 font-bold text-xl flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      -
                    </button>
                    <span className="w-10 text-center text-xl font-black text-slate-900">
                      {activeTab === 'overnight' ? (nights === '' ? 0 : nights) : (hours === '' ? 3 : hours)}
                    </span>
                    <button 
                      type="button"
                      onClick={() => activeTab === 'overnight' ? handleNightsChange(1) : handleHoursChange(1)}
                      disabled={isBookingLocked}
                      className="w-10 h-10 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xl flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
                {renderFieldHistory('nights')}
              </div>

              {/* ค่าห้อง (แสดงราคาเป้าหมายและราคาขายจริง ทั้งค้างคืนและชั่วคราว) */}
              {(() => {
                const isMultiNight = activeTab === 'overnight' && dailyBreakdown.length > 1;
                const targetTotal = Number(totalTargetPrice || 0);
                const diff = Number(actualPrice || 0) - targetTotal;
                return (
                  <div>
                    <div className="flex justify-between items-center mb-1.5 flex-wrap gap-1">
                      <label className="text-sm font-semibold text-slate-700">
                        ค่าห้อง (ราคาขายจริง) {isMultiNight && <span className="text-[11px] font-medium text-slate-400">(รวม {dailyBreakdown.length} คืน — แก้ราคาในตารางรายวัน)</span>}
                      </label>
                      <div className="flex items-center gap-1.5 text-xs">
                        {targetTotal > 0 && (
                          <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                            ราคาเป้าหมาย: ฿{targetTotal.toLocaleString()}
                          </span>
                        )}
                        {targetTotal > 0 && diff !== 0 && actualPrice !== '' && (
                          <span className={`font-bold ${diff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {diff < 0 ? '🔻' : '🔺'} ส่วนต่าง {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-indigo-700 font-bold text-lg">
                        ฿
                      </span>
                      <input 
                        type="number" min="0"
                        value={actualPrice}
                        onChange={(e) => handleActualPriceChange(e.target.value)}
                        disabled={isBookingLocked || isMultiNight}
                        readOnly={isMultiNight}
                        placeholder="0"
                        className={`w-full border rounded-2xl pl-9 pr-3 py-3 text-lg font-black focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 disabled:opacity-80 transition-all shadow-xs ${
                          targetTotal > 0 && diff < 0 ? 'border-red-300 bg-red-50 text-red-700' : targetTotal > 0 && diff > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300/80 bg-white text-slate-900'
                        }`}
                      />
                    </div>
                    {renderFieldHistory('actual_price')}
                  </div>
                );
              })()}

              {/* Dynamic Pricing Info */}
              {dynamicPricingDetails && (dynamicPricingDetails.weekendSurcharge > 0 || dynamicPricingDetails.holidaySurcharge > 0 || dynamicPricingDetails.lowOccupancySurcharge > 0 || dynamicPricingDetails.isSurgeDisabled) && (
                <div className="bg-slate-50 rounded-xl p-2.5 text-xs text-slate-600 border border-slate-200">
                  <span className="font-bold text-slate-700">⚡ ปรับราคาอัตโนมัติ: </span>
                  {dynamicPricingDetails.weekendSurcharge > 0 && <span>สุดสัปดาห์ +{dynamicPricingDetails.weekendSurcharge}บ. </span>}
                  {dynamicPricingDetails.holidaySurcharge > 0 && <span>เทศกาล +{dynamicPricingDetails.holidaySurcharge}บ. </span>}
                  {dynamicPricingDetails.lowOccupancySurcharge > 0 && <span>ห้องเหลือน้อย +{dynamicPricingDetails.lowOccupancySurcharge}บ. </span>}
                  {dynamicPricingDetails.isSurgeDisabled && <span className="text-orange-600">ยกเลิกบวกห้องเหลือน้อยหลัง {dynamicPricingDetails.surgeDisableTimeString}</span>}
                </div>
              )}

              {/* แจกแจงรายวัน: แสดงอัตโนมัติเมื่อพัก 2 คืนขึ้นไป */}
              {activeTab === 'overnight' && dailyBreakdown.length > 1 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="bg-slate-50 p-2 font-bold text-slate-700 border-b border-slate-200">
                    📌 แจกแจงรายวัน ({dailyBreakdown.length} คืน)
                  </div>
                  <table className="w-full">
                    <thead className="bg-slate-100 text-slate-500">
                      <tr>
                        <th className="p-2 text-left">วันที่</th>
                        <th className="p-2 text-right">ราคาเป้าหมาย</th>
                        <th className="p-2 text-right">ราคาขายจริง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyBreakdown.map(day => {
                        let colorClass = "text-slate-800 border-slate-200 bg-white";
                        let icon = "";
                        if (day.isOverride && day.actualPrice !== '') {
                          if (Number(day.actualPrice) < Number(day.targetPrice)) {
                            colorClass = "text-red-600 border-red-300 bg-red-50";
                            icon = "🔻";
                          } else if (Number(day.actualPrice) > Number(day.targetPrice)) {
                            colorClass = "text-emerald-600 border-emerald-300 bg-emerald-50";
                            icon = "🔺";
                          }
                        }
                        return (
                          <tr key={day.date} className="border-t border-slate-100">
                            <td className="p-2 font-medium">{new Date(day.date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                            <td className="p-2 text-right text-slate-400">฿{day.targetPrice}</td>
                            <td className="p-1 text-right">
                              <div className="relative inline-block">
                                {icon && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px]">{icon}</span>}
                                <input 
                                  type="number" min="0"
                                  value={day.actualPrice}
                                  onChange={e => updateDailyActualPrice(day.date, e.target.value)}
                                  disabled={isBookingLocked}
                                  className={`w-24 border rounded pl-6 pr-2 py-1 text-right font-bold transition-colors ${colorClass}`}
                                />
                              </div>
                              {renderFieldHistory(`daily_rate_${day.date}`)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* บริการเสริม (Add-ons) */}
              {true && (
                <div className="pt-1">
                  <div className="flex justify-between items-center mb-1.5">
                    <button
                      type="button"
                      onClick={() => setShowAddonsSection(prev => !prev)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
                        showAddonsSection
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <span>บริการเสริม (Add-ons)</span>
                      {dailyExtras.length > 0 && (
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                          showAddonsSection ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white'
                        }`}>
                          {dailyExtras.length}
                        </span>
                      )}
                      <span className="text-[10px] opacity-80">{showAddonsSection ? '▴ ซ่อน' : '▾ กดดู'}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !showAddonRecentLogs;
                          setShowAddonRecentLogs(next);
                          if (next) loadRecentAddonLogs();
                        }}
                        className="text-[11px] font-bold text-slate-500 hover:text-indigo-700 flex items-center gap-1"
                      >
                        🕒 ประวัติแก้ไขรายการเสริม
                      </button>
                    </div>
                  </div>

                  {showAddonRecentLogs && (
                    <div className="mb-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] space-y-1.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                        <span className="font-bold text-slate-700">📜 ประวัติการเพิ่ม/แก้ไขบริการเสริมล่าสุด</span>
                        <div className="flex items-center gap-2">
                          <a
                            href="/activity-log"
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:underline font-bold"
                          >
                            ดู Log ทั้งหมด (30 วัน) ↗
                          </a>
                          <button
                            type="button"
                            onClick={() => setShowAddonRecentLogs(false)}
                            className="text-slate-400 hover:text-slate-600 font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {loadingAddonLogs ? (
                        <div className="text-slate-400 py-2 text-center">กำลังโหลดประวัติ...</div>
                      ) : addonRecentLogs.length === 0 ? (
                        <div className="text-slate-400 py-2 text-center">ยังไม่มีประวัติการแก้ไขบริการเสริม</div>
                      ) : (
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {addonRecentLogs.map(log => {
                            const dt = new Date(log.timestamp);
                            const timeLabel = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                            return (
                              <div key={log.id} className="bg-white px-2 py-1 rounded border border-slate-100 flex flex-col gap-0.5">
                                <div className="flex items-center justify-between text-[10px] text-slate-500">
                                  <span className="font-bold text-indigo-700">👤 {log.staffName}{log.shiftName && log.shiftName !== log.staffName ? ` (กะ ${log.shiftName})` : ''}</span>
                                  <span>{timeLabel}</span>
                                </div>
                                <div className="text-slate-700 font-medium">{log.details}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {showAddonsSection && (room.status !== 'occupied' || extrasManagerUnlocked) && (
                    <>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {extraSettings.filter(e => e.ui_type === 'quick_button').map(e => (
                          <button 
                            key={e.id}
                            type="button"
                            onClick={() => handleAddExtra(e)}
                            className="bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                            title={e.charge_type === 'per_night' ? 'ค่าเริ่มต้น: ระบุวัน (รายคืน)' : 'ค่าเริ่มต้น: ครั้งเดียว'}
                          >
                            <span>+ {e.name} ({e.price}บ.)</span>
                            <span className="text-[10px] opacity-65">{e.charge_type === 'per_night' ? '📅' : '1️⃣'}</span>
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() => setShowOtherExtrasMenu(prev => !prev)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1 ${
                            showOtherExtrasMenu
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span>+ รายการอื่นๆ / จัดการ</span>
                          <span className="text-[10px]">{showOtherExtrasMenu ? '▴' : '▾'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowCustomExtraForm(prev => !prev)}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-xl text-xs font-bold transition-colors"
                        >
                          {showCustomExtraForm ? '✕ ปิดฟอร์ม' : '+ พิมพ์รายการเอง'}
                        </button>
                      </div>

                      {/* แผง "+ รายการอื่นๆ / จัดการ" สำหรับเลือกเพิ่มเข้าบิล หรือ เพิ่ม/แก้ไข/ลบ/สลับปุ่มลัด ได้ทันที */}
                      {showOtherExtrasMenu && (
                        <div className="mt-2 p-3 bg-white border-2 border-indigo-200 rounded-xl shadow-md space-y-2.5 text-xs">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              📂 รายการอื่นๆ & ตั้งค่าบริการเสริม
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setShowManageQuickButtonsInMenu(prev => !prev)}
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                  showManageQuickButtonsInMenu
                                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                ⚡ จัดการปุ่มลัดด้านบน ({extraSettings.filter(e => e.ui_type === 'quick_button').length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowOtherExtrasMenu(false)}
                                className="text-slate-400 hover:text-slate-600 font-bold px-1"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* รายการในตัวเลือก (+ รายการอื่นๆ) */}
                          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                            {extraSettings.filter(e => e.ui_type === 'dropdown').length === 0 && (
                              <div className="text-center text-slate-400 py-2 text-[11px]">
                                ไม่มีรายการในตัวเลือกย่อย (สามารถกด + เพิ่มรายการใหม่ด้านล่างได้เลย)
                              </div>
                            )}
                            {extraSettings.filter(e => e.ui_type === 'dropdown').map(item => (
                              <div key={item.id} className="p-1.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50">
                                {editingExtraSettingId === item.id ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={editExtraSettingName}
                                      onChange={e => setEditExtraSettingName(e.target.value)}
                                      className="flex-1 min-w-[110px] border border-slate-300 rounded px-2 py-1 bg-white font-bold text-slate-800 text-xs"
                                      placeholder="ชื่อรายการ"
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      value={editExtraSettingPrice}
                                      onChange={e => setEditExtraSettingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                      className="w-20 border border-slate-300 rounded px-2 py-1 bg-white font-bold text-slate-800 text-right text-xs"
                                      placeholder="ราคา"
                                    />
                                    <select
                                      value={editExtraSettingChargeType}
                                      onChange={e => setEditExtraSettingChargeType(e.target.value as 'one_time' | 'per_night')}
                                      className="border border-slate-300 rounded px-1.5 py-1 bg-white font-bold text-slate-700 text-[11px]"
                                    >
                                      <option value="one_time">1️⃣ ครั้งเดียว</option>
                                      <option value="per_night">📅 ระบุวัน (รายคืน)</option>
                                    </select>
                                    <select
                                      value={editExtraSettingUiType}
                                      onChange={e => setEditExtraSettingUiType(e.target.value as 'quick_button' | 'dropdown')}
                                      className="border border-slate-300 rounded px-1.5 py-1 bg-white font-bold text-slate-700 text-[11px]"
                                    >
                                      <option value="dropdown">📂 ในตัวเลือก</option>
                                      <option value="quick_button">⚡ ปุ่มลัดด้านบน</option>
                                    </select>
                                    <select
                                      value={editExtraSettingReportCat}
                                      onChange={e => setEditExtraSettingReportCat(e.target.value as 'addon' | 'minibar' | 'fine' | 'other')}
                                      className="border border-slate-300 rounded px-1.5 py-1 bg-white font-bold text-slate-700 text-[11px]"
                                      title="หมวดหมู่ในรายงานประจำวัน"
                                    >
                                      <option value="addon">📊 หมวด: ค่าส่วนเสริม</option>
                                      <option value="minibar">📊 หมวด: ค่ามินิบาร์</option>
                                      <option value="fine">📊 หมวด: ค่าปรับ</option>
                                      <option value="other">📊 หมวด: บริการอื่นๆ</option>
                                    </select>
                                    <button
                                      type="button"
                                      disabled={extraSettingSaving}
                                      onClick={() => handleSaveEditExtraSetting(item)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded text-[11px]"
                                    >
                                      บันทึก
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingExtraSettingId(null)}
                                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2 py-1 rounded text-[11px]"
                                    >
                                      ยกเลิก
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleAddExtra(item)}
                                      className="flex-1 text-left font-bold text-slate-800 hover:text-indigo-700 flex items-center gap-1.5 py-0.5"
                                    >
                                      <span className="bg-indigo-600 text-white w-4 h-4 rounded-full inline-flex items-center justify-center text-[11px] font-black">+</span>
                                      <span>{item.name}</span>
                                      <span className="text-indigo-700 font-extrabold">(฿{Number(item.price).toLocaleString()})</span>
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        disabled={extraSettingSaving}
                                        onClick={() => handleToggleExtraSettingDefaultChargeType(item)}
                                        title="สลับค่าเริ่มต้น: คิดครั้งเดียว หรือ ระบุวัน (รายคืน)"
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                          item.charge_type === 'per_night'
                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                        }`}
                                      >
                                        {item.charge_type === 'per_night' ? '📅 รายคืน' : '1️⃣ ครั้งเดียว'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={extraSettingSaving}
                                        onClick={() => handleToggleExtraSettingUiType(item)}
                                        title="ย้ายไปแสดงเป็นปุ่มลัดด้านบน"
                                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors"
                                      >
                                        ⚡ ขึ้นปุ่มลัด
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditExtraSetting(item)}
                                        title="แก้ไขชื่อ/ราคา"
                                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        type="button"
                                        disabled={extraSettingSaving}
                                        onClick={() => handleDeleteExtraSetting(item)}
                                        title="ลบรายการนี้"
                                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* ส่วนจัดการปุ่มลัดด้านบน (กรณีต้องการแก้ราคา/ลบ หรือย้ายปุ่มลัดลงมาไว้ในตัวเลือก) */}
                          {showManageQuickButtonsInMenu && (
                            <div className="pt-2 border-t border-slate-200 space-y-1.5">
                              <div className="text-[11px] font-bold text-amber-800 flex items-center justify-between">
                                <span>⚡ รายการที่เป็นปุ่มลัดด้านบน (คลิกเพื่อแก้ไข หรือย้ายเข้าตัวเลือก)</span>
                              </div>
                              {extraSettings.filter(e => e.ui_type === 'quick_button').map(item => (
                                <div key={item.id} className="p-1.5 rounded-lg border border-amber-200 bg-amber-50/40">
                                  {editingExtraSettingId === item.id ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <input
                                        type="text"
                                        value={editExtraSettingName}
                                        onChange={e => setEditExtraSettingName(e.target.value)}
                                        className="flex-1 min-w-[110px] border border-slate-300 rounded px-2 py-1 bg-white font-bold text-slate-800 text-xs"
                                      />
                                      <input
                                        type="number"
                                        min={1}
                                        value={editExtraSettingPrice}
                                        onChange={e => setEditExtraSettingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-20 border border-slate-300 rounded px-2 py-1 bg-white font-bold text-slate-800 text-right text-xs"
                                      />
                                      <select
                                        value={editExtraSettingChargeType}
                                        onChange={e => setEditExtraSettingChargeType(e.target.value as 'one_time' | 'per_night')}
                                        className="border border-slate-300 rounded px-1.5 py-1 bg-white font-bold text-slate-700 text-[11px]"
                                      >
                                        <option value="one_time">1️⃣ ครั้งเดียว</option>
                                        <option value="per_night">📅 ระบุวัน (รายคืน)</option>
                                      </select>
                                      <select
                                        value={editExtraSettingUiType}
                                        onChange={e => setEditExtraSettingUiType(e.target.value as 'quick_button' | 'dropdown')}
                                        className="border border-slate-300 rounded px-1.5 py-1 bg-white font-bold text-slate-700 text-[11px]"
                                      >
                                        <option value="quick_button">⚡ ปุ่มลัดด้านบน</option>
                                        <option value="dropdown">📂 ในตัวเลือก</option>
                                      </select>
                                      <select
                                        value={editExtraSettingReportCat}
                                        onChange={e => setEditExtraSettingReportCat(e.target.value as 'addon' | 'minibar' | 'fine' | 'other')}
                                        className="border border-slate-300 rounded px-1.5 py-1 bg-white font-bold text-slate-700 text-[11px]"
                                        title="หมวดหมู่ในรายงานประจำวัน"
                                      >
                                        <option value="addon">📊 หมวด: ค่าส่วนเสริม</option>
                                        <option value="minibar">📊 หมวด: ค่ามินิบาร์</option>
                                        <option value="fine">📊 หมวด: ค่าปรับ</option>
                                        <option value="other">📊 หมวด: บริการอื่นๆ</option>
                                      </select>
                                      <button
                                        type="button"
                                        disabled={extraSettingSaving}
                                        onClick={() => handleSaveEditExtraSetting(item)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded text-[11px]"
                                      >
                                        บันทึก
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingExtraSettingId(null)}
                                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2 py-1 rounded text-[11px]"
                                      >
                                        ยกเลิก
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleAddExtra(item)}
                                        className="flex-1 text-left font-bold text-slate-800 hover:text-indigo-700 flex items-center gap-1.5 py-0.5"
                                      >
                                        <span className="text-amber-600">⚡</span>
                                        <span>{item.name}</span>
                                        <span className="text-indigo-700 font-extrabold">(฿{Number(item.price).toLocaleString()})</span>
                                      </button>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          disabled={extraSettingSaving}
                                          onClick={() => handleToggleExtraSettingDefaultChargeType(item)}
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                            item.charge_type === 'per_night'
                                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                          }`}
                                        >
                                          {item.charge_type === 'per_night' ? '📅 รายคืน' : '1️⃣ ครั้งเดียว'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={extraSettingSaving}
                                          onClick={() => handleToggleExtraSettingUiType(item)}
                                          title="ย้ายลงมาไว้ในตัวเลือก (+ รายการอื่นๆ)"
                                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                                        >
                                          📂 ลงตัวเลือก
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditExtraSetting(item)}
                                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          type="button"
                                          disabled={extraSettingSaving}
                                          onClick={() => handleDeleteExtraSetting(item)}
                                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200"
                                        >
                                          🗑️
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* ฟอร์มเพิ่มรายการบริการเสริมใหม่ถาวร */}
                          <div className="pt-2 border-t border-slate-100">
                            {!showAddNewExtraSettingForm ? (
                              <button
                                type="button"
                                onClick={() => setShowAddNewExtraSettingForm(true)}
                                className="w-full py-1.5 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 font-bold text-xs transition-colors"
                              >
                                + เพิ่มรายการบริการเสริมใหม่ (บันทึกไว้ใช้ตลอด)
                              </button>
                            ) : (
                              <div className="p-2 bg-indigo-50/60 border border-indigo-200 rounded-lg space-y-2">
                                <div className="text-[11px] font-bold text-indigo-900">✨ เพิ่มรายการบริการเสริมใหม่</div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="ชื่อบริการเสริม (เช่น เช่าเตาปิ้งย่าง)"
                                    value={newExtraSettingName}
                                    onChange={e => setNewExtraSettingName(e.target.value)}
                                    className="flex-1 min-w-[130px] border border-slate-300 rounded-lg px-2 py-1 bg-white font-bold text-slate-800 text-xs"
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    placeholder="ราคา (บาท)"
                                    value={newExtraSettingPrice}
                                    onChange={e => setNewExtraSettingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="w-24 border border-slate-300 rounded-lg px-2 py-1 bg-white font-bold text-slate-800 text-right text-xs"
                                  />
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={newExtraSettingChargeType}
                                      onChange={e => setNewExtraSettingChargeType(e.target.value as 'one_time' | 'per_night')}
                                      className="border border-slate-300 rounded-lg px-2 py-1 bg-white font-bold text-slate-700 text-[11px]"
                                    >
                                      <option value="one_time">1️⃣ คิดครั้งเดียว</option>
                                      <option value="per_night">📅 ระบุวัน (รายคืน)</option>
                                    </select>
                                    <select
                                      value={newExtraSettingUiType}
                                      onChange={e => setNewExtraSettingUiType(e.target.value as 'quick_button' | 'dropdown')}
                                      className="border border-slate-300 rounded-lg px-2 py-1 bg-white font-bold text-slate-700 text-[11px]"
                                    >
                                      <option value="dropdown">📂 ไว้ใน + รายการอื่นๆ</option>
                                      <option value="quick_button">⚡ แสดงเป็นปุ่มลัดด้านบน</option>
                                    </select>
                                    <select
                                      value={newExtraSettingReportCat}
                                      onChange={e => setNewExtraSettingReportCat(e.target.value as 'addon' | 'minibar' | 'fine' | 'other')}
                                      className="border border-slate-300 rounded-lg px-2 py-1 bg-white font-bold text-slate-700 text-[11px]"
                                      title="หมวดหมู่ในรายงานประจำวัน"
                                    >
                                      <option value="addon">📊 หมวด: ค่าส่วนเสริม</option>
                                      <option value="minibar">📊 หมวด: ค่ามินิบาร์</option>
                                      <option value="fine">📊 หมวด: ค่าปรับ</option>
                                      <option value="other">📊 หมวด: บริการอื่นๆ</option>
                                    </select>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={extraSettingSaving || !newExtraSettingName.trim() || !newExtraSettingPrice || Number(newExtraSettingPrice) <= 0}
                                      onClick={handleCreateExtraSetting}
                                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold px-3 py-1 rounded-lg text-xs"
                                    >
                                      บันทึก
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setShowAddNewExtraSettingForm(false)}
                                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-xs"
                                    >
                                      ยกเลิก
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {showCustomExtraForm && (
                        <div className="mt-2 p-2.5 bg-indigo-50/60 border border-indigo-200 rounded-xl flex flex-wrap items-center gap-1.5 text-xs">
                          <input
                            type="text"
                            placeholder="ชื่อรายการเสริม (เฉพาะบิลนี้)..."
                            value={customExtraName}
                            onChange={e => setCustomExtraName(e.target.value)}
                            className="flex-1 min-w-[120px] border border-slate-300 rounded-lg px-2 py-1.5 bg-white font-bold text-slate-800"
                          />
                          <input
                            type="number"
                            min={1}
                            placeholder="ราคา"
                            value={customExtraPrice}
                            onChange={e => setCustomExtraPrice(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 bg-white font-bold text-slate-800 text-right"
                          />
                          <select
                            value={customExtraChargeType}
                            onChange={e => setCustomExtraChargeType(e.target.value as 'one_time' | 'per_night')}
                            className="border border-slate-300 rounded-lg px-2 py-1.5 bg-white font-bold text-slate-700"
                          >
                            <option value="one_time">1️⃣ ครั้งเดียว</option>
                            <option value="per_night">📅 ระบุวัน (รายคืน)</option>
                          </select>
                          <button
                            type="button"
                            onClick={handleAddCustomExtraInline}
                            disabled={!customExtraName.trim() || !customExtraPrice || Number(customExtraPrice) <= 0}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            เพิ่มลงบิล
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {dailyExtras.length > 0 && (
                    <div className="mt-2 space-y-2 bg-slate-50/80 p-2 rounded-xl border border-slate-100 text-xs">
                      {dailyExtras.map(ext => {
                        const showDaySchedule = Boolean(ext.isPerNight && Array.isArray(ext.dailySchedule) && ext.dailySchedule.length >= 1);
                        const activeDaysCount = showDaySchedule
                          ? ext.dailySchedule.filter((d: any) => d.enabled && !d.isVoided).length
                          : 1;

                        return (
                          <div key={ext.id} className="bg-white p-2 rounded-lg border border-slate-200 space-y-1.5">
                            <div className="flex flex-wrap justify-between items-center gap-1.5">
                              <div className="flex flex-col">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-slate-800">
                                    {ext.name}
                                  </span>
                                  <span className="text-[11px] font-semibold text-indigo-600">
                                    (฿{Number(ext.price).toLocaleString()}{ext.isPerNight ? '/คืน' : '/หน่วย'})
                                  </span>
                                  {/* ปุ่มสลับ 1️⃣ ครั้งเดียว <-> 📅 ระบุวัน ได้อิสระในทุกรายการ */}
                                  {!isBookingLocked && !ext.isSaved && (
                                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[10px] font-bold">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleExtraChargeMode(ext.id, false)}
                                        className={`px-1.5 py-0.5 rounded-md transition-colors ${
                                          !ext.isPerNight
                                            ? 'bg-white text-indigo-700 shadow-sm font-extrabold'
                                            : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                      >
                                        1️⃣ ครั้งเดียว
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleExtraChargeMode(ext.id, true)}
                                        className={`px-1.5 py-0.5 rounded-md transition-colors ${
                                          ext.isPerNight
                                            ? 'bg-indigo-600 text-white shadow-sm font-extrabold'
                                            : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                      >
                                        📅 ระบุวัน
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {showDaySchedule && (
                                  <span className="text-[10px] text-slate-500">
                                    เลือก {activeDaysCount} จาก {ext.dailySchedule.length} คืน (ติ๊กเลือกวันและปรับจำนวนรายวันได้)
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {!showDaySchedule && (
                                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-1 py-0.5">
                                    <button
                                      type="button"
                                      disabled={isBookingLocked || (Number(ext.qty) || 1) <= 1}
                                      onClick={() => handleChangeExtraQty(ext.id, -1)}
                                      className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-indigo-700 font-bold disabled:opacity-30"
                                    >
                                      -
                                    </button>
                                    <span className="w-4 text-center font-bold text-slate-800">{ext.qty || 1}</span>
                                    <button
                                      type="button"
                                      disabled={isBookingLocked}
                                      onClick={() => handleChangeExtraQty(ext.id, 1)}
                                      className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-indigo-700 font-bold disabled:opacity-30"
                                    >
                                      +
                                    </button>
                                  </div>
                                )}
                                <span className="font-black text-indigo-900">฿{extraLineTotal(ext).toLocaleString()}</span>
                                {(room.status !== 'occupied' || extrasManagerUnlocked) && (
                                  <button type="button" onClick={() => handleRemoveExtra(ext.id)} className="text-rose-500 font-bold ml-1 hover:text-rose-700">✕</button>
                                )}
                              </div>
                            </div>

                            {showDaySchedule && (
                              <div className="pt-1.5 border-t border-slate-100 space-y-1">
                                {ext.dailySchedule.map((day: any, dIdx: number) => {
                                  const dObj = new Date(day.date);
                                  const dateLabel = dObj.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
                                  const dayTotal = day.enabled && !day.isVoided ? Number(ext.price) * (Number(day.qty) || 1) : 0;
                                  const isFutureDay = dIdx > 0;
                                  return (
                                    <div
                                      key={day.date}
                                      className={`flex items-center justify-between px-2 py-1 rounded-md text-[11px] ${
                                        day.isVoided
                                          ? 'bg-rose-50/60 text-slate-400'
                                          : day.enabled
                                          ? 'bg-indigo-50/40 text-slate-700'
                                          : 'bg-slate-50 text-slate-400'
                                      }`}
                                    >
                                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(day.enabled && !day.isVoided)}
                                          disabled={isBookingLocked || Boolean(day.isVoided)}
                                          onChange={() => handleToggleExtraDay(ext.id, day.date)}
                                          className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className={`font-semibold ${day.isVoided ? 'line-through text-slate-400' : ''}`}>
                                          คืนที่ {dIdx + 1} ({dateLabel})
                                        </span>
                                        {isFutureDay && day.enabled && !day.isVoided && (
                                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                                            รอตัดบิลวันจริง
                                          </span>
                                        )}
                                        {day.isVoided && (
                                          <span className="text-[10px] text-rose-500 font-bold no-underline">
                                            (ยกเลิกแล้ว)
                                          </span>
                                        )}
                                      </label>
                                      <div className="flex items-center gap-2">
                                        {day.enabled && !day.isVoided && (
                                          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1 py-0.5">
                                            <button
                                              type="button"
                                              disabled={isBookingLocked || (Number(day.qty) || 1) <= 1}
                                              onClick={() => handleChangeExtraDayQty(ext.id, day.date, -1)}
                                              className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-indigo-700 font-bold disabled:opacity-30"
                                            >
                                              -
                                            </button>
                                            <span className="w-4 text-center font-bold text-slate-800">{day.qty || 1}</span>
                                            <button
                                              type="button"
                                              disabled={isBookingLocked}
                                              onClick={() => handleChangeExtraDayQty(ext.id, day.date, 1)}
                                              className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-indigo-700 font-bold disabled:opacity-30"
                                            >
                                              +
                                            </button>
                                          </div>
                                        )}
                                        <span className={`w-14 text-right font-bold ${day.isVoided ? 'line-through text-slate-400' : day.enabled ? 'text-indigo-900' : 'text-slate-400'}`}>
                                          ฿{dayTotal.toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Extras PIN Prompt Modal */}
              {showExtrasPinPrompt && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[70] backdrop-blur-sm p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                    <div className="bg-slate-800 p-4 text-white">
                      <h3 className="font-bold text-lg">ปลดล็อกแก้ไขข้อมูล (Admin/Manager)</h3>
                    </div>
                    <div className="p-4 space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ/Admin (กรอกทุกครั้ง)</label>
                        <input 
                          type="password" 
                          value={extrasPin}
                          onChange={(e) => setExtrasPin(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-3 text-center text-xl font-mono tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="****"
                          autoFocus
                          maxLength={6}
                        />
                      </div>
                      {extrasPinError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 font-medium">{extrasPinError}</div>}
                      <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => { setShowExtrasPinPrompt(false); setExtrasPinError(''); setExtrasPin(''); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-colors">ยกเลิก</button>
                        <button type="button" onClick={handleVerifyExtrasPin} disabled={loading || !extrasPin} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-sm shadow-blue-200">ยืนยัน</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ประวัติการรับชำระเงินที่ผ่านมา */}
              {pastPayments.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-600 mb-1">ประวัติชำระเงินเดิม</label>
                  <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                    {pastPayments.map(p => {
                      const bankMatch = p.notes?.match(/\[BANK:([^\]]+)\]/);
                      const bankLabel = bankMatch ? ` (${bankMatch[1]})` : '';
                      return (
                      <div key={p.id} className="flex justify-between items-center">
                        <span className="text-slate-600">
                          {p.category === 'transfer' ? `โอนเงิน${bankLabel}` : p.category === 'credit_card' ? 'บัตรเครดิต' : 'เงินสด'}
                          {p.notes && p.notes.includes('โอนเวลา:') ? ` (${p.notes.split('โอนเวลา:')[1].trim()})` : ` (${new Date(p.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })})`}
                        </span>
                        <span className="font-bold text-emerald-600">฿{Math.abs(p.amount).toLocaleString()}</span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* วิธีชำระเงิน (Quick Payment Method Selector) */}
              {room.status !== 'occupied' && (
                <div className="pt-1">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-bold text-slate-600">วิธีชำระเงิน</label>
                    <button 
                      type="button" 
                      onClick={() => setIsSplitPayment(!isSplitPayment)}
                      className="text-[11px] text-indigo-600 font-bold hover:underline"
                    >
                      {isSplitPayment ? '✓ ชำระเต็มยอด' : 'จ่ายแยกช่องทาง (Split)'}
                    </button>
                  </div>

                  {!isSplitPayment ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('cash')}
                          className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                            paymentMethod === 'cash'
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>💵</span> เงินสด
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('transfer')}
                          className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                            paymentMethod === 'transfer'
                              ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>📱</span> โอนเงิน
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('credit')}
                          className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                            paymentMethod === 'credit'
                              ? 'bg-purple-50 border-purple-500 text-purple-700 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>💳</span> บัตร
                        </button>
                      </div>

                      {paymentMethod === 'cash' && (
                        <div className="bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100 flex items-center justify-between text-xs">
                          <span className="text-slate-600 font-medium">รับเงินสดมา:</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number"
                              value={receivedCash}
                              onChange={e => setReceivedCash(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder={String(totalToPay)}
                              className="w-24 border border-emerald-300 rounded-lg px-2 py-1 text-right font-bold bg-white text-emerald-900"
                            />
                            {Number(receivedCash) > totalToPay && (
                              <span className="text-emerald-700 font-bold">
                                ทอน: ฿{Number(receivedCash) - totalToPay}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {paymentMethod === 'transfer' && (
                        <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 flex flex-col gap-2 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-bold text-blue-800 mr-1">เข้าบัญชี:</span>
                            {bankAccounts.map(bank => (
                              <button
                                key={bank}
                                type="button"
                                onClick={() => setSelectedBank(bank)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all ${
                                  selectedBank === bank
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                    : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                                }`}
                              >
                                {bank}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2 items-center">
                            <TransferTimePicker value={paymentTime} onChange={setPaymentTime} />
                            <label className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs shrink-0">
                              {isScanningSlip ? '⏳...' : '📷 สแกนสลิป'}
                              <input type="file" accept="image/*" className="hidden" onChange={handleScanSlip} disabled={isScanningSlip} />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-14 font-bold text-slate-600">💵 เงินสด:</span>
                        <input 
                          type="number" 
                          value={payCash} 
                          onChange={e => setPayCash(e.target.value === '' ? '' : Number(e.target.value))}
                          className="flex-1 border-slate-200 rounded-lg p-1.5 text-xs font-bold bg-white" 
                          placeholder="0"
                        />
                        <button type="button" onClick={() => setPayCash(totalToPay)} className="text-[10px] bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded font-bold">เต็ม</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-14 font-bold text-slate-600">📱 โอน:</span>
                        <input 
                          type="number" 
                          value={payTransfer} 
                          onChange={e => setPayTransfer(e.target.value === '' ? '' : Number(e.target.value))}
                          className="flex-1 border-slate-200 rounded-lg p-1.5 text-xs font-bold bg-white" 
                          placeholder="0"
                        />
                        <button type="button" onClick={() => setPayTransfer(totalToPay)} className="text-[10px] bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded font-bold">เต็ม</button>
                      </div>
                      {Number(payTransfer) > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pl-14 pt-0.5">
                          <span className="text-[11px] font-bold text-blue-700 mr-1">เข้าบัญชี:</span>
                          {bankAccounts.map(bank => (
                            <button
                              key={bank}
                              type="button"
                              onClick={() => setSelectedBank(bank)}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-black border transition-all ${
                                selectedBank === bank
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                              }`}
                            >
                              {bank}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="w-14 font-bold text-slate-600">💳 บัตร:</span>
                        <input 
                          type="number" 
                          value={payCredit} 
                          onChange={e => setPayCredit(e.target.value === '' ? '' : Number(e.target.value))}
                          className="flex-1 border-slate-200 rounded-lg p-1.5 text-xs font-bold bg-white" 
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* สรุปยอด Summary Card (Mobile-first Mockup Match) */}
              <div className="bg-slate-50/60 rounded-2xl border border-slate-200/90 p-3.5 shadow-xs">
                <div className="grid grid-cols-2 gap-3 items-center">
                  {/* Left Column: Breakdown */}
                  <div className="space-y-1.5 pr-1">
                    <div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-600">ค่าห้อง</span>
                        <span className="font-black text-slate-900">฿{Number(actualPrice || 0).toLocaleString()}</span>
                      </div>
                      {Number(totalTargetPrice) > 0 && (
                        <p className={`text-[10px] mt-0.5 ${Number(actualPrice || 0) < Number(totalTargetPrice) ? 'text-red-500 font-bold' : Number(actualPrice || 0) > Number(totalTargetPrice) ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                          เป้าหมาย ฿{Number(totalTargetPrice).toLocaleString()}
                          {Number(actualPrice || 0) !== Number(totalTargetPrice) && (
                            <> ({Number(actualPrice || 0) < Number(totalTargetPrice) ? '🔻' : '🔺'} {(Number(actualPrice || 0) - Number(totalTargetPrice) > 0 ? '+' : '') + (Number(actualPrice || 0) - Number(totalTargetPrice)).toLocaleString()})</>
                          )}
                        </p>
                      )}
                      {renderFieldHistory('actual_price')}
                    </div>

                    <div className="pt-1.5 border-t border-slate-200/70">
                      <div className="flex items-center justify-between text-xs gap-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={keyDepositEnabled}
                            onChange={e => setKeyDepositEnabled(e.target.checked)} 
                            disabled={room.status === 'occupied' && !extrasManagerUnlocked}
                            className="w-3.5 h-3.5 text-indigo-700 rounded border-slate-300 focus:ring-indigo-600"
                          />
                          <span className="font-medium text-slate-600">ค่ามัดจำกุญแจ</span>
                        </label>
                        <div className="flex items-center gap-0.5">
                          <span className="font-black text-slate-500">฿</span>
                          <input
                            type="number" min="0"
                            value={keyDepositEnabled ? keyDepositAmount : 0}
                            onChange={e => setKeyDepositAmount(e.target.value === '' ? '' : Number(e.target.value))}
                            disabled={(room.status === 'occupied' && !extrasManagerUnlocked) || !keyDepositEnabled}
                            className="w-16 border border-slate-200 rounded-md px-1.5 py-0.5 text-right font-black text-slate-900 bg-white disabled:bg-transparent disabled:border-transparent focus:ring-1 focus:ring-indigo-600"
                          />
                        </div>
                      </div>
                      {renderFieldHistory('key_deposit')}
                    </div>

                    {dailyExtras.length > 0 && (
                      <div className="pt-1 border-t border-slate-200/70 flex justify-between items-center text-xs">
                        <span className="text-slate-500">บริการเสริม</span>
                        <span className="font-bold text-slate-800">+฿{getTotalExtrasAmount().toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Net Total */}
                  <div className="border-l border-slate-200/90 pl-3.5 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-slate-500">ยอดสุทธิ</span>
                    <span className="text-2xl sm:text-3xl font-black text-indigo-950 tracking-tight leading-none mt-1">
                      ฿{totalToPay.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1">
                      {keyDepositEnabled ? 'รวมค่ามัดจำกุญแจแล้ว' : 'ไม่รวมมัดจำกุญแจ'}
                    </span>
                    {totalPaid > 0 && (
                      <span className="text-[11px] font-bold text-rose-600 mt-0.5">
                        ค้างชำระ: ฿{remainingBalance.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* พนักงานผู้ทำรายการ */}
              <div className="flex items-center justify-between gap-2 px-1 text-xs">
                <span className="text-slate-500">พนักงานผู้ทำรายการ:</span>
                <input 
                  type="text" 
                  value={staffName || operatorName || activeShift?.staff_name || ""} 
                  readOnly
                  disabled
                  placeholder={operatorName || activeShift?.staff_name || "ชื่อพนักงาน"}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 bg-slate-100 max-w-[160px] text-right cursor-not-allowed select-none"
                />
              </div>

              {isExistingBooking && extrasManagerUnlocked && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleSaveManagerEdits}
                    disabled={loading}
                    className="w-full py-3.5 text-white font-bold rounded-2xl text-sm transition-all active:scale-95 bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/20 flex items-center justify-center gap-2"
                  >
                    <span>💾 บันทึกการแก้ไขข้อมูล (โดย {extrasManagerName})</span>
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              {room.status !== 'occupied' && (
                <div className="space-y-2 pt-2">
                  {room.status === 'reserved' ? (
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={handleAdditionalPayment} 
                        disabled={loading}
                        className="w-1/2 py-3.5 text-white font-bold rounded-2xl text-sm transition-all active:scale-95 bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                      >
                        💾 บันทึกชำระเพิ่ม
                      </button>
                      <button 
                        type="button"
                        onClick={handleCheckInReserved} 
                        disabled={loading}
                        className="w-1/2 py-3.5 text-white font-bold rounded-2xl text-sm transition-all active:scale-95 bg-indigo-700 hover:bg-indigo-800 shadow-md shadow-indigo-700/20"
                      >
                        🚪 Check-in ทันที
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button 
                        type="button"
                        onClick={() => handleCheckIn(activeTab)} 
                        disabled={loading}
                        className="w-full py-4 text-white font-bold rounded-2xl text-lg transition-all active:scale-98 bg-indigo-700 hover:bg-indigo-800 shadow-lg shadow-indigo-700/25 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>
                          {loading ? 'กำลังบันทึก...' : dateOffset > 0 ? 'ยืนยันจองล่วงหน้า' : 'ยืนยันเช็คอิน'}
                        </span>
                      </button>
                      
                      {dateOffset === 0 && activeTab === 'overnight' && (
                        <button 
                          type="button"
                          onClick={() => handleCheckIn(activeTab, true)} 
                          disabled={loading}
                          className="w-full py-2.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 border border-slate-200 rounded-xl text-xs font-bold transition-all"
                        >
                          📝 จองไว้ก่อน (ยังไม่เข้าพัก)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2. ห้องมีแขกพัก หรือ จองแล้ว -> Check-out หรือ ยกเลิก */}
          {(room.status === 'occupied' || room.status === 'reserved') && (
            <div className="space-y-6">
              <div className="mt-2 pt-4 border-t border-slate-200">
                {room.status === 'occupied' && dateOffset === 0 && !isChangingRoom && (
                  <button 
                    onClick={() => { setIsChangingRoom(true); fetchAvailableRooms(); }}
                    className="w-full mt-2 py-2 text-blue-600 bg-white border border-blue-200 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-50 transition-colors"
                  >
                    🔄 ต้องการย้ายห้อง?
                  </button>
                )}
                {room.status === 'reserved' && !isReschedulingBooking && (
                  <button 
                    onClick={() => { 
                      setIsReschedulingBooking(true);
                      if (room.check_in_time) setRescheduleCheckIn(room.check_in_time.split('T')[0]);
                      if (room.check_out_time) setRescheduleCheckOut(room.check_out_time.split('T')[0]);
                    }}
                    className="w-full mt-2 py-2 text-purple-600 bg-white border border-purple-200 rounded-lg text-sm font-bold shadow-sm hover:bg-purple-50 transition-colors"
                  >
                    📅 เลื่อนวัน / ย้ายห้อง
                  </button>
                )}
              </div>

              {isReschedulingBooking && room.status === 'reserved' && (
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl mb-6 space-y-4">
                  <h3 className="font-bold text-purple-800 flex justify-between items-center">
                    <span>📅 เลื่อนวัน / ย้ายห้อง</span>
                    <button onClick={() => setIsReschedulingBooking(false)} className="text-slate-400 hover:text-slate-600">✖</button>
                  </h3>
                  
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">วันเช็คอินใหม่</label>
                      <input type="date" value={rescheduleCheckIn} onChange={(e) => {
                        handleCheckInChange(e.target.value);
                      }} className="w-full border-slate-200 rounded-lg px-2 py-2 text-sm bg-white" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">วันเช็คเอาท์ใหม่</label>
                      <input type="date" value={rescheduleCheckOut} onChange={(e) => {
                        setRescheduleCheckOut(e.target.value);
                      }} className="w-full border-slate-200 rounded-lg px-2 py-2 text-sm bg-white" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">เลือกห้องว่าง</label>
                    <select 
                      value={rescheduleTargetRoomId} onChange={e => setRescheduleTargetRoomId(e.target.value)}
                      className="w-full border-slate-200 rounded-lg px-3 py-2 bg-white"
                      disabled={loading || availableRoomsForReschedule.length === 0}
                    >
                      {availableRoomsForReschedule.length === 0 && <option value="">-- กรุณาเลือกวันที่ / ไม่มีห้องว่าง --</option>}
                      {availableRoomsForReschedule.map(r => (
                        <option key={r.id} value={r.id}>{r.location || 'ไม่มีสถานที่'} - ห้อง {r.room_no} (฿{r.price_night})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ราคาส่วนต่าง</label>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="priceDecision" checked={priceDecision === 'keep'} onChange={() => setPriceDecision('keep')} className="text-purple-600" />
                        <span className="text-xs font-medium">คงราคาเดิม (฿{room.actual_price})</span>
                      </label>
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="priceDecision" checked={priceDecision === 'update'} onChange={() => setPriceDecision('update')} className="text-purple-600" />
                        <span className="text-xs font-medium">อัปเดตราคาตามห้องใหม่</span>
                      </label>
                    </div>
                  </div>

                  <button 
                    onClick={handleRescheduleBooking} disabled={loading || !rescheduleTargetRoomId}
                    className="w-full py-3 text-white font-bold rounded-lg text-sm bg-purple-600 hover:bg-purple-700 shadow-purple-600/20 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? 'กำลังบันทึก...' : '👉 ยืนยันการเปลี่ยนแปลง'}
                  </button>
                </div>
              )}


              {isChangingRoom && room.status === 'occupied' && (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mb-6 space-y-4">
                  <h3 className="font-bold text-yellow-800 flex justify-between items-center">
                    <span>🔄 ย้ายลูกค้าไปห้องอื่น</span>
                    <button onClick={() => setIsChangingRoom(false)} className="text-slate-400 hover:text-slate-600">✖</button>
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">เลือกห้องปลายทาง (ที่ว่างอยู่)</label>
                    <select 
                      value={targetRoomId} onChange={e => setTargetRoomId(e.target.value)}
                      className="w-full border-slate-200 rounded-lg px-3 py-2 bg-white"
                      disabled={loading || availableRooms.length === 0}
                    >
                      {availableRooms.length === 0 && <option value="">-- ไม่มีห้องว่าง --</option>}
                      {availableRooms.map(r => (
                        <option key={r.id} value={r.id}>{r.location || 'ไม่มีสถานที่'} - ห้อง {r.room_no} (ค้างคืน: ฿{r.price_night} / ชั่วคราว: ฿{r.price_temp})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ส่วนต่างราคาห้อง</label>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="priceDecision" checked={priceDecision === 'keep'} onChange={() => setPriceDecision('keep')} className="text-blue-600" />
                        <span className="text-xs font-medium">คงราคาเดิมไว้ (฿{room.actual_price})</span>
                      </label>
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="priceDecision" checked={priceDecision === 'update'} onChange={() => setPriceDecision('update')} className="text-blue-600" />
                        <span className="text-xs font-medium">อัปเดตราคาตามห้องใหม่</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">สภาพห้อง {room.room_no} (ห้องเก่า)</label>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="oldRoomStatus" checked={oldRoomStatus === 'dirty'} onChange={() => setOldRoomStatus('dirty')} className="text-red-500" />
                        <span className="text-xs font-medium text-red-700">ใช้งานไปแล้ว (รอทำความสะอาด)</span>
                      </label>
                      <label className="flex items-center gap-2 flex-1 p-2 bg-white rounded border border-slate-200 cursor-pointer">
                        <input type="radio" name="oldRoomStatus" checked={oldRoomStatus === 'available'} onChange={() => setOldRoomStatus('available')} className="text-emerald-500" />
                        <span className="text-xs font-medium text-emerald-700">ยังไม่เลอะ (เปลี่ยนเป็นว่าง)</span>
                      </label>
                    </div>
                  </div>

                  <button 
                    onClick={handleChangeRoom} disabled={loading || !targetRoomId}
                    className="w-full py-3 text-white font-bold rounded-lg text-sm bg-yellow-600 hover:bg-yellow-700 shadow-yellow-600/20 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? 'กำลังย้าย...' : '👉 ยืนยันการย้ายห้อง'}
                  </button>
                </div>
              )}

              {/* ต่อเวลาเป็นคืน (แสดงเฉพาะเมื่อดูของวันนี้ และสถานะเข้าพักแล้ว) */}
              {dateOffset === 0 && room.status === 'occupied' && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-3.5 text-slate-400">🌙</span>
                      <input 
                        type="number" min="1" 
                        value={extendNights} onChange={(e) => setExtendNights(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full border-slate-200 rounded-xl pl-9 pr-4 py-3 font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 placeholder-slate-300"
                      />
                    </div>
                    <button 
                      onClick={() => handleExtend('nights')} disabled={loading}
                      className="bg-slate-800 text-white px-4 rounded-xl font-bold hover:bg-slate-900 active:scale-95"
                    >
                      ต่อเวลาพัก (+คืน)
                    </button>
                  </div>

                  {/* ต่อเวลาเป็นชั่วโมง */}
                  {(() => {
                    let isForceExtend = false;
                    if (room.status === 'occupied' && room.check_out_time) {
                      const coTime = new Date(room.check_out_time).getTime();
                      const nowTime = getNow().getTime();
                      if (nowTime > coTime && (nowTime - coTime) / 60000 >= 225) {
                        isForceExtend = true;
                      }
                    }
                    if (isForceExtend) {
                      return (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold border border-red-200">
                          🚫 เกินกำหนดเวลา 15:45 น. (บังคับพักต่ออัตโนมัติแล้ว)
                        </div>
                      );
                    }
                    return (
                      <div className="flex gap-3">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-3.5 text-slate-400">⏳</span>
                          <input 
                            type="number" min="1" 
                            value={extendHours} onChange={(e) => setExtendHours(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full border-slate-200 rounded-xl pl-9 pr-4 py-3 font-bold focus:ring-amber-500 focus:border-amber-500 bg-slate-50 placeholder-slate-300"
                          />
                        </div>
                        <button 
                          onClick={() => handleExtend('hours')} disabled={loading}
                          className="bg-amber-100 text-amber-800 px-4 rounded-xl font-bold hover:bg-amber-200 active:scale-95 border border-amber-200"
                        >
                          ออกช้า (+ชม.)
                        </button>
                      </div>
                    );
                  })()}
                </>
              )}

              <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                {room.status === 'occupied' && (
                  <button 
                    onClick={() => setShowBilling(true)} disabled={loading || !room.booking_id}
                    className="w-full py-4 text-emerald-700 font-bold rounded-xl text-lg bg-emerald-100 hover:bg-emerald-200 shadow-emerald-500/10 shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    💳 จัดการบิล / ชำระเงิน / POS
                  </button>
                )}
                  <button 
                    onClick={() => setShowVoidPinPrompt(true)} disabled={loading}
                    className="w-full py-4 text-slate-700 font-bold rounded-xl text-lg bg-slate-200 hover:bg-slate-300 shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 mb-2"
                  >
                    ⚠️ ยกเลิกการเข้าพัก (Void)
                  </button>

                  <button 
                    onClick={() => {
                      if (room.status === 'occupied' && dateOffset === 0 && room.booking_id) {
                        setShowCheckoutSummary(true);
                      } else {
                        handleCheckOut();
                      }
                    }} disabled={loading}
                  className="w-full py-4 text-white font-bold rounded-xl text-lg bg-red-500 hover:bg-red-600 shadow-red-500/20 shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {room.status === 'reserved' ? '❌ ยกเลิกการจอง' : '👋 Check-out ทันที'}
                </button>
              </div>
            </div>
          )}

          {/* 3. ห้องรอทำความสะอาด / กำลังทำความสะอาด (เฉพาะวันนี้) */}
          {(room.status === 'dirty' || room.status === 'cleaning') && dateOffset === 0 && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4 animate-bounce">🧹</div>
              <h3 className="text-lg font-bold text-slate-700 mb-6">
                {room.status === 'dirty' ? 'ห้องนี้กำลังรอทำความสะอาด' : 'กำลังทำความสะอาด...'}
              </h3>
              
              {room.status === 'dirty' ? (
                <button 
                  onClick={async () => {
                    setLoading(true);
                    await supabase.from('rooms').update({ status: 'cleaning', current_status: 'กำลังทำความสะอาด' }).eq('id', room.id);
                    setLoading(false);
                    onUpdate();
                  }}
                  disabled={loading}
                  className="w-full py-4 text-white font-bold rounded-xl text-lg bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20 shadow-lg transition-all active:scale-95 mb-3"
                >
                  {loading ? 'กำลังบันทึก...' : '▶️ เริ่มทำความสะอาด'}
                </button>
              ) : (
                <button 
                  onClick={handleClean} disabled={loading}
                  className="w-full py-4 text-white font-bold rounded-xl text-lg bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20 shadow-lg transition-all active:scale-95"
                >
                  {loading ? 'กำลังบันทึก...' : '✅ ทำความสะอาดเรียบร้อย'}
                </button>
              )}
            </div>
          )}

        </div>
      </div>
      
      {showBilling && (newBookingId || room.booking_id) && (
        <BillingModal 
          roomId={room.id}
          roomNo={room.room_no}
          bookingId={(newBookingId || room.booking_id) as string}
          onClose={() => { setShowBilling(false); onUpdate(); }}
          onSuccess={() => { setShowBilling(false); onUpdate(); }}
        />
      )}

      {showCheckoutSummary && room.booking_id && (
        <CheckoutSummaryModal
          roomId={room.id}
          roomNo={room.room_no}
          bookingId={room.booking_id}
          onClose={() => setShowCheckoutSummary(false)}
          onConfirmed={() => { setShowCheckoutSummary(false); handleCheckOut(true); }}
        />
      )}
    </div>
  );





}
