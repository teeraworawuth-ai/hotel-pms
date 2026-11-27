const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const [k, v] = l.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('system_settings').select('key, value').like('key', 'cash_handover_%');
  const byDateLoc = {};
  (data || []).forEach(r => {
    const h = r.value;
    const d = h.business_date || r.key.split('_')[2];
    const loc = h.shift_location || 'ซอย1';
    const k = d + ' | ' + loc;
    if (!byDateLoc[k]) byDateLoc[k] = { net: 0, count: 0 };
    byDateLoc[k].net += Number(h.actual_amount || 0);
    byDateLoc[k].count += 1;
  });
  Object.keys(byDateLoc).sort().forEach(k => {
    console.log(k, '-> net actual:', byDateLoc[k].net, 'count:', byDateLoc[k].count);
  });

  // Also check any expenses without shift_id or all expenses
  const { data: exps } = await supabase.from('ledger_transactions').select('id, created_at, shift_id, category, amount, notes').eq('transaction_type', 'expense');
  console.log('Total expenses:', exps?.length || 0);
  (exps || []).forEach(e => {
    console.log('EXP:', e.created_at, 'shift:', e.shift_id, 'cat:', e.category, 'amt:', e.amount, 'notes:', e.notes);
  });
}
run();
