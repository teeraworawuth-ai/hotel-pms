const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function updateToeyInitCash() {
  const { data, error } = await supabase.from('shifts')
    .update({ initial_cash: 0 })
    .eq('id', 'b4a65d04-dd89-4b38-b4b0-94045ebcaba2')
    .select();
  console.log('Updated Toey shift:', data, 'Error:', error);
}
updateToeyInitCash();
