import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getStayWindow, STAY_STATUSES, businessWindow } from '@/lib/stayWindow';

const COST_PER_KWH = 5; // เท่ากับที่ใช้ในรายงานความผิดปกติ
const BKK = 7 * 3600000;
const DAY = 86400000;

// วันที่ธุรกิจ (YYYY-MM-DD, ตัดรอบ 06:45 เวลาไทย)
const bizDateStr = (ms: number) => new Date(ms + BKK - (6 * 60 + 45) * 60000).toISOString().slice(0, 10);
// 12:00 (เวลาไทย) ของวันที่ YYYY-MM-DD + addDays
const noonOf = (dateStr: string, addDays: number) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d + addDays, 12, 0, 0) - BKK;
};

// แบ่งการเข้าพักเป็นรอบคิดค่าไฟ:
// - พัก 1 คืน: เช็คอินจริง -> เช็คเอาท์จริง (หรือปัจจุบัน)
// - พักหลายคืน: เช็คอิน -> 12:00 วันถัดไป, 12:00 -> 12:00, ..., 12:00 -> เช็คเอาท์จริง
function splitNights(inMs: number, outMs: number, scheduledOutMs: number) {
  const segs: { start: number; end: number }[] = [];
  const firstNoon = noonOf(bizDateStr(inMs), 1);
  let cur = inMs;
  // ตัดที่ 12:00 เฉพาะคืนที่ยังไม่ใช่คืนสุดท้ายตามกำหนด (เผื่อออกช้าในวันสุดท้าย)
  for (let noon = firstNoon; noon < outMs && noon < scheduledOutMs - 3600000; noon += DAY) {
    if (noon <= cur) continue;
    segs.push({ start: cur, end: noon });
    cur = noon;
  }
  segs.push({ start: cur, end: outMs });
  return segs;
}

