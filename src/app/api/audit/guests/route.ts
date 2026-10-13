import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getStayWindow, STAY_STATUSES, businessWindow } from '@/lib/stayWindow';

const COST_PER_KWH = 5; // เท่ากับที่ใช้ในรายงานความผิดปกติ

// รายงานผู้เข้าพัก: 1 การ์ด = 1 รอบเช็คอิน -> เช็คเอาท์ (ไม่มีข้อมูลกราฟ โหลดตอนคลิกการ์ด)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateOffsetStr = searchParams.get('dateOffset');
  if (dateOffsetStr === null) {
    return NextResponse.json({ error: 'Missing dateOffset' }, { status: 400 });
  }
  const dateOffset = parseInt(dateOffsetStr, 10);
  const { start: startOfDay, end: endOfDay, dateStr } = businessWindow(dateOffset);
  const now = new Date();

  const { data: bookingsData, error: bErr } = await supabase
    .from('bookings')
    .select('*, rooms ( room_no, location, sort_order )')
    .in('status', STAY_STATUSES)
    .lte('check_in_time', new Date(endOfDay.getTime() + 86400000).toISOString())
    .or('status.eq.checked_in,check_out_time.gte.' + startOfDay.toISOString());

  if (bErr || !bookingsData) {
    return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
  }

  const { data: settingsData } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'locations_order')
    .maybeSingle();
  const locationsOrder: string[] = (settingsData?.value as string[]) || [];

  // เลือกเฉพาะรอบที่ทับซ้อนกับวันธุรกิจที่เลือก
  const stays = bookingsData
    .map((b: any) => ({ b, w: getStayWindow(b, now) }))
    .filter(({ w }) => w.checkIn <= endOfDay && w.checkOut >= startOfDay && w.checkIn <= now);

  if (stays.length === 0) {
    return NextResponse.json({ cards: [], locationsOrder }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // ราคาของวันนั้น
  const bookingIds = stays.map(s => s.b.id);
  const { data: rates } = await supabase
    .from('booking_daily_rates')
    .select('booking_id, amount, target_date')
    .in('booking_id', bookingIds)
    .eq('target_date', dateStr);
  const rateMap: Record<string, number> = {};
  (rates || []).forEach((r: any) => { rateMap[r.booking_id] = Number(r.amount); });

  // ข้อมูลไฟ (เฉพาะห้องที่เกี่ยวข้อง ภายในวันธุรกิจ)
  const roomIds = Array.from(new Set(stays.map(s => s.b.room_id)));
  let energy: any[] = [];
  let from = 0;
  const limit = 1000;
  while (true) {
    const { data } = await supabase
      .from('energy_logs')
      .select('room_id, wattage, recorded_at')
      .in('room_id', roomIds)
      .gte('recorded_at', startOfDay.toISOString())
      .lte('recorded_at', endOfDay.toISOString())
      .order('recorded_at', { ascending: true })
      .range(from, from + limit - 1);
    if (!data) break;
    energy = energy.concat(data);
    if (data.length < limit) break;
    from += limit;
  }

  const cards = stays.map(({ b, w }) => {
    const room = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms;
    const winStart = Math.max(w.checkIn.getTime(), startOfDay.getTime());
    const winEnd = Math.min(w.checkOut.getTime(), endOfDay.getTime(), now.getTime());
    const logs = energy.filter(l => {
      if (l.room_id !== b.room_id) return false;
      const t = new Date(l.recorded_at).getTime();
      return t >= winStart && t <= winEnd;
    });
    let kwh = 0;
    for (let i = 1; i < logs.length; i++) {
      const dtMs = new Date(logs[i].recorded_at).getTime() - new Date(logs[i - 1].recorded_at).getTime();
      if (dtMs > 15 * 60000) continue; // ข้ามช่วงที่ไม่มีข้อมูล
      kwh += (((Number(logs[i - 1].wattage) || 0) + (Number(logs[i].wattage) || 0)) / 2) * (dtMs / 3600000) / 1000;
    }

    const schedMs = w.scheduledOut.getTime() - w.checkIn.getTime();
    return {
      bookingId: b.id,
      roomId: b.room_id,
      roomNo: room?.room_no,
      location: room?.location || 'ไม่มีสถานที่',
      sortOrder: room?.sort_order || 0,
      guestName: b.guest_name,
      guestCount: b.guest_count || 1,
      checkIn: w.checkIn.toISOString(),
      checkOut: w.checkOut.toISOString(),
      scheduledOut: w.scheduledOut.toISOString(),
      ended: w.ended,
      isOvernight: schedMs >= 12 * 3600000,
      nights: Math.max(1, Math.round(schedMs / 86400000)),
      hours: Math.max(1, Math.round(schedMs / 3600000)),
      price: rateMap[b.id] !== undefined ? rateMap[b.id] : (b.actual_price ?? null),
      kwh: Number(kwh.toFixed(2)),
      cost: Math.round(kwh * COST_PER_KWH),
    };
  });

  // เรียงตามสถานที่ -> เบอร์ห้อง (ตามหน้า Setting) -> รอบ (เวลาเช็คอิน)
  cards.sort((a: any, b: any) => {
    let la = locationsOrder.indexOf(a.location); if (la === -1) la = 999;
    let lb = locationsOrder.indexOf(b.location); if (lb === -1) lb = 999;
    if (la !== lb) return la - lb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.roomId !== b.roomId) return String(a.roomNo).localeCompare(String(b.roomNo));
    return new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime();
  });

  // หมายเลขรอบ (เฉพาะห้องที่มีหลายรอบในวันเดียวกัน)
  const perRoom: Record<string, number> = {};
  cards.forEach((c: any) => { perRoom[c.roomId] = (perRoom[c.roomId] || 0) + 1; });
  const counter: Record<string, number> = {};
  cards.forEach((c: any) => {
    counter[c.roomId] = (counter[c.roomId] || 0) + 1;
    c.round = counter[c.roomId];
    c.totalRounds = perRoom[c.roomId];
  });

  return NextResponse.json({ cards, locationsOrder, dateStr }, { headers: { 'Cache-Control': 'no-store' } });
}
