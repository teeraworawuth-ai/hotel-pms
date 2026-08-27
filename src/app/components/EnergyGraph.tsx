"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  AreaChart,
  Area,
  
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  Label
} from "recharts";

interface EnergyGraphProps {
  roomId: string;
  roomNo?: string;
  location?: string | null;
  dateOffset?: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (data.watt === null) return null;
    
    const date = new Date(data.fullTime);
    const hrs = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    const dateStr = isToday ? 'วันนี้' : (date.getDate().toString().padStart(2, '0') + '/' + (date.getMonth() + 1).toString().padStart(2, '0'));
    const formattedWatt = Math.round(data.watt).toLocaleString();

    return (
      <div className="font-bold text-[12px] pointer-events-none flex items-center gap-1" style={{ textShadow: '1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white' }}>
        <span className="text-indigo-700">{dateStr} {hrs}:{mins}</span>
        <span className="text-slate-400 font-normal">|</span>
        <span className="text-slate-800">{formattedWatt} <span className="text-[10px] font-normal text-slate-600">W</span></span>
      </div>
    );
  }
  return null;
};

export default function EnergyGraph({ roomId, roomNo, location, dateOffset = 0 }: EnergyGraphProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [localOffset, setLocalOffset] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const startDragRef = useRef({ x: 0, y: 0, time: 0 });
  
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
  
        const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 3, 0, 0, 0);
        let endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 2, 0, 0, 0);
  
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
        .limit(50000);

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
          if (next.fullTime - curr.fullTime > 10 * 60 * 1000) {
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
    const handleContainerClick = (e: React.MouseEvent) => {
    const dx = Math.abs(e.clientX - startDragRef.current.x);
    const dy = Math.abs(e.clientY - startDragRef.current.y);
    const dt = Date.now() - startDragRef.current.time;
    if (dx < 5 && dy < 5 && dt < 500) {
      setIsFullScreen(true);
    }
  };

  const handleTouchEndClick = (e: React.TouchEvent) => {
    if (e.changedTouches.length === 1) {
      const dx = Math.abs(e.changedTouches[0].clientX - startDragRef.current.x);
      const dy = Math.abs(e.changedTouches[0].clientY - startDragRef.current.y);
      const dt = Date.now() - startDragRef.current.time;
      if (dx < 10 && dy < 10 && dt < 500) {
        setIsFullScreen(true);
      }
    }
  };

  const getDynamicTicks = () => {
    const ticks = [];
    const [min, max] = domain;
    const rangeMs = max - min;
    const rangeHours = rangeMs / (60 * 60 * 1000);
    
    let intervalHours = 2;
    if (rangeHours > 16) intervalHours = 2; // Unzoomed: 2 hrs
    else if (rangeHours > 8) intervalHours = 2; // 8-16h: 2 hr (prevent overlap)
    else if (rangeHours > 4) intervalHours = 1; // 4-8h: 1 hr
    else if (rangeHours > 2) intervalHours = 0.5; // 2-4h: 30m
    else if (rangeHours > 1) intervalHours = 0.25; // 1-2h: 15m
    else if (rangeHours > 0.5) intervalHours = 1/6; // 30m-1h: 10m
    else intervalHours = 1/12; // < 30m: 5m

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    let tickMs = Math.ceil(min / intervalMs) * intervalMs;
    while (tickMs <= max) {
      ticks.push(tickMs);
      tickMs += intervalMs;
    }
    
    const secondSeven = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime();
    
    // Filter out dynamic ticks that are too close to our bold 7s (within 30 mins)
    const filteredTicks = ticks.filter(t => 
      Math.abs(t - defaultStartMs) > 30 * 60 * 1000 && 
      Math.abs(t - secondSeven) > 30 * 60 * 1000
    );
    
    if (defaultStartMs >= min && defaultStartMs <= max) filteredTicks.push(defaultStartMs);
    if (secondSeven >= min && secondSeven <= max) filteredTicks.push(secondSeven);

    return Array.from(new Set(filteredTicks)).sort((a, b) => a - b);
  };

  const renderTick = (props: any) => {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    const date = new Date(payload.value);

    // Bold 7 at start and end of day
    if (payload.value === defaultStartMs || payload.value === new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1, 6, 44, 59).getTime()) {
      return (
        <g>
          <text x={x} y={y + 11} textAnchor="middle" fill="#0f172a" fontSize={12} fontWeight="bold">7</text>
        </g>
      );
    }
    
    // Normal dynamic ticks
    let fSize = 9.5;
    const rangeMs = domain[1] - domain[0];
    let timeStr = date.getHours().toString();
    
    if (rangeMs < 16 * 60 * 60 * 1000) { // < 6 hours zoom, show minutes
      timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      fSize = 8;
    }

    return (
      <g>
        <line x1={x} y1={y} x2={x} y2={y + 2} stroke="#cbd5e1" strokeWidth={1} />
        <text x={x} y={y + 11} textAnchor="middle" fill="#64748b" fontSize={fSize} fontWeight="normal">{timeStr}</text>
      </g>
    );
  };

  const offlinePeriods: {start: number, end: number}[] = [];
  if (data && data.length > 0) {
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      if (curr.fullTime - prev.fullTime > 10 * 60 * 1000) {
        offlinePeriods.push({ start: prev.fullTime, end: curr.fullTime });
      }
    }
    const now = new Date().getTime();
    const lastPoint = data[data.length - 1];
    if (now > lastPoint.fullTime && (now - lastPoint.fullTime > 10 * 60 * 1000) && lastPoint.fullTime > domain[0] && lastPoint.fullTime < domain[1]) {
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

  const renderChartContent = () => (
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }} style={{ outline: "none" }}>
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }} />
        <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="#e2e8f0" />
        
        <XAxis 
          dataKey="fullTime"
          type="number"
          domain={domain}
          ticks={getDynamicTicks()}
          tick={renderTick}
          tickLine={false}
          axisLine={false}
          interval={0}
          minTickGap={-1000}
          allowDataOverflow={true}
        />
        <YAxis 
            type="number"
            domain={[0, yAxisMax]}
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickLine={true}
            axisLine={true}
            tickFormatter={(value) => Math.round(value).toLocaleString()}
            orientation="left"
            width={45}
            allowDataOverflow={true}
        />
        
        {offlinePeriods.map((period, idx) => (
          <ReferenceArea key={idx} x1={period.start} x2={period.end} fill="#e2e8f0" fillOpacity={0.7} />
        ))}

        {midnights.map((m, idx) => {
          const date = new Date(m);
          const now = new Date();
          const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
          const dateStr = isToday ? 'วันนี้' : (date.getDate().toString().padStart(2, '0') + '/' + (date.getMonth() + 1).toString().padStart(2, '0'));
          return (
            <ReferenceLine key={'mid-' + idx} x={m} stroke="#000000" strokeDasharray="5 5" strokeWidth={1.5} strokeOpacity={0.8}>
              <Label value={dateStr} position="insideTopLeft" fill="#334155" fontSize={11} fontWeight="bold" offset={5} />
            </ReferenceLine>
          );
        })}
        
        <Area 
            type="linear" 
            dataKey="watt" 
            stroke="#3b82f6" 
            strokeWidth={2}
            fill="#dbeafe"
            fillOpacity={0.9}
            dot={false}
            activeDot={{ r: 5, fill: '#ffffff', stroke: '#3b82f6', strokeWidth: 3 }}
            animationDuration={0}
            isAnimationActive={false}
          />
      </AreaChart>
  );

  
  const centerMs = (domain[0] + domain[1]) / 2;
  const centerDate = new Date(centerMs);
  const now = new Date();
  const isCenterToday = centerDate.getDate() === now.getDate() && centerDate.getMonth() === now.getMonth() && centerDate.getFullYear() === now.getFullYear();
  const watermarkText = isCenterToday ? 'วันนี้' : (centerDate.getDate().toString().padStart(2, '0') + '/' + (centerDate.getMonth() + 1).toString().padStart(2, '0'));
  return (
    <>
      <div className="relative w-full group select-none">
        
        <div className="absolute top-0 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setLocalOffset(prev => prev - 1)} className="p-1 text-slate-400 hover:text-indigo-600 bg-white/80 hover:bg-white rounded shadow-sm border border-slate-100">&lt;</button>
          <button onClick={() => setLocalOffset(0)} className="px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-indigo-600 bg-white/80 hover:bg-white rounded shadow-sm border border-slate-100">
            {displayDateStr}
          </button>
          <button onClick={() => setLocalOffset(prev => prev + 1)} className="p-1 text-slate-400 hover:text-indigo-600 bg-white/80 hover:bg-white rounded shadow-sm border border-slate-100">&gt;</button>
        </div>

        <div 
          ref={!isFullScreen ? chartContainerRef : undefined}
          className="w-full h-[140px] cursor-grab active:cursor-grabbing touch-pan-y outline-none focus:outline-none" style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
          onWheel={handleWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUpOrLeave}
          onMouseLeave={onMouseUpOrLeave}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={(e) => { onTouchEnd(); handleTouchEndClick(e); }}
          onClick={handleContainerClick}
        >
          {loading ? (
            <div className="w-full h-full bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-2"></div>
                <p className="text-slate-400 text-xs">กำลังโหลด...</p>
              </div>
            </div>
          ) : (
            <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
              <span className="text-slate-300 font-black text-4xl sm:text-5xl select-none opacity-50">{watermarkText}</span>
            </div>
            <ResponsiveContainer width="100%" height="100%" className="relative z-10">
              {renderChartContent()}
            </ResponsiveContainer>
            </>)}
        </div>
      </div>

      {isFullScreen && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col p-2 sm:p-4 portrait:h-[100dvh] landscape:h-[100dvh] select-none touch-none">
          <div className="flex justify-between items-center mb-2 px-2 shrink-0">
            <h2 className="text-sm sm:text-lg font-bold text-slate-700">สถานที่: {location || 'ไม่ระบุ'} - ห้อง {roomNo}</h2>
            <button onClick={() => setIsFullScreen(false)} className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded shadow-sm text-sm font-bold transition-colors cursor-pointer z-50">ปิดหน้าจอ</button>
          </div>
          
          <style>{'\n             @media (orientation: portrait) {\n               .fs-hint { display: block; }\n             }\n             @media (orientation: landscape) {\n               .fs-hint { display: none; }\n             }\n          '}</style>
          <div className="fs-hint absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white px-4 py-2 rounded-full z-50 text-xs text-center pointer-events-none">
            กรุณาหมุนโทรศัพท์เป็นแนวนอน<br/>เพื่อดูกราฟแบบเต็มจอ
          </div>

          <div 
            ref={isFullScreen ? chartContainerRef : undefined}
            className="flex-1 w-full relative outline-none cursor-grab active:cursor-grabbing touch-pan-y" 
            style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
            onWheel={handleWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUpOrLeave}
            onMouseLeave={onMouseUpOrLeave}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {loading ? null : (<>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
              <span className="text-slate-300 font-black text-4xl sm:text-5xl select-none opacity-50">{watermarkText}</span>
            </div>
            <ResponsiveContainer width="100%" height="100%" className="relative z-10">
                {renderChartContent()}
            </ResponsiveContainer>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
