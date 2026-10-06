const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

if (!content.includes('import { useShift }')) {
  content = content.replace('import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";', 'import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";\nimport { useShift } from "@/contexts/ShiftContext";');
  content = content.replace('const { getNow, simulatedTime } = useSimulatedTime();', 'const { getNow, simulatedTime } = useSimulatedTime();\n  const { activeShift } = useShift();');
}

const lines = content.split(/\r?\n/);
const idx = lines.findIndex(l => l.includes('{loading ? ('));
if (idx !== -1 && !content.includes('{/* Location Filter */}')) {
  const newLines = `
      {/* Location Filter */}
      {!loading && sortedLocations.length > 0 && activeShift?.staff_role !== 'staff' && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button 
            onClick={() => setSelectedLocationFilter(null)}
            className={\`px-4 py-2 rounded-full text-sm font-bold transition-colors \${selectedLocationFilter === null ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}\`}
          >
            ทั้งหมด
          </button>
          {sortedLocations.map(loc => (
            <button
              key={loc}
              onClick={() => setSelectedLocationFilter(loc)}
              className={\`px-4 py-2 rounded-full text-sm font-bold transition-colors \${selectedLocationFilter === loc ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}\`}
            >
              {loc}
            </button>
          ))}
        </div>
      )}
`.split('\n');
  lines.splice(idx, 0, ...newLines);
  
  const mapIdx = lines.findIndex((l, i) => i > idx && l.includes('{sortedLocations.map(loc => {'));
  if (mapIdx !== -1) {
    // Modify to filter by dynamic locations
    lines[mapIdx] = "          {sortedLocations.filter(loc => { if (activeShift?.staff_role === 'staff') { return activeShift.locations?.includes(loc) ?? false; } return !selectedLocationFilter || loc === selectedLocationFilter; }).map(loc => {";
  }
  
  fs.writeFileSync('src/app/checkin/page.tsx', lines.join('\n'), 'utf8');
  console.log('Fixed using array index for CheckinPage');
} else {
  console.log('Target line not found or already injected');
}
