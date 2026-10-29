"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Staff {
  id: string;
  name: string;
  pin: string;
  role: 'admin' | 'manager' | 'staff' | 'housekeeper';
  is_active: boolean;
}

export default function StaffSettings() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffLocations, setStaffLocations] = useState<Record<string, string[]>>({});
  const [staffPrimaryLocations, setStaffPrimaryLocations] = useState<Record<string, string>>({});
  const [cleanFlags, setCleanFlags] = useState<Record<string, boolean>>({});
  const [canClean, setCanClean] = useState(false);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState<{name: string, pin: string, role: 'admin'|'manager'|'staff'|'housekeeper'}>({
    name: '', pin: '', role: 'staff'
  });
  const [primaryLocation, setPrimaryLocation] = useState<string>('');
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Fetch Staff
    const { data: staffData } = await supabase.from('staff').select('*').order('created_at', { ascending: true });
    if (staffData) setStaffList(staffData);

    // Fetch Locations
    const { data: roomsData } = await supabase.from('rooms').select('location');
    if (roomsData) {
      const locs = Array.from(new Set(roomsData.map(r => r.location).filter(Boolean))) as string[];
      setLocations(locs.sort());
    }

    // Fetch Staff Locations & Primary Locations from system_settings
    const [{ data: settingsData }, { data: primaryData }, { data: hkData }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'staff_locations').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'staff_primary_locations').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'staff_housekeeping').maybeSingle(),
    ]);

    const locMap = (settingsData?.value as Record<string, string[]>) || {};
    const primMap = (primaryData?.value as Record<string, string>) || {};
    setStaffLocations(locMap);
    setStaffPrimaryLocations(primMap);
    if (hkData && hkData.value) setCleanFlags(hkData.value);
    
    setLoading(false);
  };

  const getEffectivePrimary = (staffId: string) => {
    const locs = staffLocations[staffId] || [];
    const savedPrim = staffPrimaryLocations[staffId];
    if (savedPrim && locs.includes(savedPrim)) return savedPrim;
    return locs[0] || '';
  };

  const handleOpenModal = (staff: Staff | null = null) => {
    setFormError('');
    if (staff) {
      setEditingStaff(staff);
      setFormData({ name: staff.name, pin: staff.pin, role: staff.role });
      const locs = staffLocations[staff.id] || [];
      const prim = getEffectivePrimary(staff.id);
      setPrimaryLocation(prim);
      setSelectedLocations(locs);
      setCanClean(!!cleanFlags[staff.id]);
    } else {
      setEditingStaff(null);
      setFormData({ name: '', pin: '', role: 'staff' });
      setPrimaryLocation('');
      setSelectedLocations([]);
      setCanClean(false);
    }
    setIsModalOpen(true);
  };

  const handleSelectPrimaryLocation = (loc: string) => {
    setPrimaryLocation(loc);
    setSelectedLocations(prev => {
      const others = prev.filter(l => l !== loc);
      return [loc, ...others];
    });
  };

  const handleToggleSecondaryLocation = (loc: string) => {
    if (loc === primaryLocation) return; // สถานที่หลักถูกเลือกอยู่แล้ว
    if (selectedLocations.includes(loc)) {
      setSelectedLocations(prev => prev.filter(l => l !== loc));
    } else {
      setSelectedLocations(prev => [...prev, loc]);
    }
  };

  const handleToggleHousekeeperLocation = (loc: string) => {
    if (selectedLocations.includes(loc)) {
      setSelectedLocations(prev => prev.filter(l => l !== loc));
    } else {
      setSelectedLocations(prev => [...prev, loc]);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.pin || formData.pin.length !== 4) {
      setFormError('กรุณากรอกชื่อ และ รหัส PIN 4 หลัก');
      return;
    }
    if (formData.role === 'staff' && !primaryLocation) {
      setFormError('กรุณาเลือก "⭐ สถานที่หลักประจำตัว" อย่างน้อย 1 แห่งสำหรับพนักงาน');
      return;
    }

    let savedStaffId = '';

    if (editingStaff) {
      const { error } = await supabase.from('staff').update({
        name: formData.name,
        pin: formData.pin,
        role: formData.role
      }).eq('id', editingStaff.id);
      if (error) { setFormError(error.message); return; }
      savedStaffId = editingStaff.id;
    } else {
      const { data, error } = await supabase.from('staff').insert({
        name: formData.name,
        pin: formData.pin,
        role: formData.role
      }).select().single();
      if (error) { setFormError(error.message); return; }
      savedStaffId = data.id;
    }

    // Save Locations for staff / housekeeper
    if (formData.role === 'staff' || formData.role === 'housekeeper') {
      const orderedLocations =
        formData.role === 'staff' && primaryLocation
          ? [primaryLocation, ...selectedLocations.filter(l => l !== primaryLocation)]
          : selectedLocations;

      const [{ data: current }, { data: currentPrim }] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'staff_locations').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'staff_primary_locations').maybeSingle(),
      ]);

      const base = (current?.value as Record<string, string[]>) || {};
      const newStaffLocations = { ...base, [savedStaffId]: orderedLocations };

      const primBase = (currentPrim?.value as Record<string, string>) || {};
      const newPrimaryLocations = {
        ...primBase,
        [savedStaffId]: formData.role === 'staff' ? primaryLocation : (orderedLocations[0] || ''),
      };

      const [{ error: locErr }, { error: primErr }] = await Promise.all([
        supabase.from('system_settings').upsert({ key: 'staff_locations', value: newStaffLocations }, { onConflict: 'key' }),
        supabase.from('system_settings').upsert({ key: 'staff_primary_locations', value: newPrimaryLocations }, { onConflict: 'key' }),
      ]);

      if (locErr || primErr) {
        setFormError('บันทึกสถานที่ไม่สำเร็จ: ' + (locErr?.message || primErr?.message));
        return;
      }
      setStaffLocations(newStaffLocations);
      setStaffPrimaryLocations(newPrimaryLocations);
    }

    {
      const { data: curHk } = await supabase.from('system_settings').select('value').eq('key', 'staff_housekeeping').maybeSingle();
      const hkBase = (curHk?.value as Record<string, boolean>) || {};
      const hkNew = { ...hkBase, [savedStaffId]: formData.role === 'staff' && canClean };
      const { error: hkErr } = await supabase.from('system_settings').upsert({ key: 'staff_housekeeping', value: hkNew }, { onConflict: 'key' });
      if (hkErr) { setFormError('บันทึกสิทธิ์แม่บ้านไม่สำเร็จ: ' + hkErr.message); return; }
      setCleanFlags(hkNew);
    }

    setIsModalOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('คุณต้องการลบผู้ใช้งานนี้ใช่หรือไม่?')) return;
    await supabase.from('staff').delete().eq('id', id);
    fetchData();
  };

  if (loading) return <div className="py-8 text-center text-slate-500">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">จัดการผู้ใช้งาน (Staff)</h2>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
        >
          + เพิ่มผู้ใช้งาน
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <th className="p-4 font-bold">ชื่อพนักงาน</th>
              <th className="p-4 font-bold">รหัส PIN</th>
              <th className="p-4 font-bold">ระดับสิทธิ์</th>
              <th className="p-4 font-bold">สถานที่หลัก & สถานที่รอง</th>
              <th className="p-4 font-bold text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map(staff => {
              const allLocs = staffLocations[staff.id] || [];
              const primLoc = getEffectivePrimary(staff.id);
              const secLocs = allLocs.filter(l => l !== primLoc);
              return (
                <tr key={staff.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-4 font-medium text-slate-800">{staff.name}</td>
                  <td className="p-4 text-slate-600 font-mono tracking-widest">{staff.pin}</td>
                  <td className="p-4">
                    {staff.role === 'admin' ? (
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-bold">แอดมิน / ผู้จัดการ</span>
                    ) : staff.role === 'manager' ? (
                      <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-md text-xs font-bold">ผู้จัดการ</span>
                    ) : staff.role === 'housekeeper' ? (
                      <span className="bg-teal-100 text-teal-800 px-2 py-1 rounded-md text-xs font-bold">แม่บ้าน</span>
                    ) : (
                      <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-md text-xs font-bold">พนักงาน (Staff)</span>
                    )}
                  </td>
                  <td className="p-4 text-slate-600 text-sm">
                    {staff.role === 'staff' ? (
                      allLocs.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {primLoc && (
                            <span className="inline-flex items-center gap-1 bg-indigo-600 text-white px-2.5 py-0.5 rounded-lg text-xs font-black shadow-xs">
                              ⭐ หลัก: {primLoc}
                            </span>
                          )}
                          {secLocs.map(sec => (
                            <span key={sec} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-lg text-xs font-bold">
                              รอง: {sec}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-red-400 font-bold">ยังไม่กำหนด (มองไม่เห็นห้อง)</span>
                      )
                    ) : staff.role === 'housekeeper' ? (
                      allLocs.length > 0 ? (
                        <span className="font-bold text-teal-700">{allLocs.join(', ')}</span>
                      ) : (
                        <span className="text-red-400">ยังไม่กำหนด (มองไม่เห็นห้อง)</span>
                      )
                    ) : (
                      <span className="text-slate-400">- เห็นทุกสถานที่ -</span>
                    )}
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button onClick={() => handleOpenModal(staff)} className="text-blue-600 hover:text-blue-800 font-bold text-sm">แก้ไข</button>
                    <button onClick={() => handleDelete(staff.id)} className="text-red-600 hover:text-red-800 font-bold text-sm">ลบ</button>
                  </td>
                </tr>
              );
            })}
            {staffList.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">ไม่มีข้อมูลพนักงาน</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800">{editingStaff ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}</h3>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อพนักงาน</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none"
                  placeholder="เช่น ซอย2 หรือ พนักงานซามีญ่า"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN (4 หลัก)</label>
                <input 
                  type="text" 
                  maxLength={4}
                  value={formData.pin}
                  onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none tracking-widest font-mono text-lg"
                  placeholder="1234"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">ระดับสิทธิ์</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="role" 
                      value="admin" 
                      checked={formData.role === 'admin'}
                      onChange={() => setFormData({...formData, role: 'admin'})}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="font-medium text-slate-700">แอดมิน / ผู้จัดการ</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="role" 
                      value="staff" 
                      checked={formData.role === 'staff'}
                      onChange={() => setFormData({...formData, role: 'staff'})}
                      className="w-4 h-4 text-amber-600"
                    />
                    <span className="font-medium text-slate-700">พนักงาน (Staff)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="role" 
                      value="housekeeper" 
                      checked={formData.role === 'housekeeper'}
                      onChange={() => setFormData({...formData, role: 'housekeeper'})}
                      className="w-4 h-4 text-teal-600"
                    />
                    <span className="font-medium text-slate-700">แม่บ้าน</span>
                  </label>
                </div>
              </div>

              {formData.role === 'staff' && (
                <div className="space-y-4">
                  {/* 1. Primary Location (เลือกได้ 1 แห่งเท่านั้น) */}
                  <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-200">
                    <label className="block text-sm font-black text-indigo-900 mb-1">
                      ⭐ 1. สถานที่หลักประจำตัวของพนักงาน (เลือกได้ 1 แห่งเท่านั้น)
                    </label>
                    <p className="text-xs text-indigo-700 mb-2.5">
                      เมื่อล็อกอิน ระบบจะล็อกให้เปิดกะที่สถานที่หลักนี้ และเปิดหน้ากระดานสถานที่หลักขึ้นมาให้อัตโนมัติเพื่อไม่ให้กดผิดสถานที่
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {locations.map(loc => {
                        const isPrimary = primaryLocation === loc;
                        return (
                          <button
                            type="button"
                            key={loc}
                            onClick={() => handleSelectPrimaryLocation(loc)}
                            className={`px-3.5 py-2 rounded-xl text-sm font-black border-2 transition-all flex items-center gap-1.5 ${
                              isPrimary
                                ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-[1.03]'
                                : 'bg-white text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                            }`}
                          >
                            <span>{isPrimary ? '⭐' : '📍'}</span>
                            <span>{loc}</span>
                            {isPrimary && <span className="text-[10px] bg-amber-300 text-slate-900 px-1.5 py-0.5 rounded-full font-black">หลัก</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Secondary Locations (เลือกได้หลายแห่ง) */}
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                    <label className="block text-sm font-bold text-amber-900 mb-1">
                      📍 2. สถานที่รองที่อนุญาตให้ดูสถานะห้อง / จองข้ามสถานที่ได้ (ถ้ามี)
                    </label>
                    <p className="text-xs text-amber-700 mb-2.5">
                      คลิกเลือกสถานที่รองที่อนุญาตให้พนักงานคนนี้กดสลับดูห้องและรับจองข้ามสถานที่ (โอน/บัตร/ยังไม่ชำระ) ได้
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {locations.map(loc => {
                        const isPrimary = primaryLocation === loc;
                        const isSecondary = !isPrimary && selectedLocations.includes(loc);
                        return (
                          <button
                            type="button"
                            key={loc}
                            disabled={isPrimary}
                            onClick={() => handleToggleSecondaryLocation(loc)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                              isPrimary
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : isSecondary
                                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            {isPrimary ? `⭐ ${loc} (เป็นสถานที่หลักแล้ว)` : isSecondary ? `✓ สถานที่รอง: ${loc}` : `+ ${loc}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {formData.role === 'housekeeper' && (
                <div className="bg-teal-50 p-4 rounded-xl border border-teal-100">
                  <label className="block text-sm font-bold text-teal-800 mb-2">📍 เลือกสถานที่ที่อนุญาตให้แม่บ้านมองเห็น</label>
                  <div className="flex flex-wrap gap-2">
                    {locations.map(loc => (
                      <button type="button" key={loc} onClick={() => handleToggleHousekeeperLocation(loc)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                          selectedLocations.includes(loc)
                            ? 'bg-teal-600 text-white border-teal-700'
                            : 'bg-white text-teal-700 border-teal-200 hover:bg-teal-100'
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.role === 'staff' && (
                <label className="flex items-center gap-2 cursor-pointer bg-teal-50 p-3 rounded-xl border border-teal-100">
                  <input type="checkbox" checked={canClean} onChange={e => setCanClean(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-bold text-teal-800">🧹 อนุญาตให้ใช้งานส่วนแม่บ้านได้ (กดห้องรอทำ/กำลังทำความสะอาด)</span>
                </label>
              )}

              {formError && <p className="text-red-500 text-sm font-bold">{formError}</p>}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
              >
                บันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
