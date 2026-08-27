const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Add lastClickRef to refs
const refStr = 'const startDragRef = useRef({ x: 0, y: 0, time: 0 });';
if (!content.includes('const lastClickRef = useRef<number>(0);')) {
  content = content.replace(refStr, refStr + '\n  const lastClickRef = useRef<number>(0);');
}

// 2. Add openFullScreen and closeFullScreen methods
const methodsToAdd = `
  const openFullScreen = async () => {
    setIsFullScreen(true);
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
      
      if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
        await window.screen.orientation.lock('landscape');
      }
    } catch (err) {
      console.log('Fullscreen/Orientation API not fully supported', err);
    }
  };

  const closeFullScreen = async () => {
    setIsFullScreen(false);
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
      }
      if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
        window.screen.orientation.unlock();
      }
    } catch (err) {
      console.log('Error exiting fullscreen', err);
    }
  };

  const checkDoubleClick = () => {
    const now = Date.now();
    if (now - lastClickRef.current < 400) {
      openFullScreen();
      lastClickRef.current = 0;
    } else {
      lastClickRef.current = now;
    }
  };
`;

if (!content.includes('const openFullScreen = async () => {')) {
  content = content.replace('const handleContainerClick = (e: React.MouseEvent) => {', methodsToAdd + '\n  const handleContainerClick = (e: React.MouseEvent) => {');
}

// 3. Update handleContainerClick and handleTouchEndClick
content = content.replace(/setIsFullScreen\(true\);/g, 'checkDoubleClick();');

// 4. Update the close button to use closeFullScreen()
content = content.replace(/onClick=\{\(\) => setIsFullScreen\(false\)\}/g, 'onClick={closeFullScreen}');

// 5. To prevent vertical scrolling when isFullScreen is true, we need to modify onTouchMove
// In onTouchMove:
// } else if (touchState.current.mode === 'pan' && e.touches.length === 1 && chartContainerRef.current) {
//   if (isFullScreen) e.preventDefault(); // Disable vertical scrolling completely in full screen
//   const dx = e.touches[0].clientX - touchState.current.startX;
const onTouchMoveOld = "} else if (touchState.current.mode === 'pan' && e.touches.length === 1 && chartContainerRef.current) {\n      // Don't prevent default, allow vertical scroll";
const onTouchMoveNew = "} else if (touchState.current.mode === 'pan' && e.touches.length === 1 && chartContainerRef.current) {\n      if (isFullScreen) e.preventDefault(); // Disable vertical scroll in full screen";
content = content.replace(onTouchMoveOld, onTouchMoveNew);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log("Updated EnergyGraph for Double Click and Fullscreen");
