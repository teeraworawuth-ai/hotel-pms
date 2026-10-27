import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useShift } from '@/contexts/ShiftContext';
import { useSimulatedTime } from '@/contexts/SimulatedTimeContext';
import { computeDeposit } from '@/lib/depositMath';
import { logActivity } from '@/lib/activityLog';
import FolioReceiptModal from './FolioReceiptModal';

type PosItem = { id: string, name: string, default_price: number };
type Transaction = { id: string, transaction_type: string, category: string, amount: number, created_at: string, staff_name: string, notes?: string };
type FieldEditEntry = { oldValue: string; newValue: string; by: string; at: string };
type BookingMeta = {
  history?: Record<string, FieldEditEntry[]>;
  targetPrices?: {
    totalTargetPrice: number;
    dailyTargets?: Record<string, number>;
    timeBand?: string;
    stayType?: 'overnight' | 'short_stay';
  };
};

interface BillingModalProps {
  roomId: string;
  roomNo: string;
  bookingId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BillingModal({ roomId, roomNo, bookingId, onClose, onSuccess }: BillingModalProps) {
  const { activeShift, operatorName, refreshShift } = useShift();
  const effectiveStaffName = operatorName || activeShift?.staff_name || 'Admin';
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [posItems, setPosItems] = useState<PosItem[]>([]);
  
  const [dailyRates, setDailyRates] = useState<any[]>([]);
  const [dailyExtras, setDailyExtras] = useState<any[]>([]);
  const [bookingMeta, setBookingMeta] = useState<BookingMeta>({});
  const [bookingCheckInTime, setBookingCheckInTime] = useState<string | null>(null);

  // Unified Extra / POS Settings & Post-Check-in Staged Cart
  const [extraSettings, setExtraSettings] = useState<any[]>([]);
  const [posCategoryMap, setPosCategoryMap] = useState<Record<string, 'addon' | 'minibar' | 'fine' | 'other'>>({});
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
  const [showCustomExtraForm, setShowCustomExtraForm] = useState(false);
  const [customExtraName, setCustomExtraName] = useState('');
  const [customExtraPrice, setCustomExtraPrice] = useState<number | ''>('');
  const [customExtraChargeType, setCustomExtraChargeType] = useState<'one_time' | 'per_night'>('one_time');
  const [stagedPostExtras, setStagedPostExtras] = useState<any[]>([]);
  
  const [payCash, setPayCash] = useState<number | ''>('');
  const [payTransfer, setPayTransfer] = useState<number | ''>('');
  const [payCredit, setPayCredit] = useState<number | ''>('');
  const [paymentTime, setPaymentTime] = useState<string>('');
  const [isScanningSlip, setIsScanningSlip] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<string[]>(['SCB', 'KBANK']);
  const [selectedBank, setSelectedBank] = useState<string>('SCB');
  
  // Custom POS states
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState<number | ''>('');
  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [showPayments, setShowPayments] = useState<boolean>(true);
  const [includeKeyDeposit, setIncludeKeyDeposit] = useState<boolean>(true);
  const [depositInput, setDepositInput] = useState<number | ''>(200);
  const [depositChecked, setDepositChecked] = useState<boolean>(false);
  const [activeDepositTx, setActiveDepositTx] = useState<{ id: string; amount: number } | null>(null);
  const [showProjected, setShowProjected] = useState<boolean>(false);

  // Admin/Manager PIN unlock for editing room charges
  const [roomPriceUnlocked, setRoomPriceUnlocked] = useState<boolean>(false);
  const [roomPriceManagerName, setRoomPriceManagerName] = useState<string>('');
  const [showRoomPinPrompt, setShowRoomPinPrompt] = useState<boolean>(false);
  const [roomPin, setRoomPin] = useState<string>('');
  const [roomPinError, setRoomPinError] = useState<string>('');
  const [editingRoomTxAmounts, setEditingRoomTxAmounts] = useState<Record<string, number | ''>>({});

  // Admin/Manager PIN modal for cancelling future extra charges (with Option A: refund cash today vs keep credit)
  const [cancellingExtra, setCancellingExtra] = useState<any | null>(null);
  const [cancelExtraPin, setCancelExtraPin] = useState<string>('');
  const [cancelExtraError, setCancelExtraError] = useState<string>('');
  const [cancelExtraRefundMode, setCancelExtraRefundMode] = useState<'refund_now' | 'keep_credit'>('refund_now');
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);

  const { getNow } = useSimulatedTime();

