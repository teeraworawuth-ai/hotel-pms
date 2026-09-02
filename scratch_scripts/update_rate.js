const fs = require('fs');
let content = fs.readFileSync('src/app/api/cron/tuya-sync/route.ts', 'utf8');

const target = 'export async function GET(request: Request) {';

const replacement = `export async function GET(request: Request) {
  try {
    // 1. Rate Limiting Check (Prevent calls more frequent than 4.5 minutes)
    const { data: lastSyncData } = await supabase.from('system_settings').select('value').eq('key', 'last_tuya_sync_time').single();
    if (lastSyncData && lastSyncData.value) {
       const lastSync = new Date(lastSyncData.value);
       const now = new Date();
       const diffMins = (now.getTime() - lastSync.getTime()) / 60000;
       
       if (diffMins < 4.5) {
          console.log('Skipping sync: ' + diffMins + ' mins since last sync');
          return NextResponse.json({ message: 'Skipped - Rate Limited to 5 mins', api_calls_used: 0 });
       }
    }
    
    await supabase.from('system_settings').upsert({ key: 'last_tuya_sync_time', value: new Date().toISOString() }, { onConflict: 'key' });
`;

content = content.replace(target, replacement);
fs.writeFileSync('src/app/api/cron/tuya-sync/route.ts', content);
console.log('Added rate limiter');
