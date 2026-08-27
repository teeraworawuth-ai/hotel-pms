const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const state_block = /const \[localOffset, setLocalOffset\] = useState\(0\);/;
const new_state_block = `const [localOffset, setLocalOffset] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const startDragRef = useRef({ x: 0, y: 0, time: 0 });`;
content = content.replace(state_block, new_state_block);

const mousedown_block = /const onMouseDown = \(e: React\.MouseEvent\) => \{\n\s*if \(\!chartContainerRef\.current\) return;/;
const new_mousedown_block = `const onMouseDown = (e: React.MouseEvent) => {
    startDragRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    if (!chartContainerRef.current) return;`;
content = content.replace(mousedown_block, new_mousedown_block);

const touchstart_block = /const onTouchStart = \(e: React\.TouchEvent\) => \{\n\s*if \(\!chartContainerRef\.current\) return;/;
const new_touchstart_block = `const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) startDragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
    if (!chartContainerRef.current) return;`;
content = content.replace(touchstart_block, new_touchstart_block);

const click_handler = `  const handleContainerClick = (e: React.MouseEvent) => {
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
  };`;
content = content.replace("const getDynamicTicks = () => {", click_handler + "\n\n  const getDynamicTicks = () => {");

const tooltip_block = /const CustomTooltip = \(\{ active, payload \}: any\) => \{[\s\S]*?return null;\n  \};/;
const new_tooltip_block = `const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.watt === null) return null;
      
      const date = new Date(data.fullTime);
      const hrs = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      
      const now = new Date();
      const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      const dateStr = isToday ? 'วันนี้' : (date.getDate().toString().padStart(2, '0') + '/' + (date.getMonth() + 1).toString().padStart(2, '0'));

      return (
        <div className="text-indigo-600 font-bold text-[11px] drop-shadow-md bg-white/80 px-1.5 py-0.5 rounded pointer-events-none">
          {dateStr} {hrs}:{mins} | {data.watt}W
        </div>
      );
    }
    return null;
  };`;
content = content.replace(tooltip_block, new_tooltip_block);

const set_logic = /return ticks\.sort\(\(a, b\) => a - b\);/;
const new_set_logic = "return Array.from(new Set(ticks)).sort((a, b) => a - b);";
content = content.replace(set_logic, new_set_logic);

// Very careful replacement for the final return
const return_start_index = content.lastIndexOf('return (');
const content_before = content.substring(0, return_start_index);

const new_return = `const renderChartContent = () => (
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
            tickFormatter={(value) => value.toLocaleString()}
            orientation="left"
            width={40}
            allowDataOverflow={true}
        />
        
        {offlinePeriods.map((period, idx) => (
          <ReferenceArea key={idx} x1={period.start} x2={period.end} fill="#e2e8f0" fillOpacity={0.7} />
        ))}

        {midnights.map((m, idx) => (
          <ReferenceLine key={'mid-' + idx} x={m} stroke="#000000" strokeDasharray="5 5" strokeWidth={1.5} strokeOpacity={0.8} />
        ))}
        
        <Area 
            type="linear" 
            dataKey="watt" 
            stroke="#3b82f6" 
            strokeWidth={2}
            fill="#eff6ff"
            fillOpacity={0.8}
            dot={false}
            activeDot={{ r: 5, fill: '#ffffff', stroke: '#3b82f6', strokeWidth: 3 }}
            animationDuration={0}
            isAnimationActive={false}
          />
      </AreaChart>
  );

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
            <ResponsiveContainer width="100%" height="100%">
              {renderChartContent()}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {isFullScreen && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col p-2 sm:p-4 portrait:h-[100dvh] landscape:h-[100dvh] select-none touch-none">
          <div className="flex justify-between items-center mb-2 px-2 shrink-0">
            <h2 className="text-sm sm:text-lg font-bold text-slate-700">สถานที่: {location || 'ไม่ระบุ'} - ห้อง {roomNo}</h2>
            <button onClick={() => setIsFullScreen(false)} className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded shadow-sm text-sm font-bold transition-colors cursor-pointer z-50">ปิดหน้าจอ</button>
          </div>
          
          <style>{'\\n             @media (orientation: portrait) {\\n               .fs-hint { display: block; }\\n             }\\n             @media (orientation: landscape) {\\n               .fs-hint { display: none; }\\n             }\\n          '}</style>
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
            {loading ? null : (
              <ResponsiveContainer width="100%" height="100%">
                {renderChartContent()}
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </>
  );
}`;

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content_before + new_return + '\n}\n');
console.log('Done');
