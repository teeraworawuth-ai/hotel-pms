const fs = require('fs');
let content = fs.readFileSync('src/app/api/cron/tuya-sync/route.ts', 'utf8');

const target = `    if (logs.length > 0) {
      await supabase.from('energy_logs').insert(logs);
      for (const log of logs) {
        await supabase.from('rooms').update({
          last_active_at: new Date().toISOString(),
          latest_wattage: log.wattage
        }).eq('id', log.room_id);
      }
    }`;

const replacement = `    if (logs.length > 0) {
      await supabase.from('energy_logs').insert(logs);
      for (const log of logs) {
        await supabase.from('rooms').update({
          last_active_at: new Date().toISOString(),
          latest_wattage: log.wattage
        }).eq('id', log.room_id);
      }
    }

    if (apiCallsMade > 0) {
      const { data: quotaSetting } = await supabase.from('system_settings').select('value').eq('key', 'tuya_api_quota').single();
      if (quotaSetting && quotaSetting.value) {
         let quota = quotaSetting.value;
         
         const lastReset = new Date(quota.last_reset_date || new Date().toISOString());
         const now = new Date();
         const daysSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 3600 * 24);
         
         if (daysSinceReset >= 30) {
            quota.calls_used_this_month = apiCallsMade;
            quota.last_reset_date = now.toISOString();
         } else {
            quota.calls_used_this_month = (Number(quota.calls_used_this_month) || 0) + apiCallsMade;
         }
         
         await supabase.from('system_settings').update({ value: quota }).eq('key', 'tuya_api_quota');
      }
    }`;

content = content.replace(target, replacement);
fs.writeFileSync('src/app/api/cron/tuya-sync/route.ts', content);
console.log('Successfully updated cron script with quota tracking.');
