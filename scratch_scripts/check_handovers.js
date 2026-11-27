const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkHandoversInSettings() {
  const { data } = await supabase.from('system_settings').select('*').like('key', 'cash_handover_%');
  console.log('Handovers count:', data?.length);
  data?.forEach(d => console.log(d.key, d.value));
}
checkHandoversInSettings();
