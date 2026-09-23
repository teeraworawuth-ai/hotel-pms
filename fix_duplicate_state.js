const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const targetLines = `  const [paymentTime, setPaymentTime] = useState<string>('');
  const [isScanningSlip, setIsScanningSlip] = useState(false);`;

content = content.replace(targetLines, '  const [isScanningSlip, setIsScanningSlip] = useState(false);');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
