import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type PosItem = {
  id: string;
  name: string;
  default_price: number;
  is_active: boolean;
};

export default function PosSettings() {
  const [items, setItems] = useState<PosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // form state
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState<number | ''>('');

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase.from('pos_items').select('*').order('name');
    if (data) setItems(data);
    setLoading(false);
  };

  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemPrice) return;
    setSaving(true);
    const { error } = await supabase.from('pos_items').insert({
      name: newItemName.trim(),
      default_price: Number(newItemPrice),
      is_active: true
    });
    
    if (!error) {
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">จัดการปุ่มรายได้อื่นๆ (POS)</h2>
          <p className="text-sm text-slate-500">เพิ่มปุ่มรายการเพื่อให้พนักงานกดเพิ่มค่าใช้จ่ายในหน้า Check-in ได้ง่ายขึ้น</p>
        </div>
      </div>

      <div className="p-6">
        <div className="flex gap-4 mb-8 bg-blue-50 p-4 rounded-xl border border-blue-100 items-end">
          <div className="flex-1">
            <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อรายการใหม่</label>
            <input 
              type="text" 
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              placeholder="เช่น ผ้าห่ม, น้ำแข็ง, ค่าซักรีด" 
              className="w-full border-2 border-white rounded-xl p-3 focus:border-blue-500 outline-none shadow-sm"
            />
          </div>
          <div className="flex-[0.5]">
            <label className="block text-sm font-bold text-slate-700 mb-1">ราคาเริ่มต้น (บาท)</label>
            <input 
              type="number" 
              value={newItemPrice}
              onChange={e => setNewItemPrice(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0" 
              className="w-full border-2 border-white rounded-xl p-3 focus:border-blue-500 outline-none shadow-sm"
            />
          </div>
          <button 
            onClick={handleAddItem}
            disabled={saving || !newItemName.trim() || !newItemPrice}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 px-6 rounded-xl shadow-sm transition-all h-[52px]"
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
                <div className="flex justify-between items-start mb-4">
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
  );
}
