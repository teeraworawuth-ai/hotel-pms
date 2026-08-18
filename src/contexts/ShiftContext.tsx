"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface Shift {
  id: string;
  staff_id: string;
  staff_name: string;
  start_time: string;
  end_time: string | null;
  initial_cash: number;
  expected_cash: number;
  final_cash: number | null;
  discrepancy: number | null;
  status: 'open' | 'closed';
  signature_data: string | null;
}

type ShiftContextType = {
  activeShift: Shift | null;
  loading: boolean;
  refreshShift: () => Promise<void>;
};

const ShiftContext = createContext<ShiftContextType>({
  activeShift: null,
  loading: true,
  refreshShift: async () => {},
});

export const useShift = () => useContext(ShiftContext);

export const ShiftProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshShift = async () => {
    setLoading(true);
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
            // คำนวณยอดเงินสดจาก Ledger
        const { data: ledgers } = await supabase
          .from('ledger_transactions')
          .select('amount, category, transaction_type')
          .eq('shift_id', shiftData.id);
          
        let cashReceived = 0;
        let cashExpenses = 0;

        if (ledgers) {
          ledgers.forEach(txn => {
            if (txn.category === 'cash' && txn.transaction_type === 'payment') {
              // การรับชำระเงินถูกบันทึกเป็นค่าลบ (-) เพื่อหักล้างหนี้
              cashReceived += Math.abs(Number(txn.amount));
            } else if (txn.transaction_type === 'expense') {
              // ค่าใช้จ่ายถูกบันทึกเป็นลบ
              cashExpenses += Math.abs(Number(txn.amount));
            }
          });
        }
        
        shiftData.expected_cash = shiftData.initial_cash + cashReceived - cashExpenses;
      
      // อัปเดตตาราง shifts ด้วยเพื่อความแน่ใจ
      supabase.from('shifts').update({ expected_cash: shiftData.expected_cash }).eq('id', shiftData.id).then();
      
      setActiveShift(shiftData);
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshShift();
  }, []);

  return (
    <ShiftContext.Provider value={{ activeShift, loading, refreshShift }}>
      {children}
    </ShiftContext.Provider>
  );
};
