const fs = require('fs');
let content = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

content = content.replace(
  'const totalPostedCharges = validTxs.filter(t => t.amount > 0).reduce((sum, t) => sum + Number(t.amount), 0);',
  "const totalPostedCharges = validTxs.filter(t => t.amount > 0 && !t.category.includes('มัดจำกุญแจ')).reduce((sum, t) => sum + Number(t.amount), 0);"
);

content = content.replace(
  'const displayTransactions = filteredTransactions;',
  "const displayTransactions = filteredTransactions.filter(tx => !tx.category.includes('มัดจำกุญแจ'));"
);

content = content.replace(
  "const balanceForward = pastTransactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') ? 0 : Number(tx.amount)), 0);",
  "const balanceForward = pastTransactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') || tx.category.includes('มัดจำกุญแจ') ? 0 : Number(tx.amount)), 0);"
);

content = content.replace(
  "const balance = transactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') ? 0 : Number(tx.amount)), 0);",
  "const balance = transactions.reduce((acc, tx) => acc + (tx.category.includes('(Voided)') || tx.category.includes('มัดจำกุญแจ') ? 0 : Number(tx.amount)), 0);"
);

fs.writeFileSync('src/app/components/BillingModal.tsx', content, 'utf8');
