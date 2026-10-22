import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useShift } from '@/contexts/ShiftContext';
import { computeDeposit } from '@/lib/depositMath';

type Tx = { id: string; transaction_type: string; category: string; amount: number; created_at: string };

interface Props {
  roomId: string;
  roomNo: string;
  bookingId: string;
  onClose: () => void;
  /** เรียกหลังบันทึกรายการมัดจำ/เงินทอนเสร็จ เพื่อให้ฝั่งแม่ทำการเช็คเอาท์ต่อ */
  onConfirmed: () => void;
}

type DepositMode = 'full' | 'partial' | 'forfeit';

export default function CheckoutSummaryModal({ roomId, roomNo, bookingId, onClose, onConfirmed }: Props) {
  const { activeShift, operatorName, refreshShift } = useShift();
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

  const baht = (n: number) => '฿' + n.toLocaleString();

  // ---- สูตรกลาง: ค่าใช้จ่ายต้องชำระครบก่อน ที่เหลือจึงนับเป็นมัดจำ ----
  const d = computeDeposit(txs);
  const { charges, cash, target, unpaid, held, shortfall, excess } = d;

  const deduct =
    mode === 'full' ? 0 : mode === 'forfeit' ? held : Math.min(Number(deductAmount) || 0, held);
  const depositRefund = Math.max(0, held - deduct);
  const totalToReturn = depositRefund + excess; // มัดจำที่คืน + เงินทอนที่ต้องคืน
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
    if (unpaid > 0 && !isTester) return false; // ค่าใช้จ่ายต้องชำระครบก่อนเช็คเอาท์
    if (held > 0) {
      if (mode === 'partial' && !(Number(deductAmount) > 0 && Number(deductAmount) < held)) return false;
      if (deduct > 0 && !deductReason.trim()) return false;
      if (needPin) return false;
    }
    return true;
  };

  const handleConfirm = async () => {
    if (!canConfirm()) return;
    setSaving(true);
    setError('');

    const needsLedger = held > 0 || excess > 0;
    if (needsLedger) {
      if (!activeShift) {
        setError('กรุณาเปิดกะก่อนทำรายการคืนเงิน');
        setSaving(false);
        return;
      }
      const base = {
        shift_id: activeShift.id === 'dummy-shift-id' ? null : activeShift.id,
        staff_name: operatorName || activeShift.staff_name,
        room_id: roomId,
        booking_id: bookingId,
      };
      const rows: any[] = [];

      // เงินทอนที่ต้องคืน (ลูกค้าจ่ายเกินยอดที่ตกลงเก็บ)
      if (excess > 0) {
        rows.push({
          ...base,
          transaction_type: 'deposit',
          category: 'คืนเงินทอน',
          amount: -excess,
          notes: 'คืนเงินที่ลูกค้าจ่ายเกิน',
        });
      }
      // คืนมัดจำ (ส่วนที่ไม่ถูกหัก)
      if (depositRefund > 0) {
        rows.push({
          ...base,
          transaction_type: 'deposit',
          category: 'คืนมัดจำกุญแจ',
          amount: -depositRefund,
          notes: deduct > 0 ? `คืนบางส่วน (หัก ${deduct.toLocaleString()} บาท)` : 'คืนเต็มจำนวน',
        });
      }
      // ส่วนที่หัก/ริบ เป็นรายได้ของโรงแรม (บันทึกเป็นรายได้ ณ ตอนนี้เท่านั้น)
      if (deduct > 0) {
        rows.push({
          ...base,
          transaction_type: 'revenue',
          category: 'ค่าปรับ/ริบมัดจำกุญแจ',
          amount: deduct,
          notes: `หัก ${deduct.toLocaleString()} บาท: ${deductReason.trim()}`,
        });
      }
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('ledger_transactions').insert(rows);
        if (insErr) {
          setError('บันทึกการคืนเงินไม่สำเร็จ: ' + insErr.message);
          setSaving(false);
          return;
        }
        refreshShift();
      }
    }

    setSaving(false);
    onConfirmed();
  };

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
              <div className="flex justify-between text-emerald-700"><span>ชำระแล้ว (เงินสด/โอน/บัตร)</span><b>-{baht(cash)}</b></div>
              <div className={'flex justify-between pt-2 border-t border-slate-200 text-base font-black ' + (unpaid > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                <span>{unpaid > 0 ? 'ค่าใช้จ่ายค้างชำระ' : 'ค่าใช้จ่ายชำระครบแล้ว'}</span>
                <span>{baht(unpaid)}</span>
              </div>
            </div>

            {unpaid > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
                {isTester
                  ? 'มียอดค้างชำระ (โหมดทดลองใช้งานข้ามได้)'
                  : 'ค่าใช้จ่ายยังชำระไม่ครบ กรุณากลับไปกด "จัดการบิล / ชำระเงิน" เพื่อรับชำระให้ครบก่อนเช็คเอาท์ (ค่าใช้จ่ายต้องครบก่อน เงินที่เหลือจึงนับเป็นมัดจำ)'}
              </div>
            )}

            <div className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-amber-800">🔑 เงินมัดจำกุญแจที่ถือไว้</span>
                <span className="text-xl font-black text-amber-700">{baht(held)}</span>
              </div>

              {target > 0 && (
                <div className="text-xs text-slate-600 space-y-0.5">
                  <div className="flex justify-between"><span>ตกลงเก็บ</span><span>{baht(target)}</span></div>
                  <div className="flex justify-between"><span>เก็บได้จริง (เงินที่เหลือหลังชำระค่าใช้จ่าย)</span><span>{baht(held)}</span></div>
                  {shortfall > 0 && (
                    <div className="flex justify-between font-bold text-rose-600"><span>⚠ เก็บไม่ครบ ขาดอีก</span><span>{baht(shortfall)}</span></div>
                  )}
                </div>
              )}

              {held <= 0 ? (
                <p className="text-sm text-slate-500">
                  {target > 0 ? 'ไม่มีเงินมัดจำเหลือให้คืน (ถูกใช้ไปกับค่าใช้จ่าย หรือเก็บไม่ได้)' : 'ห้องนี้ไม่มีเงินมัดจำกุญแจ (ไม่ต้องคืนอะไร)'}
                </p>
              ) : (
                <>
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} />
                      <span className="font-medium text-slate-700">คืนเต็มจำนวน ({baht(held)})</span>
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
                        type="number" min={1} max={held - 1}
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
                    <span className="font-bold text-slate-700">คืนมัดจำให้ลูกค้า</span>
                    <span className="font-black text-emerald-700">{baht(depositRefund)}</span>
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

            {excess > 0 && (
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-sm font-bold flex justify-between">
                <span>💵 เงินทอนที่ต้องคืนลูกค้า (จ่ายเกินยอดที่ตกลง)</span>
                <span>{baht(excess)}</span>
              </div>
            )}

            {totalToReturn > 0 && (
              <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="font-bold text-emerald-800">รวมเงินที่ต้องคืนลูกค้าตอนนี้</span>
                <span className="text-xl font-black text-emerald-700">{baht(totalToReturn)}</span>
              </div>
            )}

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
