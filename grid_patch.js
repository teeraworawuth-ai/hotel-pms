const fs = require('fs');
let c = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

const targetRegex = /<div className="space-y-4">[\s\S]*?\{loading \? \([\s\S]*?🗑️ ลบ[\s\S]*?<\/button>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\)\)[\s\S]*?\}[\s\S]*?<\/div>/;

const replacement = `<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {loading ? (
          <div className="text-center py-10 text-slate-500 col-span-full">กำลังโหลดข้อมูล...</div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-500 col-span-full">
            ยังไม่มีข้อมูลห้องพัก
          </div>
        ) : (
          rooms
            .filter(room => activeLocation === "ทั้งหมด" || (room.location || "ไม่มีสถานที่") === activeLocation)
            .map((room) => (
            <div key={room.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-all group relative">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-slate-50 text-slate-800 text-xl font-black py-1.5 px-3 rounded-lg border border-slate-200/60 flex items-center justify-center gap-1">
                  {room.room_no} 
                  {roomIconsMap[room.id] && roomIconsMap[room.id].length > 0 && (
                    <span className="flex items-center gap-1 ml-1">
                      {roomIconsMap[room.id].map(id => <span key={id} className="text-slate-700">{renderIcon(id, 'w-4 h-4')}</span>)}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openModal(room)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="แก้ไข">✏️</button>
                  <button onClick={() => handleDelete(room.id, room.room_no)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="ลบ">🗑️</button>
                </div>
              </div>
              
              <div className="flex flex-col gap-2 flex-1 text-sm">
                <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                  <span className="text-slate-500">ประเภทห้อง</span>
                  <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">{room.room_type || "ไม่ระบุ"}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                  <span className="text-slate-500">สถานที่</span>
                  <span className="font-semibold text-slate-700">{room.location || "ไม่มีสถานที่"}</span>
                </div>
                <div className="flex justify-between items-center mt-auto pt-1">
                  <span className="text-slate-500">สถานะ IoT</span>
                  {room.tuya_device_id ? (
                    (() => {
                      let isOnline = false;
                      if (room.last_active_at) {
                        const lastActive = new Date(room.last_active_at).getTime();
                        const now = new Date().getTime();
                        if (now - lastActive <= 300000) isOnline = true;
                      }
                      return isOnline ? (
                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>ออนไลน์
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-red-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>ออฟไลน์
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>ไม่มีระบบ
                    </span>
                  )}
                </div>
                {roomOptionsMap[room.id] && (
                  <div className="mt-2 text-xs text-slate-400 bg-slate-50 p-2 rounded-lg italic">
                    ออปชัน: {roomOptionsMap[room.id]}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>`;

c = c.replace(targetRegex, replacement);
fs.writeFileSync('src/app/settings/page.tsx', c, 'utf8');
console.log('Room list grid applied');
