const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Add targetScrollObj
const insertPos = content.indexOf('const touchState = useRef({ startDist: 0 });');
const newStates = `
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
  }, [zoomLevel, isExpanded]);

`;
content = content.substring(0, insertPos) + newStates + content.substring(insertPos);

// 2. Replace touchState logic
const oldTouchMove = `  const handleTouchMove = (e: React.TouchEvent) => {
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
  };`;

const newTouchMove = `  const handleTouchMove = (e: React.TouchEvent) => {
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
  };`;
content = content.replace(oldTouchMove, newTouchMove);

// 3. Replace mouse handlers
const oldOnMouseUp = `  const onMouseUp = (e: React.MouseEvent) => {
    if (isDragging.current) {
      const x = e.pageX - (scrollContainerRef.current?.offsetLeft || 0);
      const walk = Math.abs(x - startX.current);
      if (walk < 5 && e.button === 0) { // If didn't drag much, it's a click!
        setZoomLevel(prev => Math.min(4, prev + 1));
      }
    }
    isDragging.current = false;
  };`;

const newOnMouseUp = `  const onMouseUp = (e: React.MouseEvent) => {
    isDragging.current = false;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (scrollContainerRef.current) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      handleZoom(Math.min(4, zoomLevel + 1), mouseX);
    }
  };`;
content = content.replace(oldOnMouseUp, newOnMouseUp);

const oldOnContextMenu = `  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setZoomLevel(prev => Math.max(0, prev - 1));
  };`;

const newOnContextMenu = `  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (scrollContainerRef.current) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      handleZoom(Math.max(0, zoomLevel - 1), mouseX);
    }
  };`;
content = content.replace(oldOnContextMenu, newOnContextMenu);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content, 'utf8');
