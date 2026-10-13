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
  const allLocations = Array.from(new Set([...locationsOrder, ...Object.keys(grouped)])).filter(Boolean);
  const locations = allLocations.sort((a, b) => {
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
        {locations.filter(loc => !filter || loc === filter).map(loc => {
          const locCards = grouped[loc] || [];
          if (locCards.length === 0 && filter !== loc) return null;
          return (
            <div key={loc} className="bg-slate-50/50 p-2 sm:p-6 rounded-2xl border border-slate-100">
              <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="w-2 h-6 bg-slate-300 rounded-full"></span>
                {loc}
                <span className="text-sm font-normal text-slate-400">({locCards.length} รอบ)</span>
              </h2>
              {locCards.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm font-medium">ไม่มีประวัติผู้เข้าพักในโซนนี้</div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1.5 sm:gap-2 lg:gap-2.5">
                  {locCards.map(c => {
                const icons = roomIconsMap[c.roomId];
                const inDate = fmtDateRel(c.checkIn);
                const outDate = fmtDateRel(c.checkOut);
                return (
                  <button
                    key={c.cardKey || c.bookingId}
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

                    {/* ป้ายคืนที่ (กรณีพักมากกว่า 1 คืน) */}
                    {c.totalNights > 1 && (
                      <span className="absolute top-[2px] left-[3px] text-[7px] sm:text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-200 rounded px-[3px] leading-tight z-30">
                        คืน {c.nightNo}/{c.totalNights}
                      </span>
                    )}

                    {/* ป้ายรอบ (เฉพาะห้องที่มีหลายรอบในวันเดียวกัน) */}
                    {c.totalRounds > 1 && (
                      <span className="absolute top-[2px] right-[3px] text-[7px] sm:text-[9px] font-black bg-white/80 text-slate-600 rounded px-[3px] leading-tight z-30">
                        รอบ {c.round}
                      </span>
                    )}

                    {/* แถบล่าง: ค่าไฟรวมของรอบคืนนี้ */}
                    <div className="absolute bottom-0 left-0 right-0 w-full h-[14px] sm:h-[18px] flex items-center justify-center gap-0.5 sm:gap-1 text-[7px] sm:text-[9.5px] font-bold z-30 whitespace-nowrap bg-white/60 backdrop-blur-[1px] border-t border-slate-300/40 text-slate-500 tracking-tight overflow-hidden px-0.5">
                      <span>⚡{c.kwh}</span>
                      <span className="text-slate-300 font-bold">|</span>
                      <span className="text-rose-400">{c.cost}฿</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    })}
      </div>

      {selected && (() => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        const MAX_SPAN = 3 * DAY_MS;
        const stayStart = new Date(selected.checkIn).getTime();
        const stayEnd = new Date(selected.checkOut).getTime();
        const segStart = new Date(selected.segStart).getTime();
        const segEnd = new Date(selected.segEnd).getTime();

        let maxBoundStart: number;
        let maxBoundEnd: number;

        if (stayEnd - stayStart <= MAX_SPAN) {
          maxBoundStart = stayStart;
          maxBoundEnd = stayEnd;
        } else {
          let start = segStart - DAY_MS;
          let end = start + MAX_SPAN;
          if (start < stayStart) {
            start = stayStart;
            end = start + MAX_SPAN;
          } else if (end > stayEnd) {
            end = stayEnd;
            start = end - MAX_SPAN;
          }
          maxBoundStart = Math.max(stayStart, start);
          maxBoundEnd = Math.min(stayEnd, end);
        }

        const isMultiNight = selected.totalNights > 1;
        const fmtDt = (iso: string) =>
          `${new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${fmtTime(iso)}`;

        return (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-3 sm:p-4" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-5" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-slate-800">{selected.roomNo}</span>
                    <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">{selected.location}</span>
                    {isMultiNight && (
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-black">
                        คืนที่ {selected.nightNo}/{selected.totalNights}
                      </span>
                    )}
                    {selected.totalRounds > 1 && (
                      <span className="text-xs font-bold text-slate-500">
                        รอบ {selected.round}/{selected.totalRounds}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-slate-700 mt-0.5">{selected.guestName}</div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>เช็คอิน: {fmtDt(selected.checkIn)}</span>
                    <span>-</span>
                    <span>
                      {selected.ended ? (
                        <>เช็คเอาท์จริง: <span className="text-amber-600 font-bold">{fmtDt(selected.checkOut)}</span></>
                      ) : (
                        <span className="text-emerald-600 font-bold">ยังพักอยู่ (กำหนดออก: {fmtDt(selected.scheduledOut)})</span>
                      )}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold text-blue-700">
                      รอบคืนนี้: {fmtDt(selected.segStart)} - {fmtDt(selected.segEnd)} ({selected.kwh} kWh / {selected.cost}฿)
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
              </div>

              <EnergyRangeChart
                roomId={selected.roomId}
                startMs={segStart}
                endMs={segEnd}
                maxBoundStartMs={maxBoundStart}
                maxBoundEndMs={maxBoundEnd}
                focusStartMs={segStart}
                focusEndMs={segEnd}
                activeNightLabel={isMultiNight ? `คืนที่ ${selected.nightNo}/${selected.totalNights}` : 'รอบคืนนี้'}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
