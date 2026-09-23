const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

// Add states
if (!content.includes('isScanningSlip')) {
  const stateStr = `  const [paymentTime, setPaymentTime] = useState<string>('');\n  const [isScanningSlip, setIsScanningSlip] = useState(false);`;
  content = content.replace(`const [payCredit, setPayCredit] = useState<number | ''>('');`, `const [payCredit, setPayCredit] = useState<number | ''>('');\n${stateStr}`);
}

// Add function
if (!content.includes('handleScanSlip')) {
  const fnStr = `
  const handleScanSlip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsScanningSlip(true);
    try {
      const formData = new FormData();
      formData.append('slip', file);
      
      const res = await fetch('/api/ocr-slip', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('AI Error');
      const data = await res.json();
      
      if (data.amount) setPayTransfer(Number(data.amount));
      if (data.date && data.time) {
        setPaymentTime(\`\${data.date}T\${data.time}\`);
      }
      alert(\`AI ดึงข้อมูลสำเร็จ!\\nธนาคาร: \${data.sender_bank || '-'}\\nยอดเงิน: \${data.amount || '-'}\`);
    } catch (err) {
      alert('AI ไม่สามารถอ่านข้อมูลสลิปนี้ได้ หรือ API Error');
    } finally {
      setIsScanningSlip(false);
    }
  };
`;
  content = content.replace(`const handleCheckIn = async`, fnStr + '\n  const handleCheckIn = async');
}

// Update UI to add the Scan button
const oldUiBlock = `{Number(payTransfer) > 0 && (
                      <div className="pt-2 border-t border-slate-200 mt-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">เวลาที่โอน (ตามสลิป)</label>
                        <input type="datetime-local" value={paymentTime} onChange={e => setPaymentTime(e.target.value)} className="w-full border-slate-200 rounded-lg p-2 text-xs focus:ring-blue-500 bg-white" />
                      </div>
                    )}`;

const newUiBlock = `{(Number(payTransfer) > 0 || isScanningSlip) && (
                      <div className="pt-2 border-t border-slate-200 mt-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">เวลาที่โอน (ตามสลิป)</label>
                        <div className="flex gap-2">
                          <input type="datetime-local" value={paymentTime} onChange={e => setPaymentTime(e.target.value)} className="flex-1 border-slate-200 rounded-lg p-2 text-xs focus:ring-blue-500 bg-white" />
                          <label className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors border border-blue-200">
                            {isScanningSlip ? '⏳ สแกน...' : '📷 สแกนสลิป'}
                            <input type="file" accept="image/*" className="hidden" onChange={handleScanSlip} disabled={isScanningSlip} />
                          </label>
                        </div>
                      </div>
                    )}`;

content = content.replace(oldUiBlock, newUiBlock);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
