const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspect() {
  const { data, error } = await supabase.from('ledger_transactions').select('*').eq('booking_id', '15561143-1604-4dff-9d3a-370827730738');
  console.log('Error:', error);
  console.log('Found rows:', data);
}
inspect();
