const fs = require('fs');
let code = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const oldBlock = `
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col shadow-sm">
              <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[200px]">
                {loading && transactions.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>
                ) : transactions.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">ไม่มีรายการค้างชำระ</p>
                ) : (
                  transactions.map(tx => {
                    const isVoid = tx.category.includes('Voided');
                    return (
                      <div key={tx.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg text-sm border-b border-slate-50 last:border-0">
                        <div className={isVoid ? 'line-through text-slate-400 opacity-60' : ''}>
                          <p className="font-bold text-slate-700">{tx.category === 'room_charge' ? 'ค่าห้องพัก' : tx.category}</p>
                          <p className="text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleTimeString('th-TH')} ({tx.staff_name})</p>
                        </div>
                        <div className={` + '`' + `font-black \\${isVoid ? 'line-through text-slate-400 opacity-60' : tx.amount < 0 ? 'text-emerald-600' : 'text-slate-800'}` + '`' + `}>
                          {tx.amount < 0 ? '' : '+'}{Number(tx.amount).toLocaleString()}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              <div className="bg-slate-100 p-4 border-t border-slate-200 flex justify-between items-center">
                <span className="font-bold text-slate-600">ยอดคงเหลือที่ต้องชำระ:</span>
                <span className={` + '`' + `text-2xl font-black \\${balance > 0 ? 'text-rose-600' : balance < 0 ? 'text-purple-600' : 'text-emerald-600'}` + '`' + `}>
                  ฿{balance.toLocaleString()}
                </span>
              </div>
            </div>
`;

const newBlock = `
            <div className="flex bg-slate-100 rounded-lg p-1 mb-2 shrink-0">
              <button onClick={() => setBillTab('daily')} className={\`flex-1 py-1.5 text-xs font-bold rounded-md transition-all \${billTab === 'daily' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}\`}>บิลวันนี้ (Daily)</button>
              <button onClick={() => setBillTab('full')} className={\`flex-1 py-1.5 text-xs font-bold rounded-md transition-all \${billTab === 'full' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}\`}>ประวัติทั้งหมด (Full)</button>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col shadow-sm min-h-[300px]">
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {loading && transactions.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>
                ) : transactions.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">ไม่มีรายการค้างชำระ</p>
                ) : (
                  <>
                    {billTab === 'daily' && pastTransactions.length > 0 && (
                      <div className="flex justify-between items-center p-3 bg-blue-50/50 rounded-lg text-sm border border-blue-100 mb-2">
                        <div>
                          <p className="font-bold text-blue-800">📌 ยอดยกมาจากวันก่อน</p>
                          <p className="text-[10px] text-blue-500">Balance Forward</p>
                        </div>
                        <p className={\`font-black \${balanceForward > 0 ? 'text-red-500' : balanceForward < 0 ? 'text-emerald-600' : 'text-slate-500'}\`}>
                          {balanceForward > 0 ? '+' : ''}{balanceForward.toLocaleString()}
                        </p>
                      </div>
                    )}
                    
                    {(billTab === 'daily' ? todayTransactions : transactions).map(tx => {
                      const isVoid = tx.category.includes('Voided');
                      return (
                        <div key={tx.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg text-sm border-b border-slate-50 last:border-0">
                          <div className={isVoid ? 'line-through text-slate-400 opacity-60' : ''}>
                            <p className="font-bold text-slate-700">{tx.category === 'room_charge' ? 'ค่าห้องพัก' : tx.category}</p>
                            <p className="text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleTimeString('th-TH')} ({tx.staff_name})</p>
                          </div>
                          <div className={\`font-black \${isVoid ? 'line-through text-slate-400 opacity-60' : tx.amount < 0 ? 'text-emerald-600' : 'text-slate-800'}\`}>
                            {tx.amount < 0 ? '' : '+'}{Number(tx.amount).toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
              
              {billTab === 'full' && (
                <div className="p-2 border-t border-slate-100 bg-slate-50">
                  <button 
                    onClick={() => window.print()}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>🖨️</span> พิมพ์ใบเสร็จรวมทั้งหมด (Print Full Receipt)
                  </button>
                </div>
              )}
              
              <div className="bg-slate-100 p-4 border-t border-slate-200 flex justify-between items-center shrink-0">
                <span className="font-bold text-slate-600">ยอดคงเหลือที่ต้องชำระ:</span>
                <span className={\`text-2xl font-black \${balance > 0 ? 'text-rose-600' : balance < 0 ? 'text-purple-600' : 'text-emerald-600'}\`}>
                  ฿{balance.toLocaleString()}
                </span>
              </div>
            </div>
`;

// Simple string replacement using a very specific marker
const markerStart = '<div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col shadow-sm">';
const markerEnd = '฿{balance.toLocaleString()}\n                </span>\n              </div>\n            </div>';

if (code.includes(markerStart) && code.includes(markerEnd)) {
  const startIdx = code.indexOf(markerStart);
  const endIdx = code.indexOf(markerEnd) + markerEnd.length;
  code = code.substring(0, startIdx) + newBlock.trim() + code.substring(endIdx);
  fs.writeFileSync('src/app/components/BillingModal.tsx', code, 'utf8');
  console.log("Replaced successfully!");
} else {
  console.log("Could not find markers!");
}