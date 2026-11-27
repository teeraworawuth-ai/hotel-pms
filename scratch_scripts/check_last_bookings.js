const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: bList, error } = await supabase.from('bookings').select('id, room_id, check_in_time, actual_check_in_time, staff_name').order('check_in_time', { ascending: false }).limit(35);
  console.log('Error:', error);
  if (bList) {
    bList.forEach((b, i) => {
      console.log((i+1) + ': room_id=' + b.room_id + ' staff=' + b.staff_name + ' ci=' + (b.actual_check_in_time || b.check_in_time) + ' id=' + b.id);
    });
  }
}
run();
