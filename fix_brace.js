const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

// Lines are 0-indexed. We need to replace lines 583-644 (0-indexed: 582-643)
const before = lines.slice(0, 582).join('\n');
const after = lines.slice(644).join('\n');

const newBlock = `
        if (type === 'overnight') {
          // --- 1.6 บันทึก Extra Charges (ถ้ามี) ---
          if (dailyExtras.length > 0) {
            const ledgerExtras = dailyExtras.map(ext => ({
              shift_id: activeShift.id,
              staff_name: activeShift.staff_name,
              room_id: room.id,
              booking_id: insertedBooking.id,
              transaction_type: 'revenue',
              category: ext.name,
              notes: ext.isPerNight ? '(' + (nights || 1) + ' คืน)' : null,
              amount: ext.isPerNight ? (ext.price * ext.qty * (Number(nights) || 1)) : (ext.price * ext.qty)
            }));
            await supabase.from('ledger_transactions').insert(ledgerExtras);
          }

          if (dailyBreakdown.length > 0) {
            // --- 2. บันทึกราคาห้องพักรายวัน (Booking Daily Rates) ---
            const inserts = dailyBreakdown.map(d => ({
              booking_id: insertedBooking.id,
              target_date: d.date,
              amount: d.actualPrice === '' ? 0 : d.actualPrice,
              original_rate_plan_id: selectedRatePlanId || null,
              is_manual_override: d.isOverride
            }));
            const { error: ratesError } = await supabase.from('booking_daily_rates').insert(inserts);
            if (ratesError) console.error('booking_daily_rates insert error:', ratesError);

            // --- 4. บันทึกบัญชี (Ledger) สำหรับ "คืนแรก" ทันที ---
            const firstNightPrice = dailyBreakdown[0].actualPrice === '' ? 0 : dailyBreakdown[0].actualPrice;
            if (firstNightPrice > 0) {
              await supabase.from('ledger_transactions').insert({
                shift_id: activeShift.id,
                staff_name: activeShift.staff_name,
                room_id: room.id,
                booking_id: insertedBooking.id,
                transaction_type: 'revenue',
                category: 'room_charge',
                amount: Number(firstNightPrice)
              });
            }
          }
        } else {
          // --- กรณี Short Stay ---
          if (actualPrice !== '') {
            await supabase.from('ledger_transactions').insert({
              shift_id: activeShift.id,
              staff_name: activeShift.staff_name,
              room_id: room.id,
              booking_id: insertedBooking.id,
              transaction_type: 'revenue',
              category: 'room_charge',
              amount: Number(actualPrice)
            });
          }
        }`;

const newContent = before + '\n' + newBlock + '\n' + after;
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', newContent, 'utf8');
console.log('Fixed block structure');
