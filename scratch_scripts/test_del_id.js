const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const ids = [
  '8378adfe-e700-46c1-b7ba-81dd5f9199bd',
  'cffaaa17-000c-4673-a690-f563cfc40278',
  '59925797-9ec6-4515-ace6-b66dbf9abdd6',
  'cce8d21d-fd3c-4e7f-a82e-44cbaeb4ca36'
];

async function delByIds() {
  for (const id of ids) {
    const res = await supabase.from('ledger_transactions').delete().eq('id', id).select();
    console.log('Delete id', id, res);
  }
}
delByIds();
