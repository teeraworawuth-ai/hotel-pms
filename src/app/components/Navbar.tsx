"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import ShiftManager from "./ShiftManager";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/audit", label: "Audit & รายงาน" },
  { href: "/activity-log", label: "Log (30 วัน)" },
  { href: "/energy", label: "Energy" },
  { href: "/bookings", label: "Booking" },
  { href: "/checkin", label: "Check-in" },
  { href: "/smart-pricing", label: "Smart Pricing" },
  { href: "/settings", label: "Settings" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('auth_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.role) {
          setUserRole(String(parsed.role).toLowerCase());
        }
      } catch (e) {}
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('auth_user');
    window.location.href = '/';
  };

  // สำหรับผู้ใช้ระดับต่ำกว่า Admin/Manager เมื่ออยู่ในหน้า /checkin ให้ซ่อน Navbar ด้านบนทั้งหมด
  // เพื่อประหยัดพื้นที่ โดยมีแถบ กะ/วันที่/Logout รวมอยู่ที่หัวตารางในหน้า Check-in แล้ว
  if (mounted && pathname === '/checkin' && userRole && userRole !== 'admin' && userRole !== 'manager') {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/20">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-11 sm:h-14">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link
              href="/"
              className="text-base sm:text-xl font-bold text-slate-800 flex items-center"
              onClick={() => setIsOpen(false)}
            >
              ⚡ Hotel PMS <span className="ml-1.5 sm:ml-2 px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] sm:text-[10px] font-black tracking-widest leading-none">v3.4</span>
            </Link>
          </div>

          {/* Desktop Menu */}
          <nav className="hidden md:flex space-x-5 text-sm">
            {navLinks.filter(link => userRole !== "staff" || link.href === "/checkin").map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-medium transition-colors ${
                    isActive
                      ? "text-blue-600 border-b-2 border-blue-600"
                      : "text-slate-600 hover:text-blue-600"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          
          <div className="hidden md:flex items-center ml-auto">
            {userRole !== "staff" && <ShiftManager />}
            <button onClick={handleLogout} className="text-red-600 font-bold text-xs ml-3 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50/60 hover:bg-red-100 transition-colors">🚪 Logout</button>
          </div>

          {/* Mobile Menu & Quick Logout Button */}
          <div className="md:hidden flex items-center gap-1.5">
            <button
              onClick={handleLogout}
              className="px-2 py-1 rounded-md text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
              title="ออกจากระบบ"
            >
              🚪 ออก
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-slate-600 hover:text-slate-800 p-1.5 rounded-md focus:outline-none border border-slate-200 bg-white/80"
              aria-label="Toggle menu"
            >
              {isOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {isOpen && (
        <div className="md:hidden border-t border-white/20 bg-white/95 backdrop-blur-sm shadow-lg">
          <nav className="flex flex-col px-4 py-3 space-y-1">
            {navLinks.filter(link => userRole !== "staff" || link.href === "/checkin").map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`block px-3 py-2 rounded-md font-medium text-sm ${
                    isActive
                      ? "text-blue-600 bg-blue-50 font-bold"
                      : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            
            <div className="pt-3 pb-2 border-t border-slate-200 mt-2 space-y-2">
              <div className="px-1">
                <ShiftManager />
              </div>
              <button
                onClick={handleLogout}
                className="w-full py-2 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                🚪 ออกจากระบบ (Logout)
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
