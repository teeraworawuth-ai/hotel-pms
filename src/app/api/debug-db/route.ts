import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: rooms } = await supabase.from('rooms').select('room_no, booking_id').eq('room_no', '18');
  if (!rooms || rooms.length === 0) return NextResponse.json({ error: 'No room 18' });
  
  const bookingId = rooms[0].booking_id;
  const { data: rates } = await supabase.from('booking_daily_rates').select('*').eq('booking_id', bookingId);
  return NextResponse.json({ bookingId, rates });
}
