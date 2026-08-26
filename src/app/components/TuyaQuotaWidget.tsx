"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function TuyaQuotaWidget() {
  const [quota, setQuota] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingReset, setIsEditingReset] = useState(false);
  const [resetDay, setResetDay] = useState(18);

  const fetchQuota = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'tuya_api_quota')
      .single();

    if (data && data.value) {
      setQuota(data.value);
      
      const lastResetDate = new Date(data.value.last_reset_date || new Date().toISOString());
      setResetDay(lastResetDate.getDate());
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQuota();
    // Auto refresh every 5 mins
    const intv = setInterval(fetchQuota, 5 * 60 * 1000);
    return () => clearInterval(intv);
  }, []);

  const handleSaveResetDay = async () => {
    if (!quota) return;
    setIsEditingReset(false);
    
    // adjust last_reset_date to match this day of the current month (or previous month if day hasn't passed yet)
    const now = new Date();
    let newResetDate = new Date(now.getFullYear(), now.getMonth(), resetDay, 0, 0, 0);
    if (now.getDate() < resetDay) {
       // It hasn't happened this month yet, so the last reset was last month
       newResetDate.setMonth(newResetDate.getMonth() - 1);
    }
    
    const newQuota = {
      ...quota,
      last_reset_date: newResetDate.toISOString(),
      // Optionally could reset calls_used_this_month if needed, but we'll leave it
    };
    
    await supabase.from('system_settings').update({ value: newQuota }).eq('key', 'tuya_api_quota');
    setQuota(newQuota);
  };

  if (loading && !quota) {
    return <div className="animate-pulse bg-slate-100 h-48 rounded-xl w-full"></div>;
  }

  if (!quota) return null;

  const totalQuota = 53909;
  const used = Number(quota.calls_used_this_month) || 0;
  const remaining = totalQuota - used;
  
  // Package math
  const keyStartDate = new Date(quota.key_start_date || new Date().toISOString());
  const now = new Date();
  
  const trialDays = 30;
    const extensionDays = 180;
    const totalDays = trialDays + extensionDays;
    const packageDaysUsed = Math.floor((now.getTime() - keyStartDate.getTime()) / (1000 * 3600 * 24));
    
    let currentPhase = "";
    let phaseDaysUsed = 0;
    let phaseTotalDays = 0;
    
    if (packageDaysUsed <= trialDays) {
       currentPhase = "ช่วงทดลองใช้ฟรี (1 เดือนแรก)";
       phaseDaysUsed = packageDaysUsed;
       phaseTotalDays = trialDays;
    } else if (packageDaysUsed <= totalDays) {
       currentPhase = "ช่วงขยายเวลา (6 เดือน)";
       phaseDaysUsed = packageDaysUsed - trialDays;
       phaseTotalDays = extensionDays;
    } else {
       currentPhase = "หมดอายุ (ครบ 7 เดือน)";
       phaseDaysUsed = extensionDays;
       phaseTotalDays = extensionDays;
    }
    
    const phaseDaysLeft = Math.max(0, phaseTotalDays - phaseDaysUsed);
    const phasePercent = Math.min(100, (phaseDaysUsed / phaseTotalDays) * 100);
    const totalDaysLeft = Math.max(0, totalDays - packageDaysUsed);

  // Monthly math
  const lastResetDate = new Date(quota.last_reset_date || new Date().toISOString());
  const monthDaysUsed = Math.floor((now.getTime() - lastResetDate.getTime()) / (1000 * 3600 * 24));
  
  // Expectation math: 120 devices polled every 5 mins. But currently maybe 19 devices.
  // Actually, because of Batching, it's 1 call per batch of 20.
  // 120 devices = 6 batches.
  // Polling every 5 mins = 12 times an hour = 288 times a day.
  // 288 * 6 = 1,728 calls / day.
  const dailyExpectedCalls120 = 1728; 
  const monthlyRemainingDaysExpected = Math.floor(remaining / dailyExpectedCalls120);

  const quotaPercent = Math.min(100, (used / totalQuota) * 100);
  
  let progressColor = "bg-emerald-500";
  if (quotaPercent > 75) progressColor = "bg-amber-400";
  if (quotaPercent > 90) progressColor = "bg-rose-500";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-6 font-sans">
      <div className="flex justify-between items-center mb-6">
         <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            📊 ระบบติดตามโควตา API (Tuya API Dashboard)
         </h3>
         <button onClick={fetchQuota} className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            รีเฟรช
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         
         {/* Package Lifetime */}
           <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 flex flex-col justify-between">
              <div>
                  <div className="flex items-center gap-2 mb-3">
                     <span className="text-xl">📅</span>
                     <h4 className="font-bold text-slate-700">อายุอีเมล (คีย์ Tuya)</h4>
                  </div>
                  
                  <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-between mb-4 mt-2">
                     <span>สถานะปัจจุบัน:</span>
                     <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md text-xs">{currentPhase}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm mb-1 mt-2 font-medium">
                     <span className="text-slate-500">ใช้มาแล้ว (รอบนี้): {phaseDaysUsed} วัน</span>
                     <span className="text-indigo-600 font-bold">เหลืออีก: {phaseDaysLeft} วัน</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                     <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${phasePercent}%` }}></div>
                  </div>
              </div>
              <p className="text-xs text-slate-400 mt-4 flex justify-between border-t border-slate-200 pt-3">
                 <span>รวมเหลือทั้งหมด: <strong className="text-slate-500">{totalDaysLeft} วัน</strong></span>
                 <span>เริ่ม: {keyStartDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit'})}</span>
              </p>
           </div>

           {/* Monthly Quota */}
         <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
            <div className="flex items-center justify-between mb-3">
               <div className="flex items-center gap-2">
                 <span className="text-xl">⚡</span>
                 <h4 className="font-bold text-slate-700">โควตารายเดือน</h4>
               </div>
               
               {isEditingReset ? (
                  <div className="flex items-center gap-1">
                     <span className="text-[10px] text-slate-500">รีเซ็ตทุกวันที่:</span>
                     <input type="number" min="1" max="31" value={resetDay} onChange={e => setResetDay(Number(e.target.value))} className="w-12 h-6 text-xs text-center border rounded" />
                     <button onClick={handleSaveResetDay} className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded">Save</button>
                  </div>
               ) : (
                  <div 
                     className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600 underline decoration-dotted"
                     onClick={() => setIsEditingReset(true)}
                  >
                     (รอบบิลตัดทุกวันที่ {resetDay})
                  </div>
               )}
            </div>
            
            <div className="flex justify-between text-sm mb-1 mt-4 font-medium">
               <span className="text-slate-500">ใช้ไปแล้ว: {used.toLocaleString()} ครั้ง</span>
               <span className="text-emerald-600 font-bold">เหลือ: {remaining.toLocaleString()} ครั้ง</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
               <div className={`${progressColor} h-2.5 rounded-full transition-all duration-1000`} style={{ width: `${quotaPercent}%` }}></div>
            </div>
            <div className="mt-3 bg-white border border-slate-200 rounded-lg p-2 flex justify-between items-center text-xs">
               <span className="text-slate-500 font-medium ml-1">หากมี 120 อุปกรณ์, ดึงทุก 5 นาที</span>
               <span className="bg-slate-100 px-2 py-1 rounded text-slate-700 font-bold shadow-sm">
                  ใช้ได้อีกประมาณ {monthlyRemainingDaysExpected} วัน
               </span>
            </div>
         </div>
      </div>
    </div>
  );
}
