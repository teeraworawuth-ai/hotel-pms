const fs = require('fs');

function applyPlanUI() {
  let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

  const uiStartTag = '{/* --- Extra Charges UI --- */}';
  const uiEndTag = '{/* --- Split Payment UI --- */}';
  
  const uiStart = content.indexOf(uiStartTag);
  const uiEnd = content.indexOf(uiEndTag);
  
  if (uiStart !== -1 && uiEnd !== -1) {
    const newUI = `{/* --- Extra Charges UI --- */}
                {extraSettings.length > 0 && (
                <div className="pt-3 border-t border-slate-100 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-slate-700">เพิ่มค่าใช้จ่าย (Add Extras)</label>
                    {(room.status === 'reserved' || room.status === 'occupied') && !extrasManagerUnlocked && (
                      <button type="button" onClick={() => setShowExtrasPinPrompt(true)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded font-medium flex items-center gap-1">
                        🔒 ปลดล็อกแก้ไข (Manager)
                      </button>
                    )}
                  </div>
                  
                  {room.status !== 'occupied' && (
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
                  )}
                  
                  {extraSettings.filter(e => e.ui_type === 'dropdown').length > 0 && room.status !== 'occupied' && (
                    <select 
                      onChange={(e) => {
                        const setting = extraSettings.find(s => s.id === e.target.value);
                        if (setting) {
                          handleAddExtra(setting);
                          e.target.value = ""; // reset
                        }
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 mb-3"
                      defaultValue=""
                    >
                      <option value="" disabled>-- เลือกรายการอื่นๆ --</option>
                      {extraSettings.filter(e => e.ui_type === 'dropdown').map(e => (
                        <option key={e.id} value={e.id}>{e.name} (฿{e.price})</option>
                      ))}
                    </select>
                  )}

                  {dailyExtras.length > 0 && (
                    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-600">รายการที่เลือก</span>
                        {extrasManagerUnlocked && <span className="text-xs font-bold text-rose-600">🔓 โหมดผู้จัดการ: {extrasManagerName}</span>}
                      </div>
                      <div className="p-2 space-y-2">
                        {dailyExtras.map(ext => {
                          const isLocked = ext.isSaved && !extrasManagerUnlocked;
                          const showControls = !isLocked && room.status !== 'occupied';
                          return (
                            <div key={ext.id} className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 text-sm shadow-sm">
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-700 flex items-center gap-1">
                                  {ext.isSaved && <span title="บันทึกแล้ว" className="text-xs">🔒</span>} 
                                  {ext.name} {ext.isPerNight ? '(ต่อคืน)' : ''}
                                </span>
                                {showControls && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-slate-500">฿{ext.price} ×</span>
                                    <button type="button" onClick={() => handleChangeExtraQty(ext.id, -1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold flex items-center justify-center">-</button>
                                    <span className="font-bold w-4 text-center">{ext.qty || 1}</span>
                                    <button type="button" onClick={() => handleChangeExtraQty(ext.id, 1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold flex items-center justify-center">+</button>
                                  </div>
                                )}
                                {isLocked && (ext.qty || 1) > 1 && (
                                  <span className="text-xs text-slate-500 mt-0.5">จำนวน: {ext.qty}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-slate-900">฿{extraLineTotal(ext).toLocaleString()}</span>
                                {showControls && (
                                  <button type="button" onClick={() => handleRemoveExtra(ext.id)} className="text-rose-500 hover:text-rose-700 font-bold px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded">✕</button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        
                        {extrasManagerUnlocked && dailyExtras.some(e => e.isSaved && e.isModified) && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <input 
                              type="text" 
                              placeholder="หมายเหตุการแก้ไข (บังคับกรอก)..." 
                              value={extrasEditNote}
                              onChange={e => setExtrasEditNote(e.target.value)}
                              className="w-full border border-rose-200 rounded px-2 py-1.5 text-sm focus:ring-rose-500 focus:border-rose-500 bg-rose-50"
                            />
                            {!extrasEditNote.trim() && <p className="text-xs text-rose-500 mt-1">* กรุณาระบุหมายเหตุการแก้ไข</p>}
                          </div>
                        )}
                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                          <span className="font-bold text-slate-600">รวมค่าใช้จ่ายเพิ่ม</span>
                          <span className="font-bold text-emerald-600">฿{getTotalExtrasAmount().toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )}

                {/* --- Extras PIN Prompt Modal --- */}
                {showExtrasPinPrompt && (
                  <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[70] backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                      <div className="bg-slate-800 p-4 text-white">
                        <h3 className="font-bold text-lg">ปลดล็อกแก้ไขรายการ (Manager)</h3>
                      </div>
                      <div className="p-4 space-y-4">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN ผู้จัดการ/Admin</label>
                          <input 
                            type="password" 
                            value={extrasPin}
                            onChange={(e) => setExtrasPin(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg p-3 text-center text-xl font-mono tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="****"
                            autoFocus
                            maxLength={6}
                          />
                        </div>
                        {extrasPinError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 font-medium">{extrasPinError}</div>}
                        <div className="flex gap-2 pt-2">
                          <button type="button" onClick={() => { setShowExtrasPinPrompt(false); setExtrasPinError(''); setExtrasPin(''); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-colors">ยกเลิก</button>
                          <button type="button" onClick={handleVerifyExtrasPin} disabled={loading || !extrasPin} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-sm shadow-blue-200">ยืนยัน</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                `;
    content = content.substring(0, uiStart) + newUI + content.substring(uiEnd);
  }

  // Update summary block
  const summaryStart = content.indexOf('<span className="text-xs font-bold text-slate-500">ยอดรวมทั้งหมด:</span>');
  if (summaryStart !== -1) {
    const newSummaryLines = `
                      {dailyExtras.length > 0 && dailyExtras.map(ext => (
                        <div key={'sum-'+ext.id} className="flex justify-between items-center text-sm text-slate-600">
                          <span>{ext.name} {(ext.qty || 1) > 1 ? '× ' + ext.qty : ''}:</span>
                          <span>฿{extraLineTotal(ext).toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100">
                        <span className="text-xs font-bold text-slate-500">ยอดรวมทั้งหมด:</span>`;
    
    // Find the enclosing border-t border-slate-100 div of the summary
    const wrapDivIdx = content.lastIndexOf('<div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100">', summaryStart);
    if (wrapDivIdx !== -1) {
      content = content.substring(0, wrapDivIdx) + newSummaryLines + content.substring(summaryStart + 76);
    }
  }

  fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
  console.log('Phase 2 applied');
}

applyPlanUI();
