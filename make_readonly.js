const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

// Title change
content = content.replace(
  /<h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">([\s\S]*?)<\/h2>/,
  (match, inner) => {
    return `<h2 className="text-2xl font-black text-slate-800 flex flex-col gap-1">
            <div className="flex items-center gap-3">
              ${inner}
            </div>
            {room.status === 'occupied' && (
              <span className="text-sm font-normal text-slate-500 bg-slate-100 px-3 py-1 rounded-full self-start">
                🔒 โหมดดูข้อมูล (เช็คอินแล้ว)
              </span>
            )}
          </h2>`;
  }
);

// Disable inputs
content = content.replace(
  /value=\{guestName\} onChange=\{\(e\) => setGuestName\(e\.target\.value\)\}/g,
  `value={guestName} onChange={(e) => setGuestName(e.target.value)} disabled={room.status === 'occupied'}`
);

content = content.replace(
  /value=\{guestPhone\} onChange=\{\(e\) => setGuestPhone\(e\.target\.value\.replace\(\/\\D\/g, ''\)\)\}/g,
  `value={guestPhone} onChange={(e) => setGuestPhone(e.target.value.replace(/\\D/g, ''))} disabled={room.status === 'occupied'}`
);

content = content.replace(
  /value=\{guestCount\} onChange=\{\(e\) => setGuestCount\(e\.target\.value === '' \? '' : Number\(e\.target\.value\)\)\}/g,
  `value={guestCount} onChange={(e) => setGuestCount(e.target.value === '' ? '' : Number(e.target.value))} disabled={room.status === 'occupied'}`
);

content = content.replace(
  /value=\{actualPrice\} onChange=\{\(e\) => setActualPrice\(e\.target\.value === '' \? '' : Number\(e\.target\.value\)\)\}/g,
  `value={actualPrice} onChange={(e) => setActualPrice(e.target.value === '' ? '' : Number(e.target.value))} disabled={room.status === 'occupied'}`
);

content = content.replace(
  /value=\{staffName\} onChange=\{\(e\) => setStaffName\(e\.target\.value\)\}/g,
  `value={staffName} onChange={(e) => setStaffName(e.target.value)} disabled={room.status === 'occupied'}`
);

content = content.replace(
  /onChange=\{e => setKeyDepositEnabled\(e\.target\.checked\)\}/g,
  `onChange={e => setKeyDepositEnabled(e.target.checked)} disabled={room.status === 'occupied'}`
);

content = content.replace(
  /onChange=\{e => setKeyDepositAmount\(e\.target\.value === '' \? '' : Number\(e\.target\.value\)\)\}/g,
  `onChange={e => setKeyDepositAmount(e.target.value === '' ? '' : Number(e.target.value))} disabled={room.status === 'occupied'}`
);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
console.log('Disabled inputs successfully');
