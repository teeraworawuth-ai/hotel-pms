import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useShift } from '@/contexts/ShiftContext';

type PosItem = { id: string, name: string, default_price: number };
type Transaction = { id: string, transaction_type: string, category: string, amount: number, created_at: string, staff_name: string };

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
  
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer' | 'credit_card'>('cash');
  
  // Custom POS states
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState<number | ''>('');

  useEffect(() => {
    fetchData();
  }, [bookingId]);

  const fetchData = async () => {
    setLoading(true);
    const [txRes, posRes] = await Promise.all([
      supabase.from('ledger_transactions').select('*').eq('booking_id', bookingId).order('created_at', { ascending: true }),
      supabase.from('pos_items').select('*').eq('is_active', true)
    ]);
    
    if (txRes.data) setTransactions(txRes.data);
    if (posRes.data) setPosItems(posRes.data);
    setLoading(false);
  };

  const balance = transactions.reduce((acc, tx) => acc + (tx.category.includes('Voided') ? 0 : Number(tx.amount)), 0);

  useEffect(() => {
    if (balance > 0 && payAmount === '') {
      setPayAmount(balance);
    }
  }, [balance]);

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

  const handlePayment = async () => {
    if (!activeShift) { alert('กรุณาเปิดกะก่อนทำรายการ'); return; }
    if (!payAmount || Number(payAmount) <= 0) return;
    
    setLoading(true);
    const { error } = await supabase.from('ledger_transactions').insert({
      shift_id: activeShift.id,
      staff_name: activeShift.staff_name,
      room_id: roomId,
      booking_id: bookingId,
      transaction_type: 'payment',
      category: payMethod,
      amount: -Number(payAmount)
    });
    
    if (!error) {
      setPayAmount('');
      const currentBalance = balance - Number(payAmount);
      refreshShift(); // อัปเดตลิ้นชักเงินสด
      
      if (currentBalance <= 0) {
        onSuccess();
        return; // Exit early to prevent state updates on unmounted component
      } else {
        await fetchData();
      }
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h2 className="text-xl font-black text-slate-800">จัดการบิลค่าใช้จ่ายห้อง {roomNo}</h2>
          <button onClick={onClose} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition-colors">
            <span className="font-bold px-2">X</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6 bg-slate-50/50">
          {/* ขวา: รายการบิลปัจจุบัน */}
          <div className="flex-1 flex flex-col">
            <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">รายการในบิล (Folio)</h3>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col shadow-sm">
              <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[200px]">
                {loading && transactions.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>
                ) : transactions.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">ไม่มีรายการค้างชำระ</p>
                ) : (
                  transactions.map(tx => {
                    const isVoid = tx.category.includes('Voided');
                    return (
                      <div key={tx.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg text-sm border-b border-slate-50 last:border-0">
                        <div className={isVoid ? 'line-through text-slate-400 opacity-60' : ''}>
                          <p className="font-bold text-slate-700">{tx.category === 'room_charge' ? 'ค่าห้องพัก' : tx.category}</p>
                          <p className="text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleTimeString('th-TH')} ({tx.staff_name})</p>
                        </div>
                        <div className={`font-black ${isVoid ? 'line-through text-slate-400 opacity-60' : tx.amount < 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {tx.amount < 0 ? '' : '+'}{Number(tx.amount).toLocaleString()}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              <div className="bg-slate-100 p-4 border-t border-slate-200 flex justify-between items-center">
                <span className="font-bold text-slate-600">ยอดคงเหลือที่ต้องชำระ:</span>
                <span className={`text-2xl font-black ${balance > 0 ? 'text-rose-600' : balance < 0 ? 'text-purple-600' : 'text-emerald-600'}`}>
                  ฿{balance.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* ซ้าย: เครื่องมือ POS และชำระเงิน */}
          <div className="flex-1 flex flex-col gap-4">
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

            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">รับชำระเงิน</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">จำนวนเงิน (บาท)</label>
                  <input 
                    type="number" 
                    value={payAmount} 
                    onChange={e => setPayAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg p-2 font-bold text-lg focus:border-emerald-500 focus:outline-none" 
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ช่องทางชำระเงิน</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'transfer', 'credit_card'] as const).map(m => (
                      <button 
                        key={m}
                        onClick={() => setPayMethod(m)}
                        className={`py-2 px-1 text-xs font-bold rounded-lg border-2 transition-colors ${payMethod === m ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'}`}
                      >
                        {m === 'cash' ? 'เงินสด' : m === 'transfer' ? 'โอนเงิน' : 'เครดิต'}
                      </button>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={handlePayment}
                  disabled={!payAmount || Number(payAmount) <= 0 || loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-black py-3 rounded-lg shadow-sm active:scale-95 transition-all"
                >
                  {loading ? 'กำลังบันทึก...' : 'บันทึกรับชำระเงิน'}
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
