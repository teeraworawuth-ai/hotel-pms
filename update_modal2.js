const fs = require('fs');
let code = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const uiInjection = `
        >
          {showVoidPinPrompt && (
            <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-200">
                <h3 className="text-xl font-black text-slate-800 mb-2">🔒 Admin Override</h3>
                <p className="text-sm text-slate-500 mb-6">กรุณาใส่รหัส PIN ของ Admin หรือ Manager</p>
                <input type="password" value={voidPin} onChange={e => setVoidPin(e.target.value)} className="w-full text-center text-3xl tracking-[1em] font-black py-4 bg-slate-50 border border-slate-200 rounded-xl mb-4 focus:ring-purple-500" placeholder="****" maxLength={4} autoFocus />
                {voidError && <p className="text-red-500 text-sm mb-4 text-center">{voidError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setShowVoidPinPrompt(false)} className="flex-1 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300">ยกเลิก</button>
                  <button onClick={handleVerifyVoidPin} disabled={loading} className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700">ยืนยัน</button>
                </div>
              </div>
            </div>
          )}
          
          {showVoidPanel && (
            <div className="absolute inset-0 z-50 bg-white flex flex-col h-full">
              <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-black text-red-600 text-lg">⚠️ ยกเลิกการเข้าพัก (Void)</h3>
                  <p className="text-xs text-red-500 font-semibold">เวลาเข้าพัก: {Math.floor((Date.now() - new Date(room.check_in_time!).getTime()) / 60000)} นาที</p>
                </div>
                <button onClick={() => setShowVoidPanel(false)} className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm text-slate-400 hover:text-slate-600">✕</button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {voidError && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200">{voidError}</div>}
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ยอดเงินที่จะคืนลูกค้า (Refund Amount)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-400 font-bold">฿</span>
                    <input type="number" min="0" value={voidRefundAmount} onChange={e => setVoidRefundAmount(e.target.value === '' ? '' : Number(e.target.value))} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-lg focus:ring-red-500 focus:border-red-500" placeholder="0" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">*ยอดที่ไม่คืนจะถูกบันทึกเป็นรายได้ค่าปรับ (Penalty)</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">สาเหตุการยกเลิก (Reason) <span className="text-red-500">*</span></label>
                  <textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-red-500 text-sm" placeholder="เช่น ลูกค้าเปลี่ยนใจ, แอร์ไม่เย็น..." rows={2}></textarea>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">สถานะห้องหลังยกเลิก</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setVoidRoomStatus('available')} className={'py-3 rounded-xl font-bold border-2 ' + (voidRoomStatus === 'available' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-white text-slate-400')}>✅ ว่าง (สะอาด)</button>
                    <button onClick={() => setVoidRoomStatus('dirty')} className={'py-3 rounded-xl font-bold border-2 ' + (voidRoomStatus === 'dirty' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-100 bg-white text-slate-400')}>🧹 รอทำความสะอาด</button>
                  </div>
                </div>
              </div>
              
              <div className="p-4 border-t border-slate-100 shrink-0">
                <button onClick={handleExecuteVoid} disabled={loading} className="w-full py-4 bg-red-600 text-white font-black rounded-xl text-lg hover:bg-red-700 active:scale-95 transition-all shadow-lg shadow-red-600/20">กดยืนยันการ Void (ขีดฆ่าบัญชี)</button>
              </div>
            </div>
          )}
`;

code = code.replace('        onClick={e => e.stopPropagation()}\n        >', '        onClick={e => e.stopPropagation()}\n        >' + uiInjection);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', code, 'utf8');