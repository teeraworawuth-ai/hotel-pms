const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
  const startOfRange = new Date();
  startOfRange.setDate(startOfRange.getDate() - 3);
  startOfRange.setHours(0,0,0,0);
  
  const endOfDay = new Date();
  
  console.log("Fetching from", startOfRange.toISOString(), "to", endOfDay.toISOString());
  
  const { data, error } = await supabase
    .from('energy_logs')
    .select('wattage, recorded_at')
    //.eq('room_id', 'some-room-id')
    .gte('recorded_at', startOfRange.toISOString())
    .lte('recorded_at', endOfDay.toISOString())
    .order('recorded_at', { ascending: true })
    .limit(50000);
    
  console.log("Error:", error);
  console.log("Data length:", data ? data.length : 0);
}
test();
