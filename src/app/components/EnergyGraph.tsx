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

interface EnergyGraphProps {
  roomId: string;
  dateOffset?: number;
}

export default function EnergyGraph({ roomId, dateOffset = 0 }: EnergyGraphProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [expandedOffset, setExpandedOffset] = useState(0); // 0 = today, -1 = yesterday, max -3
  
  // Zoom State
  const [zoomLevel, setZoomLevel] = useState(0); // 0 to 4
  const zoomWidths = ['100%', '200%', '400%', '1200%', '4800%'];
  const zoomIntervalMins = [60, 30, 15, 5, 1]; // 0=60m, 1=30m, 2=15m, 3=5m, 4=1m

  const graphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData(expandedOffset);
  }, [roomId, dateOffset, expandedOffset, isFullScreen]);

  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      setZoomLevel(0); // Reset zoom on close
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isFullScreen]);

  const fetchData = async (currentExpandedOffset: number) => {
    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dateOffset + currentExpandedOffset);
      
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
      let endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);
      
      let query = supabase
        .from('electricity_tracking')
        .select('created_at, watt')
        .eq('room_id', roomId)
        .gte('created_at', startOfDay.toISOString())
        .lt('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: true });
        
      if (!isFullScreen) {
         query = query.limit(500);
      }

      const { data: rawData, error } = await query;
      if (error) throw error;

      let processedData: any[] = [];
      if (rawData && rawData.length > 0) {
         processedData = rawData.map(d => ({
           fullTime: new Date(d.created_at).getTime(),
           watt: d.watt,
           rawTime: new Date(d.created_at)
         }));
      }

      setData(processedData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleFullScreen = () => {
    if (!isFullScreen) {
      setExpandedOffset(0);
      setZoomLevel(0);
    }
    setIsFullScreen(!isFullScreen);
  };

  const CustomTick = (props: any) => {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    const date = new Date(payload.value);
    const timeStr = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={15} dy={0} textAnchor="middle" fill="#94a3b8" fontSize={10} className="font-medium">
          {timeStr}
        </text>
      </g>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(label);
      return (
        <div className="bg-slate-800 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-sm">
          <p className="font-bold mb-1 text-slate-300">
            {date.toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit' })} น.
          </p>
          <p className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
            <span className="font-black text-lg">{payload[0].value}</span> 
            <span className="text-slate-400">วัตต์</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const renderGraph = (baseHeight: number | string, isExpanded: boolean) => {
    if (loading) {
      return (
        <div className="w-full bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100" style={{ height: typeof baseHeight === 'number' ? `${baseHeight}px` : baseHeight }}>
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
            <p className="text-slate-400 font-medium text-sm">กำลังโหลดกราฟ...</p>
          </div>
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="w-full bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100" style={{ height: typeof baseHeight === 'number' ? `${baseHeight}px` : baseHeight }}>
          <p className="text-slate-400 font-medium text-sm flex flex-col items-center gap-2">
            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
            ไม่มีข้อมูลการใช้ไฟ
          </p>
        </div>
      );
    }

    const maxWatt = Math.max(...data.map(d => d.watt), 0);
    const yAxisMax = Math.max(1000, Math.ceil(maxWatt / 500) * 500);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dateOffset + expandedOffset);
    
    const startOfDayMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0).getTime();
    const graphStartMs = startOfDayMs;
    const graphEndMs = startOfDayMs + 24 * 3600 * 1000 - 60000;

    const currentZoom = isExpanded ? zoomLevel : 0;
    const tickIntervalMin = zoomIntervalMins[currentZoom];
    const chartWidth = isExpanded ? zoomWidths[currentZoom] : '100%';
    
    const smallTicks = [];
    const firstTickMs = startOfDayMs + 15 * 60 * 1000; // start at 07:00
    for (let m = 0; m <= 24 * 60; m += tickIntervalMin) {
      const t = firstTickMs + m * 60 * 1000;
      if (t <= graphEndMs) {
        smallTicks.push(t);
      }
    }
    smallTicks.push(graphEndMs);

    const offlinePeriods: {start: number, end: number}[] = [];
    if (data && data.length > 0) {
      for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];
        const diff = curr.fullTime - prev.fullTime;
        if (diff > 15 * 60 * 1000) {
          offlinePeriods.push({ start: prev.fullTime, end: curr.fullTime });
        }
      }
      const now = new Date().getTime();
      const lastPoint = data[data.length - 1];
      const isViewingToday = (dateOffset + expandedOffset) === 0;
      if (isViewingToday && now > lastPoint.fullTime && (now - lastPoint.fullTime > 15 * 60 * 1000)) {
        offlinePeriods.push({ start: lastPoint.fullTime, end: now });
      }
    }

    let backgroundLabel = "ไม่มีข้อมูล";
    const now = new Date().getTime();
    const isToday = (dateOffset + expandedOffset) === 0;
    
    if (data.length > 0) {
      const lastPoint = data[data.length - 1];
      if (isToday) {
        if (now - lastPoint.fullTime > 15 * 60 * 1000) backgroundLabel = "ออฟไลน์";
        else backgroundLabel = lastPoint.watt > 0 ? "กำลังใช้งาน" : "สแตนด์บาย";
      } else {
        backgroundLabel = "ออฟไลน์"; 
      }
    }

    const showControls = !loading && data.length > 0 && !isExpanded;

    return (
      <div style={{ width: chartWidth, height: typeof baseHeight === 'number' ? `${baseHeight}px` : baseHeight, minWidth: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            
            <XAxis 
              dataKey="fullTime"
              type="number"
              domain={[graphStartMs, graphEndMs]}
              ticks={smallTicks}
              tick={<CustomTick />}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis 
              type="number"
              domain={[0, yAxisMax]}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}w`}
              orientation="left"
              width={45}
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

  // Touch handlers for pinch to zoom
  const touchState = useRef({ startDist: 0 });
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      touchState.current.startDist = dist;
    }
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchState.current.startDist > 0) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const diff = dist - touchState.current.startDist;
      
      if (diff > 50) { // Pinch out -> Zoom IN
        setZoomLevel(prev => Math.min(4, prev + 1));
        touchState.current.startDist = dist; // reset for next step
      } else if (diff < -50) { // Pinch in -> Zoom OUT
        setZoomLevel(prev => Math.max(0, prev - 1));
        touchState.current.startDist = dist;
      }
    }
  };
  
  const handleTouchEnd = () => {
    touchState.current.startDist = 0;
  };

  // Mouse pan handlers for desktop
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    startX.current = e.pageX - (scrollContainerRef.current?.offsetLeft || 0);
    scrollLeft.current = scrollContainerRef.current?.scrollLeft || 0;
  };
  
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - (scrollContainerRef.current?.offsetLeft || 0);
    const walk = (x - startX.current) * 2; // scroll speed multiplier
    if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };
  
  const onMouseUp = (e: React.MouseEvent) => {
    if (isDragging.current) {
      const x = e.pageX - (scrollContainerRef.current?.offsetLeft || 0);
      const walk = Math.abs(x - startX.current);
      if (walk < 5 && e.button === 0) { // If didn't drag much, it's a click!
        setZoomLevel(prev => Math.min(4, prev + 1));
      }
    }
    isDragging.current = false;
  };

  const onMouseLeave = () => {
    isDragging.current = false;
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setZoomLevel(prev => Math.max(0, prev - 1));
  };

  return (
    <>
      {isFullScreen && (
        <style dangerouslySetInnerHTML={{__html: `
          .graph-modal-locked {
            position: fixed;
            z-index: 100;
            background-color: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(4px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          }
          
          /* ถ้ามือถือถือในแนวตั้ง บังคับหมุน 90 องศาให้เต็มจอ */
          @media (orientation: portrait) {
            .graph-modal-locked {
              top: 50%;
              left: 50%;
              width: 100vh;
              height: 100vw;
              transform: translate(-50%, -50%) rotate(90deg);
              transform-origin: center center;
            }
          }

          /* ถ้ามือถือถือในแนวนอนอยู่แล้ว ให้แสดงเต็มจอปกติ */
          @media (orientation: landscape) {
            .graph-modal-locked {
              inset: 0;
              width: 100vw;
              height: 100vh;
              transform: none;
            }
          }
          
          .no-scrollbar::-webkit-scrollbar {
             display: none;
          }
          .no-scrollbar {
             -ms-overflow-style: none;
             scrollbar-width: none;
          }
        `}} />
      )}

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
        <div className="graph-modal-locked">
          <div className="flex justify-between items-start md:items-center p-4 md:p-6 border-b border-slate-200 bg-white shrink-0 shadow-sm">
            <div className="pr-4">
              <h2 className="text-xl md:text-2xl font-black text-slate-800 leading-tight">กราฟการใช้ไฟ - ห้อง {roomId.substring(0,4)}...</h2>
              <p className="text-slate-500 text-xs md:text-sm mt-1">คลิกซ้าย/ถ่างนิ้ว เพื่อซูมเข้า (ระดับ {zoomLevel}/4) • คลิกขวา/หุบนิ้ว เพื่อซูมออก</p>
            </div>
            <button 
              onClick={toggleFullScreen}
              className="p-2 md:p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors flex items-center gap-2 shrink-0 z-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              <span className="font-bold text-sm hidden md:inline">ปิด (Close)</span>
            </button>
          </div>
          
          <div className="flex-1 p-2 pb-6 md:p-6 md:pb-8 min-h-[300px] bg-slate-50 flex flex-col relative overflow-hidden">
             {/* Navigation controls */}
             <div className="flex justify-between items-center mb-3 md:mb-4 px-2 shrink-0">
                <button 
                  onClick={() => { setExpandedOffset(Math.max(-3, expandedOffset - 1)); setZoomLevel(0); }}
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
                  onClick={() => { setExpandedOffset(Math.min(0, expandedOffset + 1)); setZoomLevel(0); }}
                  disabled={expandedOffset === 0}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:bg-slate-50 text-slate-700 font-bold rounded-lg text-sm transition-colors shadow-sm"
                >
                  ถัดไป 1 วัน &raquo;
                </button>
             </div>

             <div className="w-full flex-1 bg-white rounded-2xl border border-slate-200 relative z-10 overflow-hidden shadow-sm">
                <div 
                  ref={scrollContainerRef}
                  className="w-full h-full overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing no-scrollbar"
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseLeave={onMouseLeave}
                  onContextMenu={onContextMenu}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div className="h-full p-2 pb-8 md:p-6 md:pb-12 relative min-w-full inline-block">
                    {renderGraph('100%', true)}
                  </div>
                </div>
             </div>
          </div>
        </div>
      )}
    </>
  );
}
