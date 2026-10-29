"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { inferShiftLocation } from '@/lib/cashHandover';

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  pin: string;
  locations?: string[];
  primary_location?: string | null;
  can_clean?: boolean;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // ป้องกันปัญหา ChunkLoadError เมื่อเปิดหน้าเว็บค้างไว้ระหว่างที่มีการอัปเดตเวอร์ชันใหม่บน Vercel
    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const msg =
        (event as ErrorEvent)?.message ||
        String((event as PromiseRejectionEvent)?.reason?.message || (event as PromiseRejectionEvent)?.reason || '');
      if (
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module')
      ) {
        const lastReload = sessionStorage.getItem('chunk_reload_ts');
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 15000) {
          sessionStorage.setItem('chunk_reload_ts', String(now));
          window.location.reload();
        }
      }
    };
    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    try {
      const saved = localStorage.getItem('auth_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.role) {
          const normalizedRole = String(parsed.role).toLowerCase();
          const normalizedUser: AuthUser = { ...parsed, role: normalizedRole };
          setUser(normalizedUser);
          // ผู้ใช้งานระดับ staff / housekeeper เข้าได้เฉพาะหน้า Check-in
          if (
            (normalizedRole === 'staff' || normalizedRole === 'housekeeper') &&
            !window.location.pathname.startsWith('/checkin')
          ) {
            setLoading(false);
            window.location.replace('/checkin');
            return;
          }
        } else {
          localStorage.removeItem('auth_user');
        }
      }
    } catch (e) {
      localStorage.removeItem('auth_user');
    } finally {
      setLoading(false);
    }

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput.length !== 4) return;
    setLoading(true);
    setErrorMsg('');

    try {
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
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setErrorMsg('รหัส PIN ไม่ถูกต้อง');
        setPinInput('');
        setLoading(false);
      } else {
        const normalizedRole = String(data.role || 'staff').toLowerCase();
        let locations: string[] = [];
        let primary_location: string | null = null;
        if (normalizedRole === 'staff' || normalizedRole === 'housekeeper') {
          const [{ data: settings }, { data: primSettings }] = await Promise.all([
            supabase.from('system_settings').select('value').eq('key', 'staff_locations').maybeSingle(),
            supabase.from('system_settings').select('value').eq('key', 'staff_primary_locations').maybeSingle(),
          ]);
          if (settings && settings.value && settings.value[data.id]) {
            locations = settings.value[data.id];
          }
          const savedPrim = primSettings?.value?.[data.id];
          primary_location =
            (savedPrim && locations.includes(savedPrim) ? savedPrim : null) ||
            locations[0] ||
            inferShiftLocation(data.name, null, locations);
        }

        let can_clean = false;
        if (normalizedRole === 'staff') {
          const { data: hk } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'staff_housekeeping')
            .maybeSingle();
          can_clean = !!(hk && hk.value && hk.value[data.id]);
        }

        const authUser: AuthUser = { ...data, role: normalizedRole, locations, primary_location, can_clean };
        localStorage.setItem('auth_user', JSON.stringify(authUser));
        setUser(authUser);
        setLoading(false);
        if (authUser.role === 'staff' || authUser.role === 'housekeeper') {
          window.location.replace('/checkin');
        }
      }
    } catch (err) {
      setErrorMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
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
