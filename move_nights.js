const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const oldGuestUI = `                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนผู้เข้าพัก (คน)</label>
                  <input 
                    type="number" min="1" 
                    value={guestCount} onChange={(e) => setGuestCount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"
                  />
                </div>`;

const newCombinedUI = `                <div className="flex gap-4">
                  <div className="flex-[1]">
                    <label className="block text-sm font-medium text-slate-700 mb-1">ผู้เข้าพัก(คน)</label>
                    <input 
                      type="number" min="1" 
                      value={guestCount} onChange={(e) => setGuestCount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"
                    />
                  </div>
                  {activeTab === 'overnight' ? (
                    <div className="flex-[2]">
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex justify-between">
                        <span>จำนวนคืน 🌙</span>
                        <span className="text-[10.5px] text-slate-500">ออก: {getNextNoon(displayDate, Number(nights) || 0).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </label>
                      <input 
                        type="number" min="0" disabled={room.status === 'occupied'} value={nights} onChange={(e) => setNights(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"
                      />
                    </div>
                  ) : (
                    <div className="flex-[2]">
                      <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนชั่วโมง ⏳</label>
                      <input 
                        type="number" min="1" 
                        value={hours} onChange={(e) => setHours(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-amber-500 focus:border-amber-500 bg-slate-50 disabled:opacity-50"
                      />
                    </div>
                  )}
                </div>`;

content = content.replace(oldGuestUI, newCombinedUI);

const oldNightsUI = `                {activeTab === 'overnight' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนคืน 🌙</label>
                    <input 
                      type="number" min="0" disabled={room.status === 'occupied'} value={nights} onChange={(e) => setNights(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 disabled:opacity-50"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      ออกวันที่: {getNextNoon(displayDate, Number(nights) || 0).toLocaleString('th-TH')}
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนชั่วโมง ⏳</label>
                    <input 
                      type="number" min="1" 
                      value={hours} onChange={(e) => setHours(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-amber-500 focus:border-amber-500 bg-slate-50 disabled:opacity-50"
                    />
                  </div>
                )}`;

content = content.replace(oldNightsUI, '');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
