const fs = require('fs');

// --- Fix EnergyGraph.tsx ---
let graphContent = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// 1. Fix openFullScreen
graphContent = graphContent.replace(
  /const openFullScreen = async \(\) => \{\s*checkDoubleClick\(\);/g,
  `const openFullScreen = async () => {
    if (isFullScreen) return; // Prevent triggering if already open
    setIsFullScreen(true);`
);

// 2. Remove checkDoubleClick function
graphContent = graphContent.replace(
  /const checkDoubleClick = \(\) => \{[\s\S]*?\};\n/g,
  ''
);

// 3. Update handleContainerClick and handleTouchEndClick to use openFullScreen directly
graphContent = graphContent.replace(
  /checkDoubleClick\(\);/g,
  'openFullScreen();'
);

// 4. In onTouchMove, we disabled vertical scroll yesterday, but we need to ensure it's still there
// "if (isFullScreen) e.preventDefault();" is already there.

fs.writeFileSync('src/app/components/EnergyGraph.tsx', graphContent);

// --- Fix energy/page.tsx ---
let pageContent = fs.readFileSync('src/app/energy/page.tsx', 'utf8');
pageContent = pageContent.replace(
  /className="bg-white rounded-2xl shadow-sm border-slate-200 overflow-hidden flex flex-col h-\[220px\] border"/g,
  'className="bg-white rounded-2xl shadow-sm border-slate-200 overflow-hidden flex flex-col border"'
);

fs.writeFileSync('src/app/energy/page.tsx', pageContent);

console.log("Updated both files.");
