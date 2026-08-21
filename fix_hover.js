const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Add hover state
const statePos = content.indexOf('const targetScrollObj = useRef');
content = content.substring(0, statePos) + `  const [hoverInfo, setHoverInfo] = useState<{x: number, time: number} | null>(null);\n` + content.substring(statePos);

// 2. Add mouse tracking logic
const oldOnMouseMove = `  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - (scrollContainerRef.current?.offsetLeft || 0);
    const walk = (x - startX.current) * 2; // scroll speed multiplier
    if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };`;

const newOnMouseMove = `  const onMouseMove = (e: React.MouseEvent) => {
    if (scrollContainerRef.current && isFullScreen) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      
      const scrollL = scrollContainerRef.current.scrollLeft;
      const scrollW = scrollContainerRef.current.scrollWidth;
      const percentage = (scrollL + mouseX) / scrollW;
      
      const tDate = new Date();
      tDate.setDate(tDate.getDate() + dateOffset + expandedOffset);
      const sDayMs = new Date(tDate.getFullYear(), tDate.getMonth(), tDate.getDate(), 6, 45, 0).getTime();
      const timeMs = sDayMs + percentage * (24 * 3600 * 1000 - 60000);
      
      setHoverInfo({ x: mouseX, time: timeMs });
    }

    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - (scrollContainerRef.current?.offsetLeft || 0);
    const walk = (x - startX.current) * 2; 
    if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };`;

content = content.replace(oldOnMouseMove, newOnMouseMove);

// 3. Clear hover on leave
const oldOnMouseLeave = `  const onMouseLeave = () => {
    isDragging.current = false;
  };`;

const newOnMouseLeave = `  const onMouseLeave = () => {
    isDragging.current = false;
    setHoverInfo(null);
  };`;
content = content.replace(oldOnMouseLeave, newOnMouseLeave);

// 4. Render hover overlay
const renderPos = content.indexOf('<div className="h-full p-0 pb-4 md:p-6 md:pb-12 relative min-w-full inline-block">');
const hoverOverlay = `
                  {hoverInfo && isFullScreen && (
                    <div 
                      className="absolute top-0 bottom-0 pointer-events-none border-l-2 border-indigo-500 border-dashed z-[100] flex flex-col items-center justify-start pt-1 md:pt-4"
                      style={{ left: hoverInfo.x + (scrollContainerRef.current?.scrollLeft || 0) }}
                    >
                      <div className="bg-indigo-600/90 text-white text-[10px] md:text-sm font-bold px-2 py-1 md:px-3 md:py-1.5 rounded shadow-lg transform -translate-x-1/2 whitespace-nowrap">
                        {new Date(hoverInfo.time).toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit', second: '2-digit' })} น.
                      </div>
                    </div>
                  )}
`;
content = content.substring(0, renderPos) + hoverOverlay + content.substring(renderPos);


fs.writeFileSync('src/app/components/EnergyGraph.tsx', content, 'utf8');
