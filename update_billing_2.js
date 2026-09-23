const fs = require('fs');
let code = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

// Add new states
code = code.replace(
  "const [billTab, setBillTab] = useState<'daily' | 'full'>('daily');",
  `const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [showPayments, setShowPayments] = useState<boolean>(true);`
);

// We need to compute available dates
const filterLogic = `
  const availableDates = Array.from(new Set(transactions.map(tx => new Date(tx.created_at).toLocaleDateString('th-TH'))));
  
  const filteredTransactions = transactions.filter(tx => {
    if (selectedDate !== 'ALL') {
      const txDate = new Date(tx.created_at).toLocaleDateString('th-TH');
      if (txDate !== selectedDate) return false;
    }
    
    // Payments have negative amounts
    if (!showPayments && Number(tx.amount) < 0) {
      return false;
    }
    
    return true;
  });
  
  const displayTransactions = filteredTransactions;
`;

// Insert after todayTransactions
code = code.replace(
  "const todayTransactions = transactions.filter(tx => new Date(tx.created_at).getTime() >= businessCutoff.getTime());",
  "const todayTransactions = transactions.filter(tx => new Date(tx.created_at).getTime() >= businessCutoff.getTime());\n" + filterLogic
);

// Replace UI tabs with Date Selector and Checkbox
const uiTabsOld = `<div className="flex bg-slate-100 rounded-lg p-1 mb-2 shrink-0">
                <button onClick={() => setBillTab('daily')} className={\`flex-1 py-1.5 text-xs font-bold rounded-md transition-all \${billTab === 'daily' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}\`}>บิลวันนี้ (Daily)</button>
                <button onClick={() => setBillTab('full')} className={\`flex-1 py-1.5 text-xs font-bold rounded-md transition-all \${billTab === 'full' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}\`}>ประวัติทั้งหมด (Full)</button>
              </div>`;
              
const uiTabsNew = `<div className="flex flex-col bg-slate-100 rounded-lg p-2 mb-2 shrink-0 gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600 whitespace-nowrap">เลือกวันที่:</label>
                  <select 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-md py-1 px-2 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="ALL">ทั้งหมด (ALL)</option>
                    {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 pl-1">
                  <input 
                    type="checkbox" 
                    id="showPayments" 
                    checked={showPayments} 
                    onChange={e => setShowPayments(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="showPayments" className="text-xs font-bold text-slate-600 cursor-pointer">แสดงรายการชำระเงินด้วย (Payments)</label>
                </div>
              </div>`;

code = code.replace(uiTabsOld, uiTabsNew);

// Remove Balance Forward UI using string replace carefully
const balanceStart = `{billTab === 'daily' && pastTransactions.length > 0 && (`;
const balanceIdx = code.indexOf(balanceStart);
if (balanceIdx !== -1) {
  const balanceEndIdx = code.indexOf(')}', balanceIdx + balanceStart.length);
  if (balanceEndIdx !== -1) {
    code = code.substring(0, balanceIdx) + code.substring(balanceEndIdx + 2);
  }
}

// Replace mapping logic
code = code.replace(/\{\(billTab === 'daily' \? todayTransactions : transactions\)\.map\(tx => \{/g, '{displayTransactions.map(tx => {');

// Fix print button condition
code = code.replace(/\{billTab === 'full' && \(/g, '{true && ('); // Always show print button

fs.writeFileSync('src/app/components/BillingModal.tsx', code);
console.log('Updated BillingModal');
