const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

const includeKeyDepositState = `  const [includeKeyDeposit, setIncludeKeyDeposit] = useState<boolean>(true);`;
content = content.replace("const [showPayments, setShowPayments] = useState<boolean>(true);", "const [showPayments, setShowPayments] = useState<boolean>(true);\n" + includeKeyDepositState);

const updatedTotalExpected = `  // To avoid duplicate counting if someone clicks POS repeatedly, 
  // we count all past/today posted charges from ledger, plus ONLY future unposted from daily tables.
  const totalExpectedCharges = totalPostedCharges + futureRates + futureExtras + (includeKeyDeposit ? totalKeyDeposit : 0);`;
content = content.replace(/\/\/ To avoid duplicate counting[\s\S]*?const totalExpectedCharges = totalPostedCharges \+ futureRates \+ futureExtras;/, updatedTotalExpected);

fs.writeFileSync('src/app/components/BillingModal.tsx', content, 'utf8');
