const fs = require('fs');
let content = fs.readFileSync('src/app/components/StaffSettings.tsx', 'utf8');

// Add type="button" to the cancel button just in case too
content = content.replace(/<button \s*onClick=\{\(\) => setIsModalOpen\(false\)\}/g, '<button type="button" onClick={() => setIsModalOpen(false)}');

// Fix toggle locations buttons
content = content.replace(/<button\s+key=\{loc\}\s+onClick=\{\(\) => handleToggleLocation/g, '<button type="button" key={loc} onClick={() => handleToggleLocation');

// Improve descriptive text
content = content.replace(
  '<label className="block text-sm font-bold text-amber-800 mb-2">สถานที่ที่อนุญาตให้ผู้ทดสอบมองเห็น</label>',
  '<label className="block text-sm font-bold text-amber-800 mb-2">📍 กรุณาคลิกเลือกสถานที่ด้านล่าง เพื่ออนุญาตให้ผู้ทดสอบมองเห็น (คลิกเพื่อให้เป็นสีส้ม)</label>'
);

fs.writeFileSync('src/app/components/StaffSettings.tsx', content, 'utf8');
console.log('Fixed StaffSettings UI instructions');
