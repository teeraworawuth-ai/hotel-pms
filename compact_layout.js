const fs = require('fs');
let c = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

const targetLayout = `<div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">เลขห้อง *</label>
                    <input 
                      type="text" required
                      value={formData.room_no} onChange={e => setFormData({...formData, room_no: e.target.value})}
                      className="w-full p-2 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">ชั้น</label>
                    <input 
                      type="text"
                      value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})}
                      className="w-full p-2 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>



                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">สถานที่ (Location) *</label>
                    <input 
                      type="text" required
                      value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})}
                      className="w-full p-2 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      placeholder="เช่น ซอย 1, ตึก A"
                    />
                  </div>
                </div>`;

const replaceLayout = `<div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">เลขห้อง *</label>
                    <input type="text" required value={formData.room_no} onChange={e => setFormData({...formData, room_no: e.target.value})} className="w-full p-2 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">ชั้น</label>
                    <input type="text" value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})} className="w-full p-2 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">สถานที่ *</label>
                    <input type="text" required value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full p-2 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50" placeholder="ซอย 1" />
                  </div>
                </div>`;

c = c.replace(targetLayout, replaceLayout);


const targetTuya = `<div className="pt-4 border-t border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-600 mb-4 flex items-center gap-2">
                    ⚙️ ตั้งค่าระบบ Local Tuya Automation (ไม่บังคับ)
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Tuya Device ID</label>
                      <input 
                        type="text"
                        value={formData.tuya_device_id} onChange={e => setFormData({...formData, tuya_device_id: e.target.value})}
                        className="w-full p-2 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        placeholder="e.g. vdevo160981c72902hiuf"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Local Key</label>
                        <input 
                          type="text"
                          value={formData.tuya_local_key} onChange={e => setFormData({...formData, tuya_local_key: e.target.value})}
                          className="w-full p-2 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Device IP (LAN)</label>
                        <input 
                          type="text"
                          value={formData.tuya_ip} onChange={e => setFormData({...formData, tuya_ip: e.target.value})}
                          className="w-full p-2 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    </div>
                  </div>
                </div>`;

const replaceTuya = `<details className="pt-2 mt-2 border-t border-slate-100 group">
                  <summary className="text-sm font-semibold text-slate-600 py-2 flex items-center gap-2 cursor-pointer list-none select-none hover:text-slate-800 transition-colors">
                    ⚙️ ตั้งค่าระบบ Local Tuya Automation (ไม่บังคับ)
                    <span className="ml-auto text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="grid grid-cols-3 gap-3 pt-2 pb-2">
                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-slate-500 mb-1">Device ID</label>
                      <input type="text" value={formData.tuya_device_id} onChange={e => setFormData({...formData, tuya_device_id: e.target.value})} className="w-full p-2 bg-slate-50 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50" placeholder="vdevo..." />
                    </div>
                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-slate-500 mb-1">Local Key</label>
                      <input type="text" value={formData.tuya_local_key} onChange={e => setFormData({...formData, tuya_local_key: e.target.value})} className="w-full p-2 bg-slate-50 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                    </div>
                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-slate-500 mb-1">Device IP</label>
                      <input type="text" value={formData.tuya_ip} onChange={e => setFormData({...formData, tuya_ip: e.target.value})} className="w-full p-2 bg-slate-50 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                    </div>
                  </div>
                </details>`;

c = c.replace(targetLayout, replaceLayout);
c = c.replace(targetTuya, replaceTuya);

// One more check: decrease bottom margin of room type section
c = c.replace(/<div className="mb-6 grid grid-cols-2 gap-4">/g, `<div className="mb-3 grid grid-cols-2 gap-3">`);

// Also fix icon box padding
c = c.replace(/<div className="p-4 bg-slate-50 rounded-lg border border-slate-200">/g, `<div className="p-3 bg-slate-50 rounded-lg border border-slate-200">`);

fs.writeFileSync('src/app/settings/page.tsx', c, 'utf8');
console.log('Done compacting layout');
