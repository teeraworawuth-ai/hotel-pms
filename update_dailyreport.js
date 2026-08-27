const fs = require('fs');
let content = fs.readFileSync('src/app/audit/DailyReport.tsx', 'utf8');

const regex = /\/\/ ดึงข้อมูลกะที่เกิดขึ้นในช่วงนี้[\s\S]*?setTotalExpense\(0\);\n      }/;

const newLogic = `// ดึงข้อมูลกะที่ทับซ้อนกับช่วงเวลานี้ (เปิดในวันนี้ หรือเปิดมาก่อนแต่มันยังแอคทีฟอยู่ในวันนี้)
      const { data: shiftData, error: shiftError } = await supabase
        .from('shifts')
        .select('*')
        .lt('start_time', end.toISOString())
        .or(\`end_time.gte.\${start.toISOString()},end_time.is.null\`)
        .order('start_time', { ascending: true });

      if (!shiftError && shiftData) {
        setShifts(shiftData);
      }

      // ดึง Ledger (รายรับ/รายจ่าย) ที่เกิดขึ้นใน "วันนี้" เท่านั้น ไม่ว่าจะมาจากกะไหนก็ตาม
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('*')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString());

      if (!ledgerError && ledgerData) {
        setTransactions(ledgerData);

        let revenue = 0;
        let cash = 0;
        let transfer = 0;
        let credit = 0;
        let expense = 0;

        ledgerData.forEach((txn: LedgerTransaction) => {
          if (txn.transaction_type === 'revenue') {
            revenue += Number(txn.amount);
          } else if (txn.transaction_type === 'payment') {
            const absAmount = Math.abs(Number(txn.amount));
            if (txn.category === 'cash') cash += absAmount;
            if (txn.category === 'transfer') transfer += absAmount;
            if (txn.category === 'credit_card') credit += absAmount;
          } else if (txn.transaction_type === 'expense') {
            expense += Math.abs(Number(txn.amount));
          }
        });

        setTotalRevenue(revenue);
        setTotalCash(cash);
        setTotalTransfer(transfer);
        setTotalCredit(credit);
        setTotalExpense(expense);
      } else {
        setTransactions([]);
        setTotalRevenue(0);
        setTotalCash(0);
        setTotalTransfer(0);
        setTotalCredit(0);
        setTotalExpense(0);
      }`;

content = content.replace(regex, newLogic);
fs.writeFileSync('src/app/audit/DailyReport.tsx', content);
console.log("Updated DailyReport");