// รายงานผู้เข้าพัก: 1 การ์ด = 1 คืน (รอบคิดค่าไฟ) ของการเข้าพัก ที่เริ่มในวันธุรกิจที่เลือก
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
    .select('*, rooms ( room_no, room_type, location, sort_order, price_night, price_temp )')
    .in('status', STAY_STATUSES)
    .lte('check_in_time', new Date(endOfDay.getTime() + DAY).toISOString())
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

  // หา "คืน" ที่เริ่มในวันธุรกิจที่เลือก
  const items: any[] = [];
  bookingsData.forEach((b: any) => {
    const w = getStayWindow(b, now);
    if (w.checkIn > now) return;
    const effectiveEnd = w.ended
      ? w.checkOut.getTime()
      : Math.max(w.checkOut.getTime(), w.scheduledOut.getTime());
    const allSegs = splitNights(w.checkIn.getTime(), effectiveEnd, w.scheduledOut.getTime());
    allSegs.forEach((s, i) => {
      // คืนที่เริ่มในวันธุรกิจที่เลือก และเริ่มแล้วจริง (ไม่แสดงคืนในอนาคตที่ยังไม่ถึงเวลาเริ่ม)
      if (bizDateStr(s.start) === dateStr && s.start <= now.getTime()) {
        const segActualEnd = Math.min(s.end, w.checkOut.getTime());
        items.push({
          b,
          w,
          seg: { start: s.start, end: segActualEnd },
          nightNo: i + 1,
          totalNights: allSegs.length,
        });
      }
    });
  });

  if (items.length === 0) {
    return NextResponse.json({ cards: [], locationsOrder, dateStr }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // ราคาของวันนั้น
  const bookingIds = Array.from(new Set(items.map(it => it.b.id)));
  const { data: rates } = await supabase
    .from('booking_daily_rates')
    .select('booking_id, amount, target_date')
    .in('booking_id', bookingIds)
    .eq('target_date', dateStr);
  const rateMap: Record<string, number> = {};
  (rates || []).forEach((r: any) => { rateMap[r.booking_id] = Number(r.amount); });

  // ราคาตั้งไว้ตามประเภทห้อง (Smart Pricing ของวันนั้น)
  const { data: smartPrices } = await supabase
    .from('smart_prices')
    .select('room_type, price')
    .eq('target_date', dateStr);
  const smartPricesMap: Record<string, number> = {};
  (smartPrices || []).forEach((sp: any) => { smartPricesMap[sp.room_type] = Number(sp.price); });

  // ข้อมูลไฟของห้องที่เกี่ยวข้อง ครอบคลุมทุกคืนที่จะแสดง
  const roomIds = Array.from(new Set(items.map(it => it.b.room_id)));
  const minStart = Math.min(...items.map(it => it.seg.start));
  const maxEnd = Math.max(...items.map(it => it.seg.end));
  let energy: any[] = [];
  let from = 0;
  const limit = 1000;
  while (true) {
    const { data } = await supabase
      .from('energy_logs')
      .select('room_id, wattage, recorded_at')
      .in('room_id', roomIds)
      .gte('recorded_at', new Date(minStart).toISOString())
      .lte('recorded_at', new Date(maxEnd).toISOString())
      .order('recorded_at', { ascending: true })
      .range(from, from + limit - 1);
    if (!data) break;
    energy = energy.concat(data);
    if (data.length < limit) break;
    from += limit;
  }

  const cards = items.map(({ b, w, seg, nightNo, totalNights }) => {
    const room = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms;
    const logs = energy.filter(l => {
      if (l.room_id !== b.room_id) return false;
      const t = new Date(l.recorded_at).getTime();
      return t >= seg.start && t <= seg.end;
    });
    let kwh = 0;
    for (let i = 1; i < logs.length; i++) {
      const dtMs = new Date(logs[i].recorded_at).getTime() - new Date(logs[i - 1].recorded_at).getTime();
      if (dtMs > 15 * 60000) continue; // ข้ามช่วงที่ไม่มีข้อมูล
      kwh += (((Number(logs[i - 1].wattage) || 0) + (Number(logs[i].wattage) || 0)) / 2) * (dtMs / 3600000) / 1000;
    }

    const schedMs = w.scheduledOut.getTime() - w.checkIn.getTime();

    // คำนวณราคาตั้งต้นและส่วนต่าง เหมือนหน้า Check-in
    const defPrice = b.stay_type === 'short_stay'
      ? (room?.price_temp ?? null)
      : (smartPricesMap[room?.room_type] !== undefined ? smartPricesMap[room?.room_type] : (room?.price_night ?? null));
    const actualPrice = rateMap[b.id] !== undefined ? rateMap[b.id] : (b.actual_price ?? null);

    let basePriceText: number | null = null;
    let diffText: string | null = null;
    let diffColor = '';

    if (actualPrice !== null && actualPrice !== undefined) {
      if (defPrice !== null && defPrice !== undefined && actualPrice !== defPrice) {
        basePriceText = defPrice;
        const diff = actualPrice - defPrice;
        diffText = diff > 0 ? `+${diff}` : `${diff}`;
        diffColor = diff > 0 ? 'text-emerald-500' : 'text-red-500';
      } else {
        basePriceText = actualPrice;
      }
    } else if (defPrice !== null && defPrice !== undefined) {
      basePriceText = defPrice;
    }

    return {
      bookingId: b.id,
      cardKey: `${b.id}_${nightNo}`,
      roomId: b.room_id,
      roomNo: room?.room_no,
      roomType: room?.room_type,
      location: room?.location || 'ไม่มีสถานที่',
      sortOrder: room?.sort_order || 0,
      guestName: b.guest_name,
      guestCount: b.guest_count || 1,
      checkIn: w.checkIn.toISOString(),
      checkOut: w.checkOut.toISOString(),
      scheduledOut: w.scheduledOut.toISOString(),
      ended: w.ended,
      isOvernight: b.stay_type ? b.stay_type === 'overnight' : schedMs >= 12 * 3600000,
      nights: Math.max(1, Math.round(schedMs / DAY)),
      hours: Math.max(1, Math.round(schedMs / 3600000)),
      nightNo,
      totalNights,
      segStart: new Date(seg.start).toISOString(),
      segEnd: new Date(seg.end).toISOString(),
      price: actualPrice,
      basePriceText,
      diffText,
      diffColor,
      kwh: Number(kwh.toFixed(2)),
      cost: Math.round(kwh * COST_PER_KWH),
    };
  });

  // เรียงตามสถานที่ -> เบอร์ห้อง (ตามหน้า Setting) -> รอบ (เวลาเริ่ม)
  cards.sort((a: any, b: any) => {
    let la = locationsOrder.indexOf(a.location); if (la === -1) la = 999;
    let lb = locationsOrder.indexOf(b.location); if (lb === -1) lb = 999;
    if (la !== lb) return la - lb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.roomId !== b.roomId) return String(a.roomNo).localeCompare(String(b.roomNo));
    return new Date(a.segStart).getTime() - new Date(b.segStart).getTime();
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
