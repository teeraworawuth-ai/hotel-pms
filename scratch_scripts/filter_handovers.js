const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function listHandovers() {
  const { data } = await supabase.from('system_settings').select('*').like('key', 'cash_handover_%');
  if (data) {
    data.forEach(d => {
      let v = d.value;
      if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch(e) {}
      }
      if (v) {
        console.log('KEY:', d.key, 'date:', v.business_date, 'staff:', v.staff_name, 'kind:', v.kind, 'act:', v.actual_amount, 'carried:', v.carried_to_next_shift, 'drawer:', v.drawer_cash, 'note:', v.note);
      }
    });
  }
}
listHandovers();
