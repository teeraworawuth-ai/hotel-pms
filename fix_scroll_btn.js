const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Add domainRef
if (!content.includes('const domainRef = useRef(domain);')) {
  const domainStateStr = 'const [domain, setDomain] = useState<[number, number]>([defaultStartMs, defaultEndMs]);';
  content = content.replace(domainStateStr, domainStateStr + '\n  const domainRef = useRef(domain);\n  useEffect(() => {\n    domainRef.current = domain;\n  }, [domain]);');
}

// 2. Add native wheel listener useEffect
const nativeWheelStr = `
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault(); // This is the crucial part that stops the page from scrolling
      
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      
      const marginLeft = 0;
      const marginRight = 10;
      const chartWidth = width - marginLeft - marginRight;
      const chartX = Math.max(0, Math.min(chartWidth, x - marginLeft));
      
      const percentage = chartX / chartWidth;
      
      const zoomFactor = e.deltaY < 0 ? 0.7 : 1.4;
      const [min, max] = domainRef.current;
      
      const timeHovered = min + percentage * (max - min);
      let newRange = (max - min) * zoomFactor;
      
      if (newRange > 30 * 60 * 60 * 1000) newRange = 30 * 60 * 60 * 1000;
      if (newRange < 30 * 60 * 1000) newRange = 30 * 60 * 1000;
      
      const newMin = timeHovered - (newRange * percentage);
      const newMax = timeHovered + (newRange * (1 - percentage));
      
      setDomain([newMin, newMax]);
    };

    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [isFullScreen, loading]);
`;

if (!content.includes('const onWheelNative = (e: WheelEvent) => {')) {
  content = content.replace('// --- Zoom and Pan Handlers ---', '// --- Zoom and Pan Handlers ---' + nativeWheelStr);
}

// 3. Remove old handleWheel from JSX
content = content.replace(/onWheel=\{handleWheel\}/g, '');

// 4. Add the Expand button in the top right
const expandBtnHtml = `
          <button onClick={openFullScreen} className="p-1 ml-1 text-slate-400 hover:text-indigo-600 bg-white/80 hover:bg-white rounded shadow-sm border border-slate-100 transition-colors" title="ขยายเต็มหน้าจอ">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
          </button>
        </div>`;
content = content.replace('</button>\n        </div>', '</button>' + expandBtnHtml);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log("Updated EnergyGraph with native wheel and expand button");
