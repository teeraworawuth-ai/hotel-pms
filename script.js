const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  await supabase.from('system_settings').upsert({ key: 'energy_unit_cost', value: '5' });
  console.log("Done");
}
check();
