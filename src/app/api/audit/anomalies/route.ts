import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getStayWindow, STAY_STATUSES, businessWindow } from '@/lib/stayWindow';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateOffsetStr = searchParams.get('dateOffset');

  if (dateOffsetStr === null) {
    return NextResponse.json({ error: 'Missing dateOffset' }, { status: 400 });
  }

  const dateOffset = parseInt(dateOffsetStr, 10);
  const { start: startOfDay, end: endOfDay } = businessWindow(dateOffset);
  const now = new Date();
  const DAY = 86400000;

  // ดึงข้อมูลพื้นฐานพร้อมกันทั้งหมด
  const [settingsRes, roomsRes, bookingsRes, reviewsRes] = await Promise.all([
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .maybeSingle(),
    supabase
      .from("rooms")
      .select("id, room_no, location, sort_order, status, check_in_time, check_out_time, tuya_device_id, latest_wattage, last_active_at"),
    supabase
      .from("bookings")
      .select("*")
      .in("status", STAY_STATUSES)
      .lte("check_in_time", new Date(endOfDay.getTime() + DAY).toISOString())
      .or(`status.eq.checked_in,check_out_time.gte.${new Date(startOfDay.getTime() - DAY).toISOString()}`),
    supabase
      .from("anomaly_reviews")
      .select("room_id, session_start_time")
      .gte("session_start_time", startOfDay.toISOString())
      .lte("session_start_time", endOfDay.toISOString()),
  ]);

  const locationsOrder: string[] = (settingsRes.data?.value as string[]) || [];
  const roomsData = roomsRes.data || [];
  const bookingsData = bookingsRes.data || [];
  const reviewsData = reviewsRes.data || [];

  if (roomsRes.error) {
    return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 });
  }

  // ดึงเฉพาะห้องที่มีตัววัดไฟ Tuya แบบขนานตาม room_id (ใช้ Index room_id เร็วขึ้น ~50 เท่า ไม่เกิด Timeout)
  const meteredRooms = roomsData.filter(r => r.tuya_device_id && String(r.tuya_device_id).trim() !== '');
  const startIso = startOfDay.toISOString();
  const endIso = endOfDay.toISOString();

  const logsByRoomId: Record<string, { wattage: number; recorded_at: string; tMs: number }[]> = {};
  await Promise.all(
    meteredRooms.map(async (room) => {
      const { data } = await supabase
        .from("energy_logs")
        .select("wattage, recorded_at")
        .eq("room_id", room.id)
        .gte("recorded_at", startIso)
        .lte("recorded_at", endIso)
        .limit(1000);
      if (data && data.length > 0) {
        logsByRoomId[room.id] = data
          .map((l: any) => ({
            wattage: Number(l.wattage) || 0,
            recorded_at: l.recorded_at,
            tMs: new Date(l.recorded_at).getTime(),
          }))
          .filter(l => Number.isFinite(l.tMs))
          .sort((a, b) => a.tMs - b.tMs);
      } else {
        logsByRoomId[room.id] = [];
      }
    })
  );

  // เผื่อระยะผ่อนผันหน้า-หลังเช็คอินและเช็คเอาท์ 5 นาที (ป้องกันแจ้งเตือนหลอกตอนเสียบบัตรก่อนบันทึกเสร็จเล็กน้อย)
  const GRACE_MS = 5 * 60000;

  const anomalies = meteredRooms.map((room) => {
    const roomLogs = logsByRoomId[room.id] || [];
    if (roomLogs.length === 0) return null;

    // ดึงการจองของห้องนี้ที่ทับซ้อนกับวันทำการนี้
    const roomBookings = bookingsData
      .filter(b => b.room_id === room.id)
      .map(b => {
        const w = getStayWindow(b, now, room);
        return {
          in: w.checkIn,
          out: w.checkOut,
          guestName: b.guest_name || 'ผู้เข้าพัก',
          ended: w.ended,
        };
      })
      .filter(b => b.out.getTime() >= startOfDay.getTime() && b.in.getTime() <= endOfDay.getTime());

    // คัดเฉพาะ log ที่อยู่นอกเวลาเข้าพักจริง
    const outsideLogs = roomLogs.filter(log => {
      const t = log.tMs;
      const isInBooking = roomBookings.some(
        b => t >= b.in.getTime() - GRACE_MS && t <= b.out.getTime() + GRACE_MS
      );
      return !isInBooking;
    });

    // จัดกลุ่มเป็น Sessions
    const sessions: any[] = [];
    let currentSession: any = null;

    for (const log of outsideLogs) {
      const t = new Date(log.tMs);
      const w = log.wattage || 0;

      if (w > 0) {
        if (!currentSession) {
          currentSession = { startTime: t, lastTime: t, wattages: [w], logs: [{ t, w }] };
        } else {
          // เช็คเวลาห่าง ถ้าเกิน 15 นาที ถือว่าเป็นรอบใหม่
          const diffMins = (t.getTime() - currentSession.lastTime.getTime()) / 60000;
          if (diffMins > 15) {
            sessions.push(currentSession);
            currentSession = { startTime: t, lastTime: t, wattages: [w], logs: [{ t, w }] };
          } else {
            currentSession.lastTime = t;
            currentSession.wattages.push(w);
            currentSession.logs.push({ t, w });
          }
        }
      } else {
        if (currentSession) {
          sessions.push(currentSession);
          currentSession = null;
        }
      }
    }
    if (currentSession) sessions.push(currentSession);

    // คำนวณ duration และคัดกรองเฉพาะ session ที่นานตั้งแต่ 15 นาทีขึ้นไป และยังไม่ได้รีวิว
    const filteredSessions = sessions.map((s, index) => {
      let endTime = s.lastTime;
      let isOngoing = false;

      if (dateOffset === 0) {
        const timeSinceLastLog = (now.getTime() - s.lastTime.getTime()) / 60000;
        const stillDrawingPower = Number(room.latest_wattage || 0) > 0;
        if (timeSinceLastLog <= 12 && stillDrawingPower) {
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
          const avgW_interval = (prev.w + curr.w) / 2;
          kwh += (avgW_interval * diffHours) / 1000;
        }
      }

      if (isOngoing && s.logs && s.logs.length > 0) {
        const lastLog = s.logs[s.logs.length - 1];
        const diffHours = (now.getTime() - lastLog.t.getTime()) / 3600000;
        kwh += (lastLog.w * diffHours) / 1000;
      }

      if (kwh === 0 && durationMins > 0) {
        const durationHours = durationMins / 60;
        kwh = (avgW * durationHours) / 1000;
      }

      const estimatedCost = kwh * 5;

      return {
        id: index + 1,
        startTime: s.startTime,
        endTime,
        durationMins: Math.round(durationMins),
        avgW,
        kwhStr: kwh > 0.001 ? kwh.toFixed(3) : "0.001",
        estimatedCost: estimatedCost > 0.01 ? estimatedCost.toFixed(2) : "0.01",
        isOngoing,
      };
    }).filter(s => {
      if (s.durationMins < 15) return false;
      const isReviewed = reviewsData.some(r =>
        r.room_id === room.id &&
        Math.abs(new Date(r.session_start_time).getTime() - s.startTime.getTime()) < 60000
      );
      return !isReviewed;
    });

    if (filteredSessions.length === 0) return null;

    return {
      roomId: room.id,
      roomNo: room.room_no,
      location: room.location || 'ไม่มีสถานที่',
      sortOrder: room.sort_order || 0,
      sessions: filteredSessions,
      stayWindows: roomBookings.map(b => ({
        in: b.in.toISOString(),
        out: b.out.toISOString(),
        guestName: b.guestName,
      })),
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

  return NextResponse.json({ anomalies, locationsOrder }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
