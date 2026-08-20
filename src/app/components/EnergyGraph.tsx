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
  Tooltip,
  ReferenceArea
} from "recharts";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface EnergyGraphProps {
  roomId: string;
  dateOffset?: number;
}

export default function EnergyGraph({ roomId, dateOffset = 0 }: EnergyGraphProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [expandedOffset, setExpandedOffset] = useState(0); // 0 = today, -1 = yesterday, max -3
  const graphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData(expandedOffset);
  }, [roomId, dateOffset, expandedOffset, isFullScreen]);

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

  const fetchData = async (currentExpandedOffset: number) => {
    try {
      setLoading(true);

      const targetDate = new Date();
      // Combine the main page offset with the modal's offset
      const totalOffset = isFullScreen ? dateOffset + currentExpandedOffset : dateOffset;
      targetDate.setDate(targetDate.getDate() + totalOffset);

      // วันเริ่มต้น
      const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
      
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      let endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);

      if (totalOffset === 0) {
        const now = new Date();
        if (now < endOfDay) {
          endOfDay = now;
        }
      }

      const { data: logData, error } = await supabase
        .from("energy_logs")
        .select("wattage, recorded_at")
        .eq("room_id", roomId)
        .gte("recorded_at", startOfRange.toISOString())
        .lte("recorded_at", endOfDay.toISOString())
        .order("recorded_at", { ascending: true });

      if (error) {
        console.error("Error fetching energy logs:", error);
        return;
      }

      let formattedData = (logData || []).map((log) => {
        const d = new Date(log.recorded_at);
        const wattVal = Number(log.wattage);
        return {
          time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
          fullTime: d.getTime(), 
          watt: (log.wattage !== null && wattVal > 0) ? wattVal : null,
        };
      });

      formattedData = formattedData.map((point, i, arr) => {
        if (point.watt === null) return point;
        let hasNeighbor = false;
        for (let j = i - 1; j >= 0; j--) {
          const neighbor = arr[j];
          if (point.fullTime - neighbor.fullTime > 360000) break;
          if (neighbor.watt !== null && neighbor.watt > 0) {
            hasNeighbor = true;
            break;
          }
        }
        if (!hasNeighbor) {
          for (let j = i + 1; j < arr.length; j++) {
            const neighbor = arr[j];
            if (neighbor.fullTime - point.fullTime > 360000) break;
            if (neighbor.watt !== null && neighbor.watt > 0) {
              hasNeighbor = true;
              break;
            }
          }
        }
        if (!hasNeighbor) {
          return { ...point, watt: null };
        }
        return point;
      });
      
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
          await document.documentElement.requestFullscreen();
          const screenOrientation = (screen as any).orientation || (screen as any).mozOrientation || (screen as any).msOrientation;
          if (screenOrientation && screenOrientation.lock) {
            await screenOrientation.lock('landscape').catch(() => {});
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
          await document.exitFullscreen().catch(() => {});
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

    const targetDate = new Date();
    const totalOffset = showControls ? dateOffset + expandedOffset : dateOffset;
    targetDate.setDate(targetDate.getDate() + totalOffset);
    
    const startOfDayMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0).getTime();
    const graphStartMs = startOfDayMs;
    const graphEndMs = startOfDayMs + 24 * 3600 * 1000 - 60000;

    const smallTicks = [startOfDayMs];
    for (let h = 1; h <= 23; h++) {
      smallTicks.push(startOfDayMs + (h * 3600 + 15 * 60) * 1000);
    }
    smallTicks.push(startOfDayMs + 24 * 3600 * 1000 - 60000);

    const offlinePeriods: {start: number, end: number}[] = [];
    if (data && data.length > 0) {
      for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];
        if (curr.fullTime - prev.fullTime > 10 * 60 * 1000) { 
          offlinePeriods.push({ start: prev.fullTime, end: curr.fullTime });
        }
      }
      
      if (totalOffset === 0) {
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
      const isOddHour = date.getHours() % 2 !== 0; 
      
      if (isStartOrEnd) {
        return (
          <g>
            <line x1={x} y1={y} x2={x} y2={y + 6} stroke="#94a3b8" strokeWidth={1.5} />
            <text x={x} y={y + 15} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">
              7
            </text>
          </g>
        );
      } else if (isHour) {
        if (isOddHour || showControls) {
          const hour = date.getHours();
          const fSize = hour >= 10 ? 9.5 : 11;
          return (
            <g>
              <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#cbd5e1" strokeWidth={1} />
              <text x={x} y={y + 15} textAnchor="middle" fill="#cbd5e1" fontSize={showControls ? 11 : fSize}>
                {hour}
              </text>
            </g>
          );
        }
      }
      return null;
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        const d = new Date(label);
        const dateStr = d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
        const timeStr = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
        return (
          <div className="bg-slate-900 text-white p-2 rounded-lg shadow-xl text-xs font-bold border border-slate-700">
            <p className="text-slate-400">{dateStr}</p>
            <p>{timeStr}</p>
            <p className="text-emerald-400 text-[14px] mt-1">{payload[0].value} W</p>
          </div>
        );
      }
      return null;
    };

    const maxWatt = Math.max(...data.map(d => d.watt || 0), 100);
    const yAxisMax = Math.ceil(maxWatt / 200) * 200 + 200;

    // คำนวณช่วงของวันนี้เพื่อใส่ Background Date
    let backgroundLabel = "";
    if (showControls) {
      const isToday = totalOffset === 0;
      backgroundLabel = targetDate.toLocaleDateString("th-TH", { day: "numeric", month: "long" }) + (isToday ? " (วันนี้)" : "");
    }

    return (
      <div className="w-full" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -5, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            
            <XAxis 
              dataKey="fullTime"
              type="number"
              domain={[graphStartMs, graphEndMs]}
              ticks={smallTicks}
              tick={<CustomTick />}
              tickLine={false}
              axisLine={false}
              interval={0}
              minTickGap={10}
              tickMargin={12}
            />
            <YAxis 
              type="number"
              domain={[0, yAxisMax]}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}w`}
              orientation="left"
              width={40}
            />
            
            {offlinePeriods.map((period, idx) => (
              <ReferenceArea key={idx} x1={period.start} x2={period.end} fill="#e2e8f0" fillOpacity={0.7} />
            ))}

            {showControls && (
              <text 
                x="50%" 
                y="50%" 
                textAnchor="middle" 
                fill="#cbd5e1" 
                fontSize={48} 
                fontWeight="bold" 
                opacity={0.5}
              >
                {backgroundLabel}
              </text>
            )}

            <Tooltip content={<CustomTooltip />} />
            
            <Line 
              type="monotone" 
              dataKey="watt" 
              stroke="#6366f1" 
              strokeWidth={showControls ? 2 : 3}
              dot={false}
              activeDot={{ r: 5, fill: '#4f46e5', stroke: '#c7d2fe', strokeWidth: 3 }}
              animationDuration={1000}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <>
      <div 
        ref={graphRef} 
        className="mt-2 relative group cursor-pointer"
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
        <div className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden h-[100dvh] w-full">
          <div className="flex justify-between items-start md:items-center p-4 md:p-6 border-b border-slate-200 bg-white shrink-0 shadow-sm">
            <div className="pr-4">
              <h2 className="text-xl md:text-2xl font-black text-slate-800 leading-tight">กราฟการใช้ไฟ - ห้อง {roomId.substring(0,4)}...</h2>
              <p className="text-slate-500 text-xs md:text-sm mt-1">ใช้สองนิ้วซูมเข้า-ออก เพื่อดูความละเอียดระดับนาที</p>
            </div>
            <button 
              onClick={toggleFullScreen}
              className="p-2 md:p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors flex items-center gap-2 shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              <span className="font-bold text-sm hidden md:inline">ปิด (Close)</span>
            </button>
          </div>
          
          <div className="flex-1 p-2 pb-6 md:p-6 md:pb-8 min-h-[300px] bg-slate-50 flex flex-col relative overflow-hidden">
             {/* Navigation controls */}
             <div className="flex justify-between items-center mb-3 md:mb-4 px-2 shrink-0">
                <button 
                  onClick={() => setExpandedOffset(Math.max(-3, expandedOffset - 1))}
                  disabled={expandedOffset === -3}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:bg-slate-50 text-slate-700 font-bold rounded-lg text-sm transition-colors shadow-sm"
                >
                  &laquo; ย้อนกลับ 1 วัน
                </button>
                <div className="text-slate-700 font-bold bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm shadow-sm">
                  {(() => {
                    const d = new Date();
                    d.setDate(d.getDate() + dateOffset + expandedOffset);
                    const isToday = (dateOffset + expandedOffset) === 0;
                    return d.toLocaleDateString("th-TH", { day: "numeric", month: "long" }) + (isToday ? " (วันนี้)" : "");
                  })()}
                </div>
                <button 
                  onClick={() => setExpandedOffset(Math.min(0, expandedOffset + 1))}
                  disabled={expandedOffset === 0}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:bg-slate-50 text-slate-700 font-bold rounded-lg text-sm transition-colors shadow-sm"
                >
                  ถัดไป 1 วัน &raquo;
                </button>
             </div>

             <div className="w-full flex-1 bg-white rounded-2xl border border-slate-200 relative z-10 overflow-hidden shadow-sm">
                <TransformWrapper 
                   initialScale={1}
                   minScale={1}
                   maxScale={15}
                   centerOnInit={false}
                   wheel={{ step: 0.2 }}
                   panning={{ lockAxisX: false, lockAxisY: true }}
                >
                   <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%" }}>
                      <div className="w-full h-full p-2 pb-8 md:p-6 md:pb-12 min-w-full relative">
                        {renderGraph('100%', true)}
                      </div>
                   </TransformComponent>
                </TransformWrapper>
             </div>
          </div>
        </div>
      )}
    </>
  );
}
