import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  const url = new URL(req.url);
  const simulatedDate = url.searchParams.get('simulated_date');
  const targetDate = simulatedDate ? new Date(simulatedDate) : new Date();
  try {
    // 1. Find all active bookings (checked_in)
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, room_id, check_in_time, check_out_time')
      .eq('status', 'checked_in');

    if (bookingsError) throw bookingsError;
    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ success: true, message: 'No active bookings found' });
    }

    // 2. Fetch room info for these bookings to get the price
    const roomIds = bookings.map(b => b.room_id);
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, actual_price, price_night')
      .in('id', roomIds);

    if (roomsError) throw roomsError;

    // 3. For each booking, check if we need to post a charge for today
    const todayStr = targetDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    let postedCount = 0;

    for (const booking of bookings) {
      // Find the room
      const room = rooms?.find(r => r.id === booking.room_id);
      if (!room) continue;

      // DO NOT post charge if targetDate is the check-out day or later
      if (booking.check_out_time) {
        const checkoutDate = new Date(booking.check_out_time);
        
        // Extract local Thai date components for accurate comparison
        const checkoutYear = checkoutDate.getFullYear();
        const checkoutMonth = checkoutDate.getMonth();
        const checkoutDay = checkoutDate.getDate();
        
        const targetYear = targetDate.getFullYear();
        const targetMonth = targetDate.getMonth();
        const targetDay = targetDate.getDate();
        
        // If the target date is >= the checkout date, skip charging for this night.
        // (If a customer checks out on the 9th, they don't pay for the night of the 9th)
        if (new Date(targetYear, targetMonth, targetDay).getTime() >= new Date(checkoutYear, checkoutMonth, checkoutDay).getTime()) {
          console.log(`Skipping charge for booking ${booking.id}: Target date is >= Checkout date`);
          continue; 
        }
      }

      // Check if a daily rate is defined for todayStr
      const { data: todayRateRow } = await supabase
        .from('booking_daily_rates')
        .select('amount')
        .eq('booking_id', booking.id)
        .eq('target_date', todayStr)
        .maybeSingle();

      const chargeAmount = todayRateRow?.amount != null ? Number(todayRateRow.amount) : (room.actual_price || room.price_night || 0);

      // Check if a room_charge has already been posted TODAY for this booking
      const { data: existingCharges, error: txError } = await supabase
        .from('ledger_transactions')
        .select('id, category, notes')
        .eq('booking_id', booking.id)
        .gte('created_at', `${todayStr}T00:00:00.000Z`)
        .lte('created_at', `${todayStr}T23:59:59.999Z`);
        
      const hasRoomCharge = existingCharges?.some(tx => tx.category === 'ค่าห้องพัก' || tx.category === 'room_charge');

      if (txError) {
        console.error('Error checking existing transactions:', txError);
        continue;
      }

      if (!hasRoomCharge && chargeAmount > 0) {
        // Post the room charge
        const { error: insertError } = await supabase
          .from('ledger_transactions')
          .insert({
            staff_name: simulatedDate ? 'SYSTEM (Simulated)' : 'SYSTEM (Night Audit)',
            room_id: booking.room_id,
            booking_id: booking.id,
            transaction_type: 'revenue',
            category: 'ค่าห้องพัก',
            amount: chargeAmount
          });
  
        if (insertError) {
          console.error('Error posting charge:', insertError);
        } else {
          postedCount++;
        }
      }

      // Also post any active booking_daily_extras scheduled for todayStr
      const { data: todayExtras } = await supabase
        .from('booking_daily_extras')
        .select('*')
        .eq('booking_id', booking.id)
        .eq('target_date', todayStr);

      if (todayExtras && todayExtras.length > 0) {
        const { data: allBookingRevenueTxs } = await supabase
          .from('ledger_transactions')
          .select('id, category, notes')
          .eq('booking_id', booking.id)
          .eq('transaction_type', 'revenue');

        for (const ext of todayExtras) {
          if (String(ext.category || '').includes('(Voided)') || Number(ext.amount) <= 0) continue;
          const baseCat = String(ext.category || '').replace(' (Voided)', '').trim();
          const alreadyPosted = (allBookingRevenueTxs || []).some(tx =>
            String(tx.category || '').replace(' (Voided)', '').trim() === baseCat &&
            String(tx.notes || '').includes(todayStr)
          );
          if (!alreadyPosted) {
            const qtyMatch = String(ext.description || '').match(/x(\d+)/);
            const qtySuffix = qtyMatch ? ` (x${qtyMatch[1]})` : '';
            const { error: extraInsErr } = await supabase
              .from('ledger_transactions')
              .insert({
                staff_name: simulatedDate ? 'SYSTEM (Simulated)' : 'SYSTEM (Night Audit)',
                room_id: booking.room_id,
                booking_id: booking.id,
                transaction_type: 'revenue',
                category: baseCat,
                notes: `ประจำวันที่ ${todayStr}${qtySuffix}`,
                amount: Number(ext.amount)
              });
            if (!extraInsErr) {
              postedCount++;
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, posted: postedCount, message: `Night audit completed. Posted ${postedCount} charges.` });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export const GET = POST; // Allow GET for easy triggering via cron/browser
