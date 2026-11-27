const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkNov25Shifts() {
  const { data: sList, error } = await supabase.from('shifts').select('*').order('start_time', { ascending: false }).limit(10);
  console.log('Error:', error);
  console.log('Shifts count:', sList ? sList.length : 0);
  if (sList) {
    sList.forEach(s => {
      console.log('id=' + s.id + ' staff=' + s.staff_name + ' start=' + s.start_time + ' end=' + s.end_time + ' initCash=' + s.initial_cash + ' endSystem=' + s.end_cash_system + ' endActual=' + s.end_cash_actual + ' status=' + s.status);
    });
  }

  // Also check handovers
  const { data: hList } = await supabase.from('cash_handovers').select('*').order('created_at', { ascending: false }).limit(10);
  console.log('Handovers count:', hList ? hList.length : 0);
  if (hList) {
    hList.forEach(h => {
      console.log('hId=' + h.id + ' date=' + h.business_date + ' loc=' + h.location + ' type=' + h.handover_type + ' amt=' + h.amount + ' from=' + h.sender_name + ' to=' + h.receiver_name);
    });
  }
}
checkNov25Shifts();
