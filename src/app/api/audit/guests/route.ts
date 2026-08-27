import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateOffsetStr = searchParams.get('dateOffset');

  if (dateOffsetStr === null) {
    return NextResponse.json({ error: 'Missing dateOffset' }, { status: 400 });
  }

  const dateOffset = parseInt(dateOffsetStr, 10);
  
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dateOffset);
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
  
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);
  const endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);
  const now = new Date();

  // 2. ดึงข้อมูลการจองที่ทับซ้อนกับวันนี้
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(`
      id, room_id, guest_name, check_in_time, check_out_time, status,
      rooms ( room_no, location, sort_order )
    `)
    .lte("check_in_time", endOfDay.toISOString())
    .gte("check_out_time", startOfDay.toISOString())
    .neq("status", "cancelled");

  // 3. ดึงข้อมูลไฟของทุกห้องในวันนี้
  let energyData: any[] = [];
  let from = 0;
  const limit = 1000;
  while (true) {
    const { data } = await supabase
      .from("energy_logs")
      .select("room_id, wattage, recorded_at")
      .gte("recorded_at", startOfDay.toISOString())
      .lte("recorded_at", endOfDay.toISOString())
      .order("recorded_at", { ascending: true })
      .range(from, from + limit - 1);
      
    if (data) {
      energyData = energyData.concat(data);
      if (data.length < limit) break;
    } else {
      break;
    }
    from += limit;
  }
  
  if (bookingsData && energyData) {
    const processed = bookingsData.map((b: any) => {
      const room = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms;
      const checkIn = new Date(b.check_in_time);
      const checkOut = new Date(b.check_out_time);
      
      // เวลา Check-out จริงที่จะใช้คำนวณ (ถ้ายังไม่ถึงเวลาออก ให้ใช้เวลาปัจจุบัน)
      const effectiveCheckOut = checkOut > now ? now : checkOut;
      // ถ้าเช็คอินในอนาคต (ยังไม่เกิด) ข้ามการคำนวณ
      if (checkIn > now) return null;

      // ดึง log เฉพาะห้องนี้ และอยู่ในช่วงเวลาที่พัก
      const logs = energyData.filter(log => {
        if (log.room_id !== b.room_id) return false;
        const logTime = new Date(log.recorded_at);
        return logTime >= checkIn && logTime <= effectiveCheckOut;
      });

      // จัดเตรียมข้อมูลสำหรับกราฟ
      const chartData = logs.map(l => {
        const d = new Date(l.recorded_at);
        return {
          time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }),
          fullTime: d.getTime(),
          watt: Number(l.wattage) || 0
        };
      });

      const startMs = checkIn.getTime();
      const endMs = effectiveCheckOut.getTime();
      
      const maxWatt = Math.max(...chartData.map(d => d.watt), 100);
      const yAxisMax = Math.ceil(maxWatt / 200) * 200 + 200;

      // คัดเฉพาะ log ที่มีการใช้ไฟ (> 0)
      const activeLogs = logs.filter(l => l.wattage > 0);
      const wattages = activeLogs.map(l => Number(l.wattage)).sort((x, y) => x - y);

      let avg = 0, min10 = 0, max10 = 0, percent = 0;

      if (wattages.length > 0) {
        avg = wattages.reduce((sum, w) => sum + w, 0) / wattages.length;
        
        const lowest10 = wattages.slice(0, 10);
        min10 = lowest10.reduce((sum, w) => sum + w, 0) / lowest10.length;

        const highest10 = wattages.slice(-10);
        max10 = highest10.reduce((sum, w) => sum + w, 0) / highest10.length;

        // คำนวณ % การใช้ไฟ
        const durationMins = (effectiveCheckOut.getTime() - checkIn.getTime()) / 60000;
        if (durationMins > 0) {
          // สมมติฐาน 1 log = 1 นาที (โดยประมาณ)
          percent = (activeLogs.length / durationMins) * 100;
          if (percent > 100) percent = 100;
        }
      }

      return {
        bookingId: b.id,
        roomId: b.room_id,
        roomNo: room.room_no,
        location: room.location,
        guestName: b.guest_name,
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        effectiveCheckOut: effectiveCheckOut.toISOString(),
        avg: Math.round(avg),
        min10: Math.round(min10),
        max10: Math.round(max10),
        percent: Math.round(percent),
        sortOrder: room.sort_order || 0,
        chartData,
        startMs,
        endMs,
        yAxisMax
      };
    }).filter(Boolean); // ลบ null ทิ้ง

    // จัดเรียงตาม location_order
    processed.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    
    return NextResponse.json({ processed }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  }

  return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
}
