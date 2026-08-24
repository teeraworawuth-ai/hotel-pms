
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
  ReferenceArea,
  ReferenceLine
} from "recharts";

interface EnergyGraphProps {
  roomId: string;
  roomNo?: string;
  location?: string | null;
  dateOffset?: number;
}

export default function EnergyGraph({ roomId, roomNo, location, dateOffset = 0 }: EnergyGraphProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Zoom State
  const [zoomLevel, setZoomLevel] = useState(0); // 0 to 4
  // 1 day = 100%, 7 days = 700%
  const zoomWidths = ['700%', '1400%', '2800%', '8400%', '33600%'];
  const zoomIntervalMins = [60, 30, 15, 5, 1]; // 0=60m, 1=30m, 2=15m, 3=5m, 4=1m

  const graphRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dateOffset);

      let startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
      let nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      let endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);

      if (isFullScreen) {
        // -3 days to +3 days from targetDate
        startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 3, 6, 45, 0);
        nextDate = new Date(targetDate);
        nextDate.setDate(nextDate.getDate() + 4);
        endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);
      } else {
        if (dateOffset === 0) {
          const now = new Date();
          if (now < endOfDay) {
            endOfDay = now;
          }
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
        if (!hasNeighbor) return { ...point, watt: null };
        return point;
      });

      setData(formattedData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [roomId, dateOffset, isFullScreen]);

  // Center scroll automatically when going fullscreen
  useEffect(() => {
    if (isFullScreen && scrollContainerRef.current) {
       // center on "today" which is the middle of the 7 day period. (3 days from start)
       const scrollWidth = scrollContainerRef.current.scrollWidth;
       const clientWidth = scrollContainerRef.current.clientWidth;
       scrollContainerRef.current.scrollLeft = (scrollWidth * (3 / 7)) - (clientWidth / 2) + (scrollWidth / 14);
    }
  }, [isFullScreen, loading]);

  const toggleFullScreen = () => {
    if (!isFullScreen) {
      document.body.style.overflow = "hidden";
      setIsFullScreen(true);
      setZoomLevel(0);
    } else {
      document.body.style.overflow = "auto";
      setIsFullScreen(false);
      setHoverInfo(null);
    }
  };

  useEffect(() => {
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  const [hoverInfo, setHoverInfo] = useState<{x: number, time: number, watt: number | null, isClick: boolean} | null>(null);

  const targetScrollObj = useRef<{ percentage: number, mouseX: number } | null>(null);

  const handleZoom = (newLevel: number, mouseX: number) => {
    if (newLevel === zoomLevel) return;
    if (scrollContainerRef.current) {
      const scrollWidth = scrollContainerRef.current.scrollWidth;
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const percentage = (scrollLeft + mouseX) / scrollWidth;
      targetScrollObj.current = { percentage, mouseX };
    }
    setZoomLevel(newLevel);
  };

  useEffect(() => {
    if (targetScrollObj.current && scrollContainerRef.current) {
      const scrollWidth = scrollContainerRef.current.scrollWidth;
      scrollContainerRef.current.scrollLeft = (targetScrollObj.current.percentage * scrollWidth) - targetScrollObj.current.mouseX;
      targetScrollObj.current = null;
    }
  }, [zoomLevel, isFullScreen, loading]);

  const touchState = useRef({ startDist: 0 });
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      touchState.current.startDist = dist;
    } else if (e.touches.length === 1 && scrollContainerRef.current) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const mouseX = e.touches[0].clientX - rect.left;
      updateHover(mouseX, true);
    }
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchState.current.startDist > 0) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const diff = dist - touchState.current.startDist;
      
      if (diff > 50) { // Pinch out -> Zoom IN
        const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - (scrollContainerRef.current?.getBoundingClientRect().left || 0);
        handleZoom(Math.min(4, zoomLevel + 1), centerX);
        touchState.current.startDist = dist;
      } else if (diff < -50) { // Pinch in -> Zoom OUT
        const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - (scrollContainerRef.current?.getBoundingClientRect().left || 0);
        handleZoom(Math.max(0, zoomLevel - 1), centerX);
        touchState.current.startDist = dist;
      }
    }
  };
  
  const handleTouchEnd = () => {
    touchState.current.startDist = 0;
  };

  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    startX.current = e.pageX - (scrollContainerRef.current?.offsetLeft || 0);
    scrollLeft.current = scrollContainerRef.current?.scrollLeft || 0;
    
    // Update hover exactly where clicked
    if (scrollContainerRef.current) {
       const rect = scrollContainerRef.current.getBoundingClientRect();
       const mouseX = e.clientX - rect.left;
       updateHover(mouseX, true);
    }
  };
  
  const updateHover = (mouseX: number, isClick = false) => {
      if (!scrollContainerRef.current || !isFullScreen) return;
      const scrollL = scrollContainerRef.current.scrollLeft;
      const scrollW = scrollContainerRef.current.scrollWidth;
      const percentage = (scrollL + mouseX) / scrollW;
      
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dateOffset);
      const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 3, 6, 45, 0).getTime();
      const endOfRange = startOfRange + 7 * 24 * 3600 * 1000 - 60000;
      
      const timeMs = startOfRange + percentage * (endOfRange - startOfRange);
      
      // Find closest data point
      let closestWatt = null;
      if (data.length > 0) {
         let closestDist = Infinity;
         for (let p of data) {
           const dist = Math.abs(p.fullTime - timeMs);
           if (dist < closestDist) {
             closestDist = dist;
             closestWatt = p.watt;
           }
         }
         // if nearest point is more than 15 mins away, consider it offline/null
         if (closestDist > 15 * 60 * 1000) {
            closestWatt = null;
         }
      }

      setHoverInfo({ x: mouseX, time: timeMs, watt: closestWatt, isClick });
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (scrollContainerRef.current && isFullScreen) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      // If dragging, consider it a click so dot shows
      updateHover(mouseX, isDragging.current);
    }

    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - (scrollContainerRef.current?.offsetLeft || 0);
    const walk = (x - startX.current) * 2; 
    if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };
  
  const onMouseUp = (e: React.MouseEvent) => {
    isDragging.current = false;
    // Turn off click dot after drag
    if (hoverInfo) setHoverInfo(prev => prev ? { ...prev, isClick: false } : null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (scrollContainerRef.current) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      handleZoom(Math.min(4, zoomLevel + 1), mouseX);
    }
  };

  const onMouseLeave = () => {
    isDragging.current = false;
    setHoverInfo(null);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (scrollContainerRef.current) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      handleZoom(Math.max(0, zoomLevel - 1), mouseX);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!isFullScreen) return;
    // Don't prevent default if it's horizontal scrolling (touchpad)
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    
    e.preventDefault();
    if (scrollContainerRef.current) {
       const rect = scrollContainerRef.current.getBoundingClientRect();
       const mouseX = e.clientX - rect.left;
       if (e.deltaY < 0) {
          handleZoom(Math.min(4, zoomLevel + 1), mouseX); // Scroll up -> zoom in
       } else if (e.deltaY > 0) {
          handleZoom(Math.max(0, zoomLevel - 1), mouseX); // Scroll down -> zoom out
       }
    }
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

    const maxWatt = Math.max(...data.map(d => d.watt), 0);
    const yAxisMax = Math.max(1000, Math.ceil(maxWatt / 500) * 500);
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dateOffset);
    
    let graphStartMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0).getTime();
    let graphEndMs = graphStartMs + 24 * 3600 * 1000 - 60000;

    if (isExpanded) {
        const fullScreenStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 3, 6, 45, 0);
        graphStartMs = fullScreenStart.getTime();
        graphEndMs = graphStartMs + 7 * 24 * 3600 * 1000 - 60000;
    }

    const currentZoom = isExpanded ? zoomLevel : 0;
    const tickIntervalMin = zoomIntervalMins[currentZoom];
    const chartWidth = isExpanded ? zoomWidths[currentZoom] : '100%';
    
    const smallTicks = [];
    const firstTickMs = graphStartMs + 15 * 60 * 1000; 
    for (let m = 0; m <= (isExpanded ? 7 * 24 * 60 : 24 * 60); m += tickIntervalMin) {
      const timeMs = firstTickMs + m * 60 * 1000;
      if (timeMs <= graphEndMs) {
        smallTicks.push(timeMs);
      }
    }
    smallTicks.push(graphEndMs);

    // Calculate midnights for ReferenceLines
    const midnights = [];
    if (isExpanded) {
       for (let i = -3; i <= 4; i++) {
          const m = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + i, 0, 0, 0).getTime();
          if (m > graphStartMs && m < graphEndMs) {
             midnights.push(m);
          }
       }
    }

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
      if (now > lastPoint.fullTime && (now - lastPoint.fullTime > 15 * 60 * 1000) && lastPoint.fullTime > graphStartMs && lastPoint.fullTime < graphEndMs) {
        offlinePeriods.push({ start: lastPoint.fullTime, end: Math.min(now, graphEndMs) });
      }
    }

    const renderTick = (props: any) => {
      const { x, y, payload } = props;
      if (!payload || !payload.value) return null;
      const date = new Date(payload.value);

      if (isExpanded) {
        // Hide ticks on edges to prevent overflow if they get squished
        if (payload.value === graphStartMs || payload.value === graphEndMs) return null;
        
        const timeStr = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
        // At zoom level 0 or 1, show date at noon
        return (
          <g transform={`translate(${x},${y})`}>
            <text x={0} y={15} dy={0} textAnchor="middle" fill="#94a3b8" fontSize={10} className="font-medium">
              {timeStr}
            </text>
            {zoomLevel <= 1 && date.getHours() === 12 && date.getMinutes() === 0 && (
               <text x={0} y={28} dy={0} textAnchor="middle" fill="#64748b" fontSize={9} fontWeight="bold">
                 {date.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
               </text>
            )}
          </g>
        );
      } else {
        const isStartOrEnd = payload.value === graphStartMs || payload.value === graphEndMs;
        const isOddHour = date.getHours() % 2 !== 0; 
        
        if (isStartOrEnd) {
          return (
            <g>
              <line x1={x} y1={y} x2={x} y2={y + 3} stroke="#94a3b8" strokeWidth={1.5} />
              <text x={x} y={y + 11} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight="bold">
                7
              </text>
            </g>
          );
        } else if (date.getMinutes() === 0) {
          if (isOddHour) {
            const hour = date.getHours();
            const fSize = hour >= 10 ? 9.5 : 11;
            return (
              <g>
                <line x1={x} y1={y} x2={x} y2={y + 2} stroke="#cbd5e1" strokeWidth={1} />
                <text x={x} y={y + 11} textAnchor="middle" fill="#cbd5e1" fontSize={fSize}>
                  {hour}
                </text>
              </g>
            );
          }
        }
        return null;
      }
    };

    return (
      <div style={{ width: chartWidth, height: typeof baseHeight === 'number' ? `${baseHeight}px` : baseHeight, minWidth: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: isExpanded ? 15 : 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            
            <XAxis 
              dataKey="fullTime"
              type="number"
              domain={[graphStartMs, graphEndMs]}
              ticks={smallTicks}
              tick={renderTick}
              tickLine={false}
              axisLine={false}
              interval={isExpanded ? "preserveStartEnd" : 0}
              minTickGap={isExpanded ? 20 : 10}
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
              activeDot={false}
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
          <div className="flex justify-between items-center p-2 md:p-6 border-b border-slate-200 bg-white shrink-0 shadow-sm">
            <div className="pr-2">
              <h2 className="text-sm md:text-2xl font-black text-slate-800 leading-tight">
                {location ? `${location} - ห้อง ${roomNo || roomId}` : `กราฟการใช้ไฟ - ห้อง ${roomNo || roomId}`}
              </h2>
              <p className="text-slate-500 text-[10px] md:text-sm mt-0.5 hidden md:block">
                หมุนลูกกลิ้งเมาส์ เพื่อซูมเข้า/ออก (ระดับ {zoomLevel}/4) • คลิกเมาส์ค้างลากซ้าย-ขวา • คลิก/แตะกราฟเพื่อดูข้อมูล
              </p>
            </div>
            <button 
              onClick={toggleFullScreen}
              className="p-1.5 md:p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors flex items-center gap-2 shrink-0 z-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              <span className="font-bold text-sm hidden md:inline">ปิด</span>
            </button>
          </div>
          
          <div className="flex-1 p-1 pb-1 md:p-6 md:pb-8 min-h-0 md:min-h-[300px] bg-slate-50 flex flex-col relative overflow-hidden">
             
             <div className="w-full flex-1 bg-white rounded-2xl border border-slate-200 relative z-10 overflow-hidden shadow-sm">
                <div 
                  ref={scrollContainerRef}
                  className="w-full h-full overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing no-scrollbar"
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseLeave={onMouseLeave}
                  onDoubleClick={onDoubleClick}
                  onContextMenu={onContextMenu}
                  onWheel={onWheel}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  
                  {hoverInfo && isFullScreen && (
                    <div 
                      className="absolute top-0 bottom-0 pointer-events-none border-l-2 border-indigo-500 border-dashed z-[100] flex flex-col items-center justify-start pt-1 md:pt-4"
                      style={{ left: hoverInfo.x }}
                    >
                      <div className="bg-indigo-600/95 text-white text-[10px] md:text-sm font-bold px-2 py-1 md:px-3 md:py-2 rounded-lg shadow-xl transform -translate-x-1/2 whitespace-nowrap text-center">
                        <div className="text-indigo-200 text-[9px] md:text-xs mb-0.5">{new Date(hoverInfo.time).toLocaleDateString("th-TH", { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                        <div>{new Date(hoverInfo.time).toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit', second: '2-digit' })} น.</div>
                        <div className="text-amber-300 mt-0.5">{hoverInfo.watt !== null ? `${hoverInfo.watt} วัตต์` : 'ออฟไลน์'}</div>
                      </div>
                      
                      {hoverInfo.isClick && hoverInfo.watt !== null && (
                         <div className="absolute top-[50%] w-4 h-4 bg-indigo-500 rounded-full border-[3px] border-white shadow-md transform -translate-x-1/2 -translate-y-1/2"></div>
                      )}
                    </div>
                  )}
                  <div className="h-full p-0 pb-4 md:p-6 md:pb-12 relative min-w-full inline-block">
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
