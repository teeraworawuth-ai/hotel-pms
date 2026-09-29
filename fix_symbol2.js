const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

content = content.replace(/<span className="font-bold text-emerald-600">.*?\{Math\.abs\(p\.amount\)\.toLocaleString\(\)\}<\/span>/g, '<span className="font-bold text-emerald-600">฿{Math.abs(p.amount).toLocaleString()}</span>');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
