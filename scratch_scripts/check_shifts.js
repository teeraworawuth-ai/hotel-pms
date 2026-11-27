const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env.local');
const env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) acc[key.trim()] = vals.join('=').trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: shifts, error: sErr } = await supabase.from('shifts').select('*').order('start_time', { ascending: false }).limit(10);
  if (sErr) console.error('sErr:', sErr);
  console.log('SHIFTS:');
  if (shifts) {
    shifts.forEach(s => {
      console.log(`- [${s.start_time} - ${s.end_time}] staff=${s.staff_name} initial_cash=${s.initial_cash} final_cash=${s.final_cash} expected=${s.expected_cash} disc=${s.discrepancy} status=${s.status}`);
    });
  }
}
check();
