"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function TuyaApiSettings() {
  const [accessId, setAccessId] = useState("");
  const [accessSecret, setAccessSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'tuya_api_keys')
      .single();

    if (data?.value) {
      setAccessId(data.value.accessId || "");
      setAccessSecret(data.value.accessSecret || "");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ text: "", type: "" });

    // ตรวจสอบว่ามีแถวนี้อยู่แล้วหรือยัง
    const { data: existingData } = await supabase
      .from('system_settings')
      .select('key')
      .eq('key', 'tuya_api_keys')
      .single();

    const payload = {
      accessId: accessId.trim(),
      accessSecret: accessSecret.trim()
    };

    let error;
    if (existingData) {
      const res = await supabase
        .from('system_settings')
        .update({ value: payload })
        .eq('key', 'tuya_api_keys');
      error = res.error;
    } else {
      const res = await supabase
        .from('system_settings')
        .insert({ key: 'tuya_api_keys', value: payload });
      error = res.error;
    }

    setSaving(false);
    if (error) {
      setMessage({ text: "บันทึกไม่สำเร็จ: " + error.message, type: "error" });
    } else {
      setMessage({ text: "บันทึกสำเร็จ ระบบจะใช้คีย์ใหม่ในการซิงค์ข้อมูลรอบถัดไปทันที", type: "success" });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50">
        <h2 className="text-xl font-bold text-slate-800">ตั้งค่า Tuya API Keys</h2>
        <p className="text-sm text-slate-500 mt-1">อัปเดต Access ID และ Secret เมื่อหมดอายุ (ทุก 25 วัน) โดยไม่ต้องแก้โค้ด</p>
      </div>
      
      <div className="p-6 space-y-4">
        {loading ? (
          <div className="text-center py-4 text-slate-500">กำลังโหลดข้อมูล...</div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Access ID / Client ID</label>
              <input
                type="text"
                value={accessId}
                onChange={(e) => setAccessId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow font-mono text-sm"
                placeholder="ex. ufwyd4cdwh7u4psn43pr"
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Access Secret / Client Secret</label>
              <input
                type="text"
                value={accessSecret}
                onChange={(e) => setAccessSecret(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow font-mono text-sm"
                placeholder="ex. 6ee85f3f3f254227a1f1b624e443b064"
              />
            </div>

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
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                  บันทึกคีย์ใหม่
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
