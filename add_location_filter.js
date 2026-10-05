const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

const filterUI = \`
      {/* Location Filter */}
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
\`;

content = content.replace('{loading ? (', filterUI + '\n      {loading ? (');

const mapStart = '{sortedLocations.map(loc => {';
const mapRepl = '{sortedLocations.filter(loc => !selectedLocationFilter || loc === selectedLocationFilter).map(loc => {';
content = content.replace(mapStart, mapRepl);

fs.writeFileSync('src/app/checkin/page.tsx', content, 'utf8');
console.log('Added Location Filter UI');
