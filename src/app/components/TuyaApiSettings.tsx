"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import TuyaQuotaWidget from './TuyaQuotaWidget';

export default function TuyaApiSettings() {
  const [keys, setKeys] = useState([
    { accessId: "", accessSecret: "" },
    { accessId: "", accessSecret: "" },
    { accessId: "", accessSecret: "" }
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'tuya_api_keys')
      .single();

    if (data?.value) {
      if (Array.isArray(data.value.keys)) {
        // อัปเดต state ด้วยค่าที่มีในฐานข้อมูล (สูงสุด 3 ชุด)
        const loadedKeys = [...keys];
        data.value.keys.forEach((k: any, i: number) => {
          if (i < 3) {
            loadedKeys[i] = { accessId: k.accessId || "", accessSecret: k.accessSecret || "" };
          }
        });
        setKeys(loadedKeys);
      } else if (data.value.accessId) {
        // จัดการกรณีข้อมูลเก่าที่เป็นชุดเดียว
        const loadedKeys = [...keys];
        loadedKeys[0] = { accessId: data.value.accessId, accessSecret: data.value.accessSecret };
        setKeys(loadedKeys);
      }
    }
    setLoading(false);
  };

  const handleKeyChange = (index: number, field: "accessId" | "accessSecret", value: string) => {
    const newKeys = [...keys];
    newKeys[index][field] = value;
    setKeys(newKeys);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ text: "", type: "" });

    const payload = {
      keys: keys.map(k => ({
        accessId: k.accessId.trim(),
        accessSecret: k.accessSecret.trim()
      }))
    };

    const { data: existingData } = await supabase
      .from('system_settings')
      .select('key')
      .eq('key', 'tuya_api_keys')
      .single();

    let error;
    if (existingData) {
      const res = await supabase.from('system_settings').update({ value: payload }).eq('key', 'tuya_api_keys');
      error = res.error;
    } else {
      const res = await supabase.from('system_settings').insert({ key: 'tuya_api_keys', value: payload });
      error = res.error;
    }

    setSaving(false);
    if (error) {
      setMessage({ text: "บันทึกไม่สำเร็จ: " + error.message, type: "error" });
    } else {
      setMessage({ text: "บันทึกสำเร็จ ระบบจะจดจำและพยายามจับคู่อุปกรณ์ด้วยตำแหน่งคีย์เดิมเป็นอันดับแรกเสมอ เพื่อความรวดเร็ว หากไม่สำเร็จระบบถึงจะค้นหาให้ใหม่โดยอัตโนมัติ", type: "success" });
    }
  };

  return (
    <>
      <TuyaQuotaWidget />
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50">
        <h2 className="text-xl font-bold text-slate-800">ตั้งค่า Tuya API Keys (รองรับ 150 อุปกรณ์)</h2>
        <p className="text-sm text-slate-500 mt-1">ใส่คีย์ได้สูงสุด 3 บัญชี ระบบจะสุ่มสลับและจับคู่ให้อุปกรณ์โดยอัตโนมัติ (Auto-Discovery)</p>
      </div>
      
      <div className="p-6 space-y-6">
        {loading ? (
          <div className="text-center py-4 text-slate-500">กำลังโหลดข้อมูล...</div>
        ) : (
          <>
            {keys.map((key, index) => (
              <div key={index} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-3">บัญชีที่ {index + 1} (รองรับ 50 อุปกรณ์)</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Access ID / Client ID</label>
                    <input
                      type="text"
                      value={key.accessId}
                      onChange={(e) => handleKeyChange(index, "accessId", e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow font-mono text-sm"
                      placeholder="ex. ufwyd4cdwh7u4psn43pr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Access Secret</label>
                    <input
                      type="text"
                      value={key.accessSecret}
                      onChange={(e) => handleKeyChange(index, "accessSecret", e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow font-mono text-sm"
                      placeholder="ex. 6ee85f3f3f254227a1f1b624e443b064"
                    />
                  </div>
                </div>
              </div>
            ))}

            {message.text && (
              <div className={`p-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {message.text}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto bg-blue-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกคีย์ทั้ง 3 ชุด"}
            </button>
          </>
        )}
      </div>
    </div>
    </>
  );
}
