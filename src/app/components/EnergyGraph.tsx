"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Brush,
  Tooltip,
  ReferenceArea
} from "recharts";

interface EnergyGraphProps {
  roomId: string;
  dateOffset?: number;
}

export default function EnergyGraph({ roomId, dateOffset = 0 }: EnergyGraphProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const graphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, [roomId, dateOffset]);

  // ล็อกหน้าจอไม่ให้เลื่อนเมื่อเปิดกราฟขยาย
  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isFullScreen]);

  // ตรวจจับหน้าจอว่าเป็นแนวตั้งหรือไม่
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dateOffset);

      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
      
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      let endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);

      if (dateOffset === 0) {
        const now = new Date();
        if (now < endOfDay) {
          endOfDay = now;
        }
      }

      const { data: logData, error } = await supabase
        .from("energy_logs")
        .select("wattage, recorded_at")
        .eq("room_id", roomId)
        .gte("recorded_at", startOfDay.toISOString())
        .lte("recorded_at", endOfDay.toISOString())
        .order("recorded_at", { ascending: true });

      if (error) {
        console.error("Error fetching energy logs:", error);
        return;
      }

      const formattedData = (logData || []).map((log) => {
        const d = new Date(log.recorded_at);
        const wattVal = Number(log.wattage);
        return {
          time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
          fullTime: d.getTime(), // เก็บเวลาเต็มไว้คำนวณ
          watt: (log.wattage !== null && wattVal > 0) ? wattVal : null,
        };
      });

      // ถ้ามีข้อมูลน้อยกว่า 2 จุด Recharts อาจจะตีเส้นลำบาก
      // เราสามารถสร้างจุดเริ่มต้นหลอกๆ (0 watt) ได้ถ้าต้องการ แต่ในที่นี้จะปล่อยไปก่อน
      
      setData(formattedData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFullScreen = async () => {
    const nextState = !isFullScreen;
    setIsFullScreen(nextState);

    if (nextState) {
      try {
        if (window.innerWidth < 768 && document.documentElement.requestFullscreen) {
          // Wrap the element that needs fullscreen, or just use documentElement
          await document.documentElement.requestFullscreen();
          // Type casting for older browser support or specific TS settings
          const screenOrientation = (screen as any).orientation || (screen as any).mozOrientation || (screen as any).msOrientation;
          if (screenOrientation && screenOrientation.lock) {
            await screenOrientation.lock('landscape');
          }
        }
      } catch (err) {
        console.warn('Fullscreen/Landscape lock failed:', err);
      }
    } else {
      try {
        const screenOrientation = (screen as any).orientation || (screen as any).mozOrientation || (screen as any).msOrientation;
        if (screenOrientation && screenOrientation.unlock) {
          screenOrientation.unlock();
        }
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } catch (err) {
        console.warn('Exit fullscreen failed:', err);
      }
    }
  };

  const renderGraph = (height: number | string, showControls: boolean) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center text-slate-400 text-xs" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
          กำลังโหลดกราฟ...
        </div>
      );
    }

    if (!data || data.length === 0) {
      return (
        <div className="w-full flex items-center justify-center text-slate-400 text-sm" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
          ไม่มีข้อมูลการใช้ไฟ
        </div>
      );
    }

    let startIndex = 0; // Show all data by default

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dateOffset);
    const startOfDayMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0).getTime();
    
    // Ticks สำหรับกราฟเล็ก (เลขคี่ เริ่ม 7, 9, 11, ... ขอบคือ 06:45 และ 06:44 โชว์เป็น 7)
    // 06:45 (7), 09:00 (9), 11:00 (11), 13:00 (13), 15:00 (15), 17:00 (17), 19:00 (19), 21:00 (21), 23:00 (23), 01:00 (1), 03:00 (3), 05:00 (5), 06:44 (7)
    const smallTicks = [startOfDayMs];
    for (let h = 1; h <= 23; h++) {
      smallTicks.push(startOfDayMs + (h * 3600 + 15 * 60) * 1000);
    }
    smallTicks.push(startOfDayMs + 24 * 3600 * 1000 - 60000);
    
    // Ticks สำหรับกราฟขยาย (ทุก 10 นาที)
    const fullTicks = Array.from({ length: 145 }, (_, i) => startOfDayMs + i * 10 * 60 * 1000);
    // ปรับ tick สุดท้ายให้เป็น 06:44 พอดีแทน 06:45
    fullTicks[fullTicks.length - 1] = startOfDayMs + 24 * 3600 * 1000 - 60000;
    
    const ticksToUse = showControls ? fullTicks : smallTicks;

    // คำนวณช่วงเวลาที่อุปกรณ์ออฟไลน์ (ข้อมูลขาดหายเกิน 15 นาที)
    const offlinePeriods: {start: number, end: number}[] = [];
    if (data && data.length > 0) {
      for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];
        if (curr.fullTime - prev.fullTime > 10 * 60 * 1000) { // เกิน 10 นาทีถือว่าออฟไลน์
          offlinePeriods.push({ start: prev.fullTime, end: curr.fullTime });
        }
      }
      
      // ถ้าเป็นกราฟของวันนี้ และข้อมูลล่าสุดหยุดส่งเกิน 10 นาที
      if (dateOffset === 0) {
        const lastData = data[data.length - 1];
        const now = Date.now();
        if (now - lastData.fullTime > 10 * 60 * 1000) {
          offlinePeriods.push({ start: lastData.fullTime, end: Math.min(now, startOfDayMs + 24 * 3600 * 1000) });
        }
      }
    }

    const CustomTick = ({ x, y, payload }: any) => {
      const date = new Date(payload.value);
      const isStartOrEnd = payload.value === startOfDayMs || payload.value === (startOfDayMs + 24 * 3600 * 1000 - 60000);
      const isHour = date.getMinutes() === 0;
      const isOddHour = date.getHours() % 2 !== 0; // 9, 11, 13, 15, 17...
      
      if (isStartOrEnd) {
        return (
          <g>
            <line x1={x} y1={y} x2={x} y2={y + 6} stroke="#94a3b8" strokeWidth={1.5} />
            <text x={x} y={y + 20} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">
              7
            </text>
          </g>
        );
      } else if (isHour) {
        if (isOddHour) {
          const hour = date.getHours();
          const fSize = hour >= 10 ? 9.5 : 11;
          return (
            <g>
              <line x1={x} y1={y} x2={x} y2={y + 6} stroke="#94a3b8" strokeWidth={1.5} />
              <text x={x} y={y + 20} textAnchor="middle" fill="#94a3b8" fontSize={fSize} fontWeight="bold">
                {hour}
              </text>
            </g>
          );
        } else {
          // ชั่วโมงคู่ (even hour) โชว์แค่ขีดสั้นๆ ไม่โชว์ตัวเลขกันทับกัน
          return (
            <line x1={x} y1={y} x2={x} y2={y + 6} stroke="#94a3b8" strokeWidth={1.5} />
          );
        }
      } else {
        // ขีดเล็กสำหรับทุก 10 นาที
        return (
          <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#cbd5e1" strokeWidth={1} />
        );
      }
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        const timeStr = new Date(label).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
        return (
          <div className="bg-slate-900 text-white p-2 rounded-lg shadow-xl text-xs font-bold border border-slate-700">
            <p>{timeStr}</p>
            <p className="text-emerald-400 text-[14px] mt-1">{payload[0].value} W</p>
          </div>
        );
      }
      return null;
    };

    const maxWatt = Math.max(...data.map(d => d.watt), 100);
    const yAxisMax = Math.ceil(maxWatt / 200) * 200 + 200;

    return (
      <div className="w-full" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="fullTime"
              type="number"
              domain={[startOfDayMs, startOfDayMs + 24 * 3600 * 1000 - 60000]}
              ticks={ticksToUse}
              tick={<CustomTick />}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis 
              type="number"
              domain={[0, yAxisMax]}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}w`}
              orientation="left"
              width={65}
            />
            
            {offlinePeriods.map((period, idx) => (
              <ReferenceArea key={idx} x1={period.start} x2={period.end} fill="#cbd5e1" fillOpacity={0.6} />
            ))}
            
            <Tooltip content={<CustomTooltip />} />
            
            <Line 
              type="monotone" 
              dataKey="watt" 
              stroke="#6366f1" 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5, fill: '#4f46e5', stroke: '#c7d2fe', strokeWidth: 3 }}
              animationDuration={1500}
              connectNulls={false}
            />
            
            {showControls && data.length > 10 && (
              <Brush 
                dataKey="fullTime" 
                height={30} 
                stroke="#cbd5e1" 
                fill="#f8fafc"
                startIndex={startIndex}
                tickFormatter={(val) => new Date(val).getHours().toString()} 
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <>
      <div 
        ref={graphRef} 
        className="mt-4 relative group cursor-pointer"
        onClick={toggleFullScreen}
      >
        <div className="absolute inset-0 z-10 bg-black/0 group-hover:bg-indigo-500/5 transition-colors rounded-xl flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
            🔍 ขยายกราฟเต็มจอ
          </div>
        </div>
        {renderGraph(140, false)}
      </div>

      {isFullScreen && (
        <div 
          className={`fixed z-[100] bg-slate-900/95 backdrop-blur-sm flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden`}
          style={
            isPortrait
              ? {
                  top: '50%',
                  left: '50%',
                  width: '100vh',
                  height: '100vw',
                  transform: 'translate(-50%, -50%) rotate(90deg)',
                  transformOrigin: 'center center',
                }
              : {
                  inset: 0,
                  width: '100%',
                  height: '100%',
                }
          }
        >
          <div className="flex justify-between items-start md:items-center p-4 md:p-6 border-b border-white/10 bg-slate-900 shrink-0">
            <div className="pr-4">
              <h2 className="text-xl md:text-2xl font-black text-white leading-tight">กราฟการใช้ไฟ - ห้อง {roomId.substring(0,4)}...</h2>
              <p className="text-slate-400 text-xs md:text-sm mt-1">สามารถเลื่อนและซูมกราฟได้จากแถบด้านล่าง</p>
            </div>
            <button 
              onClick={toggleFullScreen}
              className="p-2 md:p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors flex items-center gap-2 shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              <span className="font-bold text-sm hidden md:inline">ปิด (Close)</span>
            </button>
          </div>
          
          <div className="flex-1 p-2 md:p-10 min-h-[400px] bg-slate-900 flex flex-col">
            <div className="w-full flex-1 bg-slate-800/50 p-2 md:p-6 rounded-2xl border border-white/5 relative min-h-[300px]">
              <div className="absolute inset-0 p-2 md:p-6 pb-12">
                {renderGraph('100%', true)}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
