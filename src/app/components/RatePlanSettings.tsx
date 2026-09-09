"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type RatePlan = {
  id: string;
  name: string;
  description: string;
  base_price: number;
};

type RatePlanCalendar = {
  id: string;
  rate_plan_id: string;
  target_date: string;
  price: number;
};

export default function RatePlanSettings() {
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);

  // Calendar Management
  const [selectedPlan, setSelectedPlan] = useState<RatePlan | null>(null);
  const [calendarRates, setCalendarRates] = useState<RatePlanCalendar[]>([]);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  
  // Custom Rate Form
  const [customDate, setCustomDate] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  useEffect(() => {
    fetchRatePlans();
  }, []);

  const fetchRatePlans = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('rate_plans').select('*').order('created_at', { ascending: true });
    if (!error && data) {
      setRatePlans(data);
    }
    setLoading(false);
  };

  const saveRatePlan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const base_price = Number(formData.get('base_price'));

    if (editingPlan) {
      await supabase.from('rate_plans').update({ name, description, base_price }).eq('id', editingPlan.id);
    } else {
      await supabase.from('rate_plans').insert({ name, description, base_price });
    }
    
    setIsPlanModalOpen(false);
    setEditingPlan(null);
    fetchRatePlans();
  };

  const deleteRatePlan = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Rate Plan? All custom rates will also be deleted.')) return;
    await supabase.from('rate_plans').delete().eq('id', id);
    fetchRatePlans();
  };

  // --- Calendar Functions ---
  const openCalendar = async (plan: RatePlan) => {
    setSelectedPlan(plan);
    setIsCalendarModalOpen(true);
    fetchCalendarRates(plan.id);
  };

  const fetchCalendarRates = async (planId: string) => {
    const { data, error } = await supabase
      .from('rate_plan_calendar')
      .select('*')
      .eq('rate_plan_id', planId)
      .order('target_date', { ascending: true });
    if (!error && data) {
      setCalendarRates(data);
    }
  };

  const addCustomRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !customDate || !customPrice) return;
    
    const { error } = await supabase.from('rate_plan_calendar').insert({
      rate_plan_id: selectedPlan.id,
      target_date: customDate,
      price: Number(customPrice)
    });
    
    if (error) {
      alert('Error saving custom rate. Maybe this date already exists?');
      console.error(error);
    } else {
      setCustomDate("");
      setCustomPrice("");
      fetchCalendarRates(selectedPlan.id);
    }
  };

  const deleteCustomRate = async (id: string) => {
    if (!selectedPlan) return;
    await supabase.from('rate_plan_calendar').delete().eq('id', id);
    fetchCalendarRates(selectedPlan.id);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">กำลังโหลด...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Rate Plans (แผนราคา)</h2>
          <p className="text-sm text-slate-500">จัดการราคามาตรฐานและราคาพิเศษรายวัน</p>
        </div>
        <button 
          onClick={() => { setEditingPlan(null); setIsPlanModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + สร้าง Rate Plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ratePlans.map(plan => (
          <div key={plan.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-slate-800 text-lg mb-1">{plan.name}</h3>
            <p className="text-sm text-slate-500 mb-4 h-10 overflow-hidden">{plan.description || '-'}</p>
            
            <div className="bg-slate-50 rounded-lg p-3 mb-4 flex justify-between items-center border border-slate-100">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Base Price</span>
              <span className="font-black text-blue-600 text-lg">฿{plan.base_price.toLocaleString()}</span>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => openCalendar(plan)}
                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 py-2 rounded-lg text-xs font-bold transition-colors"
              >
                📅 ตั้งราคาพิเศษ (Custom)
              </button>
              <button 
                onClick={() => { setEditingPlan(plan); setIsPlanModalOpen(true); }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition-colors"
              >
                ✏️
              </button>
              <button 
                onClick={() => deleteRatePlan(plan.id)}
                className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition-colors"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
        {ratePlans.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            ยังไม่มี Rate Plan ในระบบ กรุณาสร้างใหม่
          </div>
        )}
      </div>

      {/* Plan Modal */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">{editingPlan ? 'แก้ไข Rate Plan' : 'สร้าง Rate Plan ใหม่'}</h3>
              <button onClick={() => setIsPlanModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={saveRatePlan} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อแพ็กเกจราคา (Name)</label>
                <input required name="name" defaultValue={editingPlan?.name} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="เช่น Standard Rate, Weekend Promo" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">รายละเอียด (Description)</label>
                <textarea name="description" defaultValue={editingPlan?.description} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="คำอธิบายแพ็กเกจ..." rows={2} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ราคาพื้นฐาน (Base Price)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400">฿</span>
                  <input required type="number" name="base_price" defaultValue={editingPlan?.base_price} className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="500" />
                </div>
              </div>
              <div className="pt-2">
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700">บันทึกข้อมูล</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calendar Modal */}
      {isCalendarModalOpen && selectedPlan && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-amber-50">
              <div>
                <h3 className="font-bold text-amber-900">ปฏิทินราคาพิเศษ</h3>
                <p className="text-xs text-amber-700">สำหรับแพ็กเกจ: {selectedPlan.name} (Base: ฿{selectedPlan.base_price})</p>
              </div>
              <button onClick={() => setIsCalendarModalOpen(false)} className="text-amber-700 hover:text-amber-900 bg-amber-200/50 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <form onSubmit={addCustomRate} className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">วันที่ (Date)</label>
                  <input required type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">ราคาพิเศษ (Price)</label>
                  <input required type="number" value={customPrice} onChange={e => setCustomPrice(e.target.value)} placeholder="เช่น 700" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold h-[34px]">
                  เพิ่ม
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {calendarRates.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">ไม่มีราคาพิเศษในช่วงเวลานี้ (ระบบจะใช้ Base Price)</div>
              ) : (
                calendarRates.map(rate => (
                  <div key={rate.id} className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 text-blue-700 font-mono text-sm px-2 py-1 rounded">
                        {new Date(rate.target_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-xs text-slate-500">เปลี่ยนเป็น</div>
                      <div className="font-black text-emerald-600">฿{rate.price.toLocaleString()}</div>
                    </div>
                    <button onClick={() => deleteCustomRate(rate.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
