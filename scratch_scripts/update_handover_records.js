const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env.local');
const env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) acc[key.trim()] = vals.join('=').trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function updateHandovers() {
  // 1. Fetch current L's handover
  const { data: dL } = await supabase.from('system_settings').select('*').eq('key', 'cash_handover_2026-11-25_1795608208219_3v2roi').single();
  if (dL) {
    const v = typeof dL.value === 'string' ? JSON.parse(dL.value) : dL.value;
    v.actual_amount = 4950;
    v.required_amount = 4950;
    v.carried_to_next_shift = 0;
    v.note = 'ส่งเงินปิดกะให้ผู้จัดการ ฿4,950';
    const upL = await supabase.from('system_settings').update({ value: v }).eq('key', dL.key).select();
    console.log('Updated L handover:', upL.error ? upL.error : 'OK');
  }

  // 2. Fetch current Toey's handover
  const { data: dT } = await supabase.from('system_settings').select('*').eq('key', 'cash_handover_2026-11-25_1795650953421_yxvm9r').single();
  if (dT) {
    const v = typeof dT.value === 'string' ? JSON.parse(dT.value) : dT.value;
    v.actual_amount = 4350;
    v.required_amount = 4350;
    v.carried_to_next_shift = 0;
    v.note = 'ส่งเงินปิดกะให้ผู้จัดการ ฿4,350';
    const upT = await supabase.from('system_settings').update({ value: v }).eq('key', dT.key).select();
    console.log('Updated Toey handover:', upT.error ? upT.error : 'OK');
  }
}
updateHandovers();
