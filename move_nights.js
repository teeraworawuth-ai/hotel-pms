const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const oldGuestCount = `                <div>\r
                  <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนผู้เข้าพัก (คน)</label>\r
                  <input \r
                    type="number" min="1" \r
                    value={guestCount} onChange={(e) => setGuestCount(e.target.value === '' ? '' : Number(e.target.value))}\r
                    className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"\r
                  />\r
                </div>`;

const newCombined = `                <div className="grid grid-cols-2 gap-4">\r
                  <div>\r
                    <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนผู้เข้าพัก (คน)</label>\r
                    <input \r
                      type="number" min="1" \r
                      value={guestCount} onChange={(e) => setGuestCount(e.target.value === '' ? '' : Number(e.target.value))}\r
                      className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"\r
                    />\r
                  </div>\r
                  {activeTab === 'overnight' ? (\r
                    <div>\r
                      <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนคืน 🌙</label>\r
                      <input \r
                        type="number" min="0" disabled={room.status === 'occupied'} value={nights} onChange={(e) => setNights(e.target.value === '' ? '' : Number(e.target.value))}\r
                        className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"\r
                      />\r
                      <p className="text-xs text-slate-500 mt-2">\r
                        ออกวันที่: {getNextNoon(displayDate, Number(nights) || 0).toLocaleString('th-TH')}\r
                      </p>\r
                    </div>\r
                  ) : (\r
                    <div>\r
                      <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนชั่วโมง ⏳</label>\r
                      <input \r
                        type="number" min="1" \r
                        value={hours} onChange={(e) => setHours(e.target.value === '' ? '' : Number(e.target.value))}\r
                        className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-amber-500 focus:border-amber-500 bg-slate-50 disabled:opacity-50"\r
                      />\r
                    </div>\r
                  )}\r
                </div>`;

content = content.replace(oldGuestCount, newCombined);

const bottomNightsRegex = /                \{activeTab === 'overnight' \? \(\r?\n                  <div>\r?\n                    <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนคืน 🌙<\/label>\r?\n                    <input \r?\n                      type="number" min="0" disabled=\{room\.status === 'occupied'\} value=\{nights\} onChange=\{\(e\) => setNights\(e\.target\.value === '' \? '' : Number\(e\.target\.value\)\)\}\r?\n                      className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"\r?\n                    \/>\r?\n                    <p className="text-xs text-slate-500 mt-2">\r?\n                      ออกวันที่: \{getNextNoon\(displayDate, Number\(nights\) \|\| 0\)\.toLocaleString\('th-TH'\)\}\r?\n                    <\/p>\r?\n                  <\/div>\r?\n                \) : \(\r?\n                  <div>\r?\n                    <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนชั่วโมง ⏳<\/label>\r?\n                    <input \r?\n                      type="number" min="1" \r?\n                      value=\{hours\} onChange=\{\(e\) => setHours\(e\.target\.value === '' \? '' : Number\(e\.target\.value\)\)\}\r?\n                      className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-amber-500 focus:border-amber-500 bg-slate-50 disabled:opacity-50"\r?\n                    \/>\r?\n                  <\/div>\r?\n                \)}/;

content = content.replace(bottomNightsRegex, '');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
