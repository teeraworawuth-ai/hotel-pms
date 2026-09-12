"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "../components/Navbar";

type RatePlan = {
  id: string;
  name: string;
};

type YieldManagementRules = {
  surge_threshold_percent: number;
  surge_adjustment_percent: number;
  sale_threshold_percent: number;
  sale_adjustment_percent: number;
  time_discount_start_time: string;
  time_discount_percent: number;
};

type DailySetting = {
  target_date: string;
  rate_plan_id: string;
  enable_time_discount: boolean;
  enable_occupancy_sale: boolean;
  enable_occupancy_surge: boolean;
};

export default function SmartPricingPage() {
  const [loading, setLoading] = useState(true);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [dailySettings, setDailySettings] = useState<Record<string, DailySetting>>({});
  
  // Global Rules State
  const [rules, setRules] = useState<YieldManagementRules>({
    surge_threshold_percent: 20,
    surge_adjustment_percent: 10,
    sale_threshold_percent: 60,
    sale_adjustment_percent: 10,
    time_discount_start_time: "22:00",
    time_discount_percent: 15
  });
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  
  // Edit State
  const [editRatePlanId, setEditRatePlanId] = useState("");
  const [editTimeDiscount, setEditTimeDiscount] = useState(false);
  const [editOccSale, setEditOccSale] = useState(false);
  const [editOccSurge, setEditOccSurge] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Fetch Rate Plans
    const { data: plans } = await supabase.from('rate_plans').select('id, name');
    if (plans) setRatePlans(plans);

    // 2. Fetch Global Rules
    const { data: rulesData } = await supabase.from('system_settings').select('value').eq('key', 'yield_management_rules').single();
    if (rulesData && rulesData.value) {
      setRules(rulesData.value as YieldManagementRules);
    }

    // 3. Fetch Daily Settings for current month
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const { data: dailyData } = await supabase
      .from('daily_pricing_settings')
      .select('*')
      .gte('target_date', startStr)
      .lte('target_date', endStr);

    if (dailyData) {
      const mapping: Record<string, DailySetting> = {};
      dailyData.forEach(d => {
        mapping[d.target_date] = d as DailySetting;
      });
      setDailySettings(mapping);
    }

    setLoading(false);
  };

  const handleSaveGlobalRules = async () => {
    setSavingRules(true);
    await supabase.from('system_settings').upsert({
      key: 'yield_management_rules',
      value: rules as any
    });
    setSavingRules(false);
    setShowRulesModal(false);
    alert('บันทึกเงื่อนไขสำเร็จ');
  };

  const handleSaveDailySettings = async () => {
    if (selectedDates.size === 0) return;
    if (!editRatePlanId) {
      alert('กรุณาเลือก Rate Plan');
      return;
    }

    setSavingSettings(true);
    const inserts = Array.from(selectedDates).map(dateStr => ({
      target_date: dateStr,
      rate_plan_id: editRatePlanId,
      enable_time_discount: editTimeDiscount,
      enable_occupancy_sale: editOccSale,
      enable_occupancy_surge: editOccSurge,
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('daily_pricing_settings').upsert(inserts, { onConflict: 'target_date' });
    
    if (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
      setSelectedDates(new Set());
      fetchData();
    }
    setSavingSettings(false);
  };

  const toggleDateSelection = (dateStr: string) => {
    const newSet = new Set(selectedDates);
    if (newSet.has(dateStr)) newSet.delete(dateStr);
    else newSet.add(dateStr);
    setSelectedDates(newSet);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  
  const blanks = Array.from({ length: firstDayOfMonth }).map((_, i) => i);
  const days = Array.from({ length: daysInMonth }).map((_, i) => i + 1);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 py-8 mt-16">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
              <span className="text-3xl mr-3">📅</span> Rate Plan Calendar
            </h1>
            <p className="text-slate-500 mt-2 text-sm font-bold">ปฏิทินกำหนดแผนราคา และ Smart Pricing อัตโนมัติ (Yield Management)</p>
          </div>
          
          <button 
            onClick={() => setShowRulesModal(true)}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold shadow-md hover:bg-slate-700 flex items-center"
          >
            ⚙️ ตั้งค่าเงื่อนไข Smart Rules
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Calendar Section */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800">
                {currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                  className="p-2 border rounded-lg hover:bg-slate-50 font-bold"
                >
                  &lt; ก่อนหน้า
                </button>
                <button 
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                  className="p-2 border rounded-lg hover:bg-slate-50 font-bold"
                >
                  ถัดไป &gt;
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-black text-slate-500 uppercase">
              {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => <div key={d}>{d}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {blanks.map(b => <div key={'blank-'+b} className="h-24 bg-slate-50/50 rounded-xl"></div>)}
              
              {days.map(d => {
                const dDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
                // Adjust for local timezone to get precise YYYY-MM-DD
                const dateStr = dDate.toLocaleDateString('en-CA');
                
                const isSelected = selectedDates.has(dateStr);
                const setting = dailySettings[dateStr];
                const ratePlanName = ratePlans.find(rp => rp.id === setting?.rate_plan_id)?.name;
                
                return (
                  <div 
                    key={d} 
                    onClick={() => toggleDateSelection(dateStr)}
                    className={\`h-24 border-2 rounded-xl p-2 cursor-pointer transition-all flex flex-col \${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50 shadow-sm' 
                        : 'border-slate-100 hover:border-slate-300 bg-white'
                    }\`}
                  >
                    <div className="flex justify-between items-start">
                      <span className={\`font-black \${isSelected ? 'text-blue-700' : 'text-slate-700'}\`}>{d}</span>
                      {isSelected && <span className="text-blue-500">✓</span>}
                    </div>
                    
                    {setting ? (
                      <div className="mt-auto">
                        <div className="text-[10px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded truncate mb-1">
                          ⭐ {ratePlanName || 'Unknown'}
                        </div>
                        <div className="flex gap-1">
                          {setting.enable_time_discount && <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded font-bold" title="Late Night Sale">🌙</span>}
                          {setting.enable_occupancy_sale && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded font-bold" title="Clearance Sale">🔥</span>}
                          {setting.enable_occupancy_surge && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded font-bold" title="Surge Pricing">📈</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-auto text-[10px] text-slate-400 font-bold">
                        (ยังไม่ตั้งค่า)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="mt-4 flex gap-4 text-xs font-bold text-slate-500">
              <span>🌙 = ลดราคาตอนดึก</span>
              <span>🔥 = ลดราคาล้างสต็อก (ห้องว่างเยอะ)</span>
              <span>📈 = อัปราคาช่วงขายดี (ห้องใกลัเต็ม)</span>
            </div>
          </div>

          {/* Edit Panel */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-fit sticky top-24">
            <h2 className="text-xl font-black text-slate-800 mb-2">แก้ไขข้อมูลที่เลือก</h2>
            <p className="text-sm font-bold text-slate-500 mb-6">
              เลือก {selectedDates.size} วัน
            </p>

            {selectedDates.size === 0 ? (
              <div className="text-center py-12 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-xl">
                คลิกเลือกวันที่ในปฏิทินเพื่อตั้งค่า
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">1. เลือกแผนราคา (Base Rate)</label>
                  <select 
                    value={editRatePlanId}
                    onChange={(e) => setEditRatePlanId(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-4 py-2 font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- เลือกแผนราคา --</option>
                    {ratePlans.map(rp => (
                      <option key={rp.id} value={rp.id}>{rp.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-3">2. เปิดใช้กฎ Smart Rules (ทางเลือก)</label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={editTimeDiscount}
                        onChange={(e) => setEditTimeDiscount(e.target.checked)}
                        className="w-5 h-5 text-purple-600 rounded"
                      />
                      <div>
                        <div className="font-bold text-slate-800">🌙 Late Night Sale</div>
                        <div className="text-xs font-bold text-slate-500">หั่นราคาลงเมื่อถึงเวลาดึก (ตั้งค่าได้ใน ⚙️)</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={editOccSale}
                        onChange={(e) => setEditOccSale(e.target.checked)}
                        className="w-5 h-5 text-red-600 rounded"
                      />
                      <div>
                        <div className="font-bold text-slate-800">🔥 Clearance Sale</div>
                        <div className="text-xs font-bold text-slate-500">หั่นราคาลงเมื่อห้องเหลือเยอะมาก</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={editOccSurge}
                        onChange={(e) => setEditOccSurge(e.target.checked)}
                        className="w-5 h-5 text-emerald-600 rounded"
                      />
                      <div>
                        <div className="font-bold text-slate-800">📈 Surge Pricing</div>
                        <div className="text-xs font-bold text-slate-500">อัปราคาขึ้นอัตโนมัติเมื่อห้องใกลัเต็ม</div>
                      </div>
                    </label>
                  </div>
                </div>

                <button 
                  onClick={handleSaveDailySettings}
                  disabled={savingSettings}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl shadow-md transition-colors"
                >
                  {savingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                </button>
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Global Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                ⚙️ ตั้งค่าเงื่อนไข Smart Rules (Global)
              </h2>
              <button onClick={() => setShowRulesModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <p className="text-sm font-bold text-slate-500 mb-6">ตั้งค่าเกณฑ์เปอร์เซ็นต์และเวลา ที่จะนำไปคำนวณราคาอัตโนมัติ (จะมีผลเฉพาะวันที่มีการติ๊กเปิดใช้งานกฎนั้นๆ ในปฏิทิน)</p>

              <div className="space-y-6">
                <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl">
                  <h3 className="font-black text-purple-800 mb-4 flex items-center gap-2">🌙 Late Night Sale (ลดราคาตอนดึก)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">เริ่มลดราคาตั้งแต่เวลา</label>
                      <input type="time" value={rules.time_discount_start_time} onChange={e => setRules({...rules, time_discount_start_time: e.target.value})} className="w-full border rounded-lg px-3 py-2 font-bold focus:ring-2 focus:ring-purple-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">เปอร์เซ็นต์ส่วนลด (%)</label>
                      <input type="number" min="0" max="100" value={rules.time_discount_percent} onChange={e => setRules({...rules, time_discount_percent: Number(e.target.value)})} className="w-full border rounded-lg px-3 py-2 font-bold focus:ring-2 focus:ring-purple-500" />
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-100 p-4 rounded-xl">
                  <h3 className="font-black text-red-800 mb-4 flex items-center gap-2">🔥 Clearance Sale (ลดราคาล้างสต็อก)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">ทำงานเมื่อห้องว่าง &gt; (%)</label>
                      <input type="number" min="0" max="100" value={rules.sale_threshold_percent} onChange={e => setRules({...rules, sale_threshold_percent: Number(e.target.value)})} className="w-full border rounded-lg px-3 py-2 font-bold focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">เปอร์เซ็นต์ส่วนลด (%)</label>
                      <input type="number" min="0" max="100" value={rules.sale_adjustment_percent} onChange={e => setRules({...rules, sale_adjustment_percent: Number(e.target.value)})} className="w-full border rounded-lg px-3 py-2 font-bold focus:ring-2 focus:ring-red-500" />
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                  <h3 className="font-black text-emerald-800 mb-4 flex items-center gap-2">📈 Surge Pricing (อัปราคาช่วงขายดี)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">ทำงานเมื่อห้องว่าง &lt; (%)</label>
                      <input type="number" min="0" max="100" value={rules.surge_threshold_percent} onChange={e => setRules({...rules, surge_threshold_percent: Number(e.target.value)})} className="w-full border rounded-lg px-3 py-2 font-bold focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">เปอร์เซ็นต์ชาร์จเพิ่ม (%)</label>
                      <input type="number" min="0" max="100" value={rules.surge_adjustment_percent} onChange={e => setRules({...rules, surge_adjustment_percent: Number(e.target.value)})} className="w-full border rounded-lg px-3 py-2 font-bold focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => setShowRulesModal(false)} className="px-5 py-2 font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleSaveGlobalRules} disabled={savingRules} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl shadow-md transition-colors">
                {savingRules ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
