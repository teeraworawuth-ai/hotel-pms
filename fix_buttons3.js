const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const target = `<div className="flex gap-2 w-full mt-6">\r
                {dateOffset === 0 && activeTab === 'overnight' && (\r
                  <button \r
                    onClick={() => handleCheckIn(activeTab, true)} disabled={loading}\r
                    className="w-1/2 py-4 text-white font-bold rounded-xl text-lg transition-all active:scale-95 bg-purple-600 hover:bg-purple-700 shadow-purple-600/20 shadow-lg"\r
                  >\r
                    📝 จองไว้ก่อน\r
                  </button>\r
                )}\r
                <button \r
                  onClick={() => handleCheckIn(activeTab)} disabled={loading}\r
                  className={\`\${dateOffset === 0 && activeTab === 'overnight' ? 'w-1/2' : 'w-full'} py-4 text-white font-bold rounded-xl text-lg transition-all active:scale-95 \${dateOffset > 0 ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20 shadow-lg' : activeTab === 'overnight' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 shadow-lg' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 shadow-lg'}\`}\r
                >\r
                  {loading ? 'กำลังบันทึก...' : dateOffset > 0 ? '📅 บันทึกการจองล่วงหน้า' : activeTab === 'overnight' ? (timeBand === 'late_night' ? \`✅ check-in (เมื่อวานนี้) = \${nights} คืน\` : timeBand === 'early_in' ? \`✅ early+check-in = \${nights} คืน\` : \`✅ check-in = \${nights} คืน\`) : \`✅ Check-in ชั่วคราว\`}\r
                </button>\r
              </div>`;

const newTarget = `              {room.status !== 'occupied' && (\r
                <div className="flex gap-2 w-full mt-6">\r
                  {room.status === 'reserved' ? (\r
                    <>\r
                      <button \r
                        onClick={handleAdditionalPayment} disabled={loading}\r
                        className="w-1/2 py-4 text-white font-bold rounded-xl text-lg transition-all active:scale-95 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20 shadow-lg"\r
                      >\r
                        💾 บันทึกรับชำระเพิ่ม\r
                      </button>\r
                      <button \r
                        onClick={handleCheckInReserved} disabled={loading}\r
                        className="w-1/2 py-4 text-white font-bold rounded-xl text-lg transition-all active:scale-95 bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 shadow-lg"\r
                      >\r
                        🚪 Check-in ทันที\r
                      </button>\r
                    </>\r
                  ) : (\r
                    <>\r
                      {dateOffset === 0 && activeTab === 'overnight' && (\r
                        <button \r
                          onClick={() => handleCheckIn(activeTab, true)} disabled={loading}\r
                          className="w-1/2 py-4 text-white font-bold rounded-xl text-lg transition-all active:scale-95 bg-purple-600 hover:bg-purple-700 shadow-purple-600/20 shadow-lg"\r
                        >\r
                          📝 จองไว้ก่อน\r
                        </button>\r
                      )}\r
                      <button \r
                        onClick={() => handleCheckIn(activeTab)} disabled={loading}\r
                        className={\`\${dateOffset === 0 && activeTab === 'overnight' ? 'w-1/2' : 'w-full'} py-4 text-white font-bold rounded-xl text-lg transition-all active:scale-95 \${dateOffset > 0 ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20 shadow-lg' : activeTab === 'overnight' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 shadow-lg' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 shadow-lg'}\`}\r
                      >\r
                        {loading ? 'กำลังบันทึก...' : dateOffset > 0 ? '📅 บันทึกการจองล่วงหน้า' : activeTab === 'overnight' ? (timeBand === 'late_night' ? \`✅ check-in (เมื่อวานนี้) = \${nights} คืน\` : timeBand === 'early_in' ? \`✅ early+check-in = \${nights} คืน\` : \`✅ check-in = \${nights} คืน\`) : \`✅ Check-in ชั่วคราว\`}\r
                      </button>\r
                    </>\r
                  )}\r
                </div>\r
              )}`;

if(content.includes(target)) {
  content = content.replace(target, newTarget);
  console.log('Replaced');
} else {
  console.log('Not found');
}
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
