import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
const { TuyaContext } = require('@tuya/tuya-connector-nodejs');

export async function GET(request: Request) {
  try {
    // 1. ตรวจสอบและเตรียม Tuya Contexts (รองรับ 1 ถึง 3 บัญชี)
    let contexts: any[] = [];

    const { data: tuyaSettings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'tuya_api_keys')
      .single();

    if (tuyaSettings?.value?.keys && Array.isArray(tuyaSettings.value.keys)) {
      // ดึงคีย์ทั้งหมดที่กรอกมาแล้วมีค่า
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

    // กรณีไม่มีข้อมูลในระบบเลย ให้ใช้จาก Environment Variables
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

    // 2. ดึงข้อมูลจับคู่อุปกรณ์ที่เคยจำไว้ (Auto-Discovery Cache)
    const { data: mappingsData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'tuya_device_mappings')
      .single();
    
    let deviceMappings = mappingsData?.value || {};
    let mappingsChanged = false;

    // 3. ดึงข้อมูลห้องพักทั้งหมดที่มีรหัส Tuya Device ID
    const { data: rooms, error: dbError } = await supabase
      .from('rooms')
      .select('id, room_no, tuya_device_id')
      .not('tuya_device_id', 'is', null)
      .neq('tuya_device_id', '');

    if (dbError) throw dbError;
    if (!rooms || rooms.length === 0) return NextResponse.json({ message: 'No devices to sync.' });

    const deviceIds = rooms.map(r => r.tuya_device_id).filter(Boolean);

    const tuyaData = [];
    const failedDevices = [];
    const CHUNK_SIZE = 5;
    
    for (let i = 0; i < deviceIds.length; i += CHUNK_SIZE) {
      const chunk = deviceIds.slice(i, i + CHUNK_SIZE);
      
      const promises = chunk.map(async (deviceId) => {
        let lastError = null;
        
        // ก. ลองดึงจากบัญชีที่เคยจำไว้ (ถ้ามี)
        const cachedIndex = deviceMappings[deviceId];
        if (cachedIndex !== undefined && cachedIndex < contexts.length) {
          try {
            const response = await contexts[cachedIndex].request({
              method: 'GET',
              path: `/v1.0/iot-03/devices/${deviceId}/status`,
            });
            if (response.success && response.result) {
              return { deviceId, response };
            }
          } catch (err) {
            lastError = err;
            // ถ้าคีย์ที่เคยจำไว้ใช้ไม่ได้แล้ว ให้ลองหาใหม่
          }
        }

        // ข. Auto-Discovery: วนลูปหาว่าคีย์ไหนใช้กับอุปกรณ์นี้ได้
        for (let idx = 0; idx < contexts.length; idx++) {
          // ข้ามอันที่เพิ่งลองแล้วเฟลไปเมื่อกี้
          if (cachedIndex !== undefined && idx === cachedIndex && lastError) continue;
          
          try {
            const response = await contexts[idx].request({
              method: 'GET',
              path: `/v1.0/iot-03/devices/${deviceId}/status`,
            });
            
            if (response.success && response.result) {
              // เจอแล้ว! จำเอาไว้เลยรอบหน้าจะได้ไม่ต้องหาใหม่
              deviceMappings[deviceId] = idx;
              mappingsChanged = true;
              return { deviceId, response };
            }
          } catch (err) {
            lastError = err;
          }
        }

        // ค. ลองจนครบทุกบัญชีแล้วก็ยังไม่ได้
        return { deviceId, error: lastError || new Error('Device not found in any account') };
      });

      const results = await Promise.all(promises);

      for (const res of results) {
        if (res.error) {
          console.error(`Device ${res.deviceId} request error:`, res.error);
          failedDevices.push({ id: res.deviceId, error: (res.error as any).message || 'Request failed' });
        } else if (res.response && res.response.result) {
          tuyaData.push({ id: res.deviceId, status: res.response.result });
        }
      }
    }

    // อัปเดต Cache ถ้ามีการค้นพบคู่ใหม่
    if (mappingsChanged) {
      const { data: existingMap } = await supabase.from('system_settings').select('key').eq('key', 'tuya_device_mappings').single();
      if (existingMap) {
        await supabase.from('system_settings').update({ value: deviceMappings }).eq('key', 'tuya_device_mappings');
      } else {
        await supabase.from('system_settings').insert({ key: 'tuya_device_mappings', value: deviceMappings });
      }
    }

    if (tuyaData.length === 0 && failedDevices.length > 0) {
      return NextResponse.json(
        { error: 'All devices failed to sync', failed_devices: failedDevices },
        { status: 500 }
      );
    }

    // 5. ประมวลผลและสร้างข้อมูล Log
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
      
      logs.push({ room_id: room.id, wattage: wattage });
    }

    // 6. บันทึกลง Supabase
    if (logs.length > 0) {
      await supabase.from('energy_logs').insert(logs);
      for (const log of logs) {
        await supabase.from('rooms').update({
          last_active_at: new Date().toISOString(),
          latest_wattage: log.wattage
        }).eq('id', log.room_id);
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed_devices: logs.length,
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
