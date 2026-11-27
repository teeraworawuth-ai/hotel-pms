const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkNumbers() {
  // Check all ledger transactions and handovers on Nov 24 & Nov 25
  const { data: shifts } = await supabase.from('shifts').select('*').order('start_time', { ascending: false }).limit(6);
  console.log('Recent shifts:');
  shifts?.forEach(s => {
    console.log(`id=${s.id} staff=${s.staff_name} start=${s.start_time} end=${s.end_time} initCash=${s.initial_cash} expCash=${s.expected_cash} finalCash=${s.final_cash}`);
  });

  const { data: bookings } = await supabase.from('bookings').select('id, check_in_time, actual_check_in_time, total_amount, paid_amount, status').gte('check_in_time', '2026-11-24T00:00:00Z').lte('check_in_time', '2026-11-26T12:00:00Z');
  console.log('Bookings in window:', bookings?.length);

  // Check ledger amounts
  const { data: lt } = await supabase.from('ledger_transactions').select('*').gte('created_at', '2026-11-24T00:00:00Z').order('created_at', { ascending: true });
  console.log('Ledger count:', lt?.length);

  // Search for 4950 or 4350 anywhere in ledger or notes or shifts
  const m4950 = lt?.filter(r => JSON.stringify(r).includes('4950') || JSON.stringify(r).includes('4,950') || Math.abs(r.amount) === 4950);
  const m4350 = lt?.filter(r => JSON.stringify(r).includes('4350') || JSON.stringify(r).includes('4,350') || Math.abs(r.amount) === 4350);
  console.log('Matches 4950 in ledgers:', m4950);
  console.log('Matches 4350 in ledgers:', m4350);
}
checkNumbers();
