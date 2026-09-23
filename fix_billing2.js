const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const targetState = "  const [payCredit, setPayCredit] = useState<number | ''>('');";
const newState = `  const [payCredit, setPayCredit] = useState<number | ''>('');
  const [paymentTime, setPaymentTime] = useState<string>('');
  const [isScanningSlip, setIsScanningSlip] = useState(false);`;

if (!content.includes('const [isScanningSlip')) {
  content = content.replace(targetState, newState);
}

fs.writeFileSync('src/app/components/BillingModal.tsx', content, 'utf8');
