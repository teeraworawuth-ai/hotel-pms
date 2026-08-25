import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
const { TuyaContext } = require('@tuya/tuya-connector-nodejs');

export async function GET(request: Request) {
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

  try {
    let contexts: any[] = [];
    const { data: tuyaSettings } = await supabase.from('system_settings').select('value').eq('key', 'tuya_api_keys').single();

    if (tuyaSettings?.value?.keys && Array.isArray(tuyaSettings.value.keys)) {
      const validKeys = tuyaSettings.value.keys.filter((k: any) => k.accessId && k.accessSecret);
      if (validKeys.length > 0) {
        contexts = validKeys.map((k: any) => new TuyaContext({
          baseUrl: 'https://openapi-sg.iotbing.com',
          accessKey: k.accessId,
          secretKey: k.accessSecret,
        }));
      }
    } else if (tuyaSettings?.value?.accessId && tuyaSettings?.value?.accessSecret) {
      contexts = [new TuyaContext({
        baseUrl: 'https://openapi-sg.iotbing.com',
        accessKey: tuyaSettings.value.accessId,
        secretKey: tuyaSettings.value.accessSecret,
      })];
    }

    if (contexts.length === 0) {
      if (process.env.TUYA_ACCESS_ID && process.env.TUYA_ACCESS_SECRET) {
        contexts = [new TuyaContext({
          baseUrl: 'https://openapi-sg.iotbing.com',
          accessKey: process.env.TUYA_ACCESS_ID,
          secretKey: process.env.TUYA_ACCESS_SECRET,
        })];
      } else {
        return NextResponse.json({ error: 'Missing Tuya credentials.' }, { status: 400 });
      }
    }

    const { data: rooms, error: dbError } = await supabase
      .from('rooms')
      .select('id, room_no, tuya_device_id')
      .not('tuya_device_id', 'is', null)
      .neq('tuya_device_id', '');

    if (dbError) throw dbError;
    if (!rooms || rooms.length === 0) return NextResponse.json({ message: 'No devices to sync.' });

    const deviceIds = rooms.map(r => r.tuya_device_id).filter(Boolean);

    const CHUNK_SIZE = 20; 
    const tuyaData = [];
    const failedDevices = [];
    let apiCallsMade = 0;
    
    for (let i = 0; i < deviceIds.length; i += CHUNK_SIZE) {
      const chunk = deviceIds.slice(i, i + CHUNK_SIZE);
      const deviceIdsString = chunk.join(',');
      let chunkSuccess = false;
      let lastError = null;

      for (let idx = 0; idx < contexts.length; idx++) {
        try {
          apiCallsMade++;
          const response = await contexts[idx].request({
            method: 'GET',
            path: '/v1.0/iot-03/devices/status?device_ids=' + deviceIdsString,
          });
          
          if (response.success && response.result) {
            tuyaData.push(...response.result);
            chunkSuccess = true;
            break;
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (!chunkSuccess) {
        console.error('Chunk failed:', lastError);
        chunk.forEach(id => failedDevices.push({ id, error: lastError?.message || 'Bulk request failed in all accounts' }));
      }
    }

    if (tuyaData.length === 0 && failedDevices.length > 0) {
      return NextResponse.json(
        { error: 'All devices failed to sync', failed_devices: failedDevices },
        { status: 500 }
      );
    }

    const logs = [];
    for (const device of tuyaData) {
      const room = rooms.find(r => r.tuya_device_id === device.id);
      if (!room) continue;

      const powerStatus = device.status?.find((s: any) => s.code === 'cur_power');
      let wattage: number | null = null;
      if (powerStatus && powerStatus.value !== undefined) {
         wattage = Number(powerStatus.value) / 10;
      } else {
         const anyPower = device.status?.find((s: any) => s.code.includes('power') || s.code.includes('watt'));
         if (anyPower && anyPower.value !== undefined) wattage = Number(anyPower.value) / 10;
      }
      
      if (wattage !== null) {
        logs.push({ room_id: room.id, wattage: wattage });
      }
    }

    if (logs.length > 0) {
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
    }

    return NextResponse.json({ 
      success: true, 
      processed_devices: logs.length,
      api_calls_used: apiCallsMade,
      failed_devices: failedDevices,
      data: tuyaData
    });

  } catch (error: any) {
    console.error('Cron Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
