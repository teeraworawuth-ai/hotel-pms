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
      // อินเดีย: https://openapi.tuyain.com
      baseUrl: 'https://openapi.tuyaus.com', // ใช้ US เซิฟเวอร์เป็นค่าเริ่มต้นสำหรับไทย
      accessKey: accessKey,
      secretKey: secretKey,
    });

    // 4. ดึงข้อมูลสถานะแบบกลุ่ม (Batch) เพื่อประหยัดโควต้า
    const response = await tuya.request({
      method: 'GET',
      path: `/v1.0/iot-03/devices/status`,
      query: {
        device_ids: deviceIds.join(',')
      }
    });

    if (!response.success) {
      console.error('Tuya API Error:', response);
      return NextResponse.json(
        { error: 'Tuya API Request failed', details: response.msg },
        { status: 500 }
      );
    }

    const tuyaData = response.result;
    
    // 5. ประมวลผลและสร้างข้อมูล Log
    const logs = [];
    
    for (const device of tuyaData) {
      const room = rooms.find(r => r.tuya_device_id === device.id);
      if (!room) continue;

      // ค้นหาค่ากำลังไฟ (Power) ปกติ Tuya จะใช้ code ว่า 'cur_power'
      const powerStatus = device.status.find((s: any) => s.code === 'cur_power');
      
      let wattage = 0;
      if (powerStatus && powerStatus.value) {
         wattage = Number(powerStatus.value);
      } else {
         // ลองหา code อื่นที่ใกล้เคียงเผื่อเซ็นเซอร์ส่งมาชื่ออื่น
         const anyPower = device.status.find((s: any) => s.code.includes('power') || s.code.includes('watt'));
         if (anyPower) wattage = Number(anyPower.value);
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
