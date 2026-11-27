const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: bList, error } = await supabase.from('bookings').select('*');
  console.log('Total bookings:', bList?.length, 'Error:', error);
  if (bList) {
    const r17 = bList.filter(b => {
      const s = JSON.stringify(b);
      return s.includes('15561143') || s.includes('19:47') || (b.room_id && s.includes('17'));
    });
    console.log('Matches:', r17);
  }
}
run();
