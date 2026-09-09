"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type RatePlan = {
  id: string;
  name: string;
  description: string;
  room_types?: RatePlanRoomType[];
};

type RatePlanRoomType = {
  id: string;
  room_type: string;
  base_price: number;
};

type RatePlanCalendar = {
  id: string;
  rate_plan_id: string;
  room_type: string;
  target_date: string;
  price: number;
};

export default function RatePlanSettings() {
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [availableRoomTypes, setAvailableRoomTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);

  // Calendar Management
  const [selectedPlan, setSelectedPlan] = useState<RatePlan | null>(null);
  const [selectedRoomTypeForCalendar, setSelectedRoomTypeForCalendar] = useState<string>("");
  const [calendarRates, setCalendarRates] = useState<RatePlanCalendar[]>([]);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  
  // Custom Rate Form
  const [customDate, setCustomDate] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Fetch Room Types
    const { data: rooms } = await supabase.from('rooms').select('room_type');
    let uniqueTypes: string[] = [];
    if (rooms) {
      uniqueTypes = Array.from(new Set(rooms.map(r => r.room_type).filter(Boolean))) as string[];
      setAvailableRoomTypes(uniqueTypes);
    }

    // 2. Fetch Rate Plans and their base prices
    const { data: plans, error } = await supabase.from('rate_plans').select('*').order('created_at', { ascending: true });
    if (!error && plans) {
      const { data: roomTypePrices } = await supabase.from('rate_plan_room_types').select('*');
      
      const plansWithPrices = plans.map(p => ({
        ...p,
        room_types: roomTypePrices?.filter(rt => rt.rate_plan_id === p.id) || []
      }));
      setRatePlans(plansWithPrices);
    }
    setLoading(false);
  };

  const saveRatePlan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    let planId = editingPlan?.id;

    if (planId) {
      await supabase.from('rate_plans').update({ name, description }).eq('id', planId);
    } else {
      const { data } = await supabase.from('rate_plans').insert({ name, description }).select().single();
      if (data) planId = data.id;
    }
    
    if (planId) {
      // Save Base Prices for each room type
      for (const rt of availableRoomTypes) {
        const price = Number(formData.get(`price_${rt}`));
        if (price > 0) {
          // Upsert logic
          const existing = editingPlan?.room_types?.find(r => r.room_type === rt);
          if (existing) {
            await supabase.from('rate_plan_room_types').update({ base_price: price }).eq('id', existing.id);
          } else {
            await supabase.from('rate_plan_room_types').insert({
              rate_plan_id: planId,
              room_type: rt,
              base_price: price
            });
          }
        }
      }
    }
    
    setIsPlanModalOpen(false);
    setEditingPlan(null);
    fetchData();
  };

  const deleteRatePlan = async (id: string) => {
    if (!confirm('ยืนยันการลบ Rate Plan นี้? ราคาพิเศษทั้งหมดในปฏิทินจะถูกลบไปด้วย')) return;
    await supabase.from('rate_plans').delete().eq('id', id);
    fetchData();
  };

  // --- Calendar Functions ---
  const openCalendar = async (plan: RatePlan) => {
    setSelectedPlan(plan);
    const firstType = plan.room_types?.[0]?.room_type || availableRoomTypes[0] || "";
    setSelectedRoomTypeForCalendar(firstType);
    setIsCalendarModalOpen(true);
    if (firstType) {
      fetchCalendarRates(plan.id, firstType);
    } else {
      setCalendarRates([]);
    }
  };

  const fetchCalendarRates = async (planId: string, roomType: string) => {
    const { data, error } = await supabase
      .from('rate_plan_calendar')
      .select('*')
      .eq('rate_plan_id', planId)
      .eq('room_type', roomType)
      .order('target_date', { ascending: true });
    if (!error && data) {
      setCalendarRates(data);
    }
  };

  // Change room type tab in calendar
  const handleCalendarTabChange = (rt: string) => {
    setSelectedRoomTypeForCalendar(rt);
    if (selectedPlan) {
      fetchCalendarRates(selectedPlan.id, rt);
    }
  };

  const addCustomRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !selectedRoomTypeForCalendar || !customDate || !customPrice) return;
    
    const { error } = await supabase.from('rate_plan_calendar').insert({
      rate_plan_id: selectedPlan.id,
      room_type: selectedRoomTypeForCalendar,
      target_date: customDate,
      price: Number(customPrice)
    });
    
    if (error) {
      alert('เกิดข้อผิดพลาด อาจมีการตั้งราคาวันนี้ไปแล้วในประเภทห้องนี้');
      console.error(error);
    } else {
      setCustomDate("");
      setCustomPrice("");
      fetchCalendarRates(selectedPlan.id, selectedRoomTypeForCalendar);
    }
  };

  const deleteCustomRate = async (id: string) => {
    if (!selectedPlan || !selectedRoomTypeForCalendar) return;
    await supabase.from('rate_plan_calendar').delete().eq('id', id);
    fetchCalendarRates(selectedPlan.id, selectedRoomTypeForCalendar);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">กำลังโหลด...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Rate Plans (แผนราคา)</h2>
          <p className="text-sm text-slate-500">จัดการราคามาตรฐานและราคาพิเศษรายวัน คลุมทุกประเภทห้อง</p>
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
            
            <div className="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-100 max-h-40 overflow-y-auto space-y-1">
              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Base Price (ราคาตั้งต้น)</div>
              {plan.room_types?.map(rt => (
                <div key={rt.id} className="flex justify-between items-center text-sm border-b border-slate-100 pb-1 last:border-0">
                  <span className="text-slate-600">{rt.room_type}</span>
                  <span className="font-bold text-blue-600">฿{rt.base_price.toLocaleString()}</span>
                </div>
              ))}
              {(!plan.room_types || plan.room_types.length === 0) && (
                <div className="text-xs text-slate-400">ยังไม่ได้กำหนดราคา</div>
              )}
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => openCalendar(plan)}
                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 py-2 rounded-lg text-xs font-bold transition-colors"
              >
                📅 ปฏิทินราคาพิเศษ
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">{editingPlan ? 'แก้ไข Rate Plan' : 'สร้าง Rate Plan ใหม่'}</h3>
              <button onClick={() => setIsPlanModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={saveRatePlan} className="p-4 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อแพ็กเกจราคา (Name)</label>
                <input required name="name" defaultValue={editingPlan?.name} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="เช่น Standard Rate, Weekend Promo" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">รายละเอียด (Description)</label>
                <textarea name="description" defaultValue={editingPlan?.description} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="คำอธิบายแพ็กเกจ..." rows={2} />
              </div>
              
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 mb-2 uppercase">ตั้งราคาพื้นฐานแต่ละประเภทห้อง</label>
                <div className="space-y-2">
                  {availableRoomTypes.map(rt => {
                    const existingPrice = editingPlan?.room_types?.find(r => r.room_type === rt)?.base_price || '';
                    return (
                      <div key={rt} className="flex items-center gap-2">
                        <span className="w-1/2 text-sm text-slate-600 truncate">{rt}</span>
                        <div className="w-1/2 relative">
                          <span className="absolute left-3 top-1.5 text-slate-400 text-sm">฿</span>
                          <input 
                            type="number" 
                            name={`price_${rt}`} 
                            defaultValue={existingPrice} 
                            className="w-full border border-slate-300 rounded-lg pl-8 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" 
                            placeholder="ราคา..." 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="pt-4 mt-2 border-t border-slate-100">
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">บันทึกข้อมูล</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calendar Modal */}
      {isCalendarModalOpen && selectedPlan && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-amber-50">
              <div>
                <h3 className="font-bold text-amber-900">ปฏิทินราคาพิเศษ</h3>
                <p className="text-xs text-amber-700">สำหรับแพ็กเกจ: {selectedPlan.name}</p>
              </div>
              <button onClick={() => setIsCalendarModalOpen(false)} className="text-amber-700 hover:text-amber-900 bg-amber-200/50 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            
            {/* Room Type Tabs */}
            <div className="bg-amber-50/50 border-b border-slate-200 px-4 pt-2 flex gap-1 overflow-x-auto">
              {availableRoomTypes.map(rt => (
                <button 
                  key={rt}
                  onClick={() => handleCalendarTabChange(rt)}
                  className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap ${selectedRoomTypeForCalendar === rt ? 'bg-white text-blue-600 border-t border-x border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {rt}
                </button>
              ))}
            </div>
            
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <form onSubmit={addCustomRate} className="flex gap-2 items-end flex-wrap sm:flex-nowrap">
                <div className="w-full sm:w-1/3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">วันที่ (Date)</label>
                  <input required type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div className="w-full sm:w-1/3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    ราคา (Base เดิม: ฿{selectedPlan.room_types?.find(r => r.room_type === selectedRoomTypeForCalendar)?.base_price || 0})
                  </label>
                  <input required type="number" value={customPrice} onChange={e => setCustomPrice(e.target.value)} placeholder="เช่น 700" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <button type="submit" className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-1.5 rounded-lg text-sm font-bold h-[34px]">
                  บันทึกราคา
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
              <div className="text-sm font-bold text-slate-700 mb-3">
                ราคาพิเศษของห้อง "{selectedRoomTypeForCalendar}"
              </div>
              {calendarRates.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm bg-white rounded-lg border border-slate-200">ไม่มีราคาพิเศษในช่วงเวลานี้ (ระบบจะใช้ Base Price ของห้องนี้)</div>
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
                    <button onClick={() => deleteCustomRate(rate.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors" title="ลบ">
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
