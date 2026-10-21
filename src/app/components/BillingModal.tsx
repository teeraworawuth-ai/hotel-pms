import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useShift } from '@/contexts/ShiftContext';
import { useSimulatedTime } from '@/contexts/SimulatedTimeContext';
import { computeDeposit } from '@/lib/depositMath';

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
  const { activeShift, refreshShift } = useShift();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [posItems, setPosItems] = useState<PosItem[]>([]);
  
  const [dailyRates, setDailyRates] = useState<any[]>([]);
  const [dailyExtras, setDailyExtras] = useState<any[]>([]);
  const [bookingMeta, setBookingMeta] = useState<BookingMeta>({});
  
  const [payCash, setPayCash] = useState<number | ''>('');
  const [payTransfer, setPayTransfer] = useState<number | ''>('');
  const [payCredit, setPayCredit] = useState<number | ''>('');
  const [paymentTime, setPaymentTime] = useState<string>('');
  const [isScanningSlip, setIsScanningSlip] = useState(false);
  
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

  const { getNow } = useSimulatedTime();

  useEffect(() => {
    fetchData();
  }, [bookingId]);

  const fetchData = async () => {
    setLoading(true);
    const [txRes, posRes, ratesRes, extrasRes, metaRes, roomRes] = await Promise.all([
      supabase.from('ledger_transactions').select('*').eq('booking_id', bookingId).order('created_at', { ascending: true }),
      supabase.from('pos_items').select('*').eq('is_active', true),
      supabase.from('booking_daily_rates').select('*').eq('booking_id', bookingId),
      supabase.from('booking_daily_extras').select('*').eq('booking_id', bookingId),
      supabase.from('system_settings').select('value').eq('key', `booking_meta_${bookingId}`).maybeSingle(),
      supabase.from('rooms').select('key_deposit').eq('id', roomId).maybeSingle()
    ]);
    
    const txs = txRes.data || [];
    setTransactions(txs);
    if (posRes.data) setPosItems(posRes.data);
    if (ratesRes?.data) setDailyRates(ratesRes.data);
    if (extrasRes?.data) setDailyExtras(extrasRes.data);
    if (metaRes?.data?.value) setBookingMeta(metaRes.data.value as BookingMeta);

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
  if (now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 45)) {
    businessCutoff.setDate(businessCutoff.getDate() - 1);
  }
  businessCutoff.setHours(9, 45, 0, 0);

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
  const totalPaid = validTxs.filter(t => t.amount < 0 && t.transaction_type === 'payment').reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalPostedCharges = validTxs.filter(t => t.amount > 0 && !t.category.includes('มัดจำกุญแจ')).reduce((sum, t) => sum + Number(t.amount), 0);
  const totalKeyDeposit = validTxs.filter(t => t.category.includes('มัดจำกุญแจ')).reduce((sum, t) => sum + Number(t.amount), 0);
  const depositReceivedTotal = validTxs.filter(t => t.category.includes('มัดจำกุญแจ') && Number(t.amount) > 0).reduce((sum, t) => sum + Number(t.amount), 0);
  // สูตรกลาง: ค่าใช้จ่ายชำระครบก่อน เงินที่เหลือจึงนับเป็นมัดจำ (ดู src/lib/depositMath.ts)
  const dep = computeDeposit(transactions);
  const depositHeldNow = dep.held;
  const depositRefundedTotal = dep.refunded;
  const depositAppliedTotal = 0;

  // Date in YYYY-MM-DD for Asia/Bangkok
  const todayStr = getNow().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  // Calculate future unposted charges
  const futureRates = dailyRates.filter(r => r.target_date > todayStr).reduce((sum, r) => sum + Number(r.amount), 0);
  const futureExtras = dailyExtras.filter(e => e.target_date > todayStr).reduce((sum, e) => sum + Number(e.amount), 0);
  
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

  const handleAddPos = async (item: PosItem) => {
    if (!activeShift) { alert('กรุณาเปิดกะก่อนทำรายการ'); return; }
    
    const { error } = await supabase.from('ledger_transactions').insert({
      shift_id: activeShift.id,
      staff_name: activeShift.staff_name,
      room_id: roomId,
      booking_id: bookingId,
      transaction_type: 'revenue',
      category: item.name,
      amount: item.default_price
    });
    
    if (!error) fetchData();
  };

  const handleAddCustomPos = async () => {
    if (!activeShift) { alert('กรุณาเปิดกะก่อนทำรายการ'); return; }
    if (!customItemName.trim() || !customItemPrice || Number(customItemPrice) <= 0) return;
    
    setLoading(true);
    const { error } = await supabase.from('ledger_transactions').insert({
      shift_id: activeShift.id,
      staff_name: activeShift.staff_name,
      room_id: roomId,
      booking_id: bookingId,
      transaction_type: 'revenue',
      category: customItemName.trim(),
      amount: Number(customItemPrice)
    });
    
    if (!error) {
      setCustomItemName('');
      setCustomItemPrice('');
      fetchData();
    }
    setLoading(false);
  };


  const handleSaveDeposit = async () => {
    if (!activeShift) { alert('กรุณาเปิดกะก่อนทำรายการ'); return; }
    const oldDepAmt = activeDepositTx ? Number(activeDepositTx.amount) : 0;
    const newDepAmt = depositChecked ? (Number(depositInput) || 0) : 0;
    if (oldDepAmt === newDepAmt) return;

    setLoading(true);
    const editor = activeShift.staff_name;
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
          shift_id: activeShift.staff_role === 'staff' ? null : activeShift.id,
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
      const firstRate = sortedRates[0];
      if (firstRate) {
        await supabase.from('booking_daily_rates').update({
          amount: newAmt,
          is_manual_override: true
        }).eq('id', firstRate.id);
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
    const inserts = [];
    if (cash > 0) inserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: roomId, booking_id: bookingId, transaction_type: 'payment', category: 'cash', amount: -cash });
    if (transfer > 0) inserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: roomId, booking_id: bookingId, transaction_type: 'payment', category: 'transfer', amount: -transfer, notes: paymentTime ? `โอนเวลา: ${paymentTime.replace('T', ' ')}` : undefined });
    if (credit > 0) inserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: roomId, booking_id: bookingId, transaction_type: 'payment', category: 'credit_card', amount: -credit });
    
    const { error } = await supabase.from('ledger_transactions').insert(inserts);
    
    if (!error) {
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
    setLoading(false);
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
                        
                        // Use business date (if before 09:45, it belongs to yesterday's business date)
                        const d = new Date(tx.created_at);
                        if (d.getHours() < 9 || (d.getHours() === 9 && d.getMinutes() < 45)) {
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
                                      {tx.notes && <p className="text-xs text-slate-500 italic mt-0.5">{tx.notes}</p>}
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
                    onClick={() => window.print()}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>🖨️</span> พิมพ์ใบเสร็จ (Print Receipt)
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

            {/* 2. POS Items */}
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">เพิ่มรายการ (POS)</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {posItems.map(item => (
                  <button 
                    key={item.id} 
                    onClick={() => handleAddPos(item)}
                    className="flex flex-col items-center justify-center p-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg transition-colors active:scale-95"
                  >
                    <span className="font-bold text-slate-700 text-sm">{item.name}</span>
                    <span className="text-blue-600 font-bold text-xs">+{item.default_price}</span>
                  </button>
                ))}
              </div>
              
              {/* Custom Item Entry */}
              <div className="border-t border-slate-100 pt-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">คีย์รายการรายได้อื่นๆ (พิมพ์เอง)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="ชื่อรายการ..." 
                    value={customItemName}
                    onChange={e => setCustomItemName(e.target.value)}
                    className="flex-[2] border-2 border-slate-200 rounded-lg p-2 text-sm focus:border-blue-500 outline-none"
                  />
                  <input 
                    type="number" 
                    placeholder="ราคา" 
                    value={customItemPrice}
                    onChange={e => setCustomItemPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm focus:border-blue-500 outline-none"
                  />
                  <button 
                    onClick={handleAddCustomPos}
                    disabled={!customItemName.trim() || !customItemPrice || loading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-3 rounded-lg text-sm shadow-sm transition-colors"
                  >
                    เพิ่ม
                  </button>
                </div>
              </div>
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
      </div>
    </div>
  );
}
