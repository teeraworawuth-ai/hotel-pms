const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const targetState = "  const [payCredit, setPayCredit] = useState<number | ''>('');";
const newState = `  const [payCredit, setPayCredit] = useState<number | ''>('');
  const [paymentTime, setPaymentTime] = useState<string>('');
  const [isScanningSlip, setIsScanningSlip] = useState(false);`;

if (!content.includes('isScanningSlip')) {
  content = content.replace(targetState, newState);
}

if (!content.includes('const handleScanSlip')) {
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
  content = content.replace('  const handlePayment = async () => {', fnStr + '\n  const handlePayment = async () => {');
}

fs.writeFileSync('src/app/components/BillingModal.tsx', content, 'utf8');
