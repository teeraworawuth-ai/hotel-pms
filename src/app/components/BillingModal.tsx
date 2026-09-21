import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useShift } from '@/contexts/ShiftContext';
import { useSimulatedTime } from '@/contexts/SimulatedTimeContext';

type PosItem = { id: string, name: string, default_price: number };
type Transaction = { id: string, transaction_type: string, category: string, amount: number, created_at: string, staff_name: string, notes?: string };

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
  
  const [payCash, setPayCash] = useState<number | ''>('');
  const [payTransfer, setPayTransfer] = useState<number | ''>('');
  const [payCredit, setPayCredit] = useState<number | ''>('');
  
  // Custom POS states
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState<number | ''>('');
  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [showPayments, setShowPayments] = useState<boolean>(true);
  const { getNow } = useSimulatedTime();

  useEffect(() => {
    fetchData();
  }, [bookingId]);

  const fetchData = async () => {
    setLoading(true);
    const [txRes, posRes, ratesRes, extrasRes] = await Promise.all([
      supabase.from('ledger_transactions').select('*').eq('booking_id', bookingId).order('created_at', { ascending: true }),
      supabase.from('pos_items').select('*').eq('is_active', true),
      supabase.from('booking_daily_rates').select('*').eq('booking_id', bookingId),
      supabase.from('booking_daily_extras').select('*').eq('booking_id', bookingId)
    ]);
    
    if (txRes.data) setTransactions(txRes.data);
    if (posRes.data) setPosItems(posRes.data);
    if (ratesRes?.data) setDailyRates(ratesRes.data);
    if (extrasRes?.data) setDailyExtras(extrasRes.data);
    setLoading(false);
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
  
  const displayTransactions = filteredTransactions;


  const balanceForward = pastTransactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') ? 0 : Number(tx.amount)), 0);
  const balance = transactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') ? 0 : Number(tx.amount)), 0);

  // --- PROJECTED TOTAL CALCULATION ---
  const validTxs = transactions.filter(t => !t.category.includes('Voided'));
  const totalPaid = validTxs.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalPostedCharges = validTxs.filter(t => t.amount > 0).reduce((sum, t) => sum + Number(t.amount), 0);
  const totalKeyDeposit = validTxs.filter(t => t.category.includes('มัดจำกุญแจ')).reduce((sum, t) => sum + Number(t.amount), 0);

  // Date in YYYY-MM-DD for Asia/Bangkok
  const todayStr = getNow().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  // Calculate future unposted charges
  const futureRates = dailyRates.filter(r => r.target_date > todayStr).reduce((sum, r) => sum + Number(r.amount), 0);
  const futureExtras = dailyExtras.filter(e => e.target_date > todayStr).reduce((sum, e) => sum + Number(e.amount), 0);
  
  // To avoid duplicate counting if someone clicks POS repeatedly, 
  // we count all past/today posted charges from ledger, plus ONLY future unposted from daily tables.
  const totalExpectedCharges = totalPostedCharges + futureRates + futureExtras;
  const netRemaining = totalExpectedCharges - totalPaid;

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

  const handlePayment = async () => {
    if (!activeShift) { alert('กรุณาเปิดกะก่อนทำรายการ'); return; }
    
    const cash = Number(payCash) || 0;
    const transfer = Number(payTransfer) || 0;
    const credit = Number(payCredit) || 0;
    
    if (cash + transfer + credit <= 0) return;
    
    setLoading(true);
    const inserts = [];
    if (cash > 0) inserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: roomId, booking_id: bookingId, transaction_type: 'payment', category: 'cash', amount: -cash });
    if (transfer > 0) inserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: roomId, booking_id: bookingId, transaction_type: 'payment', category: 'transfer', amount: -transfer });
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
                              {dailyTxs.map(tx => {
                                const isVoid = tx.category.includes('Voided');
                                return (
                                  <div key={tx.id} className="flex justify-between items-start p-2 hover:bg-slate-50 rounded-lg text-sm border-b border-slate-50 last:border-0 group">
                                    <div className={isVoid ? 'line-through text-slate-400 opacity-60' : ''}>
                                      <p className="font-bold text-slate-700">{tx.category === 'room_charge' ? 'ค่าห้องพัก' : tx.category}</p>
                                      {tx.notes && <p className="text-xs text-slate-500 italic mt-0.5">{tx.notes}</p>}
                                      <p className="text-[10px] text-slate-400 mt-0.5">{new Date(tx.created_at).toLocaleTimeString('th-TH')} ({tx.staff_name})</p>
                                    </div>
                                    <div className={`font-black text-right ${isVoid ? 'line-through text-slate-400 opacity-60' : tx.amount < 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                                      {tx.amount < 0 ? '' : '+'}{Number(tx.amount).toLocaleString()}
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
                <span className={`text-2xl font-black ${balance > 0 ? 'text-rose-600' : balance < 0 ? 'text-purple-600' : 'text-emerald-600'}`}>
                  ฿{balance.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* ขวา: สรุปยอด, เครื่องมือ POS และชำระเงิน */}
          <div className="flex-1 flex flex-col gap-4">
            
            {/* 1. Grand Total Dashboard */}
            <div className="bg-slate-800 text-white p-5 rounded-xl shadow-md border-t-4 border-emerald-400">
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
                  <span className="text-white">{totalExpectedCharges.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-400 font-bold">
                  <span>ยอดชำระแล้ว (จ่ายแล้ว)</span>
                  <span>-{totalPaid.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="bg-slate-900 rounded-lg p-3 flex justify-between items-center">
                <span className="font-bold text-slate-300 text-sm">ยอดคงเหลือที่ต้องชำระสุทธิ</span>
                <span className={`text-2xl font-black ${netRemaining > 0 ? 'text-rose-400' : netRemaining < 0 ? 'text-purple-400' : 'text-emerald-400'}`}>
                  ฿{netRemaining.toLocaleString()}
                </span>
              </div>
            </div>

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
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider flex justify-between items-center">
                <span>รับชำระเงิน</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">จ่ายแยกช่องทางได้</span>
              </h3>
              
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-20 text-xs font-bold text-slate-500">เงินสด:</div>
                  <input 
                    type="number" 
                    value={payCash} 
                    onChange={e => setPayCash(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm font-bold text-emerald-700 focus:border-emerald-500 outline-none" 
                    placeholder="0.00"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 text-xs font-bold text-slate-500">โอนเงิน:</div>
                  <input 
                    type="number" 
                    value={payTransfer} 
                    onChange={e => setPayTransfer(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm font-bold text-emerald-700 focus:border-emerald-500 outline-none" 
                    placeholder="0.00"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 text-xs font-bold text-slate-500">บัตรเครดิต:</div>
                  <input 
                    type="number" 
                    value={payCredit} 
                    onChange={e => setPayCredit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm font-bold text-emerald-700 focus:border-emerald-500 outline-none" 
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <button 
                onClick={handlePayment}
                disabled={(Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0) <= 0 || loading}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-black py-3 rounded-lg shadow-sm active:scale-95 transition-all flex justify-between items-center px-4"
              >
                <span>{loading ? 'กำลังบันทึก...' : 'บันทึกรับชำระเงิน'}</span>
                {!loading && (Number(payCash)||0) + (Number(payTransfer)||0) + (Number(payCredit)||0) > 0 && (
                  <span className="bg-white/20 px-2 py-1 rounded text-sm">
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
