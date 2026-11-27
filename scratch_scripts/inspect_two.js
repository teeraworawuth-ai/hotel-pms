const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspectTwo() {
  const { data } = await supabase.from('system_settings').select('*').in('key', [
    'cash_handover_2026-11-25_1795608208219_3v2roi',
    'cash_handover_2026-11-25_1795650953421_yxvm9r'
  ]);
  data?.forEach(d => console.log(d.key, JSON.stringify(d.value, null, 2)));
}
inspectTwo();
