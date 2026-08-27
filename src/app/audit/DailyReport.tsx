"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Shift } from "@/contexts/ShiftContext";

type LedgerTransaction = {
  id: string;
  shift_id: string;
  staff_name: string;
  transaction_type: string;
  category: string;
  amount: number;
  created_at: string;
};

export default function DailyReport({ dateOffset }: { dateOffset: number }) {
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [isDayClosed, setIsDayClosed] = useState(false);
  
  // Totals
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCash, setTotalCash] = useState(0);
  const [totalTransfer, setTotalTransfer] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);

  useEffect(() => {
    async function fetchDailyData() {
      setLoading(true);

      // กำหนดช่วงเวลา (06:45 น. ของวันนั้น ถึง 06:44:59 น. ของวันถัดไป)
      const start = new Date();
      start.setDate(start.getDate() + dateOffset);
      start.setHours(6, 45, 0, 0); // 06:45 AM
      
      const end = new Date(start);
      end.setDate(end.getDate() + 1); // Next day 06:45 AM

      // ดึงข้อมูลกะที่ทับซ้อนกับช่วงเวลานี้ (เปิดในวันนี้ หรือเปิดมาก่อนแต่มันยังแอคทีฟอยู่ในวันนี้)
      const { data: shiftData, error: shiftError } = await supabase
        .from('shifts')
        .select('*')
        .lt('start_time', end.toISOString())
        .or(`end_time.gte.${start.toISOString()},end_time.is.null`)
        .order('start_time', { ascending: true });

      if (!shiftError && shiftData) {
        setShifts(shiftData);
      }

      // ดึง Ledger (รายรับ/รายจ่าย) ที่เกิดขึ้นใน "วันนี้" เท่านั้น ไม่ว่าจะมาจากกะไหนก็ตาม
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('*')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString());

      if (!ledgerError && ledgerData) {
        setTransactions(ledgerData);

        let revenue = 0;
        let cash = 0;
        let transfer = 0;
        let credit = 0;
        let expense = 0;

        ledgerData.forEach((txn: LedgerTransaction) => {
          if (txn.transaction_type === 'revenue') {
            revenue += Number(txn.amount);
          } else if (txn.transaction_type === 'payment') {
            const absAmount = Math.abs(Number(txn.amount));
            if (txn.category === 'cash') cash += absAmount;
            if (txn.category === 'transfer') transfer += absAmount;
            if (txn.category === 'credit_card') credit += absAmount;
          } else if (txn.transaction_type === 'expense') {
            expense += Math.abs(Number(txn.amount));
          }
        });

        setTotalRevenue(revenue);
        setTotalCash(cash);
        setTotalTransfer(transfer);
        setTotalCredit(credit);
        setTotalExpense(expense);
      } else {
        setTransactions([]);
        setTotalRevenue(0);
        setTotalCash(0);
        setTotalTransfer(0);
        setTotalCredit(0);
        setTotalExpense(0);
      }

      // ตรวจสอบว่ากะสุดท้ายของวันถูกปิดไปแล้วหรือยัง
      const shiftDateStr = start.toISOString().split('T')[0];
      const eodKey = `eod_shift_${shiftDateStr}`;
      const { data: eodData } = await supabase.from('system_settings').select('id').eq('key', eodKey).maybeSingle();
      setIsDayClosed(!!eodData);

      setLoading(false);
    }
    fetchDailyData();
  }, [dateOffset]);

  if (loading) return <div className="text-center py-12 text-slate-500 animate-pulse">กำลังโหลดรายงาน...</div>;

  const totalCashDrop = totalCash - totalExpense;

  return (
    <div className="space-y-6">
      {/* สถานะการปิดยอดประจำวัน */}
      <div className={`p-4 rounded-xl border flex items-center justify-between ${isDayClosed ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
        <div>
          <h2 className={`text-lg font-bold ${isDayClosed ? 'text-indigo-800' : 'text-slate-700'}`}>สถานะประจำวัน</h2>
          <p className={`text-sm ${isDayClosed ? 'text-indigo-600' : 'text-slate-500'}`}>
            {isDayClosed ? 'บันทึกกะสุดท้ายและสรุปยอดประจำวันครบถ้วนแล้ว' : 'กำลังดำเนินการ (ยังไม่มีการระบุกะสุดท้ายของวัน)'}
          </p>
        </div>
        <div className={`px-4 py-2 rounded-full font-bold text-sm ${isDayClosed ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
          {isDayClosed ? '✅ สรุปยอดแล้ว (Closed)' : '🔄 ยังไม่สรุปยอด (Open)'}
        </div>
      </div>

      {/* สรุปยอดรวมประจำวัน */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-sm font-medium text-slate-500 mb-1">รายได้รวม (ไม่หักจ่าย)</div>
          <div className="text-2xl font-black text-slate-800">฿{totalRevenue.toLocaleString()}</div>
        </div>
        <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-sm">
          <div className="text-sm font-medium text-emerald-600 mb-1">รับเงินสดสุทธิ (หักค่าใช้จ่าย)</div>
          <div className="text-2xl font-black text-emerald-700">฿{totalCashDrop.toLocaleString()}</div>
        </div>
        <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 shadow-sm">
          <div className="text-sm font-medium text-blue-600 mb-1">รับเงินโอนสุทธิ</div>
          <div className="text-2xl font-black text-blue-700">฿{totalTransfer.toLocaleString()}</div>
        </div>
        <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100 shadow-sm">
          <div className="text-sm font-medium text-purple-600 mb-1">บัตรเครดิต</div>
          <div className="text-2xl font-black text-purple-700">฿{totalCredit.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* สรุปรายจ่าย / เงินสดย่อย */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800">ค่าใช้จ่าย / เงินสดย่อย (Petty Cash)</h3>
          </div>
          <div className="p-4 flex-1">
            {transactions.filter(t => t.transaction_type === 'expense').length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">ไม่มีรายการใช้จ่ายในวันนี้</p>
            ) : (
              <ul className="space-y-3">
                {transactions.filter(t => t.transaction_type === 'expense').map(txn => (
                  <li key={txn.id} className="flex justify-between items-center text-sm border-b border-slate-50 pb-2 last:border-0">
                    <div>
                      <div className="font-bold text-slate-700">{txn.category}</div>
                      <div className="text-xs text-slate-400">โดย: {txn.staff_name}</div>
                    </div>
                    <div className="font-bold text-orange-600">-฿{Math.abs(txn.amount).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-4 border-t border-slate-100 bg-orange-50 flex justify-between items-center font-bold text-orange-800">
            <span>รวมค่าใช้จ่าย:</span>
            <span>฿{totalExpense.toLocaleString()}</span>
          </div>
        </div>

        {/* สรุปกะ (Shift Logs) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800">ประวัติการปิดกะ (Shift Logs)</h3>
          </div>
          <div className="p-4 space-y-4">
            {shifts.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">ไม่มีการเปิดกะในช่วงเวลานี้</p>
            ) : (
              shifts.map(shift => (
                <div key={shift.id} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-800">{shift.staff_name}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${shift.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {shift.status === 'open' ? 'กำลังเปิด' : 'ปิดแล้ว'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mb-4">
                    เวลา: {new Date(shift.start_time).toLocaleTimeString('th-TH')} - {shift.end_time ? new Date(shift.end_time).toLocaleTimeString('th-TH') : '...'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-slate-600">เงินทอนตั้งต้น:</div>
                    <div className="font-bold text-right">฿{shift.initial_cash.toLocaleString()}</div>
                    
                    <div className="text-slate-600">ยอดที่ควรมี:</div>
                    <div className="font-bold text-right text-emerald-600">฿{shift.expected_cash.toLocaleString()}</div>
                    
                    {shift.status === 'closed' && (
                      <>
                        <div className="text-slate-600">ยอดนับได้จริง:</div>
                        <div className="font-bold text-right">฿{(shift.final_cash || 0).toLocaleString()}</div>
                        
                        <div className="text-slate-600">ส่วนต่าง:</div>
                        <div className={`font-bold text-right ${(shift.discrepancy || 0) < 0 ? 'text-red-500' : ((shift.discrepancy || 0) > 0 ? 'text-blue-500' : 'text-slate-500')}`}>
                          ฿{(shift.discrepancy || 0).toLocaleString()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
