import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
const { TuyaContext } = require('@tuya/tuya-connector-nodejs');

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const specificRoomId = url.searchParams.get('room_id');
    const specificDeviceId = url.searchParams.get('device_id');

    // 1. ตรวจสอบตั้งค่า Tuya
    let accessKey = process.env.TUYA_ACCESS_ID;
    let secretKey = process.env.TUYA_ACCESS_SECRET;

    // ดึงค่าจาก Database เผื่อผู้ใช้มีการอัปเดตผ่านหน้าเว็บ (Override)
    const { data: tuyaSettings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'tuya_api_keys')
      .single();

    if (tuyaSettings?.value) {
      accessKey = tuyaSettings.value.accessId || accessKey;
      secretKey = tuyaSettings.value.accessSecret || secretKey;
    }

    if (!accessKey || !secretKey) {
      return NextResponse.json(
        { error: 'Missing Tuya credentials in environment variables.' },
        { status: 400 }
      );
    }

    // 2. เริ่มการเชื่อมต่อ Tuya Cloud
    const tuya = new TuyaContext({
      baseUrl: 'https://openapi-sg.iotbing.com',
      accessKey: accessKey,
      secretKey: secretKey,
    });

    let roomsToSync = [];

    // 3. ถ้าไม่ได้ระบุห้องมา ให้ดึงทุกห้อง
    if (specificRoomId && specificDeviceId) {
      roomsToSync.push({ id: specificRoomId, tuya_device_id: specificDeviceId });
    } else {
      const { data: rooms, error: dbError } = await supabase
        .from('rooms')
        .select('id, tuya_device_id')
        .not('tuya_device_id', 'is', null)
        .neq('tuya_device_id', '');
      
      if (dbError) throw dbError;
      if (!rooms || rooms.length === 0) {
        return NextResponse.json({ message: 'No devices to sync.' });
      }
      roomsToSync = rooms;
    }

    const endTime = Date.now();
    // ดึงย้อนหลัง 7 วัน (7 * 24 * 60 * 60 * 1000)
    const startTime = endTime - (7 * 24 * 60 * 60 * 1000);
    
    let totalLogsInserted = 0;
    const failedDevices = [];

    // 4. ลูปดึงข้อมูลทีละห้อง
    for (const room of roomsToSync) {
      try {
        let hasNext = true;
        let lastRowKey = '';
        let loopCount = 0;
        
        while (hasNext && loopCount < 10) { // Limit to 10 loops (1000 items) to prevent infinite loops
          loopCount++;
          
          const queryParams: any = {
            type: '7', // Report Data
            start_time: startTime.toString(),
            end_time: endTime.toString(),
            size: '100'
          };
          
          if (lastRowKey) {
            queryParams.last_row_key = lastRowKey;
          }

          const response = await tuya.request({
            method: 'GET',
            path: `/v1.0/devices/${room.tuya_device_id}/logs`,
            query: queryParams
          });

          if (response.success && response.result && response.result.logs) {
            const logsToInsert = [];
            
            for (const log of response.result.logs) {
              if (log.code && (log.code.includes('power') || log.code.includes('watt'))) {
                const wattage = Number(log.value) / 10;
                const recordedAt = new Date(log.event_time).toISOString();
                
                logsToInsert.push({
                  room_id: room.id,
                  wattage: wattage,
                  recorded_at: recordedAt
                });
              }
            }

            if (logsToInsert.length > 0) {
              const { error: insertError } = await supabase
                .from('energy_logs')
                .insert(logsToInsert);
                
              if (insertError) {
                  console.error("Insert history error for room", room.id, insertError.message);
              } else {
                  totalLogsInserted += logsToInsert.length;
              }
            }
            
            // Handle pagination
            hasNext = response.result.has_next;
            lastRowKey = response.result.last_row_key;
            
            if (!hasNext) break;
          } else {
             failedDevices.push({ id: room.tuya_device_id, msg: response.msg || 'No logs' });
             break;
          }
        }
      } catch (err: any) {
        console.error(`Failed to fetch history for ${room.tuya_device_id}:`, err);
        failedDevices.push({ id: room.tuya_device_id, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Inserted ${totalLogsInserted} historical logs.`,
      failed_devices: failedDevices
    });

  } catch (error: any) {
    console.error('History sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync history', details: error.message },
      { status: 500 }
    );
  }
}
