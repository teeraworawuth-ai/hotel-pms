import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
const { TuyaContext } = require('@tuya/tuya-connector-nodejs');

export async function GET(request: Request) {
  try {
    // 1. ตรวจสอบตั้งค่า Tuya
    const accessKey = process.env.TUYA_ACCESS_ID;
    const secretKey = process.env.TUYA_ACCESS_SECRET;

    if (!accessKey || !secretKey) {
      return NextResponse.json(
        { error: 'Missing Tuya credentials in environment variables.' },
        { status: 400 }
      );
    }

    // 2. ดึงข้อมูลห้องพักทั้งหมดที่มีรหัส Tuya Device ID
    const { data: rooms, error: dbError } = await supabase
      .from('rooms')
      .select('id, room_no, tuya_device_id')
      .not('tuya_device_id', 'is', null)
      .neq('tuya_device_id', '');

    if (dbError) throw dbError;

    if (!rooms || rooms.length === 0) {
      return NextResponse.json({ message: 'No devices to sync.' });
    }

    const deviceIds = rooms.map(r => r.tuya_device_id).filter(Boolean);

    // 3. เริ่มการเชื่อมต่อ Tuya Cloud
    const tuya = new TuyaContext({
      // Data Center URL:
      // จีน: https://openapi.tuyacn.com
      // อเมริกา: https://openapi.tuyaus.com
      // ยุโรป: https://openapi.tuyaeu.com
      // สิงคโปร์: https://openapi-sg.iotbing.com
      baseUrl: 'https://openapi-sg.iotbing.com', // ใช้เซิร์ฟเวอร์สิงคโปร์ตามที่ตั้งไว้ในเว็บ Tuya
      accessKey: accessKey,
      secretKey: secretKey,
    });

    // 4. ดึงข้อมูลสถานะโดยใช้ Promise.all แบบแบ่งกลุ่ม (Chunk) เพื่อให้ทำงานขนานกัน (เร็วขึ้น ไม่ติด Timeout)
    // สาเหตุที่กลับมาใช้ API เดี่ยว เพราะ Batch API (iot-03) อาจติด Permission Deny ในบางบัญชี
    const tuyaData = [];
    const failedDevices = [];
    let hasError = false;
    let lastError = '';
    
    // ดึงพร้อมกันทีละ 5 อุปกรณ์ เพื่อไม่ให้โดน Tuya บล็อคจากการดึงรัวเกินไป (Rate Limit)
    const CHUNK_SIZE = 5;
    
    for (let i = 0; i < deviceIds.length; i += CHUNK_SIZE) {
      const chunk = deviceIds.slice(i, i + CHUNK_SIZE);
      
      const promises = chunk.map(async (deviceId) => {
        try {
          const response = await tuya.request({
            method: 'GET',
            path: `/v1.0/iot-03/devices/${deviceId}/status`,
          });
          return { deviceId, response };
        } catch (err: any) {
          return { deviceId, error: err };
        }
      });

      const results = await Promise.all(promises);

      for (const res of results) {
        if (res.error) {
          console.error(`Device ${res.deviceId} request error:`, res.error);
          failedDevices.push({ id: res.deviceId, error: res.error.message || 'Request failed' });
          hasError = true;
          lastError = res.error.message || 'Request failed';
        } else if (res.response.success && res.response.result) {
          tuyaData.push({
            id: res.deviceId,
            status: res.response.result
          });
        } else {
          console.error(`Device ${res.deviceId} failed:`, res.response);
          failedDevices.push({ id: res.deviceId, error: res.response.msg || 'Unknown error' });
          lastError = res.response.msg || 'Unknown error';
          hasError = true;
        }
      }
    }

    if (tuyaData.length === 0) {
      return NextResponse.json(
        { error: 'All devices failed to sync', details: lastError, failed_devices: failedDevices },
        { status: 500 }
      );
    }

    // 5. ประมวลผลและสร้างข้อมูล Log
    const logs = [];
    
    for (const device of tuyaData) {
      const room = rooms.find(r => r.tuya_device_id === device.id);
      if (!room) continue;

      // ค้นหาค่ากำลังไฟ (Power) ปกติ Tuya จะใช้ code ว่า 'cur_power'
      const powerStatus = device.status?.find((s: any) => s.code === 'cur_power');
      
      let wattage: number | null = null;
      if (powerStatus && powerStatus.value !== undefined) {
         wattage = Number(powerStatus.value) / 10; // หาร 10 ตามที่ Tuya ส่งมา
      } else {
         // ลองหา code อื่นที่ใกล้เคียงเผื่อเซ็นเซอร์ส่งมาชื่ออื่น
         const anyPower = device.status?.find((s: any) => s.code.includes('power') || s.code.includes('watt'));
         if (anyPower && anyPower.value !== undefined) wattage = Number(anyPower.value) / 10;
      }
      
      logs.push({
        room_id: room.id,
        wattage: wattage
      });
    }

    // 6. บันทึกลง Supabase
    if (logs.length > 0) {
      const { error: insertError } = await supabase.from('energy_logs').insert(logs);
      if (insertError) throw insertError;
      
      // อัปเดตสถานะห้องล่าสุด (เวลา และ ค่าไฟ) ให้เช็คง่ายๆ ว่าออนไลน์หรือไม่
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
      data: tuyaData // ส่งกลับมาให้ดูเป็นตัวอย่างตอนทดสอบด้วย
    });

  } catch (error: any) {
    console.error('Cron Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
