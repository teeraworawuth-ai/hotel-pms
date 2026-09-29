const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const extrasUI = `                {/* --- Extra Charges UI --- */}
                {extraSettings.length > 0 && (
                <div className="pt-3 border-t border-slate-100 mb-4">
                  <label className="block text-sm font-bold text-slate-700 mb-2">เพิ่มค่าใช้จ่าย (Add Extras)</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {extraSettings.filter(e => e.ui_type === 'quick_button').map(e => (
                      <button 
                        key={e.id}
                        type="button"
                        onClick={() => handleAddExtra(e)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
                      >
                        + {e.name} (฿{e.price})
                      </button>
                    ))}
                  </div>
                  {extraSettings.filter(e => e.ui_type === 'dropdown').length > 0 && (
                    <select 
                      onChange={(e) => {
                        const setting = extraSettings.find(s => s.id === e.target.value);
                        if (setting) {
                          handleAddExtra(setting);
                          e.target.value = ""; // reset
                        }
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                      defaultValue=""
                    >
                      <option value="" disabled>-- เลือกรายการอื่นๆ --</option>
                      {extraSettings.filter(e => e.ui_type === 'dropdown').map(e => (
                        <option key={e.id} value={e.id}>{e.name} (฿{e.price})</option>
                      ))}
                    </select>
                  )}
                </div>
                )}
`;

const insertUIPoint = `{/* --- Past Payments History --- */}`;
content = content.replace(insertUIPoint, extrasUI + '\n                ' + insertUIPoint);

const breakdownExtrasUI = `                      {dailyExtras.length > 0 && dailyExtras.map((ext, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm text-slate-600">
                          <span>{ext.name} {ext.qty > 1 ? \`x\${ext.qty}\` : ''} {ext.isPerNight ? \`(\${nights || 1} คืน)\` : ''} <button onClick={() => handleRemoveExtra(ext.id)} className="text-[10px] text-rose-500 ml-1 hover:underline">ลบ</button></span>
                          <span>฿{Number(ext.amount).toLocaleString()}</span>
                        </div>
                      ))}`;

const breakdownPoint = `{keyDepositEnabled && (`;
content = content.replace(breakdownPoint, breakdownExtrasUI + '\n                      ' + breakdownPoint);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
