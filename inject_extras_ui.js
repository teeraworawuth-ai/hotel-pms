const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const extrasUI = `
                                      <div className="relative">
                                        <span className="absolute left-2 top-2 text-xs">{icon}</span>
                                        <input 
                                          type="number" min="0" 
                                          value={day.actualPrice} 
                                          onChange={(e) => updateDailyActualPrice(day.date, e.target.value)}
                                          className={\`w-full border rounded-lg pl-7 pr-2 py-1.5 font-bold \${colorClass} \${bgClass} transition-colors\`}
                                        />
                                      </div>
                                      
                                      {/* Render Extras for this day */}
                                      {dailyExtras.filter(e => e.target_date === day.date).map((ext, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-xs mt-1 bg-slate-50 p-1 rounded border border-slate-100">
                                          <span className="truncate flex-1 text-slate-600" title={ext.description}>{ext.category} {ext.description && \`(\${ext.description})\`}</span>
                                          <span className={\`font-bold \${ext.amount < 0 ? 'text-red-500' : 'text-purple-600'}\`}>
                                            {ext.amount > 0 ? '+' : ''}{ext.amount}
                                          </span>
                                          <button type="button" onClick={() => setDailyExtras(prev => prev.filter(p => p !== ext))} className="text-slate-400 hover:text-red-600 ml-1 px-1">×</button>
                                        </div>
                                      ))}
                                      <button type="button" onClick={() => { setExtraForm({...extraForm, targetDate: day.date, applyToAll: false}); setIsExtraModalOpen(true); }} className="text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 font-bold mt-1 flex items-center gap-1 w-full justify-center py-1 border border-dashed border-purple-200 rounded transition-colors">
                                        + เพิ่มรายการ/ส่วนลด
                                      </button>
`;

content = content.replace(
  /<div className="relative">\n\s*<span className="absolute left-2 top-2 text-xs">\{icon\}<\/span>\n\s*<input\s*type="number" min="0"\s*value=\{day\.actualPrice\}\s*onChange=\{\(e\) => updateDailyActualPrice\(day\.date, e\.target\.value\)\}\s*className=\{`w-full border rounded-lg pl-7 pr-2 py-1\.5 font-bold \$\{colorClass\} \$\{bgClass\} transition-colors`\}\s*\/>\n\s*<\/div>/g,
  extrasUI
);

const addExtraModalUI = `
      {/* Extra Items Modal */}
      {isExtraModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsExtraModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-800">เพิ่มรายการ/ส่วนลด</h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">หมวดหมู่</label>
                <select 
                  value={extraForm.category}
                  onChange={(e) => {
                    const newCat = e.target.value;
                    const isDiscount = newCat.includes('ส่วนลด');
                    setExtraForm({...extraForm, category: newCat, amount: isDiscount ? -Math.abs(extraForm.amount) : Math.abs(extraForm.amount)});
                  }}
                  className="w-full border-slate-200 rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-purple-500"
                >
                  <option value="เตียงเสริม/อุปกรณ์">🛏️ เตียงเสริม / อุปกรณ์</option>
                  <option value="อาหาร/มินิบาร์">🍜 อาหาร / มินิบาร์</option>
                  <option value="ส่วนลดสมาชิก">📉 ส่วนลดสมาชิก (ลด)</option>
                  <option value="ส่วนลดโปรโมชั่น">🎁 ส่วนลดโปรโมชั่น (ลด)</option>
                  <option value="ค่าปรับ/อื่นๆ">⚠️ ค่าปรับ / อื่นๆ</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">รายละเอียด (ระบุเอง)</label>
                <input 
                  type="text" 
                  placeholder="เช่น หมอน 2 ใบ, ลูกค้าเก่า"
                  value={extraForm.description}
                  onChange={(e) => setExtraForm({...extraForm, description: e.target.value})}
                  className="w-full border-slate-200 rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">จำนวนเงิน</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">฿</span>
                  <input 
                    type="number" 
                    value={extraForm.amount === 0 ? '' : extraForm.amount}
                    onChange={(e) => setExtraForm({...extraForm, amount: e.target.value === '' ? 0 : Number(e.target.value)})}
                    className="w-full border-slate-200 rounded-xl pl-8 pr-4 py-2 font-bold focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                {extraForm.category.includes('ส่วนลด') && extraForm.amount > 0 && (
                  <p className="text-xs text-red-500 mt-1">* ระบบจะแปลงเป็นค่าติดลบอัตโนมัติเมื่อบันทึก</p>
                )}
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={extraForm.applyToAll}
                    onChange={(e) => setExtraForm({...extraForm, applyToAll: e.target.checked})}
                    className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm font-medium text-slate-700">คัดลอกรายการนี้ให้ "ทุกวัน" ที่เข้าพัก</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setIsExtraModalOpen(false)}
                className="flex-1 py-2 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const finalAmount = extraForm.category.includes('ส่วนลด') ? -Math.abs(extraForm.amount) : extraForm.amount;
                  if (finalAmount === 0) return;
                  
                  if (extraForm.applyToAll) {
                    const newExtras = dailyBreakdown.map(d => ({
                      id: Math.random().toString(36).substr(2, 9),
                      target_date: d.date,
                      category: extraForm.category,
                      description: extraForm.description,
                      amount: finalAmount
                    }));
                    setDailyExtras(prev => [...prev, ...newExtras]);
                  } else {
                    setDailyExtras(prev => [...prev, {
                      id: Math.random().toString(36).substr(2, 9),
                      target_date: extraForm.targetDate,
                      category: extraForm.category,
                      description: extraForm.description,
                      amount: finalAmount
                    }]);
                  }
                  setIsExtraModalOpen(false);
                  setExtraForm({ category: 'เตียงเสริม/อุปกรณ์', description: '', amount: 0, applyToAll: false, targetDate: '' });
                }}
                className="flex-1 py-2 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace(
  /<\/div>\n\s*<\/div>\n\s*\);\n\}/g,
  `\n${addExtraModalUI}\n      </div>\n    </div>\n  );\n}`
);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
console.log('Extras UI injected.');
