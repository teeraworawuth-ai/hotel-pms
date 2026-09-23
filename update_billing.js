const fs = require('fs');
let code = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

// Import useSimulatedTime
if (!code.includes('useSimulatedTime')) {
  code = code.replace("import { useShift } from '@/contexts/ShiftContext';", "import { useShift } from '@/contexts/ShiftContext';\nimport { useSimulatedTime } from '@/contexts/SimulatedTimeContext';");
}

// Add state for tab
if (!code.includes('const [billTab')) {
  code = code.replace("const [customItemPrice, setCustomItemPrice] = useState<number | ''>('');", "const [customItemPrice, setCustomItemPrice] = useState<number | ''>('');\n  const [billTab, setBillTab] = useState<'daily' | 'full'>('daily');\n  const { getNow } = useSimulatedTime();");
}

// Logic for cutoff and filtering
const logic = `
  const now = getNow();
  const businessCutoff = new Date(now);
  if (now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 45)) {
    businessCutoff.setDate(businessCutoff.getDate() - 1);
  }
  businessCutoff.setHours(9, 45, 0, 0);

  const pastTransactions = transactions.filter(tx => new Date(tx.created_at).getTime() < businessCutoff.getTime());
  const todayTransactions = transactions.filter(tx => new Date(tx.created_at).getTime() >= businessCutoff.getTime());

  const balanceForward = pastTransactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') ? 0 : Number(tx.amount)), 0);
  const balance = transactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') ? 0 : Number(tx.amount)), 0);
`;

code = code.replace(
  "const balance = transactions.reduce((acc, tx) => acc + (tx.category.includes('Voided') ? 0 : Number(tx.amount)), 0);",
  logic.trim()
);

// UI for Tabs and List
const listReplacement = `
                <div className="flex bg-slate-100 rounded-lg p-1 mb-2">
                  <button onClick={() => setBillTab('daily')} className={\`flex-1 py-1.5 text-xs font-bold rounded-md transition-all \${billTab === 'daily' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}\`}>บิลวันนี้ (Daily)</button>
                  <button onClick={() => setBillTab('full')} className={\`flex-1 py-1.5 text-xs font-bold rounded-md transition-all \${billTab === 'full' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}\`}>ประวัติทั้งหมด (Full)</button>
                </div>
                
                <div className="h-64 overflow-y-auto border border-slate-100 rounded-xl bg-white shadow-inner p-2 space-y-1">
                  {loading ? (
                    <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>
                  ) : transactions.length === 0 ? (
                    <p className="text-center text-slate-400 py-10">ไม่มีรายการค้างชำระ</p>
                  ) : (
                    <>
                      {billTab === 'daily' && pastTransactions.length > 0 && (
                        <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg text-sm border-b border-slate-100">
                          <div>
                            <p className="font-bold text-slate-700">📌 ยอดยกมาจากวันก่อน</p>
                            <p className="text-[10px] text-slate-400">Balance Forward</p>
                          </div>
                          <p className={\`font-black \${balanceForward > 0 ? 'text-red-500' : balanceForward < 0 ? 'text-blue-600' : 'text-emerald-500'}\`}>
                            {balanceForward > 0 ? '+' : ''}{balanceForward.toLocaleString()}
                          </p>
                        </div>
                      )}
                      
                      {(billTab === 'daily' ? todayTransactions : transactions).map(tx => {
                        const isVoid = tx.category.includes('(Voided)');
                        return (
                          <div key={tx.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg text-sm border-b border-slate-50 last:border-0">
                            <div className={isVoid ? 'line-through text-slate-400 opacity-60' : ''}>
                              <p className="font-bold text-slate-700">{tx.category === 'room_charge' ? 'ค่าห้องพัก' : tx.category}</p>
                              <p className="text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleTimeString('th-TH')} ({tx.staff_name})</p>
                            </div>
                            <div className="text-right">
                              <p className={\`font-black \${isVoid ? 'text-slate-400 line-through opacity-60' : (Number(tx.amount) > 0 ? 'text-red-500' : 'text-emerald-600')}\`}>
                                {Number(tx.amount) > 0 ? '+' : ''}{Number(tx.amount).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
`;

code = code.replace(
  /<div className="h-64 overflow-y-auto border border-slate-100 rounded-xl bg-white shadow-inner p-2 space-y-1">[\s\S]*?<\/div>/,
  listReplacement.trim()
);

fs.writeFileSync('src/app/components/BillingModal.tsx', code, 'utf8');