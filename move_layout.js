const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const guestCountRegex = /<div>\s*<label className="block text-sm font-medium text-slate-700 mb-1">จำนวนผู้เข้าพัก \(คน\)<\/label>\s*<input \s*type="number" min="1" \s*value=\{guestCount\} onChange=\{\(e\) => setGuestCount\(e\.target\.value === '' \? '' : Number\(e\.target\.value\)\)\}\s*className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"\s*\/>\s*<\/div>/;

const nightsHoursRegex = /\{activeTab === 'overnight' \? \(\s*<div>\s*<label className="block text-sm font-medium text-slate-700 mb-1">จำนวนคืน 🌙<\/label>\s*<input \s*type="number" min="0" disabled=\{room\.status === 'occupied'\} value=\{nights\} onChange=\{\(e\) => setNights\(e\.target\.value === '' \? '' : Number\(e\.target\.value\)\)\}\s*className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"\s*\/>\s*<p className="text-xs text-slate-500 mt-2">\s*ออกวันที่: \{getNextNoon\(displayDate, Number\(nights\) \|\| 0\)\.toLocaleString\('th-TH'\)\}\s*<\/p>\s*<\/div>\s*\) : \(\s*<div>\s*<label className="block text-sm font-medium text-slate-700 mb-1">จำนวนชั่วโมง ⏳<\/label>\s*<input \s*type="number" min="1" \s*value=\{hours\} onChange=\{\(e\) => setHours\(e\.target\.value === '' \? '' : Number\(e\.target\.value\)\)\}\s*className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-amber-500 focus:border-amber-500 bg-slate-50 disabled:opacity-50"\s*\/>\s*<\/div>\s*\)\}/;

const guestCountMatch = content.match(guestCountRegex);
const nightsHoursMatch = content.match(nightsHoursRegex);

if (guestCountMatch && nightsHoursMatch) {
  content = content.replace(nightsHoursRegex, '');
  
  const combined = `<div className="grid grid-cols-2 gap-4">\n${guestCountMatch[0]}\n${nightsHoursMatch[0]}\n</div>`;
  content = content.replace(guestCountMatch[0], combined);
  
  fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
  console.log('Moved layout successfully');
} else {
  console.log('Regex did not match', !!guestCountMatch, !!nightsHoursMatch);
}
