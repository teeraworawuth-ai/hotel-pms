"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RoomTypePrice = {
  is_specific_room?: boolean;
  room_id?: string;
  room_no?: string;
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
    async function loadData() {
      setLoading(true);
      try {
        const { data: types } = await supabase.from('room_types').select('*').order('id');
        if (types) setRoomTypes(types);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function fetchData() {
    setLoading(true);
    
    // 1. Fetch rooms to group by type
    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select("id, room_no, room_type, price_night, price_temp");
      
    if (roomsError) {
      console.error("Error fetching rooms:", roomsError);
    } else if (roomsData) {
      const typeMap = new Map<string, RoomTypePrice>();
      const specificRooms: RoomTypePrice[] = [];
      
      roomsData.forEach(room => {
        const type = room.room_type || "เนเธกเนเธฃเธฐเธเธธ";
        
        if (type.includes("เธเธดเน€เธจเธฉ")) {
          specificRooms.push({
            is_specific_room: true,
            room_id: room.id,
            room_no: room.room_no,
            room_type: type.replace(",เธเธดเน€เธจเธฉ", ""),
            price_night: room.price_night || 0,
            price_temp: room.price_temp || 0,
            count: 1
          });
        } else {
          if (typeMap.has(type)) {
            typeMap.get(type)!.count += 1;
          } else {
            typeMap.set(type, {
              is_specific_room: false,
              room_type: type,
              price_night: room.price_night || 0,
              price_temp: room.price_temp || 0,
              count: 1
            });
          }
        }
      });
      
      setRoomTypes([...Array.from(typeMap.values()), ...specificRooms]);
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
    let error;

    if (type.is_specific_room && type.room_id) {
       const res = await supabase
         .from("rooms")
         .update({
           price_night: type.price_night,
           price_temp: type.price_temp
         })
         .eq("id", type.room_id);
       error = res.error;
    } else {
       const res = await supabase
         .from("rooms")
         .update({
           price_night: type.price_night,
           price_temp: type.price_temp
         })
         .eq("room_type", type.room_type);
       error = res.error;
    }
      
    if (error) {
      alert("Error saving prices: " + error.message);
    } else {
      if (type.is_specific_room) {
        alert(`เธเธฑเธเธ—เธถเธเธฃเธฒเธเธฒเธชเธณเธซเธฃเธฑเธเธซเนเธญเธ ${type.room_no} เน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง`);
      } else {
        alert(`เธเธฑเธเธ—เธถเธเธฃเธฒเธเธฒเธชเธณเธซเธฃเธฑเธเธซเนเธญเธเธเธฑเธเธเธฃเธฐเน€เธ เธ— "${type.room_type}" เน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง`);
      }
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
      alert("เธเธฑเธเธ—เธถเธเธเธเธฃเธฒเธเธฒเนเธเธฃเธเธฑเธเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง");
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-medium">เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ...</div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto p-4 animate-in fade-in duration-500 mb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-800 drop-shadow-sm flex items-center gap-3">
            <span className="text-blue-600">๐“</span> Smart Pricing
          </h1>
          <p className="text-slate-500 font-medium mt-1">เนเธเธเธเธงเธเธเธธเธกเธฃเธฒเธเธฒเธกเธฒเธ•เธฃเธเธฒเธ เนเธฅเธฐเธเธเธฃเธฒเธเธฒเนเธเธฃเธเธฑเธเธญเธฑเธเธเธฃเธดเธขเธฐ</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Section 1: Base Prices */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">๐ท๏ธ</div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 leading-none">เธ•เธฑเนเธเธฃเธฒเธเธฒเธกเธฒเธ•เธฃเธเธฒเธ (Base Price)</h2>
              <p className="text-xs text-slate-500 mt-1">เนเธขเธเธ•เธฒเธกเธเธฃเธฐเน€เธ เธ—เธซเนเธญเธเธเธฑเธ เธญเธฑเธเน€เธ”เธ•เธ—เธตเน€เธ”เธตเธขเธงเธ—เธฑเนเธเธเธฅเธธเนเธก</p>
            </div>
          </div>

          <div className="space-y-4">
            {roomTypes.map((type, idx) => (
              <div key={type.is_specific_room ? type.room_id : type.room_type} className={`p-4 rounded-2xl border ${type.is_specific_room ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'} flex flex-col gap-4`}>
                <div className="flex justify-between items-center">
                  <h3 className={`font-black text-lg flex items-center gap-2 ${type.is_specific_room ? 'text-rose-700' : 'text-slate-700'}`}>
                    {type.is_specific_room ? (
                      <><span>โญ</span> เธซเนเธญเธ {type.room_no} <span className="text-sm font-medium opacity-60">({type.room_type})</span></>
                    ) : (
                      type.room_type
                    )}
                  </h3>
                  <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                    {type.is_specific_room ? 'เธฃเธฒเธเธฒเน€เธเธเธฒเธฐเธซเนเธญเธ' : `${type.count} เธซเนเธญเธ`}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">เธฃเธฒเธเธฒเธเนเธฒเธเธเธทเธ (Overnight)</label>
                    <input 
                      type="number" 
                      value={type.price_night}
                      onChange={(e) => handlePriceChange(idx, 'price_night', Number(e.target.value))}
                      className={`w-full ${type.is_specific_room ? 'border-rose-300' : 'border-slate-300'} rounded-xl px-3 py-2 text-sm font-bold focus:ring-blue-500 focus:border-blue-500`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">เธฃเธฒเธเธฒเธเธฑเนเธงเธเธฃเธฒเธง (Short-stay)</label>
                    <input 
                      type="number" 
                      value={type.price_temp}
                      onChange={(e) => handlePriceChange(idx, 'price_temp', Number(e.target.value))}
                      className={`w-full ${type.is_specific_room ? 'border-rose-300' : 'border-slate-300'} rounded-xl px-3 py-2 text-sm font-bold focus:ring-blue-500 focus:border-blue-500`}
                    />
                  </div>
                </div>
                
                <button 
                  onClick={() => saveBasePrices(type)}
                  disabled={saving}
                  className="w-full mt-2 bg-slate-800 text-white font-bold py-2.5 rounded-xl hover:bg-slate-700 transition-colors text-sm"
                >
                  เธเธฑเธเธ—เธถเธเนเธเธ—เธตเนเธซเนเธญเธเธ—เธฑเนเธเธซเธกเธ”
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Dynamic Pricing Rules */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl">โก</div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 leading-none">เธเธเธฃเธฒเธเธฒเนเธเธฃเธเธฑเธ (Dynamic Rules)</h2>
              <p className="text-xs text-slate-500 mt-1">เธเธงเธเธฃเธฒเธเธฒเน€เธเธดเนเธกเธญเธฑเธ•เนเธเธกเธฑเธ•เธดเธ•เธฒเธกเธชเธ–เธฒเธเธเธฒเธฃเธ“เน</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Weekend Rule */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span>๐–๏ธ</span> เธงเธฑเธเธซเธขเธธเธ”เธชเธธเธ”เธชเธฑเธเธ”เธฒเธซเน (เธจเธธเธเธฃเน-เน€เธชเธฒเธฃเน)
              </label>
              <div className="flex items-center gap-3">
                <span className="text-slate-500 text-sm">เธเธงเธเน€เธเธดเนเธก</span>
                <input 
                  type="number" 
                  value={rules.weekend_surcharge}
                  onChange={(e) => setRules({...rules, weekend_surcharge: Number(e.target.value)})}
                  className="w-24 border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-blue-500"
                />
                <span className="text-slate-500 text-sm">เธเธฒเธ—/เธฃเธญเธ</span>
              </div>
            </div>

            <div className="h-px bg-slate-100"></div>

            {/* Holiday Rule */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span>๐</span> เธงเธฑเธเธซเธขเธธเธ”เน€เธ—เธจเธเธฒเธฅ (Holiday Mode)
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={rules.holiday_mode_active} onChange={(e) => setRules({...rules, holiday_mode_active: e.target.checked})} />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              <p className="text-xs text-slate-400">เน€เธเธดเธ”เน€เธกเธทเนเธญเธ–เธถเธเธเนเธงเธเน€เธ—เธจเธเธฒเธฅ เน€เธเนเธ เธเธตเนเธซเธกเน เธชเธเธเธฃเธฒเธเธ•เน</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-slate-500 text-sm">เธเธงเธเน€เธเธดเนเธก</span>
                <input 
                  type="number" 
                  disabled={!rules.holiday_mode_active}
                  value={rules.holiday_surcharge}
                  onChange={(e) => setRules({...rules, holiday_surcharge: Number(e.target.value)})}
                  className="w-24 border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-blue-500 disabled:opacity-50 disabled:bg-slate-100"
                />
                <span className="text-slate-500 text-sm">เธเธฒเธ—/เธฃเธญเธ</span>
              </div>
            </div>

            <div className="h-px bg-slate-100"></div>

            {/* Low Occupancy / Surge Rule */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span>๐”ฅ</span> เธซเนเธญเธเน€เธซเธฅเธทเธญเธเนเธญเธข (Surge Pricing)
              </label>
              <p className="text-xs text-slate-400">เนเธกเนเธฃเธงเธกเธเธณเธเธงเธ“เนเธฅเธฐเนเธเนเธเธฒเธเธเธฑเธเธซเนเธญเธเธเธฑเธเธเธฃเธฐเน€เธ เธ— "เธเนเธฒเธ"</p>
              
              <div className="flex flex-col gap-3 mt-2 bg-orange-50 p-4 rounded-xl border border-orange-100">
                <div className="flex items-center gap-3">
                  <span className="text-orange-700 text-sm font-medium w-32">เน€เธกเธทเนเธญเธงเนเธฒเธเน€เธซเธฅเธทเธญเธเนเธญเธขเธเธงเนเธฒ</span>
                  <input 
                    type="number" 
                    value={rules.low_occupancy_threshold_percent}
                    onChange={(e) => setRules({...rules, low_occupancy_threshold_percent: Number(e.target.value)})}
                    className="w-20 border-orange-200 rounded-lg px-3 py-1.5 text-sm font-bold text-orange-700 focus:ring-orange-500"
                  />
                  <span className="text-orange-700 text-sm font-medium">%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-orange-700 text-sm font-medium w-32">เนเธซเนเธเธงเธเธฃเธฒเธเธฒเน€เธเธดเนเธก</span>
                  <input 
                    type="number" 
                    value={rules.low_occupancy_surcharge}
                    onChange={(e) => setRules({...rules, low_occupancy_surcharge: Number(e.target.value)})}
                    className="w-24 border-orange-200 rounded-lg px-3 py-1.5 text-sm font-bold text-orange-700 focus:ring-orange-500"
                  />
                  <span className="text-orange-700 text-sm font-medium">เธเธฒเธ—</span>
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
                      เธขเธเน€เธฅเธดเธเธเธฒเธฃเธเธงเธเธฃเธฒเธเธฒเธซเนเธญเธเน€เธซเธฅเธทเธญเธเนเธญเธข เธซเธฒเธเน€เธงเธฅเธฒเธเธฑเธเธเธธเธเธฑเธเน€เธฅเธขเน€เธงเธฅเธฒเธ—เธตเนเธเธณเธซเธเธ” (เธเนเธญเธเธเธฑเธเธฅเธนเธเธเนเธฒ Walk-in เธ”เธถเธเธ–เธญเธขเธซเธเธต)
                    </span>
                    {rules.disable_surge_after_2130 && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-orange-700 font-bold">เน€เธงเธฅเธฒเธ—เธตเนเน€เธฃเธดเนเธกเธขเธเน€เธฅเธดเธ:</span>
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
              เธเธฑเธเธ—เธถเธเธเธเธฃเธฒเธเธฒเนเธเธฃเธเธฑเธเธ—เธฑเนเธเธซเธกเธ”
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

