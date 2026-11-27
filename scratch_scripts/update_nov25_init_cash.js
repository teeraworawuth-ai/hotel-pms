const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function updateNov25S1InitCash() {
  const { data, error } = await supabase.from('shifts').update({ initial_cash: 0 }).eq('id', '6bcae276-f57b-4999-8e67-deae47773a42').select();
  console.log('Updated shift:', data, 'Error:', error);
}
updateNov25S1InitCash();
