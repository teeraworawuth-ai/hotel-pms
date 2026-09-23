const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const folioLogic = `
                <div className="flex-1 overflow-y-auto p-2 space-y-4">
                  {loading && transactions.length === 0 ? (
                    <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>
                  ) : transactions.length === 0 ? (
                    <p className="text-center text-slate-400 py-10">ไม่มีรายการ</p>
                  ) : (
                    (() => {
                      // Group transactions by date
                      const grouped: Record<string, typeof transactions> = {};
                      
                      const txsToUse = selectedDate === 'ALL' ? transactions : transactions.filter(t => new Date(t.created_at).toLocaleDateString('th-TH') === selectedDate);
                      
                      txsToUse.forEach(tx => {
                        if (!showPayments && tx.amount < 0) return; // filter payments if disabled
                        
                        // Use business date (if before 09:45, it belongs to yesterday's business date)
                        const d = new Date(tx.created_at);
                        if (d.getHours() < 9 || (d.getHours() === 9 && d.getMinutes() < 45)) {
                          d.setDate(d.getDate() - 1);
                        }
                        const dateStr = d.toLocaleDateString('th-TH');
                        
                        if (!grouped[dateStr]) grouped[dateStr] = [];
                        grouped[dateStr].push(tx);
                      });

                      let runningBalance = 0;
                      
                      return Object.entries(grouped).map(([dateStr, dailyTxs], idx) => {
                        const dailyCharges = dailyTxs.filter(t => t.amount > 0 && !t.category.includes('Voided')).reduce((sum, t) => sum + Number(t.amount), 0);
                        const dailyPayments = dailyTxs.filter(t => t.amount < 0 && !t.category.includes('Voided')).reduce((sum, t) => sum + Number(t.amount), 0);
                        const prevBalance = runningBalance;
                        runningBalance += dailyCharges + dailyPayments;
                        
                        return (
                          <div key={dateStr} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="bg-slate-100 px-3 py-2 flex justify-between items-center border-b border-slate-200">
                              <span className="font-bold text-slate-700 text-sm">📅 {dateStr}</span>
                              {selectedDate === 'ALL' && idx > 0 && (
                                <span className="text-xs text-slate-500 font-medium">ยกมา: <span className={\`font-bold \${prevBalance < 0 ? 'text-emerald-600' : prevBalance > 0 ? 'text-red-500' : ''}\`}>{prevBalance.toLocaleString()}</span></span>
                              )}
                            </div>
                            <div className="p-2 space-y-1">
                              {dailyTxs.map(tx => {
                                const isVoid = tx.category.includes('Voided');
                                return (
                                  <div key={tx.id} className="flex justify-between items-start p-2 hover:bg-slate-50 rounded-lg text-sm border-b border-slate-50 last:border-0 group">
                                    <div className={isVoid ? 'line-through text-slate-400 opacity-60' : ''}>
                                      <p className="font-bold text-slate-700">{tx.category === 'room_charge' ? 'ค่าห้องพัก' : tx.category}</p>
                                      {tx.notes && <p className="text-xs text-slate-500 italic mt-0.5">{tx.notes}</p>}
                                      <p className="text-[10px] text-slate-400 mt-0.5">{new Date(tx.created_at).toLocaleTimeString('th-TH')} ({tx.staff_name})</p>
                                    </div>
                                    <div className={\`font-black text-right \${isVoid ? 'line-through text-slate-400 opacity-60' : tx.amount < 0 ? 'text-emerald-600' : 'text-slate-800'}\`}>
                                      {tx.amount < 0 ? '' : '+'}{Number(tx.amount).toLocaleString()}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {selectedDate === 'ALL' && (
                              <div className="bg-slate-50 px-3 py-2 flex justify-between items-center border-t border-slate-100">
                                <span className="text-xs font-bold text-slate-500">ยอดคงเหลือยกไป (Balance)</span>
                                <span className={\`text-sm font-black \${runningBalance < 0 ? 'text-emerald-600' : runningBalance > 0 ? 'text-red-500' : 'text-slate-700'}\`}>
                                  {runningBalance.toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
`;

const regex = /<div className="flex-1 overflow-y-auto p-2 space-y-1">.*?<\/div>\n\s*\{true && \(/s;
content = content.replace(regex, folioLogic.trim() + '\n                {true && (');

fs.writeFileSync('src/app/components/BillingModal.tsx', content, 'utf8');
console.log('Folio injected.');
