"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceArea,
  ReferenceLine
} from "recharts";

interface EnergyGraphProps {
  roomId: string;
  roomNo?: string;
  location?: string | null;
  dateOffset?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const date = new Date(label);
    const timeStr = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const watt = payload[0].value;
    
    return (
      <div className="bg-white/80 backdrop-blur-[2px] text-slate-800 px-2 py-1 rounded border border-slate-200 text-[10px] font-bold shadow-sm pointer-events-none">
        <span className="text-indigo-600">{timeStr}</span>
        <span className="text-slate-300 font-normal mx-1">|</span>
        <span>{watt} <span className="text-[9px] font-normal text-slate-500">W</span></span>
      </div>
    );
  }
  return null;
};

export default function EnergyGraph({ roomId, roomNo, location, dateOffset = 0 }: EnergyGraphProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [localOffset, setLocalOffset] = useState(0);
  
  const targetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dateOffset + localOffset);
    return d;
  }, [dateOffset, localOffset]);

  const defaultStartMs = useMemo(() => {
    return new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0).getTime();
  }, [targetDate]);

  const defaultEndMs = useMemo(() => {
    return new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 13, 0, 0).getTime();
  }, [targetDate]);

  const [domain, setDomain] = useState<[number, number]>([defaultStartMs, defaultEndMs]);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Sync domain when date changes
  useEffect(() => {
    setDomain([defaultStartMs, defaultEndMs]);
  }, [defaultStartMs, defaultEndMs]);

  // Reset local offset if global date changes
  useEffect(() => {
    setLocalOffset(0);
  }, [dateOffset]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 7, 0, 0);
      let nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      let endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 13, 0, 0);

      // limit fetching to now if future
      const now = new Date();
      if (now < endOfDay) {
         if (now < startOfRange) {
           setData([]);
           return;
         } else {
           endOfDay = now;
         }
      }

      const { data: logData, error } = await supabase
        .from("energy_logs")
        .select("wattage, recorded_at")
        .eq("room_id", roomId)
        .gte("recorded_at", startOfRange.toISOString())
        .lte("recorded_at", endOfDay.toISOString())
        .order("recorded_at", { ascending: true })
        .limit(15000);

      if (error) {
        console.error("Error fetching energy logs:", error);
        return;
      }

      let rawData = (logData || []).map((log) => {
        const d = new Date(log.recorded_at);
        const wattVal = Number(log.wattage);
        return {
          time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
          fullTime: d.getTime(), 
          watt: (log.wattage !== null && wattVal > 0) ? wattVal : null,
        };
      });

      let formattedData = [];
      for (let i = 0; i < rawData.length; i++) {
        formattedData.push(rawData[i]);
        if (i < rawData.length - 1) {
          const curr = rawData[i];
          const next = rawData[i + 1];
          if (next.fullTime - curr.fullTime > 15 * 60 * 1000) {
            formattedData.push({
              time: "",
              fullTime: curr.fullTime + 1000,
              watt: null
            });
            formattedData.push({
              time: "",
              fullTime: next.fullTime - 1000,
              watt: null
            });
          }
        }
      }

      setData(formattedData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [roomId, targetDate]);

  const yAxisMax = Math.max(1500, ...data.filter(d => d.watt !== null).map(d => (d.watt as number) + 200));

  // --- Zoom and Pan Handlers ---
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!chartContainerRef.current) return;
    
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    // approximate chart area
    const marginLeft = 0;
    const marginRight = 10;
    const chartWidth = width - marginLeft - marginRight;
    const chartX = Math.max(0, Math.min(chartWidth, x - marginLeft));
    
    const percentage = chartX / chartWidth;
    
    const zoomFactor = e.deltaY < 0 ? 0.7 : 1.4; // up=zoom in, down=zoom out
    const [min, max] = domain;
    
    const timeHovered = min + percentage * (max - min);
    let newRange = (max - min) * zoomFactor;
    
    // Limits: Max zoom out 30 hours, Min zoom in 30 mins
    if (newRange > 30 * 60 * 60 * 1000) newRange = 30 * 60 * 60 * 1000;
    if (newRange < 30 * 60 * 1000) newRange = 30 * 60 * 1000;
    
    const newMin = timeHovered - (newRange * percentage);
    const newMax = timeHovered + (newRange * (1 - percentage));
    
    setDomain([newMin, newMax]);
  };

  // Mouse pan
  const dragState = useRef({ isDragging: false, startX: 0, startDomain: [0, 0] as [number, number] });
  
  const onMouseDown = (e: React.MouseEvent) => {
    dragState.current = {
      isDragging: true,
      startX: e.clientX,
      startDomain: [...domain]
    };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragState.current.isDragging && chartContainerRef.current) {
      const dx = e.clientX - dragState.current.startX;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const chartWidth = rect.width - 10;
      
      const [min, max] = dragState.current.startDomain;
      const timeShift = (dx / chartWidth) * (max - min);
      
      setDomain([min - timeShift, max - timeShift]);
    }
  };

  const onMouseUpOrLeave = () => {
    dragState.current.isDragging = false;
  };

  // Touch zoom/pan
  const touchState = useRef({ dist: 0, startX: 0, startDomain: [0, 0] as [number, number], mode: 'none' });

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touchState.current.mode = 'zoom';
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      touchState.current.dist = dist;
      touchState.current.startDomain = [...domain];
    } else if (e.touches.length === 1) {
      touchState.current.mode = 'pan';
      touchState.current.startX = e.touches[0].clientX;
      touchState.current.startDomain = [...domain];
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchState.current.mode === 'zoom' && e.touches.length === 2 && chartContainerRef.current) {
      e.preventDefault(); // prevent scroll
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const scale = touchState.current.dist / dist; // pinch in (smaller dist) -> scale > 1 -> zoom out
      
      const rect = chartContainerRef.current.getBoundingClientRect();
      const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
      const chartWidth = rect.width - 10;
      const percentage = Math.max(0, Math.min(1, centerX / chartWidth));
      
      const [min, max] = touchState.current.startDomain;
      const timeHovered = min + percentage * (max - min);
      
      let newRange = (max - min) * scale;
      if (newRange > 30 * 60 * 60 * 1000) newRange = 30 * 60 * 60 * 1000;
      if (newRange < 30 * 60 * 1000) newRange = 30 * 60 * 1000;
      
      setDomain([timeHovered - (newRange * percentage), timeHovered + (newRange * (1 - percentage))]);
      
    } else if (touchState.current.mode === 'pan' && e.touches.length === 1 && chartContainerRef.current) {
      // Don't prevent default, allow vertical scroll
      const dx = e.touches[0].clientX - touchState.current.startX;
      if (Math.abs(dx) > 10) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        const chartWidth = rect.width - 10;
        const [min, max] = touchState.current.startDomain;
        const timeShift = (dx / chartWidth) * (max - min);
        setDomain([min - timeShift, max - timeShift]);
      }
    }
  };

  const onTouchEnd = () => {
    touchState.current.mode = 'none';
  };

  // --- Dynamic Ticks ---
  const getDynamicTicks = () => {
    const ticks = [];
    const [min, max] = domain;
    const rangeMs = max - min;
    const rangeHours = rangeMs / (60 * 60 * 1000);
    
    let intervalHours = 2;
    if (rangeHours > 24) intervalHours = 6;
    else if (rangeHours > 12) intervalHours = 2;
    else if (rangeHours > 6) intervalHours = 1;
    else if (rangeHours > 3) intervalHours = 0.5;
    else if (rangeHours > 1) intervalHours = 0.25; // 15m
    else intervalHours = 1/12; // 5m

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    // start from nearest interval
    let tickMs = Math.ceil(min / intervalMs) * intervalMs;
    while (tickMs <= max) {
      ticks.push(tickMs);
      tickMs += intervalMs;
    }
    
    // Always include start 06:45 and end 06:45 if in view
    if (defaultStartMs >= min && defaultStartMs <= max && !ticks.includes(defaultStartMs)) ticks.push(defaultStartMs);
    const secondSeven = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime();
    if (secondSeven >= min && secondSeven <= max && !ticks.includes(secondSeven)) ticks.push(secondSeven);

    return ticks.sort((a, b) => a - b);
  };

  const renderTick = (props: any) => {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    const date = new Date(payload.value);

    // Bold 7 at start and end of day
    if (payload.value === defaultStartMs || payload.value === new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime()) {
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y + 3} stroke="#94a3b8" strokeWidth={1.5} />
          <text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">7</text>
        </g>
      );
    }
    
    // Normal dynamic ticks
    let fSize = 9.5;
    const rangeMs = domain[1] - domain[0];
    let timeStr = date.getHours().toString();
    
    if (rangeMs < 6 * 60 * 60 * 1000) { // < 6 hours zoom, show minutes
      timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      fSize = 8;
    }

    return (
      <g>
        <line x1={x} y1={y} x2={x} y2={y + 2} stroke="#cbd5e1" strokeWidth={1} />
        <text x={x} y={y + 11} textAnchor="middle" fill="#cbd5e1" fontSize={fSize} fontWeight="normal">{timeStr}</text>
      </g>
    );
  };

  const offlinePeriods: {start: number, end: number}[] = [];
  if (data && data.length > 0) {
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      if (curr.fullTime - prev.fullTime > 15 * 60 * 1000) {
        offlinePeriods.push({ start: prev.fullTime, end: curr.fullTime });
      }
    }
    const now = new Date().getTime();
    const lastPoint = data[data.length - 1];
    if (now > lastPoint.fullTime && (now - lastPoint.fullTime > 15 * 60 * 1000) && lastPoint.fullTime > domain[0] && lastPoint.fullTime < domain[1]) {
      offlinePeriods.push({ start: lastPoint.fullTime, end: Math.min(now, domain[1]) });
    }
  }

  const midnights = [];
  for (let i = -1; i <= 2; i++) {
    const m = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + i, 0, 0, 0).getTime();
    if (m > domain[0] && m < domain[1]) midnights.push(m);
  }

  const isToday = localOffset === 0 && dateOffset === 0;
  const displayDateStr = isToday ? "วันนี้" : targetDate.toLocaleDateString("th-TH", { day: 'numeric', month: 'short' });

  return (
    <div className="mt-2 relative w-full group select-none">
      
      {/* Floating Controls */}
      <div className="absolute top-0 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setLocalOffset(prev => prev - 1)} className="p-1 text-slate-400 hover:text-indigo-600 bg-white/80 hover:bg-white rounded shadow-sm border border-slate-100">&lt;</button>
        <button onClick={() => setLocalOffset(0)} className="px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-indigo-600 bg-white/80 hover:bg-white rounded shadow-sm border border-slate-100">
          {displayDateStr}
        </button>
        <button onClick={() => setLocalOffset(prev => prev + 1)} className="p-1 text-slate-400 hover:text-indigo-600 bg-white/80 hover:bg-white rounded shadow-sm border border-slate-100">&gt;</button>
      </div>

      <div 
        ref={chartContainerRef}
        className="w-full h-[140px] cursor-grab active:cursor-grabbing touch-pan-y"
        onWheel={handleWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUpOrLeave}
        onMouseLeave={onMouseUpOrLeave}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {loading ? (
          <div className="w-full h-full bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-2"></div>
              <p className="text-slate-400 text-xs">กำลังโหลด...</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              
              <XAxis 
                dataKey="fullTime"
                type="number"
                domain={domain}
                ticks={getDynamicTicks()}
                tick={renderTick}
                tickLine={false}
                axisLine={false}
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

              {midnights.map((m, idx) => (
                <ReferenceLine key={`mid-${idx}`} x={m} stroke="#000000" strokeDasharray="5 5" strokeWidth={1.5} strokeOpacity={0.8} />
              ))}
              
              <Line 
                type="monotone" 
                dataKey="watt" 
                stroke="#6366f1" 
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                animationDuration={0}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
