"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RoomTypePrice = {
  room_type: string;
  price_night: number;
  price_temp: number;
  count: number;
};

export type PricingRules = {
  weekend_surcharge: number;
  holiday_surcharge: number;
  holiday_mode_active: boolean;
  low_occupancy_surcharge: number;
  low_occupancy_threshold_percent: number;
  disable_surge_after_2130: boolean;
  surge_disable_time: string;
};

export const DEFAULT_RULES: PricingRules = {
  weekend_surcharge: 100,
  holiday_surcharge: 200,
  holiday_mode_active: false,
  low_occupancy_surcharge: 100,
  low_occupancy_threshold_percent: 20,
  disable_surge_after_2130: true,
  surge_disable_time: "21:30",
};

export default function SmartPricingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomTypePrice[]>([]);
  const [rules, setRules] = useState<PricingRules>(DEFAULT_RULES);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    
    // 1. Fetch rooms to group by type
    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select("room_type, price_night, price_temp");
      
    if (roomsError) {
      console.error("Error fetching rooms:", roomsError);
    } else if (roomsData) {
      const typeMap = new Map<string, RoomTypePrice>();
      
      roomsData.forEach(room => {
        const type = room.room_type || "ไม่ระบุ";
        if (typeMap.has(type)) {
          typeMap.get(type)!.count += 1;
        } else {
          typeMap.set(type, {
            room_type: type,
            price_night: room.price_night || 0,
            price_temp: room.price_temp || 0,
            count: 1
          });
        }
      });
      
      setRoomTypes(Array.from(typeMap.values()));
    }

    // 2. Fetch Pricing Rules
    const { data: rulesData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "smart_pricing_rules")
      .single();
      
    if (rulesData && rulesData.value) {
      setRules({ ...DEFAULT_RULES, ...(rulesData.value as PricingRules) });
    }

    setLoading(false);
  }

  const handlePriceChange = (index: number, field: 'price_night' | 'price_temp', value: number) => {
    const newTypes = [...roomTypes];
    newTypes[index][field] = value;
    setRoomTypes(newTypes);
  };

  const saveBasePrices = async (type: RoomTypePrice) => {
    setSaving(true);
    const { error } = await supabase
      .from("rooms")
      .update({
        price_night: type.price_night,
        price_temp: type.price_temp
      })
      .eq("room_type", type.room_type);
      
    if (error) {
      alert("Error saving prices: " + error.message);
    } else {
      alert(`บันทึกราคาสำหรับห้องพักประเภท "${type.room_type}" เรียบร้อยแล้ว`);
    }
    setSaving(false);
  };

  const saveRules = async () => {
    setSaving(true);
    
    // Check if key exists
    const { data } = await supabase.from("system_settings").select("id").eq("key", "smart_pricing_rules").maybeSingle();
    
    let error;
    if (data) {
      const res = await supabase.from("system_settings").update({ value: rules }).eq("key", "smart_pricing_rules");
      error = res.error;
    } else {
      const res = await supabase.from("system_settings").insert({ key: "smart_pricing_rules", value: rules });
      error = res.error;
    }
    
    if (error) {
      alert("Error saving rules: " + error.message);
    } else {
      alert("บันทึกกฎราคาแปรผันเรียบร้อยแล้ว");
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-medium">กำลังโหลดข้อมูล...</div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto p-4 animate-in fade-in duration-500 mb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-800 drop-shadow-sm flex items-center gap-3">
            <span className="text-blue-600">📈</span> Smart Pricing
          </h1>
          <p className="text-slate-500 font-medium mt-1">แผงควบคุมราคามาตรฐาน และกฎราคาแปรผันอัจฉริยะ</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Section 1: Base Prices */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">🏷️</div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 leading-none">ตั้งราคามาตรฐาน (Base Price)</h2>
              <p className="text-xs text-slate-500 mt-1">แยกตามประเภทห้องพัก อัปเดตทีเดียวทั้งกลุ่ม</p>
            </div>
          </div>

          <div className="space-y-4">
            {roomTypes.map((type, idx) => (
              <div key={type.room_type} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-slate-700 text-lg">{type.room_type}</h3>
                  <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">{type.count} ห้อง</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">ราคาค้างคืน (Overnight)</label>
                    <input 
                      type="number" 
                      value={type.price_night}
                      onChange={(e) => handlePriceChange(idx, 'price_night', Number(e.target.value))}
                      className="w-full border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">ราคาชั่วคราว (Short-stay)</label>
                    <input 
                      type="number" 
                      value={type.price_temp}
                      onChange={(e) => handlePriceChange(idx, 'price_temp', Number(e.target.value))}
                      className="w-full border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <button 
                  onClick={() => saveBasePrices(type)}
                  disabled={saving}
                  className="w-full mt-2 bg-slate-800 text-white font-bold py-2.5 rounded-xl hover:bg-slate-700 transition-colors text-sm"
                >
                  บันทึกไปที่ห้องทั้งหมด
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Dynamic Pricing Rules */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl">⚡</div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 leading-none">กฎราคาแปรผัน (Dynamic Rules)</h2>
              <p className="text-xs text-slate-500 mt-1">บวกราคาเพิ่มอัตโนมัติตามสถานการณ์</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Weekend Rule */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span>🏖️</span> วันหยุดสุดสัปดาห์ (ศุกร์-เสาร์)
              </label>
              <div className="flex items-center gap-3">
                <span className="text-slate-500 text-sm">บวกเพิ่ม</span>
                <input 
                  type="number" 
                  value={rules.weekend_surcharge}
                  onChange={(e) => setRules({...rules, weekend_surcharge: Number(e.target.value)})}
                  className="w-24 border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-blue-500"
                />
                <span className="text-slate-500 text-sm">บาท/รอบ</span>
              </div>
            </div>

            <div className="h-px bg-slate-100"></div>

            {/* Holiday Rule */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span>🎉</span> วันหยุดเทศกาล (Holiday Mode)
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={rules.holiday_mode_active} onChange={(e) => setRules({...rules, holiday_mode_active: e.target.checked})} />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              <p className="text-xs text-slate-400">เปิดเมื่อถึงช่วงเทศกาล เช่น ปีใหม่ สงกรานต์</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-slate-500 text-sm">บวกเพิ่ม</span>
                <input 
                  type="number" 
                  disabled={!rules.holiday_mode_active}
                  value={rules.holiday_surcharge}
                  onChange={(e) => setRules({...rules, holiday_surcharge: Number(e.target.value)})}
                  className="w-24 border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-blue-500 disabled:opacity-50 disabled:bg-slate-100"
                />
                <span className="text-slate-500 text-sm">บาท/รอบ</span>
              </div>
            </div>

            <div className="h-px bg-slate-100"></div>

            {/* Low Occupancy / Surge Rule */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span>🔥</span> ห้องเหลือน้อย (Surge Pricing)
              </label>
              <p className="text-xs text-slate-400">ไม่รวมคำนวณและใช้งานกับห้องพักประเภท "บ้าน"</p>
              
              <div className="flex flex-col gap-3 mt-2 bg-orange-50 p-4 rounded-xl border border-orange-100">
                <div className="flex items-center gap-3">
                  <span className="text-orange-700 text-sm font-medium w-32">เมื่อว่างเหลือน้อยกว่า</span>
                  <input 
                    type="number" 
                    value={rules.low_occupancy_threshold_percent}
                    onChange={(e) => setRules({...rules, low_occupancy_threshold_percent: Number(e.target.value)})}
                    className="w-20 border-orange-200 rounded-lg px-3 py-1.5 text-sm font-bold text-orange-700 focus:ring-orange-500"
                  />
                  <span className="text-orange-700 text-sm font-medium">%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-orange-700 text-sm font-medium w-32">ให้บวกราคาเพิ่ม</span>
                  <input 
                    type="number" 
                    value={rules.low_occupancy_surcharge}
                    onChange={(e) => setRules({...rules, low_occupancy_surcharge: Number(e.target.value)})}
                    className="w-24 border-orange-200 rounded-lg px-3 py-1.5 text-sm font-bold text-orange-700 focus:ring-orange-500"
                  />
                  <span className="text-orange-700 text-sm font-medium">บาท</span>
                </div>
                
                <label className="flex items-start gap-2 mt-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={rules.disable_surge_after_2130}
                    onChange={(e) => setRules({...rules, disable_surge_after_2130: e.target.checked})}
                    className="mt-1.5 rounded text-orange-600 focus:ring-orange-500"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-orange-800 font-medium leading-tight">
                      ยกเลิกการบวกราคาห้องเหลือน้อย หากเวลาปัจจุบันเลยเวลาที่กำหนด (ป้องกันลูกค้า Walk-in ดึกถอยหนี)
                    </span>
                    {rules.disable_surge_after_2130 && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-orange-700 font-bold">เวลาที่เริ่มยกเลิก:</span>
                        <input 
                          type="time" 
                          value={rules.surge_disable_time || "21:30"}
                          onChange={(e) => setRules({...rules, surge_disable_time: e.target.value})}
                          className="border-orange-200 rounded-md px-2 py-1 text-sm font-bold text-orange-700 focus:ring-orange-500"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

          </div>

          <div className="mt-auto pt-6 border-t border-slate-100">
            <button 
              onClick={saveRules}
              disabled={saving}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 text-base"
            >
              บันทึกกฎราคาแปรผันทั้งหมด
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
