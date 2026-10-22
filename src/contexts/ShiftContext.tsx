"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface Shift {
  id: string;
  staff_id: string;
  staff_name: string;
  operator_name?: string;
  staff_role?: string;
  housekeeper_only?: boolean;
  can_clean?: boolean;
  locations?: string[];
  start_time: string;
  end_time: string | null;
  initial_cash: number;
  expected_cash: number;
  final_cash: number | null;
  discrepancy: number | null;
  status: 'open' | 'closed';
  signature_data: string | null;
}

export interface LoggedInUser {
  id: string;
  name: string;
  role: string;
  locations?: string[];
  can_clean?: boolean;
}

type ShiftContextType = {
  activeShift: Shift | null;
  currentUser: LoggedInUser | null;
  operatorName: string;
  loading: boolean;
  refreshShift: () => Promise<void>;
};

const ShiftContext = createContext<ShiftContextType>({
  activeShift: null,
  currentUser: null,
  operatorName: "",
  loading: true,
  refreshShift: async () => {},
});

export const useShift = () => useContext(ShiftContext);

export const ShiftProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [currentUser, setCurrentUser] = useState<LoggedInUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshShift = async () => {
    setLoading(true);

    // Check AuthUser for logged-in user and Housekeeper Dummy Shift
    const saved = localStorage.getItem('auth_user');
    let parsedUser: LoggedInUser | null = null;
    if (saved) {
      try {
        const user = JSON.parse(saved);
        parsedUser = user;
        setCurrentUser(user);
        if (user.role === 'housekeeper') {
          // Dummy shift for housekeeper so cleaning is never blocked
          setActiveShift({
            id: 'dummy-shift-id',
            staff_id: user.id,
            staff_name: user.name,
            operator_name: user.name,
            staff_role: 'housekeeper',
            housekeeper_only: true,
            can_clean: true,
            locations: user.locations || [],
            start_time: new Date().toISOString(),
            end_time: null,
            initial_cash: 0,
            expected_cash: 0,
            final_cash: null,
            discrepancy: null,
            status: 'open',
            signature_data: null
          });
          setLoading(false);
          return;
        }
      } catch (e) {}
    } else {
      setCurrentUser(null);
    }

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
        if (parsedUser.can_clean !== undefined) shiftData.can_clean = parsedUser.can_clean;
      } else {
        shiftData.operator_name = shiftData.staff_name;
      }

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
          } else if (txn.transaction_type === 'expense' || (txn.transaction_type === 'deposit' && Number(txn.amount) < 0 && (txn.category.includes('คืนมัดจำ') || txn.category.includes('คืนเงินทอน')))) {
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

  const operatorName = currentUser?.name || activeShift?.operator_name || activeShift?.staff_name || "";

  return (
    <ShiftContext.Provider value={{ activeShift, currentUser, operatorName, loading, refreshShift }}>
      {children}
    </ShiftContext.Provider>
  );
};
