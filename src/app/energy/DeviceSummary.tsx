"use client";

type Room = {
  id: string;
  room_no: string;
  room_type: string;
  tuya_device_id: string | null;
  location: string | null;
  last_active_at: string | null;
  latest_wattage: number | null;
  sort_order: number;
};

export default function DeviceSummary({ rooms, dateOffset }: { rooms: Room[], dateOffset: number }) {
  const isOnline = (lastActive: string | null) => {
    if (dateOffset !== 0) return true;
    if (!lastActive) return false;
    const diff = new Date().getTime() - new Date(lastActive).getTime();
    return diff < 15 * 60 * 1000;
  };

  const stats = rooms.reduce((acc, room) => {
    const loc = room.location || "ไม่ได้ระบุสถานที่";
    if (!acc[loc]) {
      acc[loc] = { total: 0, online: 0, offline: 0, inUse: 0, standby: 0 };
    }
    const online = isOnline(room.last_active_at);
    const wattage = room.latest_wattage || 0;
    
    acc[loc].total += 1;
    if (online) {
      acc[loc].online += 1;
      if (wattage > 0) acc[loc].inUse += 1;
      else acc[loc].standby += 1;
    } else {
      acc[loc].offline += 1;
    }
    return acc;
  }, {} as Record<string, { total: number, online: number, offline: number, inUse: number, standby: number }>);

  const sortedLocations = Object.keys(stats).sort((a, b) => {
    if (a === "ไม่ได้ระบุสถานที่") return 1;
    if (b === "ไม่ได้ระบุสถานที่") return -1;
    return a.localeCompare(b, 'th');
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {sortedLocations.map((loc) => {
        const data = stats[loc];
        return (
          <div key={loc} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">{loc}</h3>
              <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-full">
                รวม {data.total}
              </span>
            </div>
            
            <div className="p-4 grid grid-cols-2 gap-3 flex-1">
              <div className="bg-emerald-50 rounded-lg p-3 flex flex-col items-center justify-center text-center">
                <span className="text-emerald-500 text-[10px] font-bold mb-1 uppercase tracking-wider">ออนไลน์</span>
                <span className="text-2xl font-black text-emerald-600 leading-none">{data.online}</span>
              </div>
              
              <div className="bg-red-50 rounded-lg p-3 flex flex-col items-center justify-center text-center">
                <span className="text-red-500 text-[10px] font-bold mb-1 uppercase tracking-wider">ออฟไลน์</span>
                <span className="text-2xl font-black text-red-600 leading-none">{data.offline}</span>
              </div>
              
              <div className="bg-amber-50 rounded-lg p-3 flex flex-col items-center justify-center text-center">
                <span className="text-amber-500 text-[10px] font-bold mb-1 uppercase tracking-wider">ใช้งานอยู่</span>
                <span className="text-xl font-black text-amber-600 leading-none">{data.inUse}</span>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-3 flex flex-col items-center justify-center text-center border border-slate-100">
                <span className="text-slate-400 text-[10px] font-bold mb-1 uppercase tracking-wider">สแตนด์บาย</span>
                <span className="text-xl font-black text-slate-500 leading-none">{data.standby}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
