const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspectNov25Full() {
  // 1. Fetch shifts on Nov 25
  const { data: sList } = await supabase.from('shifts')
    .select('*')
    .gte('start_time', '2026-11-24T23:00:00Z')
    .lte('start_time', '2026-11-26T00:00:00Z')
    .order('start_time', { ascending: true });
  console.log('Shifts on Nov 25:');
  sList?.forEach(s => {
    console.log(`id=${s.id} staff=${s.staff_name} start=${s.start_time} end=${s.end_time} initCash=${s.initial_cash} endCashSys=${s.end_cash_system} endCashAct=${s.end_cash_actual} expCash=${s.expected_cash} finalCash=${s.final_cash}`);
  });

  // 2. Fetch all ledger transactions on Nov 25
  const sIds = sList ? sList.map(s => s.id) : [];
  const { data: ltList } = await supabase.from('ledger_transactions').select('*').in('shift_id', sIds);
  console.log('\nLedgers count:', ltList?.length);

  sList?.forEach(s => {
    const rows = (ltList || []).filter(l => l.shift_id === s.id);
    let cashPay = 0;
    let transferPay = 0;
    let depPlaced = 0;
    let depRef = 0;
    let rev = 0;
    let exp = 0;
    rows.forEach(r => {
      const a = Number(r.amount || 0);
      if (r.transaction_type === 'payment') {
        if (r.category === 'cash') cashPay += Math.abs(a);
        else transferPay += Math.abs(a);
      } else if (r.transaction_type === 'deposit') {
        if (a > 0) depPlaced += a;
        else depRef += Math.abs(a);
      } else if (r.transaction_type === 'revenue') {
        rev += a;
      } else if (r.transaction_type === 'expense') {
        exp += Math.abs(a);
      }
    });
    const netCashInShift = cashPay - depPlaced;
    console.log(`\n--- Shift: ${s.staff_name} (${s.id}) ---`);
    console.log(`rev=${rev}, cashPay=${cashPay}, transferPay=${transferPay}, depPlaced=${depPlaced}, depRef=${depRef}, exp=${exp}`);
    console.log(`netCashInShift = ${cashPay} - ${depPlaced} = ${netCashInShift}`);
    console.log(`initCash=${s.initial_cash}, totalBeforeHandover = ${Number(s.initial_cash || 0) + cashPay - depRef - exp}`);
  });
}
inspectNov25Full();
