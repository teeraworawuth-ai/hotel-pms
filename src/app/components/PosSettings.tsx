"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type PosItem = {
  id: string;
  name: string;
  default_price: number;
  is_active: boolean;
};

export type PosReportCategory = 'minibar' | 'addon' | 'fine' | 'other';

export const REPORT_CATEGORY_LABELS: Record<PosReportCategory, string> = {
  minibar: 'ค่ามินิบาร์',
  addon: 'ค่าส่วนเสริม',
  fine: 'ค่าปรับ',
  other: 'ค่าบริการอื่นๆ',
};

export default function PosSettings() {
  const [items, setItems] = useState<PosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // form state
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState<number | ''>('');
  const [newItemCat, setNewItemCat] = useState<PosReportCategory>('minibar');

  // Category map & Bank accounts in system_settings
  const [categoryMap, setCategoryMap] = useState<Record<string, PosReportCategory>>({});
  const [bankAccounts, setBankAccounts] = useState<string[]>(['SCB', 'KBANK']);
  const [newBankName, setNewBankName] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const [posRes, catRes, bankRes] = await Promise.all([
      supabase.from('pos_items').select('*').order('name'),
      supabase.from('system_settings').select('value').eq('key', 'pos_category_map').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'bank_accounts').maybeSingle(),
    ]);
    if (posRes.data) setItems(posRes.data);
    if (catRes.data?.value) setCategoryMap(catRes.data.value as Record<string, PosReportCategory>);
    if (bankRes.data?.value && Array.isArray(bankRes.data.value) && bankRes.data.value.length > 0) {
      setBankAccounts(bankRes.data.value as string[]);
    }
    setLoading(false);
  };

  const handleUpdateCategory = async (itemName: string, cat: PosReportCategory) => {
    const next = { ...categoryMap, [itemName]: cat };
    setCategoryMap(next);
    await supabase.from('system_settings').upsert({ key: 'pos_category_map', value: next }, { onConflict: 'key' });
  };

  const handleAddBank = async () => {
    const bank = newBankName.trim().toUpperCase();
    if (!bank || bankAccounts.includes(bank)) return;
    const next = [...bankAccounts, bank];
    setBankAccounts(next);
    setNewBankName('');
    await supabase.from('system_settings').upsert({ key: 'bank_accounts', value: next }, { onConflict: 'key' });
  };

  const handleRemoveBank = async (bank: string) => {
    if (bankAccounts.length <= 1) {
      alert('ต้องมีบัญชีธนาคารอย่างน้อย 1 บัญชี');
      return;
    }
    const next = bankAccounts.filter(b => b !== bank);
    setBankAccounts(next);
    await supabase.from('system_settings').upsert({ key: 'bank_accounts', value: next }, { onConflict: 'key' });
  };

  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemPrice) return;
    setSaving(true);
    const trimmed = newItemName.trim();
    const { error } = await supabase.from('pos_items').insert({
      name: trimmed,
      default_price: Number(newItemPrice),
      is_active: true
    });
    
    if (!error) {
      const nextCatMap = { ...categoryMap, [trimmed]: newItemCat };
      setCategoryMap(nextCatMap);
      await supabase.from('system_settings').upsert({ key: 'pos_category_map', value: nextCatMap }, { onConflict: 'key' });
      setNewItemName('');
      setNewItemPrice('');
      await fetchItems();
    } else {
      alert('เกิดข้อผิดพลาด หรือชื่อรายการซ้ำ');
    }
    setSaving(false);
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    await supabase.from('pos_items').update({ is_active: !currentStatus }).eq('id', id);
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (confirm('คุณแน่ใจหรือไม่ที่จะลบรายการนี้? (การลบจะไม่กระทบประวัติในบิลที่เคยชำระไปแล้ว)')) {
      await supabase.from('pos_items').delete().eq('id', id);
      fetchItems();
    }
  };

  return (
    <div className="space-y-6">
      {/* ส่วนที่ 1: จัดการบัญชีธนาคารรับโอน */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800">🏦 บัญชีธนาคารสำหรับรับเงินโอน</h2>
          <p className="text-sm text-slate-500">ใช้เลือกเมื่อลูกค้าชำระด้วยการโอนเงิน และแยกบรรทัดแสดงในรายงานเงินสดประจำวัน</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {bankAccounts.map(bank => (
              <div key={bank} className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-3.5 py-2 rounded-xl font-bold text-sm">
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
        </div>
      </div>

      {/* ส่วนที่ 2: จัดการปุ่ม POS และหมวดหมู่รายงาน */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">จัดการปุ่มรายได้อื่นๆ (POS) & หมวดหมู่รายงาน</h2>
            <p className="text-sm text-slate-500">เพิ่มปุ่มรายการ POS และกำหนดว่าจะให้รวมอยู่ในหมวดใดของรายงานเงินสดประจำวัน</p>
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 mb-8 bg-blue-50 p-4 rounded-xl border border-blue-100 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อรายการใหม่</label>
              <input 
                type="text" 
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                placeholder="เช่น น้ำดื่ม, มาม่า, ค่าปรับสูบบุหรี่" 
                className="w-full border-2 border-white rounded-xl p-3 focus:border-blue-500 outline-none shadow-sm bg-white"
              />
            </div>
            <div className="w-full md:w-36">
              <label className="block text-sm font-bold text-slate-700 mb-1">ราคา (บาท)</label>
              <input 
                type="number" 
                value={newItemPrice}
                onChange={e => setNewItemPrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0" 
                className="w-full border-2 border-white rounded-xl p-3 focus:border-blue-500 outline-none shadow-sm bg-white"
              />
            </div>
            <div className="w-full md:w-48">
              <label className="block text-sm font-bold text-slate-700 mb-1">หมวดในรายงานประจำวัน</label>
              <select
                value={newItemCat}
                onChange={e => setNewItemCat(e.target.value as PosReportCategory)}
                className="w-full border-2 border-white rounded-xl p-3 focus:border-blue-500 outline-none shadow-sm bg-white font-bold text-slate-700"
              >
                <option value="minibar">ค่ามินิบาร์</option>
                <option value="addon">ค่าส่วนเสริม</option>
                <option value="fine">ค่าปรับ</option>
                <option value="other">ค่าบริการอื่นๆ</option>
              </select>
            </div>
            <button 
              onClick={handleAddItem}
              disabled={saving || !newItemName.trim() || !newItemPrice}
              className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 px-6 rounded-xl shadow-sm transition-all h-[52px]"
            >
              {saving ? 'กำลังบันทึก...' : '+ เพิ่มรายการ'}
            </button>
          </div>

          {loading ? (
            <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-400 py-10">ยังไม่มีรายการ POS ในระบบ</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(item => (
                <div key={item.id} className={`border-2 rounded-xl p-4 flex flex-col justify-between transition-colors ${item.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-slate-800">{item.name}</h3>
                      <p className="text-blue-600 font-bold">฿{item.default_price.toLocaleString()}</p>
                    </div>
                    <button 
                      onClick={() => toggleStatus(item.id, item.is_active)}
                      className={`text-xs font-bold px-2 py-1 rounded-full ${item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {item.is_active ? 'ใช้งานอยู่' : 'ซ่อน'}
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">หมวดในรายงานประจำวัน:</label>
                    <select
                      value={categoryMap[item.name] || 'minibar'}
                      onChange={e => handleUpdateCategory(item.name, e.target.value as PosReportCategory)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-50"
                    >
                      <option value="minibar">ค่ามินิบาร์</option>
                      <option value="addon">ค่าส่วนเสริม</option>
                      <option value="fine">ค่าปรับ</option>
                      <option value="other">ค่าบริการอื่นๆ</option>
                    </select>
                  </div>
                  <div className="flex justify-end border-t border-slate-100 pt-3">
                    <button onClick={() => deleteItem(item.id)} className="text-xs text-red-500 font-bold hover:bg-red-50 px-3 py-1 rounded-md transition-colors">
                      ลบทิ้ง
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
