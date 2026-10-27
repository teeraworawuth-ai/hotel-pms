import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');
  const dateOffsetStr = searchParams.get('dateOffset');

  if (!roomId || dateOffsetStr === null) {
    return NextResponse.json({ error: 'Missing roomId or dateOffset' }, { status: 400 });
  }

  const dateOffset = parseInt(dateOffsetStr, 10);

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dateOffset);

  const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 1, 0, 0, 0);
  let endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 2, 0, 0, 0);

  const now = new Date();
  if (now < endOfDay) {
    if (now < startOfRange) {
      return NextResponse.json({ formattedData: [] }, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    } else {
      endOfDay = now;
    }
  }

  const { data: logData, error: fetchError } = await supabase
    .from("energy_logs")
    .select("wattage, recorded_at")
    .eq("room_id", roomId)
    .gte("recorded_at", startOfRange.toISOString())
    .lte("recorded_at", endOfDay.toISOString())
    .limit(1000);

  if (fetchError) {
    return NextResponse.json({ error: 'Error fetching energy logs' }, { status: 500 });
  }

  const allLogs = (logData || []).slice().sort(
    (a: any, b: any) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  const rawData = allLogs.map((log: any) => {
    const d = new Date(log.recorded_at);
    const wattVal = Number(log.wattage);
    return {
      time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }),
      fullTime: d.getTime(),
      watt: (log.wattage !== null && wattVal > 0) ? wattVal : null,
    };
  });

  const formattedData: any[] = [];
  for (let i = 0; i < rawData.length; i++) {
    formattedData.push(rawData[i]);
    if (i < rawData.length - 1) {
      const curr = rawData[i];
      const next = rawData[i + 1];
      if (next.fullTime - curr.fullTime > 25 * 60 * 1000) {
        formattedData.push({
          time: "",
          fullTime: curr.fullTime + 1000,
          watt: null
        });
        formattedData.push({
          time: "",
          fullTime: next.fullTime - 1000,
          watt: null
        });
      }
    }
  }

  return NextResponse.json({ formattedData }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
