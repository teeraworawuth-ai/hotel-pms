"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  pin: string;
  locations?: string[];
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('auth_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      // ผู้ทดสอบเข้าได้เฉพาะหน้า Check-in
      if (parsed.role === 'staff' && window.location.pathname !== '/checkin') {
        window.location.replace('/checkin');
        return;
      }
      setUser(parsed);
    }
    setLoading(false);
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput.length !== 4) return;
    setLoading(true);
    setErrorMsg('');
    
    // Master Key fallback
    if (pinInput === '9999') {
      const masterUser: AuthUser = { id: 'master', name: 'Master Admin', role: 'admin', pin: '9999' };
      localStorage.setItem('auth_user', JSON.stringify(masterUser));
      setUser(masterUser);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('staff')
      .select('id, name, role, pin')
      .eq('pin', pinInput)
      .single();

    if (error || !data) {
      setErrorMsg('รหัส PIN ไม่ถูกต้อง');
      setPinInput('');
      setLoading(false);
    } else {
      let locations: string[] = [];
      if (data.role === 'staff') {
        const { data: settings } = await supabase.from('system_settings').select('value').eq('key', 'staff_locations').maybeSingle();
        if (settings && settings.value && settings.value[data.id]) {
          locations = settings.value[data.id];
        }
      }

      const authUser: AuthUser = { ...data, locations };
      localStorage.setItem('auth_user', JSON.stringify(authUser));
      if (authUser.role === 'staff') {
        window.location.replace('/checkin');
        return;
      }
      setUser(authUser);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">กำลังตรวจสอบสิทธิ์...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-100">
            <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7z"></path></svg>
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-2">เข้าสู่ระบบ</h1>
          <p className="text-slate-500 mb-8 text-sm">Hotel PMS</p>
          
          <input 
            type="password"
            maxLength={4}
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
            className="w-full text-center tracking-[1em] text-4xl py-4 px-2 rounded-2xl border-2 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none mb-6 font-mono transition-all"
            placeholder="••••"
            autoFocus
          />
          
          {errorMsg && <p className="text-red-500 text-sm mb-6 font-bold">{errorMsg}</p>}
          
          <button 
            type="submit"
            disabled={pinInput.length !== 4}
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-md active:scale-[0.98]"
          >
            เข้าสู่ระบบ
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
