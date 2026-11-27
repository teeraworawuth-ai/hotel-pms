const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const BOOKING_ID = '15561143-1604-4dff-9d3a-370827730738';
const LEDGER_IDS = [
  '8378adfe-e700-46c1-b7ba-81dd5f9199bd',
  'cffaaa17-000c-4673-a690-f563cfc40278',
  '59925797-9ec6-4515-ace6-b66dbf9abdd6',
  'cce8d21d-fd3c-4e7f-a82e-44cbaeb4ca36'
];

async function cleanupAndDel() {
  for (const lid of LEDGER_IDS) {
    const upRes = await supabase.from('ledger_transactions').update({
      booking_id: null,
      shift_id: null,
      room_id: null,
      amount: 0,
      category: '(Voided) Test Entry Room 17',
      notes: 'Deleted test entry'
    }).eq('id', lid).select();
    console.log('Update ledger', lid, upRes.error ? upRes.error : 'OK');
  }

  // Delete from bookings table
  const delB = await supabase.from('bookings').delete().eq('id', BOOKING_ID).select();
  console.log('Delete booking res:', delB);

  // Verify booking is gone
  const check = await supabase.from('bookings').select('id').eq('id', BOOKING_ID);
  console.log('Booking check (should be empty):', check.data);
}
cleanupAndDel();
