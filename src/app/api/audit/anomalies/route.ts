import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateOffsetStr = searchParams.get('dateOffset');

  if (dateOffsetStr === null) {
    return NextResponse.json({ error: 'Missing dateOffset' }, { status: 400 });
  }

  const dateOffset = parseInt(dateOffsetStr, 10);
  
  // ดึง Location Order
  const { data: settingsData } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "location_order")
    .maybeSingle();

  let locationsOrder: string[] = [];
  if (settingsData && settingsData.value) {
    locationsOrder = settingsData.value as string[];
  }

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dateOffset);
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
  
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);
  const endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);
  const now = new Date();

  const { data: roomsData } = await supabase.from("rooms").select("id, room_no, location, sort_order");

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("room_id, check_in_time, check_out_time")
    .lte("check_in_time", endOfDay.toISOString())
    .gte("check_out_time", startOfDay.toISOString())
    .neq("status", "cancelled");

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
  
  const { data: reviewsData } = await supabase
    .from("anomaly_reviews")
    .select("room_id, session_start_time")
    .gte("session_start_time", startOfDay.toISOString())
    .lte("session_start_time", endOfDay.toISOString());

  if (roomsData && energyData) {
    const anomalies = roomsData.map((room) => {
      // ดึงการจองของห้องนี้
      const roomBookings = (bookingsData || []).filter(b => b.room_id === room.id).map(b => {
        const out = new Date(b.check_out_time);
        return {
          in: new Date(b.check_in_time),
          out: out > now ? now : out // ถ้ายังไม่ checkout ถือว่าครอบคลุมถึงปัจจุบัน
        };
      });

      // ดึง log เฉพาะของห้องนี้
      const roomLogs = energyData.filter(l => l.room_id === room.id);

      // คัดเฉพาะ log ที่อยู่นอกเวลาจอง
      const outsideLogs = roomLogs.filter(log => {
        const t = new Date(log.recorded_at);
        // เช็คว่า t ทับซ้อนกับการจองไหนบ้างไหม
        const isInBooking = roomBookings.some(b => t >= b.in && t <= b.out);
        return !isInBooking;
      });

      // จัดกลุ่มเป็น Sessions
      const sessions: any[] = [];
      let currentSession: any = null;

      for (const log of outsideLogs) {
        const t = new Date(log.recorded_at);
        const w = log.wattage || 0;

        if (w > 0) {
          if (!currentSession) {
            currentSession = { startTime: t, lastTime: t, wattages: [w], logs: [{t, w}] };
          } else {
            // เช็คเวลาห่าง ถ้าเกิน 15 นาที ถือว่าเป็นรอบใหม่
            const diffMins = (t.getTime() - currentSession.lastTime.getTime()) / 60000;
            if (diffMins > 15) {
              sessions.push(currentSession);
              currentSession = { startTime: t, lastTime: t, wattages: [w], logs: [{t, w}] };
            } else {
              currentSession.lastTime = t;
              currentSession.wattages.push(w);
              currentSession.logs.push({t, w});
            }
          }
        } else {
          // ถ้า w == 0 ปิด session
          if (currentSession) {
            sessions.push(currentSession);
            currentSession = null;
          }
        }
      }
      if (currentSession) sessions.push(currentSession);

      // คำนวณ duration และคัดกรองเฉพาะ session ที่นานเกิน 20 นาที และยังไม่ได้รีวิว
      const filteredSessions = sessions.map((s, index) => {
        let endTime = s.lastTime;
        let isOngoing = false;

        // เช็คว่าไฟยังคงเปิดอยู่หรือไม่ (ถ้า log สุดท้ายห่างจากปัจจุบันไม่เกิน 10 นาที)
        if (dateOffset === 0) {
          const timeSinceLastLog = (now.getTime() - s.lastTime.getTime()) / 60000;
          if (timeSinceLastLog <= 10) {
            endTime = now;
            isOngoing = true;
          }
        }

        const durationMins = (endTime.getTime() - s.startTime.getTime()) / 60000;
        const avgW = Math.round(s.wattages.reduce((a: number, b: number) => a + b, 0) / s.wattages.length);

        let kwh = 0;
        if (s.logs && s.logs.length > 1) {
          for (let i = 1; i < s.logs.length; i++) {
            const prev = s.logs[i - 1];
            const curr = s.logs[i];
            const diffHours = (curr.t.getTime() - prev.t.getTime()) / 3600000;
            const avgW_interval = (prev.w + curr.w) / 2; // คำนวณแบบพื้นที่ใต้กราฟ (Trapezoidal rule)
            kwh += (avgW_interval * diffHours) / 1000;
          }
        }

        if (isOngoing && s.logs && s.logs.length > 0) {
          const lastLog = s.logs[s.logs.length - 1];
          const diffHours = (now.getTime() - lastLog.t.getTime()) / 3600000;
          kwh += (lastLog.w * diffHours) / 1000;
        }

        // Fallback กรณีมีจุดเดียวแล้วจบเลย (ถึงแม้ปกติจะไม่ถึง 20 นาทีก็ตาม)
        if (kwh === 0 && durationMins > 0) {
           const durationHours = durationMins / 60;
           kwh = (avgW * durationHours) / 1000;
        }

        const estimatedCost = kwh * 5; // 5 THB per unit (approximate for 3-star hotel)

        return {
          id: index + 1,
          startTime: s.startTime,
          endTime,
          durationMins: Math.round(durationMins),
          avgW,
          kwhStr: kwh > 0.001 ? kwh.toFixed(3) : "0.001",
          estimatedCost: estimatedCost > 0.01 ? estimatedCost.toFixed(2) : "0.01",
          isOngoing
        };
      }).filter(s => {
        if (s.durationMins < 20) return false;
        // ตรวจสอบว่า session นี้ถูกรีวิวไปแล้วหรือยัง โดยเทียบเวลาเริ่ม (ยอมให้คลาดเคลื่อนได้ 1 นาที)
        const isReviewed = (reviewsData || []).some(r => 
          r.room_id === room.id && 
          Math.abs(new Date(r.session_start_time).getTime() - s.startTime.getTime()) < 60000
        );
        return !isReviewed;
      });

      if (filteredSessions.length === 0) return null;

      return {
        roomId: room.id,
        roomNo: room.room_no,
        location: room.location,
        sortOrder: room.sort_order || 0,
        sessions: filteredSessions
      };
    }).filter(Boolean);

    anomalies.sort((a: any, b: any) => {
      let indexA = locationsOrder.indexOf(a.location);
      let indexB = locationsOrder.indexOf(b.location);
      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;
      if (indexA !== indexB) return indexA - indexB;
      return a.sortOrder - b.sortOrder;
    });
    
    return NextResponse.json({ anomalies }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  }

  return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
}
