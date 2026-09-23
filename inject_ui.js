const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const state_code = `  const [actualPrice, setActualPrice] = useState<number | ''>(room.actual_price || room.price_night || '');
  const [paymentMethod, setPaymentMethod] = useState<'unpaid' | 'cash' | 'transfer' | 'credit_card'>('unpaid');
  const [staffName, setStaffName] = useState<string>(room.staff_name || '');
  
  // States for Key Deposit & Daily Extras
  const [keyDepositEnabled, setKeyDepositEnabled] = useState<boolean>(true);
  const [keyDepositAmount, setKeyDepositAmount] = useState<number | ''>(room.key_deposit !== undefined && room.key_deposit !== null ? room.key_deposit : 200);
  
  const [dailyExtras, setDailyExtras] = useState<any[]>([]);
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [extraForm, setExtraForm] = useState({ category: 'เตียงเสริม/อุปกรณ์', description: '', amount: 0, applyToAll: false, targetDate: '' });
  const [paymentTime, setPaymentTime] = useState<string>('');`;

content = content.replace(
  /  const \[actualPrice, setActualPrice\] = useState<number \| ''>\(room\.actual_price \|\| room\.price_night \|\| ''\);\n  const \[paymentMethod, setPaymentMethod\] = useState<'unpaid' \| 'cash' \| 'transfer' \| 'credit_card'>\('unpaid'\);\n  const \[staffName, setStaffName\] = useState<string>\(room\.staff_name \|\| ''\);/g,
  state_code
);

// We need a helper to calculate the total to pay
// Total to Pay = actualPrice + keyDepositAmount (if enabled) + all dailyExtras amounts
const totalToPayHelper = `  const getTotalExtrasAmount = () => dailyExtras.reduce((sum, ext) => sum + Number(ext.amount || 0), 0);
  const totalToPay = Number(actualPrice || 0) + (keyDepositEnabled ? Number(keyDepositAmount || 0) : 0) + getTotalExtrasAmount();`;

content = content.replace(
  /  useEffect\(\(\) => \{\n    if \(activeTab === 'overnight'\) \{/g,
  `${totalToPayHelper}\n\n  useEffect(() => {\n    if (activeTab === 'overnight') {`
);

// We need to inject the "Amount to Pay" UI and Key Deposit UI right above payment methods
const uiInjection = `
            {/* Key Deposit & Amount to Pay */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3 mb-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={keyDepositEnabled}
                  onChange={(e) => setKeyDepositEnabled(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="font-bold text-slate-700 text-sm">มัดจำกุญแจ (Key Deposit)</span>
                {keyDepositEnabled && (
                  <input 
                    type="number" 
                    value={keyDepositAmount}
                    onChange={(e) => setKeyDepositAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="ml-auto w-24 px-3 py-1 border border-slate-200 rounded-lg text-right font-bold focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                )}
              </label>
              
              <div className="flex justify-between items-center border-t border-slate-200 pt-3">
                <span className="font-bold text-slate-700">จำนวนเงินที่ต้องชำระ:</span>
                <span className="text-xl font-black text-purple-600">฿{totalToPay}</span>
              </div>
            </div>
`;

content = content.replace(
  /<div className="space-y-3">\n\s*<label className="block text-sm font-bold text-slate-700">\n\s*ช่องทางการชำระเงิน \(Payment Method\)/g,
  uiInjection + '\n            <div className="space-y-3">\n              <label className="block text-sm font-bold text-slate-700">\n                ช่องทางการชำระเงิน (Payment Method)'
);

// For Transfer Payment Time UI
const transferUI = `
                {paymentMethod === 'transfer' && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-500 mb-1">วันที่และเวลาโอน</label>
                    <input 
                      type="datetime-local" 
                      value={paymentTime}
                      onChange={(e) => setPaymentTime(e.target.value)}
                      className="w-full border-slate-200 rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-slate-50"
                    />
                  </div>
                )}
`;

content = content.replace(
  /<\/div>\n\s*<\/div>\n\s*\{activeTab === 'short_stay' && room.stay_type === 'short_stay' &&/g,
  `</div>${transferUI}\n            </div>\n\n            {activeTab === 'short_stay' && room.stay_type === 'short_stay' &&`
);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
console.log('UI injected.');
