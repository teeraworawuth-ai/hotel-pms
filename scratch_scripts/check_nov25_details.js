const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkNov25Details() {
  const { data: shifts } = await supabase.from('shifts')
    .select('*')
    .gte('start_time', '2026-11-24T23:00:00Z')
    .lte('start_time', '2026-11-26T00:00:00Z');
  
  console.log('Shifts:');
  shifts?.forEach(s => {
    console.log(s.id, s.staff_name, 'init:', s.initial_cash, 'expected:', s.expected_cash, 'final:', s.final_cash);
  });

  const { data: handovers } = await supabase.from('cash_handovers')
    .select('*')
    .gte('created_at', '2026-11-24T23:00:00Z');
  console.log('Handovers:', handovers);
}
checkNov25Details();
