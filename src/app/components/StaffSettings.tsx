"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Staff {
  id: string;
  name: string;
  pin: string;
  role: 'admin' | 'manager' | 'staff';
  is_active: boolean;
}

export default function StaffSettings() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffLocations, setStaffLocations] = useState<Record<string, string[]>>({});
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState<{name: string, pin: string, role: 'admin'|'manager'|'staff'}>({
    name: '', pin: '', role: 'staff'
  });
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

    // Fetch Staff Locations from system_settings
    const { data: settingsData } = await supabase.from('system_settings').select('value').eq('key', 'staff_locations').maybeSingle();
    if (settingsData && settingsData.value) {
      setStaffLocations(settingsData.value);
    }
    
    setLoading(false);
  };

  const handleOpenModal = (staff: Staff | null = null) => {
    setFormError('');
    if (staff) {
      setEditingStaff(staff);
      setFormData({ name: staff.name, pin: staff.pin, role: staff.role });
      setSelectedLocations(staffLocations[staff.id] || []);
    } else {
      setEditingStaff(null);
      setFormData({ name: '', pin: '', role: 'staff' });
      setSelectedLocations([]);
    }
    setIsModalOpen(true);
  };

  const handleToggleLocation = (loc: string) => {
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

    // Save Locations for staff
    if (formData.role === 'staff') {
      const newStaffLocations = { ...staffLocations, [savedStaffId]: selectedLocations };
      setStaffLocations(newStaffLocations);
      
      const { data: existing } = await supabase.from('system_settings').select('id').eq('key', 'staff_locations').maybeSingle();
      if (existing) {
        await supabase.from('system_settings').update({ value: newStaffLocations }).eq('key', 'staff_locations');
      } else {
        await supabase.from('system_settings').insert({ key: 'staff_locations', value: newStaffLocations });
      }
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
              <th className="p-4 font-bold">สถานที่ที่มองเห็น (สำหรับ Tester)</th>
              <th className="p-4 font-bold text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map(staff => (
              <tr key={staff.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-4 font-medium text-slate-800">{staff.name}</td>
                <td className="p-4 text-slate-600 font-mono tracking-widest">{staff.pin}</td>
                <td className="p-4">
                  {staff.role === 'admin' ? (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-bold">แอดมิน / ผู้จัดการ</span>
                  ) : staff.role === 'manager' ? (
                    <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-md text-xs font-bold">ผู้จัดการ</span>
                  ) : (
                    <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-md text-xs font-bold">ผู้ทดสอบ (Tester)</span>
                  )}
                </td>
                <td className="p-4 text-slate-500 text-sm">
                  {staff.role === 'staff' ? (
                    (staffLocations[staff.id] || []).length > 0 
                      ? (staffLocations[staff.id] || []).join(', ')
                      : <span className="text-red-400">ยังไม่กำหนด (มองไม่เห็นห้อง)</span>
                  ) : (
                    <span className="text-slate-400">- เห็นทุกสถานที่ -</span>
                  )}
                </td>
                <td className="p-4 text-right space-x-2">
                  <button onClick={() => handleOpenModal(staff)} className="text-blue-600 hover:text-blue-800 font-bold text-sm">แก้ไข</button>
                  <button onClick={() => handleDelete(staff.id)} className="text-red-600 hover:text-red-800 font-bold text-sm">ลบ</button>
                </td>
              </tr>
            ))}
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
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800">{editingStaff ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}</h3>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อพนักงาน / ชื่อผู้ทดสอบ</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none"
                  placeholder="เช่น สมชาย หรือ พนักงานชามีญ่า"
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
                <div className="flex gap-4">
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
                    <span className="font-medium text-slate-700">ผู้ทดสอบ (Tester)</span>
                  </label>
                </div>
              </div>

              {formData.role === 'staff' && (
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <label className="block text-sm font-bold text-amber-800 mb-2">สถานที่ที่อนุญาตให้ผู้ทดสอบมองเห็น</label>
                  <div className="flex flex-wrap gap-2">
                    {locations.map(loc => (
                      <button
                        key={loc}
                        onClick={() => handleToggleLocation(loc)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                          selectedLocations.includes(loc)
                            ? 'bg-amber-500 text-white border-amber-600'
                            : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600 mt-2">* ผู้ทดสอบจะเห็นและเข้าได้เฉพาะหน้า Check-in ของสถานที่ที่เลือกเท่านั้น</p>
                </div>
              )}

              {formError && <p className="text-red-500 text-sm">{formError}</p>}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
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