  useEffect(() => {
    fetchData();
  }, [bookingId]);

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
    if (posRes.data) setPosItems(posRes.data);
  };

  const fetchData = async () => {
    setLoading(true);
    const [txRes, ratesRes, extrasRes, metaRes, roomRes, bankRes, bookingRes] = await Promise.all([
      supabase.from('ledger_transactions').select('*').eq('booking_id', bookingId).order('created_at', { ascending: true }),
      supabase.from('booking_daily_rates').select('*').eq('booking_id', bookingId),
      supabase.from('booking_daily_extras').select('*').eq('booking_id', bookingId),
      supabase.from('system_settings').select('value').eq('key', `booking_meta_${bookingId}`).maybeSingle(),
      supabase.from('rooms').select('key_deposit').eq('id', roomId).maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'bank_accounts').maybeSingle(),
      supabase.from('bookings').select('check_in_time, actual_check_in_time, created_at').eq('id', bookingId).maybeSingle(),
      refreshExtraSettings()
    ]);

    if (bookingRes?.data) {
      setBookingCheckInTime(bookingRes.data.actual_check_in_time || bookingRes.data.check_in_time || bookingRes.data.created_at || null);
    }
    
    const txs = [...(txRes.data || [])];
    const ratesList = ratesRes?.data || [];
    const extrasList = extrasRes?.data || [];

    // Auto-post any due booking_daily_extras (target_date <= current business date) that haven't been posted to ledger yet
    const nowDt = getNow();
    const cutoffDt = new Date(nowDt);
    if (nowDt.getHours() < 9 || (nowDt.getHours() === 9 && nowDt.getMinutes() < 45)) {
      cutoffDt.setDate(cutoffDt.getDate() - 1);
    }
    const currentBizDateStr = cutoffDt.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const allStayDates = [
      ...ratesList.map((r: any) => String(r.target_date)),
      ...extrasList.map((e: any) => String(e.target_date))
    ].filter(Boolean).sort();
    const firstStayDate = allStayDates[0] || '';

    for (const ext of extrasList) {
      const isVoid = String(ext.category || '').includes('(Voided)');
      if (isVoid || !ext.target_date || String(ext.target_date) > currentBizDateStr || Number(ext.amount) <= 0) continue;
      const baseCat = String(ext.category || '').replace(' (Voided)', '').trim();
      const alreadyPosted = txs.some(t =>
        t.transaction_type === 'revenue' &&
        String(t.category || '').replace(' (Voided)', '').trim() === baseCat &&
        (String(t.notes || '').includes(ext.target_date) || (ext.target_date === firstStayDate && !String(t.notes || '').includes('ประจำวันที่ ')))
      );
      if (!alreadyPosted) {
        const qtyMatch = String(ext.description || '').match(/x(\d+)/);
        const qtySuffix = qtyMatch ? ` (x${qtyMatch[1]})` : '';
        const { data: newExtraTx } = await supabase.from('ledger_transactions').insert({
          shift_id: activeShift?.id && activeShift.id !== 'dummy-shift-id' ? activeShift.id : null,
          staff_name: effectiveStaffName || 'SYSTEM',
          room_id: roomId,
          booking_id: bookingId,
          transaction_type: 'revenue',
          category: baseCat,
          notes: `ประจำวันที่ ${ext.target_date}${qtySuffix}`,
          amount: Number(ext.amount)
        }).select('*').single();
        if (newExtraTx) {
          txs.push(newExtraTx);
        }
      }
    }

    setTransactions(txs);
    setDailyRates(ratesList);
    setDailyExtras(extrasList);
    if (metaRes?.data?.value) setBookingMeta(metaRes.data.value as BookingMeta);
    if (bankRes?.data && Array.isArray(bankRes.data.value) && bankRes.data.value.length > 0) {
      setBankAccounts(bankRes.data.value);
      setSelectedBank(prev => bankRes.data!.value.includes(prev) ? prev : bankRes.data!.value[0]);
    }

    const activeDeps = txs.filter(t => !t.category.includes('Voided') && Number(t.amount) > 0 && (t.transaction_type === 'deposit' || t.category === 'ค่ามัดจำกุญแจ' || t.category === 'key_deposit'));
    const depTx = activeDeps.length > 0 ? activeDeps[activeDeps.length - 1] : null;
    if (depTx) {
      setActiveDepositTx({ id: depTx.id, amount: Number(depTx.amount) });
      setDepositChecked(true);
      setDepositInput(Number(depTx.amount));
    } else {
      setActiveDepositTx(null);
      setDepositChecked(false);
      const defaultDep = roomRes.data?.key_deposit && Number(roomRes.data.key_deposit) > 0 ? Number(roomRes.data.key_deposit) : 200;
      setDepositInput(defaultDep);
    }

    const roomAmtMap: Record<string, number | ''> = {};
    txs.forEach(t => {
      if (!t.category.includes('Voided') && (t.category === 'room_charge' || t.category.includes('ค่าห้องพัก'))) {
        roomAmtMap[t.id] = Number(t.amount);
      }
    });
    setEditingRoomTxAmounts(roomAmtMap);
    setLoading(false);
  };

  const renderFieldHistory = (fieldKey: string) => {
    const entries = bookingMeta?.history?.[fieldKey];
    if (!entries || entries.length === 0) return null;
    return (
      <div className="mt-1 space-y-0.5">
        {entries.map((entry, idx) => (
          <div key={idx} className="text-[11px] text-slate-400/90 flex items-center gap-1.5">
            <span className="line-through">{entry.oldValue || '-'}</span>
            <span className="text-[10px] text-slate-400/75 no-underline">(แก้โดย {entry.by})</span>
          </div>
        ))}
      </div>
    );
  };

  const now = getNow();
  const businessCutoff = new Date(now);
  if (now.getHours() < 6 || (now.getHours() === 6 && now.getMinutes() < 45)) {
    businessCutoff.setDate(businessCutoff.getDate() - 1);
  }
  businessCutoff.setHours(6, 45, 0, 0);

  const pastTransactions = transactions.filter(tx => new Date(tx.created_at).getTime() < businessCutoff.getTime());
  const todayTransactions = transactions.filter(tx => new Date(tx.created_at).getTime() >= businessCutoff.getTime());

  const availableDates = Array.from(new Set(transactions.map(tx => new Date(tx.created_at).toLocaleDateString('th-TH'))));
  
  const filteredTransactions = transactions.filter(tx => {
    if (selectedDate !== 'ALL') {
      const txDate = new Date(tx.created_at).toLocaleDateString('th-TH');
      if (txDate !== selectedDate) return false;
    }
    
    // Payments have negative amounts
    if (!showPayments && Number(tx.amount) < 0) {
      return false;
    }
    
    return true;
  });
  
  const displayTransactions = filteredTransactions.filter(tx => !tx.category.includes('มัดจำกุญแจ'));


  const balanceForward = pastTransactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') ? 0 : Number(tx.amount)), 0);
  const balance = transactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') ? 0 : Number(tx.amount)), 0);

  // --- PROJECTED TOTAL CALCULATION ---
  const validTxs = transactions.filter(t => !t.category.includes('Voided'));
  const rawPaid = validTxs.filter(t => t.amount < 0 && t.transaction_type === 'payment').reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const changeRefundedTotal = validTxs.filter(t => t.amount < 0 && t.category.includes('คืนเงินทอน')).reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalPaid = Math.max(0, rawPaid - changeRefundedTotal);
  const totalPostedCharges = validTxs.filter(t => t.amount > 0 && !t.category.includes('มัดจำกุญแจ')).reduce((sum, t) => sum + Number(t.amount), 0);
  const totalKeyDeposit = validTxs.filter(t => t.category.includes('มัดจำกุญแจ')).reduce((sum, t) => sum + Number(t.amount), 0);
  const depositReceivedTotal = validTxs.filter(t => t.category.includes('มัดจำกุญแจ') && Number(t.amount) > 0).reduce((sum, t) => sum + Number(t.amount), 0);

  // Date in YYYY-MM-DD for Asia/Bangkok (based on 06:45 - 06:44 business day cutoff)
  const todayStr = `${businessCutoff.getFullYear()}-${String(businessCutoff.getMonth() + 1).padStart(2, '0')}-${String(businessCutoff.getDate()).padStart(2, '0')}`;

  // Calculate future unposted charges (ข้ามคืนที่ถูกตัดเข้า ledger_transactions ไปแล้ว)
  const sortedAllRates = [...dailyRates].sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
  const postedRoomTxCount = validTxs.filter(t => t.category === 'room_charge' || t.category === 'ค่าห้องพัก').length;
  const unpostedRateRows = sortedAllRates.filter((r, idx) => r.target_date > todayStr && idx >= postedRoomTxCount);
  const futureRates = unpostedRateRows.reduce((sum, r) => sum + Number(r.amount), 0);
  const allDailyExtraRows = [...dailyExtras].sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
  const futureExtraRows = allDailyExtraRows.filter(e => e.target_date > todayStr);
  const activeFutureExtraRows = futureExtraRows.filter(e => !String(e.category || '').includes('(Voided)'));
  const futureExtras = activeFutureExtraRows.reduce((sum, e) => sum + Number(e.amount), 0);

  // สูตรกลาง: ค่าใช้จ่ายชำระครบก่อน (รวมรายการล่วงหน้าที่ยังไม่ถึงวัน) เงินที่เหลือจึงนับเป็นมัดจำ (ดู src/lib/depositMath.ts)
  const dep = computeDeposit([
    ...transactions,
    ...(futureRates + futureExtras > 0
      ? [{ transaction_type: 'revenue', category: 'future_scheduled', amount: futureRates + futureExtras }]
      : []),
  ]);
  const depositHeldNow = dep.held;
  const depositRefundedTotal = dep.refunded;
  const depositAppliedTotal = 0;
  
    // To avoid duplicate counting if someone clicks POS repeatedly, 
  // we count all past/today posted charges from ledger, plus ONLY future unposted from daily tables.
  const totalExpectedCharges = totalPostedCharges + futureRates + futureExtras + (includeKeyDeposit ? totalKeyDeposit : 0);
  const netRemaining = totalExpectedCharges - totalPaid;

  // ส่วนต่าง = เงินที่จ่ายจริง - ค่าใช้จ่าย (ลบ = ค้างชำระ) ส่วนที่เหลือหลังค่าใช้จ่ายครบ = มัดจำ/เงินทอน
  const dashCharges = totalExpectedCharges - (includeKeyDeposit ? totalKeyDeposit : 0);
  const dashSurplus = totalPaid - dashCharges;
  const fmt = (n: number) => '฿' + n.toLocaleString();
  const dashNote: { ok: boolean; text: string } | null =
    dep.unpaid > 0
      ? { ok: false, text: '⚠ ค่าใช้จ่ายยังค้างชำระ ' + fmt(dep.unpaid) + ' (ต้องชำระค่าใช้จ่ายให้ครบก่อน จึงจะนับเงินที่เหลือเป็นมัดจำ)' }
      : dep.target > 0
      ? dep.shortfall > 0
        ? { ok: false, text: '⚠ เก็บมัดจำได้ ' + fmt(dep.held) + ' จากที่ตกลง ' + fmt(dep.target) + ' → ขาดอีก ' + fmt(dep.shortfall) }
        : { ok: true, text: '✓ ค่าใช้จ่ายครบ และมีเงินมัดจำถือไว้ ' + fmt(dep.held) + (dep.excess > 0 ? ' (มีเงินเกิน ' + fmt(dep.excess) + ' ต้องคืนเป็นเงินทอน)' : '') }
      : dep.excess > 0
      ? { ok: false, text: 'ห้องนี้ไม่มีมัดจำ ลูกค้าจ่ายเกินค่าใช้จ่าย ' + fmt(dep.excess) + ' (เงินทอนที่ต้องคืน)' }
      : null;
  const payEntered = (Number(payCash) || 0) + (Number(payTransfer) || 0) + (Number(payCredit) || 0);
  const payChange = Math.max(0, payEntered - Math.max(0, netRemaining));

  useEffect(() => {
    // Default cash to netRemaining if they haven't typed anything
    if (netRemaining > 0 && payCash === '' && payTransfer === '' && payCredit === '') {
      setPayCash(netRemaining);
    }
  }, [netRemaining, transactions.length]);

  // Stay dates available for per-night scheduling in post-check-in POS
  const stayDatesForExtras = React.useMemo(() => {
    const rateDates = dailyRates
      .map((r: any) => String(r.target_date || ''))
      .filter(Boolean)
      .sort();
    if (rateDates.length > 0) return rateDates;
    return [todayStr];
  }, [dailyRates, todayStr]);

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
          staffName: effectiveStaffName,
          shiftName: activeShift?.staff_name || null,
          roomNo,
          target: trimmed,
          details: `เพิ่มรายการ "${trimmed}" ราคา ฿${numPrice.toLocaleString()} (${newExtraSettingChargeType === 'per_night' ? 'ระบุวัน/รายคืน' : 'ครั้งเดียว'} • ${newExtraSettingUiType === 'quick_button' ? 'ปุ่มลัดด้านบน' : 'ในตัวเลือก'})`
        });
        await refreshExtraSettings();
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
          staffName: effectiveStaffName,
          shiftName: activeShift?.staff_name || null,
          roomNo,
          target: trimmed,
          details: `แก้ไขรายการ "${oldItem.name}" (฿${Number(oldItem.price).toLocaleString()}) -> "${trimmed}" (฿${numPrice.toLocaleString()})`
        });
        await refreshExtraSettings();
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
          staffName: effectiveStaffName,
          shiftName: activeShift?.staff_name || null,
          roomNo,
          target: item.name,
          details: `ย้ายปุ่ม "${item.name}" เป็น ${nextUi === 'quick_button' ? 'ปุ่มลัดด้านบน' : 'ในตัวเลือก (+ รายการอื่นๆ)'}`
        });
        await refreshExtraSettings();
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
          staffName: effectiveStaffName,
          shiftName: activeShift?.staff_name || null,
          roomNo,
          target: item.name,
          details: `เปลี่ยนค่าเริ่มต้น "${item.name}" เป็นแบบ ${nextCharge === 'per_night' ? 'ระบุวัน (รายคืน)' : 'ครั้งเดียว'}`
        });
        await refreshExtraSettings();
      }
    } finally {
      setExtraSettingSaving(false);
    }
  };

  const handleDeleteExtraSetting = async (item: any) => {
    if (!window.confirm(`ยืนยันการลบรายการ "${item.name}" (฿${Number(item.price).toLocaleString()}) ออกจากตัวเลือก?`)) return;
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
          staffName: effectiveStaffName,
          shiftName: activeShift?.staff_name || null,
          roomNo,
          target: item.name,
          details: `ลบรายการ "${item.name}" (ราคาเดิม ฿${Number(item.price).toLocaleString()})`
        });
        await refreshExtraSettings();
      }
    } finally {
      setExtraSettingSaving(false);
    }
  };

  // --- Post-Check-in Staged Extras Cart Handlers (เหมือนหน้าก่อนเช็คอินเป๊ะๆ) ---
  const buildDefaultDailySchedule = () => {
    return stayDatesForExtras.map(d => ({
      date: d,
      enabled: d >= todayStr,
      qty: 1
    }));
  };

  const handleSelectPostExtra = (setting: any) => {
    const isPerNight = setting.charge_type === 'per_night';
    setStagedPostExtras(prev => {
      const existingIdx = prev.findIndex(e => e.name === setting.name);
      if (existingIdx !== -1) {
        return prev.map((e, i) => {
          if (i !== existingIdx) return e;
          if (e.isPerNight && Array.isArray(e.dailySchedule)) {
            return {
              ...e,
              dailySchedule: e.dailySchedule.map((day: any) =>
                day.enabled ? { ...day, qty: (Number(day.qty) || 1) + 1 } : day
              )
            };
          }
          return { ...e, qty: (Number(e.qty) || 1) + 1 };
        });
      }
      return [
        ...prev,
        {
          id: Math.random().toString(),
          settingId: setting.id,
          name: setting.name,
          price: Number(setting.price),
          isPerNight,
          qty: 1,
          dailySchedule: isPerNight ? buildDefaultDailySchedule() : undefined
        }
      ];
    });
  };

  const handleAddCustomPostExtraInline = () => {
    const trimmed = customExtraName.trim();
    const numPrice = Number(customExtraPrice);
    if (!trimmed || !numPrice || numPrice <= 0) return;
    const isPerNight = customExtraChargeType === 'per_night';
    setStagedPostExtras(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        name: trimmed,
        price: numPrice,
        isPerNight,
        qty: 1,
        dailySchedule: isPerNight ? buildDefaultDailySchedule() : undefined
      }
    ]);
    setCustomExtraName('');
    setCustomExtraPrice('');
    setShowCustomExtraForm(false);
  };

  const handleToggleStagedChargeMode = (extId: string, toPerNight: boolean) => {
    setStagedPostExtras(prev =>
      prev.map(e => {
        if (e.id !== extId) return e;
        if (toPerNight) {
          const baseQty = Number(e.qty) || 1;
          const schedule =
            Array.isArray(e.dailySchedule) && e.dailySchedule.length > 0
              ? e.dailySchedule
              : stayDatesForExtras.map(d => ({ date: d, enabled: d >= todayStr, qty: baseQty }));
          return { ...e, isPerNight: true, dailySchedule: schedule };
        }
        return { ...e, isPerNight: false };
      })
    );
  };

  const handleChangeStagedQty = (extId: string, delta: number) => {
    setStagedPostExtras(prev =>
      prev.map(e => {
        if (e.id !== extId) return e;
        return { ...e, qty: Math.max(1, (Number(e.qty) || 1) + delta) };
      })
    );
  };

  const handleToggleStagedDay = (extId: string, dateStr: string) => {
    setStagedPostExtras(prev =>
      prev.map(e => {
        if (e.id !== extId || !Array.isArray(e.dailySchedule)) return e;
        return {
          ...e,
          dailySchedule: e.dailySchedule.map((d: any) =>
            d.date === dateStr ? { ...d, enabled: !d.enabled } : d
          )
        };
      })
    );
  };

  const handleChangeStagedDayQty = (extId: string, dateStr: string, delta: number) => {
    setStagedPostExtras(prev =>
      prev.map(e => {
        if (e.id !== extId || !Array.isArray(e.dailySchedule)) return e;
        return {
          ...e,
          dailySchedule: e.dailySchedule.map((d: any) =>
            d.date === dateStr ? { ...d, qty: Math.max(1, (Number(d.qty) || 1) + delta) } : d
          )
        };
      })
    );
  };

  const handleRemoveStagedExtra = (extId: string) => {
    setStagedPostExtras(prev => prev.filter(e => e.id !== extId));
  };

  const stagedLineTotal = (ext: any) => {
    if (ext.isPerNight && Array.isArray(ext.dailySchedule) && ext.dailySchedule.length > 0) {
      return ext.dailySchedule.reduce((sum: number, day: any) => {
        if (!day.enabled) return sum;
        return sum + Number(ext.price || 0) * (Number(day.qty) || 1);
      }, 0);
    }
    return Number(ext.price || 0) * (Number(ext.qty) || 1);
  };

  const totalStagedPostExtrasAmount = stagedPostExtras.reduce((sum, ext) => sum + stagedLineTotal(ext), 0);

  const handleCommitStagedPostExtras = async () => {
    if (stagedPostExtras.length === 0) return;
    if (!activeShift) {
      alert('กรุณาเปิดกะก่อนทำรายการ');
      return;
    }

    setLoading(true);
    try {
      const ledgerInserts: any[] = [];
      const dailyExtraInserts: any[] = [];
      const summaryParts: string[] = [];

      for (const ext of stagedPostExtras) {
        const lineAmt = stagedLineTotal(ext);
        if (lineAmt <= 0) continue;

        if (ext.isPerNight && Array.isArray(ext.dailySchedule)) {
          for (const day of ext.dailySchedule) {
            if (!day.enabled) continue;
            const dQty = Number(day.qty) || 1;
            const dayAmt = Number(ext.price || 0) * dQty;
            if (dayAmt <= 0) continue;

            dailyExtraInserts.push({
              booking_id: bookingId,
              target_date: day.date,
              category: ext.name,
              description: `บริการเสริมรายวัน (${day.date})${dQty > 1 ? ` x${dQty}` : ''} [POST_CHECKIN]`,
              amount: dayAmt
            });

            if (day.date <= todayStr) {
              ledgerInserts.push({
                shift_id: activeShift.id === 'dummy-shift-id' ? null : activeShift.id,
                staff_name: effectiveStaffName,
                room_id: roomId,
                booking_id: bookingId,
                transaction_type: 'revenue',
                category: ext.name,
                notes: `ประจำวันที่ ${day.date}${dQty > 1 ? ` (x${dQty})` : ''} [POST_CHECKIN]`,
                amount: dayAmt
              });
            }
          }
          summaryParts.push(`${ext.name} (ระบุวัน รวม ฿${lineAmt.toLocaleString()})`);
        } else {
          const q = Number(ext.qty) || 1;
          const totalAmt = Number(ext.price || 0) * q;
          ledgerInserts.push({
            shift_id: activeShift.id === 'dummy-shift-id' ? null : activeShift.id,
            staff_name: effectiveStaffName,
            room_id: roomId,
            booking_id: bookingId,
            transaction_type: 'revenue',
            category: ext.name,
            notes: `${q > 1 ? `จำนวน x${q} ` : ''}[POST_CHECKIN]`,
            amount: totalAmt
          });
          summaryParts.push(`${ext.name}${q > 1 ? ` x${q}` : ''} (฿${totalAmt.toLocaleString()})`);
        }
      }

      if (dailyExtraInserts.length > 0) {
        await supabase.from('booking_daily_extras').insert(dailyExtraInserts);
      }
      if (ledgerInserts.length > 0) {
        await supabase.from('ledger_transactions').insert(ledgerInserts);
      }

      if (summaryParts.length > 0) {
        await logActivity({
          category: 'billing',
          action: 'create',
          staffName: effectiveStaffName,
          shiftName: activeShift?.staff_name || null,
          roomNo,
          target: `ห้อง ${roomNo} • เพิ่มรายการหลังเช็คอิน`,
          details: `เพิ่มรายการหลังเช็คอิน ห้อง ${roomNo}: ${summaryParts.join(', ')}`
        });
      }

      setStagedPostExtras([]);
      await fetchData();
    } finally {
      setLoading(false);
    }
  };

  // รายการค่าใช้จ่ายที่ถูกเพิ่มเข้ามาเฉพาะ "ระหว่างเช็คอินแล้ว (หลังเช็คอิน)" เท่านั้น (ไม่รวมรายการที่เพิ่มตั้งแต่ก่อนเช็คอิน)
  const postCheckinOnlyHistory = React.useMemo(() => {
    const checkInMs = bookingCheckInTime ? new Date(bookingCheckInTime).getTime() : 0;
    const list: { id: string; title: string; note: string; amount: number; isFuture: boolean }[] = [];

    transactions.forEach(tx => {
      if (tx.transaction_type !== 'revenue' || Number(tx.amount) <= 0) return;
      if (tx.category.includes('Voided') || tx.category === 'room_charge' || tx.category.includes('ค่าห้องพัก') || tx.category.includes('มัดจำกุญแจ')) return;
      const rawNote = String(tx.notes || '');
      const hasPostTag = rawNote.includes('[POST_CHECKIN]');
      const txMs = new Date(tx.created_at).getTime();
      const isCreatedAfterCheckin = checkInMs > 0 && txMs > checkInMs + 60 * 1000 && !rawNote.includes('ประจำวันที่ ');
      if (!hasPostTag && !isCreatedAfterCheckin) return;

      list.push({
        id: `tx_${tx.id}`,
        title: tx.category,
        note: rawNote.replace('[POST_CHECKIN]', '').trim() || new Date(tx.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        amount: Number(tx.amount),
        isFuture: false
      });
    });

    activeFutureExtraRows.forEach((ext: any) => {
      const rawDesc = String(ext.description || '');
      if (!rawDesc.includes('[POST_CHECKIN]')) return;
      list.push({
        id: `ext_${ext.id}`,
        title: String(ext.category || '').replace(' (Voided)', '').trim(),
        note: rawDesc.replace('[POST_CHECKIN]', '').trim(),
        amount: Number(ext.amount || 0),
        isFuture: true
      });
    });

    return list;
  }, [transactions, activeFutureExtraRows, bookingCheckInTime]);


  const handleSaveDeposit = async () => {
    if (!activeShift) { alert('กรุณาเปิดกะก่อนทำรายการ'); return; }
    const oldDepAmt = activeDepositTx ? Number(activeDepositTx.amount) : 0;
    const newDepAmt = depositChecked ? (Number(depositInput) || 0) : 0;
    if (oldDepAmt === newDepAmt) return;

    setLoading(true);
    const editor = effectiveStaffName;
    const nowIso = getNow().toISOString();

    if (newDepAmt > 0) {
      if (activeDepositTx) {
        const { error } = await supabase.from('ledger_transactions').update({
          amount: newDepAmt,
          notes: `แก้มัดจำจาก ฿${oldDepAmt.toLocaleString()} โดย ${editor}`
        }).eq('id', activeDepositTx.id);
        if (error) { alert('แก้ไขมัดจำไม่สำเร็จ: ' + error.message); setLoading(false); return; }
      } else {
        const { error } = await supabase.from('ledger_transactions').insert({
          shift_id: activeShift.id === 'dummy-shift-id' ? null : activeShift.id,
          staff_name: editor,
          room_id: roomId,
          booking_id: bookingId,
          transaction_type: 'deposit',
          category: 'ค่ามัดจำกุญแจ',
          amount: newDepAmt
        });
        if (error) { alert('บันทึกมัดจำกุญแจไม่สำเร็จ: ' + error.message); setLoading(false); return; }
      }
    } else if (activeDepositTx) {
      const { error } = await supabase.from('ledger_transactions').update({
        category: 'ค่ามัดจำกุญแจ (Voided)',
        notes: `ยกเลิกมัดจำโดย ${editor}`
      }).eq('id', activeDepositTx.id);
      if (error) { alert('ยกเลิกมัดจำไม่สำเร็จ: ' + error.message); setLoading(false); return; }
    }

    await supabase.from('rooms').update({ key_deposit: newDepAmt }).eq('id', roomId);

    const nextHistory: Record<string, FieldEditEntry[]> = { ...(bookingMeta.history || {}) };
    nextHistory.key_deposit = [
      ...(nextHistory.key_deposit || []),
      {
        oldValue: oldDepAmt > 0 ? `฿${oldDepAmt.toLocaleString()}` : 'ไม่เก็บมัดจำ (฿0)',
        newValue: newDepAmt > 0 ? `฿${newDepAmt.toLocaleString()}` : 'ไม่เก็บมัดจำ (฿0)',
        by: editor,
        at: nowIso
      }
    ];
    const updatedMeta: BookingMeta = { ...bookingMeta, history: nextHistory };
    await supabase.from('system_settings').upsert({ key: `booking_meta_${bookingId}`, value: updatedMeta }, { onConflict: 'key' });
    setBookingMeta(updatedMeta);

    await logActivity({
      category: 'billing',
      action: 'update',
      staffName: editor,
      shiftName: activeShift?.staff_name || null,
      roomNo,
      target: `ห้อง ${roomNo} • มัดจำกุญแจ`,
      details: `แก้ไขค่ามัดจำกุญแจห้อง ${roomNo} จาก ฿${oldDepAmt.toLocaleString()} -> ฿${newDepAmt.toLocaleString()}`
    });

    await fetchData();
    setLoading(false);
  };

  const handleVerifyRoomPin = async () => {
    if (!roomPin) return;
    setLoading(true);
    setRoomPinError('');
    const { data: staffData, error } = await supabase.from('staff').select('role, name').eq('pin', roomPin).maybeSingle();
    setLoading(false);
    if (error || !staffData || (staffData.role !== 'admin' && staffData.role !== 'manager')) {
      setRoomPinError('รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็น Admin/Manager)');
      return;
    }
    setShowRoomPinPrompt(false);
    setRoomPin('');
    setRoomPriceUnlocked(true);
    setRoomPriceManagerName(staffData.name || staffData.role);
  };

  const handleSaveRoomCharge = async (tx: Transaction) => {
    const newAmt = Number(editingRoomTxAmounts[tx.id]);
    if (isNaN(newAmt) || newAmt < 0) return;
    const oldAmt = Number(tx.amount);
    if (newAmt === oldAmt) return;

    setLoading(true);
    const editor = roomPriceManagerName || activeShift?.staff_name || 'Admin';
    const nowIso = getNow().toISOString();

    await supabase.from('ledger_transactions').update({
      amount: newAmt,
      notes: `แก้ไขราคาโดย ${editor} (เดิม ฿${oldAmt.toLocaleString()})`
    }).eq('id', tx.id);

    const diffAmt = newAmt - oldAmt;
    const { data: bRow } = await supabase.from('bookings').select('actual_price').eq('id', bookingId).maybeSingle();
    const oldTotalActual = bRow?.actual_price != null ? Number(bRow.actual_price) : oldAmt;
    const newTotalActual = Math.max(0, oldTotalActual + diffAmt);

    await supabase.from('bookings').update({ actual_price: newTotalActual }).eq('id', bookingId);
    await supabase.from('rooms').update({ actual_price: newTotalActual }).eq('id', roomId);

    if (dailyRates.length > 0) {
      const sortedRates = [...dailyRates].sort((a, b) => a.target_date.localeCompare(b.target_date));
      const roomChargeTxs = transactions
        .filter(t => !t.category.includes('Voided') && (t.category === 'room_charge' || t.category === 'ค่าห้องพัก'))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const txIdx = Math.max(0, roomChargeTxs.findIndex(t => t.id === tx.id));
      const targetRate = sortedRates[txIdx] || sortedRates[0];
      if (targetRate) {
        await supabase.from('booking_daily_rates').update({
          amount: newAmt,
          is_manual_override: true
        }).eq('id', targetRate.id);
      }
    }

    const nextHistory: Record<string, FieldEditEntry[]> = { ...(bookingMeta.history || {}) };
    const pushHist = (key: string, oldVal: string, newVal: string) => {
      if (oldVal === newVal) return;
      nextHistory[key] = [...(nextHistory[key] || []), { oldValue: oldVal, newValue: newVal, by: editor, at: nowIso }];
    };
    pushHist(`tx_${tx.id}`, `฿${oldAmt.toLocaleString()}`, `฿${newAmt.toLocaleString()}`);
    pushHist('actual_price', `฿${oldTotalActual.toLocaleString()}`, `฿${newTotalActual.toLocaleString()}`);

    const updatedMeta: BookingMeta = { ...bookingMeta, history: nextHistory };
    await supabase.from('system_settings').upsert({ key: `booking_meta_${bookingId}`, value: updatedMeta }, { onConflict: 'key' });
    setBookingMeta(updatedMeta);
    setRoomPriceUnlocked(false);
    await logActivity({
      category: 'billing',
      action: 'update',
      staffName: editor,
      shiftName: activeShift?.staff_name || null,
      roomNo,
      target: `ห้อง ${roomNo} • ราคาค่าห้อง`,
      details: `แก้ไขราคาค่าห้องในบิลห้อง ${roomNo} จาก ฿${oldAmt.toLocaleString()} -> ฿${newAmt.toLocaleString()}`
    });
    await fetchData();
    setLoading(false);
  };

  const extraAmtToCancel = Number(cancellingExtra?.amount || 0);
  const totalObligationsBeforeCancel = totalPostedCharges + futureRates + futureExtras + dep.held;
  const chargesAfterCancellingExtra = Math.max(0, totalObligationsBeforeCancel - extraAmtToCancel);
  const prepaidRefundableForCancelling = Math.min(extraAmtToCancel, Math.max(0, totalPaid - chargesAfterCancellingExtra));

  const openCancelFutureExtraModal = (extRow: any) => {
    setCancellingExtra(extRow);
    setCancelExtraPin('');
    setCancelExtraError('');
    setCancelExtraRefundMode('refund_now');
  };

  const handleConfirmCancelFutureExtra = async () => {
    if (!cancellingExtra) return;
    if (!cancelExtraPin) {
      setCancelExtraError('กรุณากรอกรหัส PIN ผู้จัดการ/Admin');
      return;
    }
    if (!activeShift) {
      alert('กรุณาเปิดกะก่อนทำรายการ');
      return;
    }
    setLoading(true);
    setCancelExtraError('');
    const { data: staffData, error: staffErr } = await supabase
      .from('staff')
      .select('role, name')
      .eq('pin', cancelExtraPin)
      .maybeSingle();

    if (staffErr || !staffData || (staffData.role !== 'admin' && staffData.role !== 'manager')) {
      setLoading(false);
      setCancelExtraError('รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็น Admin/Manager)');
      return;
    }

    const approverName = staffData.name || staffData.role || 'Admin';
    const baseCat = String(cancellingExtra.category || '').replace(' (Voided)', '').trim();
    const targetDate = String(cancellingExtra.target_date || '');
    const cancelAmt = Number(cancellingExtra.amount || 0);
    const refundAmt = prepaidRefundableForCancelling;
    const isRefundingCashNow = refundAmt > 0 && cancelExtraRefundMode === 'refund_now';

    const statusTag = refundAmt > 0
      ? (isRefundingCashNow ? `คืนเงินสดทันที ฿${refundAmt.toLocaleString()}` : `พักเครดิตไว้หักลบ ฿${refundAmt.toLocaleString()}`)
      : 'ยังไม่ได้รับชำระล่วงหน้า';

    // 1. Mark booking_daily_extras row as (Voided)
    await supabase
      .from('booking_daily_extras')
      .update({
        category: `${baseCat} (Voided)`,
        description: `${cancellingExtra.description || `บริการเสริมรายวัน (${targetDate})`} [ยกเลิกโดย ${approverName} • ${statusTag}]`
      })
      .eq('id', cancellingExtra.id);

    // 2. If this daily extra was already posted to ledger_transactions, void that ledger row too
    const allStayDates = [
      ...dailyRates.map((r: any) => String(r.target_date)),
      ...dailyExtras.map((e: any) => String(e.target_date))
    ].filter(Boolean).sort();
    const firstStayDate = allStayDates[0] || '';

    const matchingPostedTx = transactions.find(t =>
      t.transaction_type === 'revenue' &&
      !String(t.category || '').includes('(Voided)') &&
      String(t.category || '').trim() === baseCat &&
      (
        String(t.notes || '').includes(targetDate) ||
        (targetDate === firstStayDate && !String(t.notes || '').includes('ประจำวันที่ ') && Number(t.amount) === cancelAmt)
      )
    );

    if (matchingPostedTx) {
      await supabase
        .from('ledger_transactions')
        .update({
          category: `${baseCat} (Voided)`,
          notes: `${matchingPostedTx.notes ? matchingPostedTx.notes + ' • ' : ''}ยกเลิกโดย ${approverName} (${statusTag})`
        })
        .eq('id', matchingPostedTx.id);
    }

    // 3. Option A1: If customer prepaid and Admin chose immediate cash refund, record negative deposit ('คืนเงินทอน')
    if (isRefundingCashNow) {
      await supabase.from('ledger_transactions').insert({
        shift_id: activeShift.id === 'dummy-shift-id' ? null : activeShift.id,
        staff_name: effectiveStaffName,
        room_id: roomId,
        booking_id: bookingId,
        transaction_type: 'deposit',
        category: `คืนเงินทอน (ยกเลิก${baseCat} ${targetDate})`,
        amount: -refundAmt,
        notes: `คืนเงินสดทันทีจากการยกเลิก ${baseCat} วันที่ ${targetDate} (อนุมัติโดย ${approverName} / ทำรายการโดย ${effectiveStaffName})`
      });
    }

    // 4. Save audit history in booking_meta
    const nowIso = getNow().toISOString();
    const nextHistory: Record<string, FieldEditEntry[]> = { ...(bookingMeta.history || {}) };
    const histKey = `extra_${targetDate}`;
    nextHistory[histKey] = [
      ...(nextHistory[histKey] || []),
      {
        oldValue: `${baseCat} (${targetDate}) ฿${cancelAmt.toLocaleString()}`,
        newValue: `ยกเลิก ฿0 (${statusTag})`,
        by: approverName,
        at: nowIso
      }
    ];
    const updatedMeta: BookingMeta = { ...bookingMeta, history: nextHistory };
    await supabase.from('system_settings').upsert({ key: `booking_meta_${bookingId}`, value: updatedMeta }, { onConflict: 'key' });
    setBookingMeta(updatedMeta);

    await logActivity({
      category: 'addons',
      action: 'cancel',
      staffName: effectiveStaffName,
      shiftName: activeShift?.staff_name || null,
      roomNo,
      target: `ห้อง ${roomNo} • ${baseCat} (${targetDate})`,
      details: `ยกเลิกบริการเสริมรายวัน "${baseCat}" วันที่ ${targetDate} ยอด ฿${cancelAmt.toLocaleString()} (${statusTag}) อนุมัติโดย ${approverName}`
    });

    setCancellingExtra(null);
    setCancelExtraPin('');
    setCancelExtraError('');
    refreshShift();
    await fetchData();
    setLoading(false);
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
      
      if (data.amount) setPayTransfer(Number(data.amount));
      if (data.date && data.time) {
        setPaymentTime(`${data.date}T${data.time}`);
      }
      alert(`AI ดึงข้อมูลสำเร็จ!\nธนาคาร: ${data.sender_bank || '-'}\nยอดเงิน: ${data.amount || '-'}`);
    } catch (err) {
      alert('AI ไม่สามารถอ่านข้อมูลสลิปนี้ได้ หรือ API Error');
    } finally {
      setIsScanningSlip(false);
    }
  };

  const handlePayment = async () => {
    if (loading) return;
    if (!activeShift) { alert('กรุณาเปิดกะก่อนทำรายการ'); return; }
    
    let cash = Number(payCash) || 0;
    const transfer = Number(payTransfer) || 0;
    const credit = Number(payCredit) || 0;
    const entered = cash + transfer + credit;
    if (entered <= 0) return;

    // เงินทอนทันที: รับเกินยอดที่ต้องชำระ -> ทอนจากเงินสด บันทึกเฉพาะยอดที่รับจริง
    const due = Math.max(0, netRemaining);
    const change = Math.max(0, entered - due);
    if (change > 0) {
      if (cash < change) { alert('ยอดรับเกินยอดที่ต้องชำระ ' + due.toLocaleString() + ' บาท และเงินสดไม่พอสำหรับทอน กรุณาตรวจสอบจำนวนเงิน'); return; }
      cash -= change;
    }
    if (cash + transfer + credit <= 0) { alert('ไม่มียอดค้างชำระ'); return; }
    
    setLoading(true);
    try {
      const inserts = [];
      if (cash > 0) inserts.push({ shift_id: activeShift.id, staff_name: effectiveStaffName, room_id: roomId, booking_id: bookingId, transaction_type: 'payment', category: 'cash', amount: -cash });
      if (transfer > 0) {
        const transferNote = `[BANK:${selectedBank || 'SCB'}]${paymentTime ? ` โอนเวลา: ${paymentTime.replace('T', ' ')}` : ''}`;
        inserts.push({ shift_id: activeShift.id, staff_name: effectiveStaffName, room_id: roomId, booking_id: bookingId, transaction_type: 'payment', category: 'transfer', amount: -transfer, notes: transferNote });
      }
      if (credit > 0) inserts.push({ shift_id: activeShift.id, staff_name: effectiveStaffName, room_id: roomId, booking_id: bookingId, transaction_type: 'payment', category: 'credit_card', amount: -credit });
      
      const { error } = await supabase.from('ledger_transactions').insert(inserts);
      
      if (!error) {
        await logActivity({
          category: 'billing',
          action: 'payment',
          staffName: effectiveStaffName,
          shiftName: activeShift?.staff_name || null,
          roomNo,
          target: `ห้อง ${roomNo}`,
          details: `รับชำระเงินห้อง ${roomNo} รวม ฿${(cash + transfer + credit).toLocaleString()} (${[
            cash > 0 ? `เงินสด ฿${cash.toLocaleString()}` : '',
            transfer > 0 ? `โอน ฿${transfer.toLocaleString()}` : '',
            credit > 0 ? `บัตร ฿${credit.toLocaleString()}` : ''
          ].filter(Boolean).join(', ')})`
        });
        setPayCash('');
        setPayTransfer('');
        setPayCredit('');
        
        const currentBalance = netRemaining - (cash + transfer + credit);
        refreshShift();
        
        if (currentBalance <= 0) {
          onSuccess();
          return;
        } else {
          await fetchData();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h2 className="text-xl font-black text-slate-800">จัดการบิลค่าใช้จ่ายห้อง {roomNo}</h2>
          <button onClick={onClose} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition-colors">
            <span className="font-bold px-2">X</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 flex flex-col md:flex-row gap-6 bg-slate-50/50">
          {/* ซ้าย: รายการบิลปัจจุบัน */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">รายการในบิล (Folio)</h3>
              {roomPriceUnlocked ? (
                <button
                  type="button"
                  onClick={() => setRoomPriceUnlocked(false)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-300"
                >
                  🔓 แก้ค่าห้องโดย {roomPriceManagerName} (คลิกเพื่อล็อก)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setRoomPin(''); setRoomPinError(''); setShowRoomPinPrompt(true); }}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-colors"
                >
                  🔑 ปลดล็อกแก้ค่าห้อง (Admin)
                </button>
              )}
            </div>
            <div className="flex flex-col bg-slate-100 rounded-lg p-3 mb-2 shrink-0 gap-3 border border-slate-200">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600 whitespace-nowrap">เลือกวันที่:</label>
                  <select 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)}
                    className="flex-1 bg-white border border-slate-300 rounded-md py-1.5 px-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="ALL">ทั้งหมด (ALL)</option>
                    {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 pl-1 border-t border-slate-200 pt-2">
                  <input 
                    type="checkbox" 
                    id="showPayments" 
                    checked={showPayments} 
                    onChange={e => setShowPayments(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="showPayments" className="text-xs font-bold text-slate-600 cursor-pointer">แสดงรายการรับชำระเงิน (Payments)</label>
                </div>
              </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col shadow-sm min-h-[300px]">
              <div className="flex-1 overflow-y-auto p-2 space-y-4">
                  {loading && transactions.length === 0 ? (
                    <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>
                  ) : transactions.length === 0 ? (
                    <p className="text-center text-slate-400 py-10">ไม่มีรายการ</p>
                  ) : (
                    (() => {
                      // Group transactions by date
                      const grouped: Record<string, typeof transactions> = {};
                      
                      const txsToUse = selectedDate === 'ALL' ? transactions : transactions.filter(t => new Date(t.created_at).toLocaleDateString('th-TH') === selectedDate);
                      
                      txsToUse.forEach(tx => {
                        if (!showPayments && tx.amount < 0) return;
                        
                        // Use business date (if before 06:45, it belongs to yesterday's business date)
                        const d = new Date(tx.created_at);
                        if (d.getHours() < 6 || (d.getHours() === 6 && d.getMinutes() < 45)) {
                          d.setDate(d.getDate() - 1);
                        }
                        const dateStr = d.toLocaleDateString('th-TH');
                        
                        if (!grouped[dateStr]) grouped[dateStr] = [];
                        grouped[dateStr].push(tx);
                      });

                      let runningBalance = 0;
                      
                      return Object.entries(grouped).map(([dateStr, dailyTxs], idx) => {
                        const dailyCharges = dailyTxs.filter(t => t.amount > 0 && !t.category.includes('Voided')).reduce((sum, t) => sum + Number(t.amount), 0);
                        const dailyPayments = dailyTxs.filter(t => t.amount < 0 && !t.category.includes('Voided')).reduce((sum, t) => sum + Number(t.amount), 0);
                        const prevBalance = runningBalance;
                        runningBalance += dailyCharges + dailyPayments;
                        
                        return (
                          <div key={dateStr} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="bg-slate-100 px-3 py-2 flex justify-between items-center border-b border-slate-200">
                              <span className="font-bold text-slate-700 text-sm">📅 {dateStr}</span>
                              {selectedDate === 'ALL' && idx > 0 && (
                                <span className="text-xs text-slate-500 font-medium">ยกมา: <span className={`font-bold ${prevBalance < 0 ? 'text-emerald-600' : prevBalance > 0 ? 'text-red-500' : ''}`}>{prevBalance.toLocaleString()}</span></span>
                              )}
                            </div>
                            <div className="p-2 space-y-1">
                              {dailyTxs.filter(tx => !tx.category.includes('ค่ามัดจำกุญแจ') && !tx.category.includes('คืนมัดจำกุญแจ')).map(tx => {
                                const isVoid = tx.category.includes('Voided');
                                const isRoomCharge = !isVoid && (tx.category === 'room_charge' || tx.category.includes('ค่าห้องพัก'));
                                return (
                                  <div key={tx.id} className="flex justify-between items-start p-2 hover:bg-slate-50 rounded-lg text-sm border-b border-slate-50 last:border-0 group">
                                    <div className={isVoid ? 'line-through text-slate-400 opacity-60' : ''}>
                                      <p className="font-bold text-slate-700">{tx.category === 'room_charge' ? 'ค่าห้องพัก' : tx.category}</p>
                                      {tx.notes && tx.notes.replace('[POST_CHECKIN]', '').trim() && (
                                        <p className="text-xs text-slate-500 italic mt-0.5">{tx.notes.replace('[POST_CHECKIN]', '').trim()}</p>
                                      )}
                                      <p className="text-[10px] text-slate-400 mt-0.5">{new Date(tx.created_at).toLocaleTimeString('th-TH')} ({tx.staff_name})</p>
                                      {renderFieldHistory(`tx_${tx.id}`)}
                                      {isRoomCharge && !bookingMeta?.history?.[`tx_${tx.id}`] && renderFieldHistory('actual_price')}
                                    </div>
                                    <div className="text-right">
                                      {isRoomCharge && roomPriceUnlocked ? (
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="number"
                                            min={0}
                                            value={editingRoomTxAmounts[tx.id] ?? tx.amount}
                                            onChange={e => setEditingRoomTxAmounts(prev => ({ ...prev, [tx.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                            className="w-24 border border-amber-300 rounded-lg px-2 py-1 text-right font-black text-slate-900 bg-amber-50/40"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleSaveRoomCharge(tx)}
                                            disabled={loading || Number(editingRoomTxAmounts[tx.id]) === Number(tx.amount)}
                                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 text-white text-xs font-bold rounded-lg transition-colors"
                                          >
                                            บันทึก
                                          </button>
                                        </div>
                                      ) : (
                                        <div className={`font-black ${isVoid ? 'line-through text-slate-400 opacity-60' : tx.amount < 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                                          {tx.amount < 0 ? '' : '+'}{Number(tx.amount).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {selectedDate === 'ALL' && (
                              <div className="bg-slate-50 px-3 py-2 flex justify-between items-center border-t border-slate-100">
                                <span className="text-xs font-bold text-slate-500">ยอดคงเหลือยกไป (Balance)</span>
                                <span className={`text-sm font-black ${runningBalance < 0 ? 'text-emerald-600' : runningBalance > 0 ? 'text-red-500' : 'text-slate-700'}`}>
                                  {runningBalance.toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>

              {allDailyExtraRows.length > 0 && (
                <div className="mx-2 mb-2 p-2.5 text-xs border border-indigo-200 bg-indigo-50/70 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="font-black text-indigo-900 flex items-center gap-1.5">
                      <span>⏳</span> รายการบริการเสริมรายวัน / ล่วงหน้า
                    </p>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                      รอตัดบิล ฿{futureExtras.toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {allDailyExtraRows.map((extRow: any) => {
                      const isVoid = String(extRow.category || '').includes('(Voided)');
                      const isFuture = String(extRow.target_date || '') > todayStr;
                      const baseCat = String(extRow.category || '').replace(' (Voided)', '').trim();
                      const formattedDate = extRow.target_date
                        ? new Date(`${extRow.target_date}T00:00:00`).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '-';
                      return (
                        <div
                          key={extRow.id}
                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
                            isVoid
                              ? 'bg-slate-100/80 border-slate-200 text-slate-400'
                              : isFuture
                              ? 'bg-white border-indigo-200 text-slate-800'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold ${isVoid ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                {formattedDate}: {baseCat}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isVoid
                                    ? 'bg-rose-100 text-rose-700'
                                    : isFuture
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isVoid ? 'ยกเลิกแล้ว' : isFuture ? 'รอตัดเข้าบิล' : 'ตัดเข้าบิลแล้ว'}
                              </span>
                            </div>
                            {extRow.description && extRow.description.replace('[POST_CHECKIN]', '').trim() && (
                              <p className="text-[10px] text-slate-500 truncate mt-0.5">{extRow.description.replace('[POST_CHECKIN]', '').trim()}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-black ${isVoid ? 'line-through text-slate-400' : 'text-indigo-900'}`}>
                              ฿{Number(extRow.amount || 0).toLocaleString()}
                            </span>
                            {!isVoid && (
                              <button
                                type="button"
                                onClick={() => openCancelFutureExtraModal(extRow)}
                                className="px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-[11px] transition-colors"
                              >
                                ❌ ยกเลิก
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {dep.target > 0 && (
                <div className="mx-2 mb-2 p-2 text-xs border border-amber-200 bg-amber-50 rounded-lg space-y-0.5">
                  <p className="font-bold text-amber-800">🔑 สรุปเงินมัดจำกุญแจ (ไม่รวมในค่าใช้จ่าย)</p>
                  <div className="flex justify-between text-slate-600"><span>ตกลงเก็บ</span><span>฿{dep.target.toLocaleString()}</span></div>
                  <div className="flex justify-between text-slate-600"><span>เก็บได้จริง (หลังชำระค่าใช้จ่ายครบ)</span><span>฿{dep.held.toLocaleString()}</span></div>
                  {depositRefundedTotal > 0 && <div className="flex justify-between text-slate-600"><span>คืนลูกค้าแล้ว</span><span>-฿{depositRefundedTotal.toLocaleString()}</span></div>}
                  <div className="flex justify-between font-bold text-amber-700 pt-0.5 border-t border-amber-200"><span>คงเหลือ</span><span>฿{Math.max(0, dep.held - depositRefundedTotal).toLocaleString()}</span></div>
                  {renderFieldHistory('key_deposit')}
                </div>
              )}
              {true && (
                <div className="p-2 border-t border-slate-100 bg-slate-50">
                  <button 
                    type="button"
                    onClick={() => setShowReceiptModal(true)}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs"
                  >
                    <span>🖨️</span> พิมพ์ใบเสร็จ / เลือกวันที่ & ซ่อนรายการ (Folio Receipt)
                  </button>
                </div>
              )}
              
              <div className="bg-slate-100 p-4 border-t border-slate-200 flex justify-between items-center shrink-0">
                <span className="font-bold text-slate-600">ยอดค้างชำระ (Folio Balance):</span>
                <span className={"text-2xl font-black " + (dep.unpaid > 0 ? "text-rose-600" : "text-emerald-600")}>
                  ฿{dep.unpaid.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* ขวา: สรุปยอด, เครื่องมือ POS และชำระเงิน */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            
            {/* 1. Grand Total Dashboard (ยุบไว้เป็นค่าเริ่มต้น) */}
            <button
              type="button"
              onClick={() => setShowProjected(!showProjected)}
              className="w-full flex justify-between items-center bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors"
            >
              <span>📊 สรุปยอดตลอดการเข้าพัก {showProjected ? '' : '(คลิกดูรายละเอียด)'}</span>
              <span>{showProjected ? '▲' : '▼'}</span>
            </button>
            {showProjected && (
            <div className="bg-slate-800 text-white p-5 rounded-xl shadow-md border-t-4 border-emerald-400 -mt-2">
              <h3 className="text-xs font-bold text-slate-300 mb-4 uppercase tracking-wider flex justify-between items-center">
                <span>สรุปยอดตลอดการเข้าพัก (Projected Total)</span>
                <span className="bg-slate-700 px-2 py-1 rounded text-[10px]">รวมอนาคต</span>
              </h3>
              
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between items-center text-slate-300">
                  <span>ค่าห้องและ POS ที่เกิดขึ้นแล้ว</span>
                  <span>{totalPostedCharges.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>ค่าห้องพัก (อนาคต)</span>
                  <span>{futureRates.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>รายการเพิ่มเติมรายวัน (อนาคต)</span>
                  <span>{futureExtras.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-700 font-bold">
                  <span>รวมค่าใช้จ่ายทั้งสิ้น</span>
                  <span className="text-white">{(totalExpectedCharges - (includeKeyDeposit ? totalKeyDeposit : 0)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-400 font-bold">
                  <span>ยอดชำระแล้ว (เงินสด/โอน/บัตร)</span>
                  <span>-{(totalPaid - depositAppliedTotal).toLocaleString()}</span>
                </div>
                <div className={`flex justify-between items-center pt-2 border-t border-slate-700 font-bold ${dashSurplus < 0 ? 'text-rose-400' : dashSurplus > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                  <span>ส่วนต่าง</span>
                  <span>{dashSurplus < 0 ? `${Math.abs(dashSurplus).toLocaleString()} (ค้างชำระ)` : `-${dashSurplus.toLocaleString()}`}</span>
                </div>
                {dashNote && (
                  <div className={`text-[11px] font-bold px-2 py-1.5 rounded ${dashNote.ok ? 'bg-emerald-900/50 text-emerald-300' : 'bg-rose-900/50 text-rose-300'}`}>
                    {dashNote.text}
                  </div>
                )}
              </div>
              
              <div className="bg-slate-900 rounded-lg p-3 flex justify-between items-center">
                <span className="font-bold text-slate-300 text-sm">ยอดคงเหลือที่ต้องชำระสุทธิ</span>
                <span className={`text-2xl font-black ${netRemaining > 0 ? 'text-rose-400' : netRemaining < 0 ? 'text-purple-400' : 'text-emerald-400'}`}>
                  ฿{netRemaining.toLocaleString()}
                </span>
              </div>
            </div>
            )}

            {/* 1.5 Key Deposit (ทั้งพนักงานทั่วไปและ Admin/Manager แก้ไขได้หลังเช็คอิน) */}
            <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-xl shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={depositChecked}
                    onChange={e => setDepositChecked(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm font-bold text-amber-900">🔑 รับมัดจำกุญแจ</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">฿</span>
                  <input
                    type="number"
                    min={0}
                    value={depositChecked ? depositInput : 0}
                    onChange={e => setDepositInput(e.target.value === '' ? '' : Number(e.target.value))}
                    disabled={!depositChecked}
                    className="w-24 border-2 border-amber-200 rounded-lg px-2 py-1 text-right font-black text-slate-900 focus:border-amber-500 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  {((depositChecked ? (Number(depositInput) || 0) : 0) !== (activeDepositTx ? Number(activeDepositTx.amount) : 0)) && (
                    <button
                      type="button"
                      onClick={handleSaveDeposit}
                      disabled={loading || (depositChecked && (!depositInput || Number(depositInput) <= 0))}
                      className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-xs transition-colors"
                    >
                      บันทึกมัดจำ
                    </button>
                  )}
                </div>
              </div>

              {renderFieldHistory('key_deposit')}

              {dep.target > 0 && (
                <div className="space-y-1 text-sm pt-2 border-t border-amber-200/80">
                  <div className="flex justify-between text-slate-600 text-xs"><span>ตกลงเก็บ</span><span>฿{dep.target.toLocaleString()}</span></div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-700 text-xs">เก็บได้จริง (ถืออยู่)</span>
                    <span className="text-lg font-black text-amber-700">฿{dep.held.toLocaleString()}</span>
                  </div>
                  {dep.unpaid > 0 && <p className="text-[11px] font-bold text-rose-600">ค่าใช้จ่ายค้าง ฿{dep.unpaid.toLocaleString()} ต้องชำระครบก่อน จึงจะนับเงินที่เหลือเป็นมัดจำ</p>}
                  {dep.unpaid === 0 && dep.shortfall > 0 && <p className="text-[11px] font-bold text-rose-600">เก็บมัดจำไม่ครบ ขาดอีก ฿{dep.shortfall.toLocaleString()}</p>}
                  {dep.excess > 0 && <p className="text-[11px] font-bold text-sky-700">มีเงินเกินยอดที่ตกลง ฿{dep.excess.toLocaleString()} = เงินทอนที่ต้องคืน</p>}
                </div>
              )}
            </div>

            {showRoomPinPrompt && (
              <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[70] backdrop-blur-sm p-4" onClick={() => setShowRoomPinPrompt(false)}>
                <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="bg-slate-800 p-4 text-white">
                    <h3 className="font-bold text-lg">ปลดล็อกแก้ไขค่าห้องพัก (Admin/Manager)</h3>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ/Admin (กรอกทุกครั้ง)</label>
                      <input
                        type="password"
                        value={roomPin}
                        onChange={e => setRoomPin(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-3 text-center text-xl font-mono tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="****"
                        autoFocus
                        maxLength={6}
                      />
                    </div>
                    {roomPinError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 font-medium">{roomPinError}</div>}
                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={() => { setShowRoomPinPrompt(false); setRoomPinError(''); setRoomPin(''); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-colors">ยกเลิก</button>
                      <button type="button" onClick={handleVerifyRoomPin} disabled={loading || !roomPin} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-xl transition-colors">ยืนยัน</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {cancellingExtra && (
              <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[75] backdrop-blur-sm p-4" onClick={() => setCancellingExtra(null)}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="bg-rose-600 p-4 text-white">
                    <h3 className="font-black text-base flex items-center gap-2">
                      <span>❌</span> ยกเลิกรายการบริการเสริมรายวัน (Admin/Manager)
                    </h3>
                    <p className="text-xs text-rose-100 mt-0.5">
                      {String(cancellingExtra.category || '').replace(' (Voided)', '').trim()} • วันที่{' '}
                      {cancellingExtra.target_date
                        ? new Date(`${cancellingExtra.target_date}T00:00:00`).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '-'}{' '}
                      (฿{Number(cancellingExtra.amount || 0).toLocaleString()})
                    </p>
                  </div>

                  <div className="p-4 space-y-4">
                    {prepaidRefundableForCancelling > 0 ? (
                      <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-xs font-black text-amber-900">
                          💡 ลูกค้าได้ชำระเงินล่วงหน้าครอบคลุมรายการนี้ไว้แล้ว ฿{prepaidRefundableForCancelling.toLocaleString()}
                        </p>
                        <p className="text-[11px] font-bold text-amber-800">กรุณาเลือกวิธีจัดการยอดเงิน ฿{prepaidRefundableForCancelling.toLocaleString()}:</p>
                        <label
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            cancelExtraRefundMode === 'refund_now'
                              ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20'
                              : 'bg-white/70 border-amber-200 hover:bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="cancelExtraRefundMode"
                            checked={cancelExtraRefundMode === 'refund_now'}
                            onChange={() => setCancelExtraRefundMode('refund_now')}
                            className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="text-xs">
                            <p className="font-black text-slate-800">💵 คืนเงินสดให้ลูกค้าวันนี้ทันที (฿{prepaidRefundableForCancelling.toLocaleString()})</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              ระบบจะลงบันทึกจ่ายเงินสดคืนลูกค้า (-฿{prepaidRefundableForCancelling.toLocaleString()}) เพื่อตัดยอดเงินสดในลิ้นชักกะปัจจุบันให้ตรงกับเงินจริง
                            </p>
                          </div>
                        </label>

                        <label
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            cancelExtraRefundMode === 'keep_credit'
                              ? 'bg-white border-blue-500 ring-2 ring-blue-500/20'
                              : 'bg-white/70 border-amber-200 hover:bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="cancelExtraRefundMode"
                            checked={cancelExtraRefundMode === 'keep_credit'}
                            onChange={() => setCancelExtraRefundMode('keep_credit')}
                            className="mt-0.5 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="text-xs">
                            <p className="font-black text-slate-800">🏦 พักยอดเครดิตไว้หักลบค่าใช้จ่ายอื่น / คืนตอนเช็คเอาท์</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              ยังไม่หยิบเงินสดออกจากลิ้นชักตอนนี้ (เก็บเครดิต ฿{prepaidRefundableForCancelling.toLocaleString()} ไว้หักลบ POS หรือคืนพร้อมมัดจำตอนเช็คเอาท์)
                            </p>
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-medium">
                        รายการนี้ยังไม่ได้รับชำระเงินล่วงหน้า เมื่อยกเลิกแล้วระบบจะตัดยอดที่ต้องชำระลดลง ฿{Number(cancellingExtra.amount || 0).toLocaleString()} ทันที
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ/Admin (กรอกทุกครั้งเพื่อยืนยัน)</label>
                      <input
                        type="password"
                        value={cancelExtraPin}
                        onChange={e => setCancelExtraPin(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-3 text-center text-xl font-mono tracking-widest focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                        placeholder="****"
                        autoFocus
                        maxLength={6}
                      />
                    </div>

                    {cancelExtraError && (
                      <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 font-bold">
                        {cancelExtraError}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => { setCancellingExtra(null); setCancelExtraPin(''); setCancelExtraError(''); }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-colors text-sm"
                      >
                        ปิด
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmCancelFutureExtra}
                        disabled={loading || !cancelExtraPin}
                        className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-black py-3 px-4 rounded-xl transition-colors text-sm shadow-sm"
                      >
                        {loading ? 'กำลังบันทึก...' : 'ยืนยันยกเลิกรายการ'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. เพิ่มรายการ / บริการเสริม / POS (หลังเช็คอิน - รูปแบบเดียวกับก่อนเช็คอินเป๊ะๆ) */}
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <span>➕</span> เพิ่มรายการ / บริการเสริม / POS (หลังเช็คอิน)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    เลือกรายการแบบครั้งเดียว หรือระบุวันรายคืนได้เหมือนก่อนเช็คอิน (แสดงเฉพาะรายการที่เพิ่มระหว่างเข้าพัก)
                  </p>
                </div>
              </div>

              {/* แถวปุ่มลัด + ปุ่ม "+ รายการอื่นๆ / จัดการ" + ปุ่ม "+ พิมพ์รายการเอง" */}
              <div className="flex flex-wrap gap-1.5">
                {extraSettings.filter(e => e.ui_type === 'quick_button').map(ext => (
                  <button
                    key={ext.id}
                    type="button"
                    onClick={() => handleSelectPostExtra(ext)}
                    className="bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs active:scale-95"
                  >
                    <span>+ {ext.name}</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      ({ext.charge_type === 'per_night' ? '📅' : '1️⃣'} ฿{Number(ext.price).toLocaleString()})
                    </span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setShowOtherExtrasMenu(prev => !prev)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1 ${
                    showOtherExtrasMenu
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>+ รายการอื่นๆ / จัดการ</span>
                  <span className="text-[10px]">{showOtherExtrasMenu ? '▴' : '▾'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCustomExtraForm(prev => !prev)}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors"
                >
                  {showCustomExtraForm ? '✕ ปิดฟอร์ม' : '+ พิมพ์รายการเอง'}
                </button>
              </div>

              {/* แผง "+ รายการอื่นๆ / จัดการ" (ซิงค์ชุดเดียวกับหน้าก่อนเช็คอิน) */}
              {showOtherExtrasMenu && (
                <div className="p-3 bg-white border-2 border-indigo-200 rounded-xl shadow-md space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      📂 รายการอื่นๆ & ตั้งค่าบริการเสริม / POS
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

                  {/* รายการในตัวเลือกย่อย */}
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
                              onClick={() => handleSelectPostExtra(item)}
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
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors"
                              >
                                ⚡ ขึ้นปุ่มลัด
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

                  {/* ส่วนจัดการปุ่มลัดด้านบน */}
                  {showManageQuickButtonsInMenu && (
                    <div className="pt-2 border-t border-slate-200 space-y-1.5">
                      <div className="text-[11px] font-bold text-amber-800">
                        ⚡ รายการที่เป็นปุ่มลัดด้านบน (คลิกเพื่อแก้ไข หรือย้ายเข้าตัวเลือก)
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
                                onClick={() => handleSelectPostExtra(item)}
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

                  {/* ฟอร์มเพิ่มรายการใหม่ถาวร */}
                  <div className="pt-2 border-t border-slate-100">
                    {!showAddNewExtraSettingForm ? (
                      <button
                        type="button"
                        onClick={() => setShowAddNewExtraSettingForm(true)}
                        className="w-full py-1.5 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 font-bold text-xs transition-colors"
                      >
                        + เพิ่มรายการบริการเสริม / POS ใหม่ (บันทึกไว้ใช้ตลอด)
                      </button>
                    ) : (
                      <div className="p-2 bg-indigo-50/60 border border-indigo-200 rounded-lg space-y-2">
                        <div className="text-[11px] font-bold text-indigo-900">✨ เพิ่มรายการใหม่ (ซิงค์ทั้งก่อนเช็คอิน & หลังเช็คอิน)</div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="ชื่อรายการ (เช่น น้ำดื่ม, เตียงเสริม, มอเตอร์ไซค์)"
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
                          <div className="flex flex-wrap items-center gap-1.5">
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

              {/* ฟอร์มพิมพ์รายการเองเฉพาะกิจ */}
              {showCustomExtraForm && (
                <div className="p-2.5 bg-indigo-50/60 border border-indigo-200 rounded-xl flex flex-wrap items-center gap-1.5 text-xs">
                  <input
                    type="text"
                    placeholder="ชื่อรายการเฉพาะบิลนี้..."
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
                    onClick={handleAddCustomPostExtraInline}
                    disabled={!customExtraName.trim() || !customExtraPrice || Number(customExtraPrice) <= 0}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    เลือก
                  </button>
                </div>
              )}

              {/* รายการที่กำลังเลือกเพิ่มในรอบนี้ (สลับ 1️⃣ ครั้งเดียว <-> 📅 ระบุวัน และปรับจำนวน [-] 1 [+] ได้เหมือนก่อนเช็คอินเป๊ะๆ) */}
              {stagedPostExtras.length > 0 && (
                <div className="space-y-2 bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-200 text-xs">
                  <div className="font-bold text-indigo-950 flex items-center justify-between">
                    <span>🛒 รายการที่กำลังจะเพิ่มเข้าบิล ({stagedPostExtras.length} รายการ)</span>
                    <span className="text-indigo-700 font-black">รวม +฿{totalStagedPostExtrasAmount.toLocaleString()}</span>
                  </div>
                  {stagedPostExtras.map(ext => {
                    const showDaySchedule = Boolean(ext.isPerNight && Array.isArray(ext.dailySchedule) && ext.dailySchedule.length >= 1);
                    const activeDaysCount = showDaySchedule
                      ? ext.dailySchedule.filter((d: any) => d.enabled).length
                      : 1;
                    return (
                      <div key={ext.id} className="bg-white p-2.5 rounded-lg border border-indigo-100 space-y-1.5 shadow-2xs">
                        <div className="flex flex-wrap justify-between items-center gap-1.5">
                          <div className="flex flex-col">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-slate-800">{ext.name}</span>
                              <span className="text-[11px] font-semibold text-indigo-600">
                                (฿{Number(ext.price).toLocaleString()}{ext.isPerNight ? '/คืน' : '/หน่วย'})
                              </span>
                              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[10px] font-bold">
                                <button
                                  type="button"
                                  onClick={() => handleToggleStagedChargeMode(ext.id, false)}
                                  className={`px-1.5 py-0.5 rounded-md transition-colors ${
                                    !ext.isPerNight
                                      ? 'bg-white text-indigo-700 shadow-xs font-extrabold'
                                      : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  1️⃣ ครั้งเดียว
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleStagedChargeMode(ext.id, true)}
                                  className={`px-1.5 py-0.5 rounded-md transition-colors ${
                                    ext.isPerNight
                                      ? 'bg-indigo-600 text-white shadow-xs font-extrabold'
                                      : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  📅 ระบุวัน
                                </button>
                              </div>
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
                                  disabled={(Number(ext.qty) || 1) <= 1}
                                  onClick={() => handleChangeStagedQty(ext.id, -1)}
                                  className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-indigo-700 font-bold disabled:opacity-30"
                                >
                                  -
                                </button>
                                <span className="w-4 text-center font-bold text-slate-800">{ext.qty || 1}</span>
                                <button
                                  type="button"
                                  onClick={() => handleChangeStagedQty(ext.id, 1)}
                                  className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-indigo-700 font-bold"
                                >
                                  +
                                </button>
                              </div>
                            )}
                            <span className="font-black text-indigo-900">฿{stagedLineTotal(ext).toLocaleString()}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveStagedExtra(ext.id)}
                              className="text-rose-500 font-bold ml-1 hover:text-rose-700"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {showDaySchedule && (
                          <div className="pt-1.5 border-t border-slate-100 space-y-1">
                            {ext.dailySchedule.map((day: any, dIdx: number) => {
                              const dObj = new Date(`${day.date}T00:00:00`);
                              const dateLabel = dObj.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
                              const dayTotal = day.enabled ? Number(ext.price) * (Number(day.qty) || 1) : 0;
                              const isFutureDay = day.date > todayStr;
                              return (
                                <div
                                  key={day.date}
                                  className={`flex items-center justify-between px-2 py-1 rounded-md text-[11px] ${
                                    day.enabled ? 'bg-indigo-50/40 text-slate-700' : 'bg-slate-50 text-slate-400'
                                  }`}
                                >
                                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(day.enabled)}
                                      onChange={() => handleToggleStagedDay(ext.id, day.date)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="font-semibold">
                                      คืนที่ {dIdx + 1} ({dateLabel})
                                    </span>
                                    {isFutureDay && day.enabled && (
                                      <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                                        รอตัดบิลวันจริง
                                      </span>
                                    )}
                                  </label>
                                  <div className="flex items-center gap-2">
                                    {day.enabled && (
                                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded px-1 py-0.5">
                                        <button
                                          type="button"
                                          disabled={(Number(day.qty) || 1) <= 1}
                                          onClick={() => handleChangeStagedDayQty(ext.id, day.date, -1)}
                                          className="w-3.5 h-3.5 flex items-center justify-center text-slate-600 hover:text-indigo-700 font-bold disabled:opacity-30"
                                        >
                                          -
                                        </button>
                                        <span className="w-3.5 text-center font-bold text-slate-800">{day.qty || 1}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleChangeStagedDayQty(ext.id, day.date, 1)}
                                          className="w-3.5 h-3.5 flex items-center justify-center text-slate-600 hover:text-indigo-700 font-bold"
                                        >
                                          +
                                        </button>
                                      </div>
                                    )}
                                    <span className={`w-14 text-right font-bold ${day.enabled ? 'text-slate-800' : 'text-slate-400'}`}>
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

                  <button
                    type="button"
                    onClick={handleCommitStagedPostExtras}
                    disabled={loading || totalStagedPostExtrasAmount <= 0}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>➕</span> ยืนยันเพิ่มรายการลงบิล (+฿{totalStagedPostExtrasAmount.toLocaleString()})
                  </button>
                </div>
              )}

              {/* แสดงเฉพาะรายการค่าใช้จ่ายที่เพิ่มเข้ามาในระหว่างเช็คอินแล้วเท่านั้น (ไม่เอารายการที่เพิ่มตั้งแต่ก่อนเช็คอินมาแสดงซ้ำ) */}
              {postCheckinOnlyHistory.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span>📌 รายการที่เพิ่มระหว่างเข้าพัก (หลังเช็คอินแล้วเท่านั้น)</span>
                    <span>
                      รวม ฿{postCheckinOnlyHistory.reduce((s, x) => s + x.amount, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                    {postCheckinOnlyHistory.map(item => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-slate-700">{item.title}</span>
                          {item.note && (
                            <span className="text-[10px] text-slate-400 ml-1.5">({item.note})</span>
                          )}
                          {item.isFuture && (
                            <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              รอตัดบิลวันจริง
                            </span>
                          )}
                        </div>
                        <span className="font-black text-slate-800 shrink-0">
                          +฿{item.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

                        {/* 3. Split Payment */}
            <div className="bg-white border-2 border-slate-200 p-5 rounded-2xl shadow-sm">
              <h3 className="text-sm font-black text-slate-700 mb-4 flex justify-between items-center">
                <span className="flex items-center gap-2"><span className="text-lg">💳</span> รับชำระเงิน</span>
                <span className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-1 rounded">จ่ายแยกช่องทางได้</span>
              </h3>
              
              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div className="w-24 text-xs font-bold text-slate-600 flex items-center gap-1">💵 เงินสด:</div>
                  <input 
                    type="number" 
                    value={payCash} 
                    onChange={e => setPayCash(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-0 bg-transparent p-2 text-right text-base font-black text-emerald-700 focus:ring-0 outline-none" 
                    placeholder="0.00"
                  />
                  <span className="text-slate-400 font-bold pr-2">฿</span>
                </div>
                
                <div className="flex flex-col gap-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-24 text-xs font-bold text-slate-600 flex items-center gap-1">📱 โอนเงิน:</div>
                    <input 
                      type="number" 
                      value={payTransfer} 
                      onChange={e => setPayTransfer(e.target.value === '' ? '' : Number(e.target.value))}
                      className="flex-1 border-0 bg-transparent p-2 text-right text-base font-black text-emerald-700 focus:ring-0 outline-none" 
                      placeholder="0.00"
                    />
                    <span className="text-slate-400 font-bold pr-2">฿</span>
                  </div>
                  {(Number(payTransfer) > 0 || isScanningSlip) && (
                    <div className="flex flex-col gap-2 pl-2 pr-2 pt-2 border-t border-slate-200 mt-1">
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
                      <div className="flex items-center gap-2">
                        <input 
                          type="datetime-local" 
                          value={paymentTime} 
                          onChange={e => setPaymentTime(e.target.value)} 
                          className="flex-1 border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-blue-500 bg-white" 
                        />
                        <label className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border border-blue-200">
                          {isScanningSlip ? '⏳ สแกน...' : '📷 สแกนสลิป'}
                          <input type="file" accept="image/*" className="hidden" onChange={handleScanSlip} disabled={isScanningSlip} />
                        </label>
                      </div>
                      {paymentTime && (
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setPaymentTime('')}
                            className="px-3 py-1 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                          >
                            ✕ ยกเลิก/ล้างเวลา
                          </button>
                          <button
                            type="button"
                            onClick={() => { /* time is already set, just visual confirmation */ }}
                            className="px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                          >
                            ✓ ยืนยันเวลา
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div className="w-24 text-xs font-bold text-slate-600 flex items-center gap-1">💳 บัตรเครดิต:</div>
                  <input 
                    type="number" 
                    value={payCredit} 
                    onChange={e => setPayCredit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-0 bg-transparent p-2 text-right text-base font-black text-emerald-700 focus:ring-0 outline-none" 
                    placeholder="0.00"
                  />
                  <span className="text-slate-400 font-bold pr-2">฿</span>
                </div>
              </div>
              
              {payChange > 0 && (
                <div className="mb-3 p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 font-bold text-sm flex justify-between">
                  <span>💵 เงินทอน (ทอนจากเงินสดที่รับ)</span>
                  <span>฿{payChange.toLocaleString()}</span>
                </div>
              )}

              <button 
                onClick={handlePayment}
                disabled={(Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0) <= 0 || loading}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-black py-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex justify-between items-center px-5 text-lg"
              >
                <span>{loading ? 'กำลังบันทึก...' : 'บันทึกรับชำระเงิน'}</span>
                {!loading && (Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0) > 0 && (
                  <span className="bg-white text-emerald-600 px-3 py-1 rounded-lg text-base">
                    ฿{((Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0)).toLocaleString()}
                  </span>
                )}
              </button>
            </div>
            
          </div>
        </div>
        {showReceiptModal && (
          <FolioReceiptModal
            roomId={roomId}
            roomNo={roomNo}
            bookingId={bookingId}
            onClose={() => setShowReceiptModal(false)}
          />
        )}
      </div>
    </div>
  );
}
