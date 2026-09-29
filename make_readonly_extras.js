const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const regex = /<div className="flex gap-2">\s*<select \s*value=\{selectedExtraIndex\} onChange=\{e => setSelectedExtraIndex\(e\.target\.value\)\}\s*className="flex-1 border-slate-200 rounded-lg text-sm bg-white p-2"\s*>\s*<option value="">-- เลือกรายการ --<\/option>\s*\{EXTRA_ITEMS\.map\(\(e, i\) => \(\s*<option key=\{i\} value=\{i\}>\{e\.name\} \(\+\{e\.price\}\{e\.isPerNight \? '\/คืน' : ''\}\)<\/option>\s*\)\)\}\s*<\/select>\s*<button type="button" onClick=\{handleAddSelectedExtra\} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm">\s*เพิ่ม\s*<\/button>\s*<\/div>/;

if (regex.test(content)) {
  content = content.replace(regex, (match) => `{room.status !== 'occupied' && ( ${match} )}`);
  fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
  console.log('Disabled Add Extra dropdown');
} else {
  console.log('Could not find Add Extra dropdown');
}

const removeExtraRegex = /<button onClick=\{\(\) => handleRemoveExtra\(ext\.id\)\} className="text-\[10px\] text-rose-500 ml-1 hover:underline">ลบ<\/button>/g;
content = content.replace(removeExtraRegex, (match) => `{room.status !== 'occupied' && (${match})}`);
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
console.log('Disabled Remove Extra button');
