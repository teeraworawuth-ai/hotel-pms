const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function updateNov26Shift() {
  const { data, error } = await supabase.from('shifts')
    .update({ initial_cash: 0 })
    .eq('id', '14a6226d-ab7f-427d-8b33-9e026865cd04')
    .select();
  console.log('Updated Nov 26 shift:', data, 'Error:', error);
}
updateNov26Shift();
