const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: bList } = await supabase.from('bookings').select('*, rooms(room_number, location)').order('check_in_time', { ascending: true });
  const nov24 = (bList || []).filter(b => {
    const t = b.actual_check_in_time || b.check_in_time;
    return t && t.startsWith('2026-11-24');
  });
  console.log('Nov 24 bookings count:', nov24.length);
  nov24.forEach((b, idx) => {
    console.log(idx + 1, b.rooms?.room_number, b.rooms?.location, b.staff_name, b.actual_check_in_time || b.check_in_time, b.id);
  });
}
run();
