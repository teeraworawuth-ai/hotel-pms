const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const [k, v] = l.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('system_settings').select('key').order('key');
  const keys = (data || []).map(r => r.key).filter(k =>
    !k.startsWith('cash_handover_') &&
    !k.startsWith('shift_bd_') &&
    !k.startsWith('activity_log_') &&
    !k.startsWith('booking_meta_') &&
    !k.startsWith('last_closed_drawer_')
  );
  console.log('Other system_settings keys:', keys);
}
run();
