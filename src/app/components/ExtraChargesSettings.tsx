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
    const { data, error } = await supabase
      .from('extra_charge_settings')
      .select('*')
      .order('ui_type', { ascending: false })
      .order('created_at', { ascending: true });
    if (!error && data) {
      setCharges(data);
    }
    setLoading(false);
  };

  const syncAddonCategoryMap = async (itemName: string) => {
    const trimmed = itemName.trim();
    if (!trimmed) return;
    const { data: catRes } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'pos_category_map')
      .maybeSingle();
    const currentMap = (catRes?.value && typeof catRes.value === 'object') ? (catRes.value as Record<string, string>) : {};
    if (!currentMap[trimmed]) {
      const nextMap = { ...currentMap, [trimmed]: 'addon' };
      await supabase.from('system_settings').upsert({ key: 'pos_category_map', value: nextMap }, { onConflict: 'key' });
    }
  };

  const handleSave = async (id?: string) => {
    if (!formData.name?.trim() || formData.price === undefined || Number(formData.price) < 0) return;
    const cleanName = formData.name.trim();

    if (id) {
      await supabase
        .from('extra_charge_settings')
        .update({
          name: cleanName,
          price: Number(formData.price),
          charge_type: formData.charge_type || 'one_time',
          ui_type: formData.ui_type || 'dropdown',
        })
        .eq('id', id);
    } else {
      await supabase.from('extra_charge_settings').insert({
        name: cleanName,
        price: Number(formData.price),
        charge_type: formData.charge_type || 'one_time',
        ui_type: formData.ui_type || 'dropdown',
        is_active: true,
      });
    }
    await syncAddonCategoryMap(cleanName);
    setFormData({});
    setIsEditing(null);
    fetchCharges();
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    await supabase.from('extra_charge_settings').update({ is_active: !currentStatus }).eq('id', id);
    fetchCharges();
  };

  const handleQuickToggleChargeType = async (charge: ExtraCharge) => {
    const nextType = charge.charge_type === 'per_night' ? 'one_time' : 'per_night';
    await supabase.from('extra_charge_settings').update({ charge_type: nextType }).eq('id', charge.id);
    fetchCharges();
  };

  const handleQuickToggleUiType = async (charge: ExtraCharge) => {
    const nextUi = charge.ui_type === 'quick_button' ? 'dropdown' : 'quick_button';
    await supabase.from('extra_charge_settings').update({ ui_type: nextUi }).eq('id', charge.id);
    fetchCharges();
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`คุณต้องการลบรายการ "${name}" ใช่หรือไม่?`)) {
      await supabase.from('extra_charge_settings').delete().eq('id', id);
      fetchCharges();
    }
  };

  const activeQuickButtons = charges.filter(c => c.is_active && c.ui_type === 'quick_button');
  const activeDropdownItems = charges.filter(c => c.is_active && c.ui_type === 'dropdown');

  return (
    <div className="space-y-6">
      {/* Live Preview Box */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-black text-indigo-950 flex items-center gap-2">
              <span>👀</span> ตัวอย่างการแสดงผลจริงในหน้าเช็คอิน (RoomCheckinModal)
            </h3>
            <p className="text-xs text-indigo-700 mt-0.5">
              ปุ่มที่คุณตั้งเป็น &quot;ปุ่มลัด (เด่น)&quot; จะแสดงให้กดทันที ส่วน &quot;ดรอปดาวน์&quot; จะรวมอยู่ในตัวเลือก + รายการอื่นๆ
            </p>
          </div>
          <span className="text-[11px] font-bold bg-white text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg self-start sm:self-auto">
            เข้าหมวด &quot;2. ค่าส่วนเสริม&quot; ในรายงานประจำวันอัตโนมัติ
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-600 mb-2">บริการเสริม (Add-ons)</div>
          <div className="flex flex-wrap items-center gap-2">
            {activeQuickButtons.map(btn => (
              <span
                key={btn.id}
                className="bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1"
              >
                <span>+ {btn.name} ({btn.price}บ.)</span>
                {btn.charge_type === 'per_night' && (
                  <span className="text-[10px] text-indigo-600 font-semibold">/คืน</span>
                )}
              </span>
            ))}
            {activeDropdownItems.length > 0 && (
              <select
                className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-slate-50 text-slate-700"
                defaultValue=""
              >
                <option value="" disabled>
                  + รายการอื่นๆ ({activeDropdownItems.length} รายการ)
                </option>
                {activeDropdownItems.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} (฿{item.price}{item.charge_type === 'per_night' ? '/คืน' : ''})
                  </option>
                ))}
              </select>
            )}
            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-xl text-xs font-bold">
              + พิมพ์รายการเอง
            </span>
          </div>
        </div>
      </div>

      {/* Main Management Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">ตั้งค่ารายการบริการเสริมตอนเช็คอิน (Add-ons)</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              คลิกที่ป้าย <strong>ประเภทการคิดเงิน</strong> หรือ <strong>รูปแบบปุ่ม</strong> ในตารางเพื่อสลับค่าได้ทันที
            </p>
          </div>
          <button
            onClick={() => {
              setIsEditing('new');
              setFormData({ charge_type: 'per_night', ui_type: 'quick_button' });
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-colors self-start sm:self-auto"
          >
            + เพิ่มรายการบริการเสริมใหม่
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
                  <th className="px-4 py-3">ประเภทการคิดเงิน (คลิกสลับได้)</th>
                  <th className="px-4 py-3">ตำแหน่งแสดงปุ่ม (คลิกสลับได้)</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {isEditing === 'new' && (
                  <tr className="border-b border-emerald-200 bg-emerald-50/60">
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        placeholder="เช่น เช่ามอเตอร์ไซค์, เตียงเสริม"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold bg-white"
                        value={formData.name || ''}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        placeholder="0"
                        className="w-28 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold bg-white"
                        value={formData.price ?? ''}
                        onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold w-full bg-white"
                        value={formData.charge_type || 'per_night'}
                        onChange={e => setFormData({ ...formData, charge_type: e.target.value as any })}
                      >
                        <option value="per_night">คิดตามจำนวนคืน (แจกแจงรายวัน/ยกเลิกรายวันได้)</option>
                        <option value="one_time">คิดครั้งเดียว (ตลอดการเข้าพัก)</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold w-full bg-white"
                        value={formData.ui_type || 'quick_button'}
                        onChange={e => setFormData({ ...formData, ui_type: e.target.value as any })}
                      >
                        <option value="quick_button">ปุ่มลัด (เด่น) — กดได้ทันที</option>
                        <option value="dropdown">ดรอปดาวน์ — อยู่ใน + รายการอื่นๆ</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-emerald-700 font-bold">เปิดใช้งาน</td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleSave()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                      >
                        บันทึก
                      </button>
                      <button
                        onClick={() => setIsEditing(null)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold"
                      >
                        ยกเลิก
                      </button>
                    </td>
                  </tr>
                )}
                {charges.map(charge => (
                  <tr
                    key={charge.id}
                    className={`border-b border-slate-100 ${!charge.is_active ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'}`}
                  >
                    {isEditing === charge.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold bg-white"
                            value={formData.name || ''}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            className="w-28 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold bg-white"
                            value={formData.price ?? ''}
                            onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold w-full bg-white"
                            value={formData.charge_type || 'one_time'}
                            onChange={e => setFormData({ ...formData, charge_type: e.target.value as any })}
                          >
                            <option value="per_night">คิดตามจำนวนคืน (แจกแจงรายวัน/ยกเลิกรายวันได้)</option>
                            <option value="one_time">คิดครั้งเดียว (ตลอดการเข้าพัก)</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold w-full bg-white"
                            value={formData.ui_type || 'dropdown'}
                            onChange={e => setFormData({ ...formData, ui_type: e.target.value as any })}
                          >
                            <option value="quick_button">ปุ่มลัด (เด่น) — กดได้ทันที</option>
                            <option value="dropdown">ดรอปดาวน์ — อยู่ใน + รายการอื่นๆ</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">-</td>
                        <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => handleSave(charge.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                          >
                            บันทึก
                          </button>
                          <button
                            onClick={() => setIsEditing(null)}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold"
                          >
                            ยกเลิก
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-bold text-slate-800">{charge.name}</td>
                        <td className="px-4 py-3 font-black text-slate-800">฿{charge.price.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleQuickToggleChargeType(charge)}
                            title="คลิกเพื่อสลับระหว่าง ตามจำนวนคืน / ครั้งเดียว"
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                              charge.charge_type === 'per_night'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {charge.charge_type === 'per_night' ? '📅 คิดตามจำนวนคืน (รายวัน)' : '1️⃣ คิดครั้งเดียว'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleQuickToggleUiType(charge)}
                            title="คลิกเพื่อสลับระหว่าง ปุ่มลัด (เด่น) / ดรอปดาวน์"
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                              charge.ui_type === 'quick_button'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            {charge.ui_type === 'quick_button' ? '⚡ ปุ่มลัด (เด่น)' : '📂 ดรอปดาวน์ (+ รายการอื่นๆ)'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(charge.id, charge.is_active)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                              charge.is_active
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                : 'bg-slate-200 text-slate-500 border border-slate-300'
                            }`}
                          >
                            {charge.is_active ? 'เปิดใช้งาน' : 'ซ่อนไว้'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setIsEditing(charge.id);
                              setFormData(charge);
                            }}
                            className="text-blue-600 hover:underline font-bold"
                          >
                            แก้ไขราคา/ชื่อ
                          </button>
                          <button
                            onClick={() => handleDelete(charge.id, charge.name)}
                            className="text-rose-600 hover:underline font-bold"
                          >
                            ลบ
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {charges.length === 0 && isEditing !== 'new' && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      ยังไม่มีการตั้งค่าบริการเสริม
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Best Practice Guide Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 space-y-2">
        <p className="font-bold text-slate-800 text-sm">💡 แนวทางการตั้งค่าบริการเสริมให้ใช้งานได้มีประสิทธิภาพสูงสุด</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>1. แยกบทบาทชัดเจน:</strong> รายการในหน้านี้จะแสดงในหน้าเช็คอิน และถูกรวมเข้าหมวด <strong>2. ค่าส่วนเสริม</strong> ในรายงานเงินสดประจำวันโดยอัตโนมัติ ส่วนของกิน/มินิบาร์/ค่าปรับระหว่างพักให้ตั้งในแท็บ <strong>จัดการปุ่ม POS</strong>
          </li>
          <li>
            <strong>2. จัดวางปุ่มให้กดไว:</strong> ตั้งเป็น <strong>⚡ ปุ่มลัด (เด่น)</strong> เฉพาะรายการที่ใช้บ่อย 2–4 รายการ (เช่น <code>เตียงเสริม</code>, <code>คนเพิ่ม</code>, <code>เช่ามอเตอร์ไซค์</code>) ส่วนรายการเบิกเสริมทั่วไป (เช่น <code>หมอนเพิ่ม</code>, <code>ผ้าห่มเพิ่ม</code>, <code>ผ้าเช็ดตัวเพิ่ม</code>) ให้ตั้งเป็น <strong>📂 ดรอปดาวน์ (+ รายการอื่นๆ)</strong>
          </li>
          <li>
            <strong>3. เลือกประเภทการคิดเงินให้เหมาะกับหน้างาน:</strong> รายการที่มีโอกาสเช่าบางวันหรือยกเลิกกลางคัน (เช่น <code>เช่ามอเตอร์ไซค์</code>, <code>เตียงเสริม</code>, <code>คนเพิ่ม</code>) ให้ตั้งเป็น <strong>📅 คิดตามจำนวนคืน (รายวัน)</strong> เพื่อให้ระบบกางตารางรายวันและกดยกเลิก/คืนเงินรายวันผ่าน PIN Admin ได้ ส่วนของที่เบิกครั้งเดียวใช้ตลอดทริปให้ตั้งเป็น <strong>1️⃣ คิดครั้งเดียว</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}
