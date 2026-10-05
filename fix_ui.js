const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

const t = `      {loading ? (
        <div className="text-center py-20 text-slate-500">กำลังโหลดข้อมูล...</div>
      ) : (
        <div className="space-y-8">
          {sortedLocations.map(loc => {
            const locRooms = groupedRooms[loc].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));`;

const r = `      {/* Location Filter */}
      {!loading && sortedLocations.length > 0 && (
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

      {loading ? (
        <div className="text-center py-20 text-slate-500">กำลังโหลดข้อมูล...</div>
      ) : (
        <div className="space-y-8">
          {sortedLocations.filter(loc => !selectedLocationFilter || loc === selectedLocationFilter).map(loc => {
            const locRooms = groupedRooms[loc].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));`;

content = content.replace(t, r);
fs.writeFileSync('src/app/checkin/page.tsx', content, 'utf8');
console.log('Fixed UI');
