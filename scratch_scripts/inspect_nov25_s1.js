const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const SHIFT_ID_NOV25_S1 = '6bcae276-f57b-4999-8e67-deae47773a42';

async function inspectNov25S1() {
  const { data: shift } = await supabase.from('shifts').select('*').eq('id', SHIFT_ID_NOV25_S1).single();
  console.log('Current Nov 25 S1 shift:', shift);

  // Check ledger transactions for this shift
  const { data: ledgers } = await supabase.from('ledger_transactions').select('*').eq('shift_id', SHIFT_ID_NOV25_S1);
  console.log('Ledger count in Nov 25 S1:', ledgers ? ledgers.length : 0);
  let cashSum = 0;
  let transferSum = 0;
  if (ledgers) {
    ledgers.forEach(l => {
      console.log(`tx: cat=${l.category} type=${l.transaction_type} amt=${l.amount} notes=${l.notes}`);
      if (l.transaction_type === 'payment' && l.category === 'cash') cashSum += Number(l.amount);
      if (l.transaction_type === 'payment' && (l.category === 'transfer' || l.category === 'credit_card')) transferSum += Number(l.amount);
    });
  }
  console.log('Cash payments sum:', cashSum, 'Transfer sum:', transferSum);
}
inspectNov25S1();
