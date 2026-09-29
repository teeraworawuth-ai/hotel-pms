const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const targetDateRender = `<span className="text-slate-600">{new Date(p.created_at).toLocaleString('th-TH')} - {p.category}</span>`;
const newDateRender = `<span className="text-slate-600">{p.category === 'transfer' && p.notes && p.notes.includes('โอนเวลา:') ? p.notes.split('โอนเวลา:')[1].trim() : new Date(p.created_at).toLocaleString('th-TH')} - {p.category}</span>`;

content = content.replace(targetDateRender, newDateRender);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
