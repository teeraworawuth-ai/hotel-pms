"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { renderIcon } from "../components/RoomIcons";
import EnergyRangeChart from "./EnergyRangeChart";

interface GuestReportProps {
  dateOffset: number;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

// รายงานผู้เข้าพัก: การ์ดหน้าตาเหมือนหน้า Check-in (1 ใบ = 1 รอบเช็คอิน-เช็คเอาท์) คลิกเพื่อดูกราฟไฟฟ้า
export default function GuestReport({ dateOffset }: GuestReportProps) {
  const [cards, setCards] = useState<any[]>([]);
  const [dateStr, setDateStr] = useState<string>("");
  const [locationsOrder, setLocationsOrder] = useState<string[]>([]);
  const [roomIconsMap, setRoomIconsMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/audit/guests?dateOffset=${dateOffset}`, { cache: "no-store" });
        if (!res.ok) { setCards([]); return; }
        const json = await res.json();
        setCards(json.cards || []);
        setDateStr(json.dateStr || "");
        setLocationsOrder(json.locationsOrder || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateOffset]);

  useEffect(() => {
    supabase.from("system_settings").select("value").eq("key", "room_icons_map").maybeSingle().then(({ data }) => {
      if (data && data.value && typeof data.value === "object") {
        const parsed: Record<string, any> = { ...(data.value as any) };
        for (const k in parsed) if (typeof parsed[k] === "string") parsed[k] = [parsed[k]];
        setRoomIconsMap(parsed);
      }
    });
  }, []);

  // เหมือนหน้า Check-in: ไม่แสดงวันที่ถ้าตรงกับวันที่ของรายงาน
  const fmtDateRel = (iso: string) => {
    const d = new Date(iso);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return key === dateStr ? "" : `${d.getDate()}/${d.getMonth() + 1}`;
  };

  const grouped: Record<string, any[]> = {};
  cards.forEach(c => { (grouped[c.location] = grouped[c.location] || []).push(c); });
  const locations = Object.keys(grouped).sort((a, b) => {
    let ia = locationsOrder.indexOf(a); if (ia === -1) ia = 999;
    let ib = locationsOrder.indexOf(b); if (ib === -1) ib = 999;
    return ia - ib;
  });

  if (loading) return <div className="py-10 text-center text-slate-500">กำลังประมวลผลข้อมูล...</div>;

  if (cards.length === 0) return (
    <div className="py-20 text-center bg-white rounded-xl shadow-sm border border-slate-200">
      <h3 className="text-lg font-bold text-slate-700">ไม่มีประวัติผู้เข้าพักในวันนี้</h3>
    </div>
  );

  return (
    <div>
      {/* ตัวกรองสถานที่ เหมือนหน้า Check-in */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilter(null)}
          className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${filter === null ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          ทั้งหมด
        </button>
        {locations.map(loc => (
          <button
            key={loc}
            onClick={() => setFilter(loc)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${filter === loc ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {loc}
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {locations.filter(loc => !filter || loc === filter).map(loc => (
          <div key={loc} className="bg-slate-50/50 p-2 sm:p-6 rounded-2xl border border-slate-100">
            <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
              <span className="w-2 h-6 bg-slate-300 rounded-full"></span>
              {loc}
              <span className="text-sm font-normal text-slate-400">({grouped[loc].length} รอบ)</span>
            </h2>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1.5 sm:gap-2 lg:gap-2.5">
              {grouped[loc].map(c => {
                const icons = roomIconsMap[c.roomId];
                const inDate = fmtDateRel(c.checkIn);
                const outDate = fmtDateRel(c.checkOut);
                return (
                  <button
                    key={c.bookingId}
                    onClick={() => setSelected(c)}
                    className="relative aspect-[16/14] w-full flex items-center justify-center rounded-xl border-2 transition-all active:scale-95 group overflow-hidden bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200 hover:border-blue-400 shadow-sm"
                  >
                    {/* Left Section (Details) */}
                    <div className="absolute top-0.5 left-0 bottom-[14px] sm:bottom-[18px] w-[30%] flex flex-col justify-between items-start text-[7px] sm:text-[9.5px] leading-none font-semibold opacity-90 pl-0.5 py-0.5">
                      <div className="flex flex-col items-start gap-[1px] w-full">
                        <div className="text-slate-500 h-[8px] sm:h-[10px] flex items-center">
                          {inDate ? <>{inDate}</> : <span>&nbsp;</span>}
                        </div>
                        <div className="font-bold text-slate-700">{fmtTime(c.checkIn)}</div>
                      </div>

                      <div className="flex flex-row items-center gap-0 self-start -space-x-[3px] -ml-[2px]">
                        <div className="relative inline-flex items-center justify-center">
                          <span className="text-[9px] sm:text-[11.5px] leading-none opacity-40 grayscale">👤</span>
                          <span className="absolute top-[1.5px] w-full text-center text-[6.5px] sm:text-[8px] text-slate-900 font-black drop-shadow-sm">{c.guestCount}</span>
                        </div>
                        <div className="relative inline-flex items-center justify-center">
                          <span className="text-[9px] sm:text-[11.5px] leading-none opacity-40 grayscale">{c.isOvernight ? "🌙" : "⏳"}</span>
                          {c.isOvernight ? (
                            <span className="absolute top-[1px] right-[1px] text-[6.5px] sm:text-[8px] text-slate-900 font-black drop-shadow-sm">{c.nights}</span>
                          ) : (
                            <span className="absolute bottom-[1px] w-full text-center text-[6.5px] sm:text-[8px] text-slate-900 font-black drop-shadow-sm">{c.hours}</span>
                          )}
                        </div>
                      </div>

                      {/* เวลาเช็คเอาท์: ถ้าเช็คเอาท์แล้ว แสดงเวลาจริงเป็นสีส้มอมเหลือง */}
                      <div className="flex flex-col items-start gap-[1px] w-full">
                        <div className={`font-bold ${c.ended ? "text-amber-500" : "text-slate-700"}`}>{fmtTime(c.ended ? c.checkOut : c.scheduledOut)}</div>
                        <div className="text-slate-500 h-[8px] sm:h-[10px] flex items-center">
                          {(() => { const od = c.ended ? outDate : fmtDateRel(c.scheduledOut); return od ? <>{od}</> : <span>&nbsp;</span>; })()}
                        </div>
                      </div>
                    </div>

                    {/* Center Section (Room No & Price) */}
                    <div className="flex-1 w-full h-full flex flex-col items-center justify-start pt-[18px] sm:pt-6 pb-[14px] sm:pb-[18px]">
                      <div className="absolute top-0 text-[15px] sm:text-xl top-[1px] sm:top-1 font-black text-slate-700 leading-none flex items-center justify-center gap-0 mix-blend-multiply">
                        <span>{c.roomNo}</span>
                        <div className="flex items-center text-[13px] leading-none -space-x-1 -ml-0.5">
                          {icons && icons.length > 0 ? (
                            <span className="opacity-90 ml-[2px] drop-shadow-sm text-slate-700 flex items-center gap-[1px]">
                              {icons.map(id => <span key={id}>{renderIcon(id, "w-[13px] h-[16px] sm:w-[17px] sm:h-[20px]")}</span>)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-[11px] sm:text-xs font-bold text-slate-500 w-full z-20 flex flex-col items-center">
                        <div className="h-[11px] sm:h-[14px] flex items-center justify-center">
                          {c.price !== null && c.price !== undefined && (
                            <span className="opacity-40 text-[10px] sm:text-[13px] leading-none">{c.price}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ป้ายรอบ (เฉพาะห้องที่มีหลายรอบในวันเดียวกัน) */}
                    {c.totalRounds > 1 && (
                      <span className="absolute top-[2px] right-[3px] text-[7px] sm:text-[9px] font-black bg-white/80 text-slate-600 rounded px-[3px] leading-tight z-30">
                        รอบ {c.round}
                      </span>
                    )}

                    {/* แถบล่าง: ค่าไฟรวม */}
                    <div className="absolute bottom-0 left-0 right-0 w-full h-[14px] sm:h-[18px] flex items-center justify-center gap-0.5 sm:gap-1 text-[7px] sm:text-[9.5px] font-bold z-30 whitespace-nowrap bg-white/60 backdrop-blur-[1px] border-t border-slate-300/40 text-slate-500 tracking-tight overflow-hidden px-0.5">
                      <span>⚡{c.kwh}</span>
                      <span className="text-slate-300 font-bold">|</span>
                      <span className="text-rose-400">{c.cost}฿</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-slate-800">{selected.roomNo}</span>
                  <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">{selected.location}</span>
                  {selected.totalRounds > 1 && <span className="text-xs font-bold text-slate-500">รอบ {selected.round}/{selected.totalRounds}</span>}
                </div>
                <div className="text-sm text-slate-600">{selected.guestName}</div>
                <div className="text-xs text-slate-500 mt-1">
                  เช็คอิน {fmtTime(selected.checkIn)} - {selected.ended ? <>เช็คเอาท์ <span className="text-amber-600 font-bold">{fmtTime(selected.checkOut)}</span></> : "ยังพักอยู่"}
                  {" "}| ไฟวันนี้ {selected.kwh} kWh ({selected.cost}฿)
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>
            <EnergyRangeChart
              roomId={selected.roomId}
              startMs={new Date(selected.checkIn).getTime()}
              endMs={new Date(selected.checkOut).getTime()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
