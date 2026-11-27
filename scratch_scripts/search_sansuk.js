const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function searchSansuk() {
  const { data: lt } = await supabase.from('ledger_transactions').select('*').ilike('notes', '%แสนสุข%');
  const { data: lt2 } = await supabase.from('ledger_transactions').select('*').ilike('category', '%แสนสุข%');
  console.log('Notes match:', lt);
  console.log('Category match:', lt2);
}
searchSansuk();
