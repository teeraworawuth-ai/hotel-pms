const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const BOOKING_ID = '15561143-1604-4dff-9d3a-370827730738';

async function deleteItem15() {
  console.log('--- Deleting associated rows for booking:', BOOKING_ID);

  // 1. Delete from ledger_transactions
  const { data: ledgers, error: lErr } = await supabase.from('ledger_transactions').delete().eq('booking_id', BOOKING_ID).select();
  console.log('Deleted ledger rows:', ledgers?.length, 'Error:', lErr);

  // 2. Delete from booking_daily_rates if any
  const { data: bdr, error: bdrErr } = await supabase.from('booking_daily_rates').delete().eq('booking_id', BOOKING_ID).select();
  console.log('Deleted booking_daily_rates rows:', bdr?.length, 'Error:', bdrErr);

  // 3. Delete from booking_daily_extras if any
  const { data: bde, error: bdeErr } = await supabase.from('booking_daily_extras').delete().eq('booking_id', BOOKING_ID).select();
  console.log('Deleted booking_daily_extras rows:', bde?.length, 'Error:', bdeErr);

  // 4. Delete from bookings
  const { data: bRow, error: bErr } = await supabase.from('bookings').delete().eq('id', BOOKING_ID).select();
  console.log('Deleted booking row:', bRow?.length, 'Error:', bErr);

  // 5. Verify deletion
  const { data: checkB } = await supabase.from('bookings').select('id').eq('id', BOOKING_ID);
  console.log('Verification check (should be empty):', checkB);
}
deleteItem15();
