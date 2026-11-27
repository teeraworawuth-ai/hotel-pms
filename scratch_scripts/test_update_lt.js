const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testUpdate() {
  const res = await supabase.from('ledger_transactions').update({ notes: 'test-update' }).eq('id', '8378adfe-e700-46c1-b7ba-81dd5f9199bd').select();
  console.log('Update res:', res);
}
testUpdate();
