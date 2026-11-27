const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function simulate() {
  const { data: shifts } = await supabase.from('shifts').select('*').order('start_time', { ascending: false });
  const { data: lt } = await supabase.from('ledger_transactions').select('*');
  const { data: rooms } = await supabase.from('rooms').select('*');

  ['2026-11-24', '2026-11-25'].forEach(dateStr => {
    console.log(`\n=================== DATE: ${dateStr} ===================`);
    // Find shifts on this date
    // Business date start is 06:45 on dateStr to 06:45 next day
    const dStart = new Date(`${dateStr}T06:45:00+07:00`);
    const dEnd = new Date(dStart.getTime() + 24 * 3600 * 1000);

    const dayShifts = (shifts || []).filter(s => {
      const st = new Date(s.start_time);
      return st >= new Date(dStart.getTime() - 4 * 3600 * 1000) && st < dEnd;
    });

    dayShifts.forEach((s, idx) => {
      const rows = (lt || []).filter(r => r.shift_id === s.id);
      let rev = 0, cash = 0, transfer = 0, depIn = 0, depOut = 0;
      rows.forEach(r => {
        const amt = Number(r.amount || 0);
        if (r.transaction_type === 'revenue') rev += amt;
        if (r.transaction_type === 'payment') {
          if (r.category === 'cash') cash += Math.abs(amt);
          else transfer += Math.abs(amt);
        }
        if (r.transaction_type === 'deposit') {
          if (amt > 0) depIn += amt;
          else depOut += Math.abs(amt);
        }
      });
      console.log(`Shift ${idx + 1} (${s.staff_name}, id: ${s.id.slice(0, 8)}):`);
      console.log(`  start: ${new Date(s.start_time).toLocaleString('th-TH')}, end: ${s.end_time ? new Date(s.end_time).toLocaleString('th-TH') : 'open'}`);
      console.log(`  initCash: ${s.initial_cash}, finalCash: ${s.final_cash}`);
      console.log(`  Revenue: ${rev}, CashPay: ${cash}, TransferPay: ${transfer}, NetCashInShift: ${cash - depIn}`);
      console.log(`  TotalCashInDrawer (init + cash - depOut): ${Number(s.initial_cash || 0) + cash - depOut}`);
    });
  });
}
simulate();
