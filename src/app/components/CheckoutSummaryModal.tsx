import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useShift } from '@/contexts/ShiftContext';

type Tx = { id: string; transaction_type: string; category: string; amount: number; created_at: string };

interface Props {
  roomId: string;
  roomNo: string;
  bookingId: string;
  onClose: () => void;
  /** เรียกหลังบันทึกรายการมัดจำเสร็จ เพื่อให้ฝั่งแม่ทำการเช็คเอาท์ต่อ */
  onConfirmed: () => void;
}

const DEPOSIT_KEY = 'มัดจำกุญแจ';
type DepositMode = 'full' | 'partial' | 'forfeit';

export default function CheckoutSummaryModal({ roomId, roomNo, bookingId, onClose, onConfirmed }: Props) {
  const { activeShift, refreshShift } = useShift();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);

  const [mode, setMode] = useState<DepositMode>('full');
  const [deductAmount, setDeductAmount] = useState<number | ''>('');
  const [deductReason, setDeductReason] = useState('');

  const [pin, setPin] = useState('');
  const [pinOk, setPinOk] = useState(false);
  const [error, setError] = useState('');

  const isTester = activeShift?.staff_role === 'staff';
  const isManager = activeShift?.staff_role === 'admin' || activeShift?.staff_role === 'manager';

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ledger_transactions')
        .select('id, transaction_type, category, amount, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
      setTxs((data as Tx[]) || []);
      setLoading(false);
    })();
  }, [bookingId]);

  // ---- คำนวณยอด (ตรงกับตรรกะของ BillingModal: มัดจำแยกจากยอดบิล) ----
  const valid = txs.filter(t => !t.category.includes('Voided'));
  const isDeposit = (t: Tx) => t.category.includes(DEPOSIT_KEY);

  const isReceivedRow = (t: Tx) =>
    isDeposit(t) && Number(t.amount) > 0 && (t.transaction_type === 'deposit' || t.category === 'ค่ามัดจำกุญแจ' || t.category === 'key_deposit');
  const charges = valid
    .filter(t => Number(t.amount) > 0 && !isDeposit(t))
    .reduce((s, t) => s + Number(t.amount), 0);
  const depositReceived = valid
    .filter(isReceivedRow)
    .reduce((s, t) => s + Number(t.amount), 0);
  const depositRefunded = valid
    .filter(t => isDeposit(t) && Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const depositHeld = Math.max(0, depositReceived - depositRefunded);
  const paid = valid
    .filter(t => t.transaction_type === 'payment' && Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  // ยอดที่ลูกค้ายังต้องจ่าย (ค่าห้อง+อื่นๆ+มัดจำที่เก็บ - ที่จ่ายแล้ว)
  const remaining = charges + depositReceived - paid;

  const deduct =
    mode === 'full' ? 0 : mode === 'forfeit' ? depositHeld : Math.min(Number(deductAmount) || 0, depositHeld);
  const refund = Math.max(0, depositHeld - deduct);
  const needPin = deduct > 0 && !isManager && !pinOk;

  const verifyPin = async () => {
    if (!pin) return;
    setError('');
    const { data, error: err } = await supabase.from('staff').select('role').eq('pin', pin).maybeSingle();
    if (err || !data || (data.role !== 'admin' && data.role !== 'manager')) {
      setError('PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็นแอดมิน/ผู้จัดการ)');
      return;
    }
    setPinOk(true);
    setPin('');
  };

  const canConfirm = () => {
    if (saving || loading) return false;
    if (remaining > 0 && !isTester) return false;
    if (depositHeld > 0) {
      if (mode === 'partial' && !(Number(deductAmount) > 0 && Number(deductAmount) < depositHeld)) return false;
      if (deduct > 0 && !deductReason.trim()) return false;
      if (needPin) return false;
    }
    return true;
  };

  const handleConfirm = async () => {
    if (!canConfirm()) return;
    setSaving(true);
    setError('');

    if (depositHeld > 0) {
      if (!activeShift) {
        setError('กรุณาเปิดกะก่อนทำรายการคืนมัดจำ');
        setSaving(false);
        return;
      }
      const base = {
        shift_id: isTester ? null : activeShift.id,
        staff_name: activeShift.staff_name,
        room_id: roomId,
        booking_id: bookingId,
      };
      const rows: any[] = [];
      if (refund > 0) {
        rows.push({
          ...base,
          transaction_type: 'deposit',
          category: 'คืนมัดจำกุญแจ',
          amount: -refund,
          notes: deduct > 0 ? `คืนบางส่วน (หัก ${deduct.toLocaleString()} บาท)` : 'คืนเต็มจำนวน',
        });
      }
      if (deduct > 0) {
        // ส่วนที่หัก/ริบ เป็นรายได้ของโรงแรม (บันทึกเป็นรายได้ ณ ตอนนี้เท่านั้น)
        rows.push({
          ...base,
          transaction_type: 'revenue',
          category: 'ค่าปรับ/ริบมัดจำกุญแจ',
          amount: deduct,
          notes: `หัก ${deduct.toLocaleString()} บาท: ${deductReason.trim()}`,
        });
      }
      const { error: insErr } = await supabase.from('ledger_transactions').insert(rows);
      if (insErr) {
        setError('บันทึกการคืนมัดจำไม่สำเร็จ: ' + insErr.message);
        setSaving(false);
        return;
      }
      refreshShift();
    }

    setSaving(false);
    onConfirmed();
  };

  const baht = (n: number) => '฿' + n.toLocaleString();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h2 className="text-lg font-black text-slate-800">สรุปก่อนเช็คเอาท์ ห้อง {roomNo}</h2>
          <button onClick={onClose} className="px-3 py-1 bg-slate-200 hover:bg-slate-300 rounded-full font-bold">X</button>
        </div>

        {loading ? (
          <p className="p-8 text-center text-slate-400">กำลังโหลด...</p>
        ) : (
          <div className="p-6 space-y-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">ค่าใช้จ่ายทั้งหมด (ห้อง + เพิ่มเติม + POS)</span><b>{baht(charges)}</b></div>
              <div className="flex justify-between"><span className="text-slate-600">มัดจำกุญแจที่รับไว้</span><b>{baht(depositReceived)}</b></div>
              <div className="flex justify-between text-emerald-700"><span>ชำระแล้ว</span><b>-{baht(paid)}</b></div>
              <div className={`flex justify-between pt-2 border-t border-slate-200 text-base font-black ${remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                <span>{remaining > 0 ? 'ยอดค้างชำระ' : 'ชำระครบแล้ว'}</span>
                <span>{baht(Math.max(0, remaining))}</span>
              </div>
            </div>

            {remaining > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
                {isTester
                  ? 'มียอดค้างชำระ (โหมดทดลองใช้งานข้ามได้)'
                  : 'ยังมียอดค้างชำระ กรุณากลับไปกด "จัดการบิล / ชำระเงิน" เพื่อรับชำระให้ครบก่อนเช็คเอาท์'}
              </div>
            )}

            <div className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-amber-800">🔑 เงินมัดจำกุญแจที่ถือไว้</span>
                <span className="text-xl font-black text-amber-700">{baht(depositHeld)}</span>
              </div>

              {depositHeld <= 0 ? (
                <p className="text-sm text-slate-500">ห้องนี้ไม่มีเงินมัดจำกุญแจ (ไม่ต้องคืนอะไร)</p>
              ) : (
                <>
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} />
                      <span className="font-medium text-slate-700">คืนเต็มจำนวน ({baht(depositHeld)})</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={mode === 'partial'} onChange={() => setMode('partial')} />
                      <span className="font-medium text-slate-700">คืนบางส่วน (หักค่าเสียหาย)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={mode === 'forfeit'} onChange={() => setMode('forfeit')} />
                      <span className="font-medium text-slate-700">ไม่คืน (กุญแจหาย / ริบทั้งหมด)</span>
                    </label>
                  </div>

                  {mode === 'partial' && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-600 whitespace-nowrap">หักออก:</span>
                      <input
                        type="number" min={1} max={depositHeld - 1}
                        value={deductAmount}
                        onChange={e => setDeductAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="flex-1 border border-slate-300 rounded-lg p-2 text-right font-bold"
                        placeholder="จำนวนเงินที่หัก"
                      />
                      <span className="font-bold text-slate-500">฿</span>
                    </div>
                  )}

                  {deduct > 0 && (
                    <input
                      type="text"
                      value={deductReason}
                      onChange={e => setDeductReason(e.target.value)}
                      placeholder="เหตุผล เช่น กุญแจหาย / ทำของเสียหาย (จำเป็น)"
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    />
                  )}

                  <div className="flex justify-between text-sm pt-2 border-t border-amber-200">
                    <span className="font-bold text-slate-700">คืนเงินให้ลูกค้า</span>
                    <span className="font-black text-emerald-700">{baht(refund)}</span>
                  </div>
                  {deduct > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-700">หักเป็นรายได้ของโรงแรม</span>
                      <span className="font-black text-rose-600">{baht(deduct)}</span>
                    </div>
                  )}

                  {needPin && (
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                      <p className="text-xs font-bold text-slate-600">การหัก/ริบมัดจำ ต้องให้แอดมินหรือผู้จัดการยืนยันด้วย PIN</p>
                      <div className="flex gap-2">
                        <input
                          type="password" inputMode="numeric" maxLength={4}
                          value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                          className="flex-1 border border-slate-300 rounded-lg p-2 text-center tracking-widest font-mono"
                          placeholder="PIN"
                        />
                        <button type="button" onClick={verifyPin} className="px-4 bg-slate-800 text-white font-bold rounded-lg">ยืนยัน</button>
                      </div>
                    </div>
                  )}
                  {deduct > 0 && !isManager && pinOk && (
                    <p className="text-xs font-bold text-emerald-600">✓ ผู้จัดการยืนยันแล้ว</p>
                  )}
                </>
              )}
            </div>

            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700">ยกเลิก</button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm()}
                className="flex-[2] py-3 rounded-xl font-black text-white bg-red-500 hover:bg-red-600 disabled:bg-slate-300 shadow-lg"
              >
                {saving ? 'กำลังบันทึก...' : '👋 ยืนยันเช็คเอาท์'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
