"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type ExtraCharge = {
  id: string;
  name: string;
  price: number;
  charge_type: 'per_night' | 'one_time';
  ui_type: 'quick_button' | 'dropdown';
  is_active: boolean;
};

export default function ExtraChargesSettings() {
  const [charges, setCharges] = useState<ExtraCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ExtraCharge>>({});

  useEffect(() => {
    fetchCharges();
  }, []);

  const fetchCharges = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('extra_charge_settings').select('*').order('created_at', { ascending: true });
    if (!error && data) {
      setCharges(data);
    }
    setLoading(false);
  };

  const handleSave = async (id?: string) => {
    if (!formData.name || !formData.price) return;
    
    if (id) {
      await supabase.from('extra_charge_settings').update(formData).eq('id', id);
    } else {
      await supabase.from('extra_charge_settings').insert({
        name: formData.name,
        price: Number(formData.price),
        charge_type: formData.charge_type || 'one_time',
        ui_type: formData.ui_type || 'dropdown',
        is_active: true
      });
    }
    setFormData({});
    setIsEditing(null);
    fetchCharges();
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    await supabase.from('extra_charge_settings').update({ is_active: !currentStatus }).eq('id', id);
    fetchCharges();
  };

  const handleDelete = async (id: string) => {
    if (confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
      await supabase.from('extra_charge_settings').delete().eq('id', id);
      fetchCharges();
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800">ตั้งค่าค่าใช้จ่ายเพิ่มเติม (Extra Charges)</h2>
          <p className="text-sm text-slate-500">จัดการรายการค่าใช้จ่ายที่จะไปแสดงเป็นปุ่มลัดหรือดรอปดาวน์ในหน้า Check-in</p>
        </div>
        <button 
          onClick={() => { setIsEditing('new'); setFormData({ charge_type: 'one_time', ui_type: 'dropdown' }); }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors"
        >
          + เพิ่มรายการใหม่
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-400">กำลังโหลด...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">ชื่อรายการ</th>
                <th className="px-4 py-3">ราคา (บาท)</th>
                <th className="px-4 py-3">ประเภทการคิดเงิน</th>
                <th className="px-4 py-3">รูปแบบปุ่ม (UI)</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {isEditing === 'new' && (
                <tr className="border-b border-emerald-100 bg-emerald-50/50">
                  <td className="px-4 py-3"><input type="text" placeholder="เช่น เตียงเสริม" className="w-full border rounded px-2 py-1 text-sm font-bold" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} /></td>
                  <td className="px-4 py-3"><input type="number" placeholder="0" className="w-24 border rounded px-2 py-1 text-sm font-bold" value={formData.price || ''} onChange={e => setFormData({...formData, price: Number(e.target.value)})} /></td>
                  <td className="px-4 py-3">
                    <select className="border rounded px-2 py-1 text-sm font-bold w-full" value={formData.charge_type || 'one_time'} onChange={e => setFormData({...formData, charge_type: e.target.value as any})}>
                      <option value="one_time">คิดครั้งเดียว</option>
                      <option value="per_night">คิดตามจำนวนคืน</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select className="border rounded px-2 py-1 text-sm font-bold w-full" value={formData.ui_type || 'dropdown'} onChange={e => setFormData({...formData, ui_type: e.target.value as any})}>
                      <option value="dropdown">ดรอปดาวน์</option>
                      <option value="quick_button">ปุ่มลัด (เด่น)</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-emerald-600 font-bold">เปิดใช้งาน</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => handleSave()} className="text-emerald-600 font-bold hover:underline">บันทึก</button>
                    <button onClick={() => setIsEditing(null)} className="text-slate-400 hover:underline">ยกเลิก</button>
                  </td>
                </tr>
              )}
              {charges.map(charge => (
                <tr key={charge.id} className={`border-b border-slate-100 ${!charge.is_active ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'}`}>
                  {isEditing === charge.id ? (
                    <>
                      <td className="px-4 py-3"><input type="text" className="w-full border rounded px-2 py-1 text-sm font-bold" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} /></td>
                      <td className="px-4 py-3"><input type="number" className="w-24 border rounded px-2 py-1 text-sm font-bold" value={formData.price || ''} onChange={e => setFormData({...formData, price: Number(e.target.value)})} /></td>
                      <td className="px-4 py-3">
                        <select className="border rounded px-2 py-1 text-sm font-bold w-full" value={formData.charge_type || 'one_time'} onChange={e => setFormData({...formData, charge_type: e.target.value as any})}>
                          <option value="one_time">คิดครั้งเดียว</option>
                          <option value="per_night">คิดตามจำนวนคืน</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select className="border rounded px-2 py-1 text-sm font-bold w-full" value={formData.ui_type || 'dropdown'} onChange={e => setFormData({...formData, ui_type: e.target.value as any})}>
                          <option value="dropdown">ดรอปดาวน์</option>
                          <option value="quick_button">ปุ่มลัด (เด่น)</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">-</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button onClick={() => handleSave(charge.id)} className="text-blue-600 font-bold hover:underline">บันทึก</button>
                        <button onClick={() => setIsEditing(null)} className="text-slate-400 hover:underline">ยกเลิก</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-bold text-slate-700">{charge.name}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{charge.price.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {charge.charge_type === 'per_night' ? (
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">ตามจำนวนคืน</span>
                        ) : (
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">ครั้งเดียว</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {charge.ui_type === 'quick_button' ? (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">ปุ่มลัด</span>
                        ) : (
                          <span className="text-slate-500 text-xs font-medium">ดรอปดาวน์</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button 
                          onClick={() => handleToggleActive(charge.id, charge.is_active)}
                          className={`px-2 py-1 rounded text-xs font-bold ${charge.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-200 text-slate-500 border border-slate-300'}`}
                        >
                          {charge.is_active ? 'เปิดใช้งาน' : 'ปิดการใช้งาน'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right space-x-3">
                        <button onClick={() => { setIsEditing(charge.id); setFormData(charge); }} className="text-blue-600 hover:underline font-bold">แก้ไข</button>
                        <button onClick={() => handleDelete(charge.id)} className="text-rose-600 hover:underline font-bold">ลบ</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {charges.length === 0 && isEditing !== 'new' && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">ยังไม่มีการตั้งค่าค่าใช้จ่ายเพิ่มเติม</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
