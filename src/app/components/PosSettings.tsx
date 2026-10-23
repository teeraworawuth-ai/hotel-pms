"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activityLog';

export type PosReportCategory = 'minibar' | 'addon' | 'fine' | 'other';

export const REPORT_CATEGORY_LABELS: Record<PosReportCategory, string> = {
  minibar: 'ค่ามินิบาร์',
  addon: 'ค่าส่วนเสริม',
  fine: 'ค่าปรับ',
  other: 'ค่าบริการอื่นๆ',
};

export default function PosSettings() {
  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<string[]>(['SCB', 'KBANK']);
  const [newBankName, setNewBankName] = useState('');

  useEffect(() => {
    fetchBanks();
  }, []);

  const fetchBanks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'bank_accounts')
      .maybeSingle();
    if (data?.value && Array.isArray(data.value) && data.value.length > 0) {
      setBankAccounts(data.value as string[]);
    }
    setLoading(false);
  };

  const handleAddBank = async () => {
    const bank = newBankName.trim().toUpperCase();
    if (!bank || bankAccounts.includes(bank)) return;
    const next = [...bankAccounts, bank];
    setBankAccounts(next);
    setNewBankName('');
    await supabase.from('system_settings').upsert({ key: 'bank_accounts', value: next }, { onConflict: 'key' });
    await logActivity({
      category: 'settings',
      action: 'create',
      target: `บัญชีธนาคาร ${bank}`,
      details: `เพิ่มบัญชีธนาคารสำหรับรับเงินโอน "${bank}"`
    });
  };

  const handleRemoveBank = async (bank: string) => {
    if (bankAccounts.length <= 1) {
      alert('ต้องมีบัญชีธนาคารอย่างน้อย 1 บัญชี');
      return;
    }
    if (!confirm(`ยืนยันการลบบัญชีธนาคาร "${bank}" หรือไม่?`)) return;
    const next = bankAccounts.filter(b => b !== bank);
    setBankAccounts(next);
    await supabase.from('system_settings').upsert({ key: 'bank_accounts', value: next }, { onConflict: 'key' });
    await logActivity({
      category: 'settings',
      action: 'delete',
      target: `บัญชีธนาคาร ${bank}`,
      details: `ลบบัญชีธนาคารสำหรับรับเงินโอน "${bank}"`
    });
  };

  return (
    <div className="space-y-6">
      {/* จัดการบัญชีธนาคารรับโอน */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800">🏦 บัญชีธนาคารสำหรับรับเงินโอน</h2>
          <p className="text-sm text-slate-500">
            ใช้เลือกเมื่อลูกค้าชำระด้วยการโอนเงิน และแยกบรรทัดแสดงตามธนาคารในรายงานเงินสดประจำวัน
          </p>
        </div>
        <div className="p-6 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-400">กำลังโหลดข้อมูลบัญชีธนาคาร...</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {bankAccounts.map(bank => (
                  <div
                    key={bank}
                    className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-3.5 py-2 rounded-xl font-bold text-sm"
                  >
                    <span>🏦 {bank}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveBank(bank)}
                      className="text-blue-400 hover:text-rose-600 font-black ml-1"
                      title="ลบบัญชีนี้"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 max-w-md">
                <input
                  type="text"
                  value={newBankName}
                  onChange={e => setNewBankName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddBank();
                  }}
                  placeholder="เพิ่มชื่อธนาคาร เช่น KTB, BBL..."
                  className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddBank}
                  disabled={!newBankName.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  + เพิ่มธนาคาร
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* คำแนะนำการตั้งค่ารายการบริการเสริม & POS */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-5 flex items-start gap-3">
        <span className="text-xl">💡</span>
        <div className="text-xs sm:text-sm text-indigo-950 space-y-1">
          <p className="font-black">การตั้งค่ารายการบริการเสริม & POS (มินิบาร์ / อุปกรณ์เสริม / ค่าปรับ)</p>
          <p className="text-indigo-800">
            คุณและพนักงานสามารถเพิ่ม, แก้ไขราคา, ลบ, กำหนดปุ่มลัด และเลือกหมวดรายงานประจำวันได้โดยตรงที่ปุ่ม{" "}
            <b>&ldquo;+ รายการอื่นๆ / จัดการ ▾&rdquo;</b> ทั้งในหน้า <b>ก่อนเช็คอิน</b> และหน้า{" "}
            <b>จัดการบิล (POS หลังเช็คอิน)</b> โดยข้อมูลจะเชื่อมต่อถึงกันอัตโนมัติและบันทึกประวัติในหน้า Log (30 วัน) ทุกครั้ง
          </p>
        </div>
      </div>
    </div>
  );
}
