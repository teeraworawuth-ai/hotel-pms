const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const replacementLogic = `
      // 1.5 บันทึกรายได้และรายการต่างๆ (Revenue & Extras)
      if (insertedBooking) {
          // --- 1. บันทึกมัดจำกุญแจ (ถ้ามี) ---
          if (keyDepositEnabled && Number(keyDepositAmount) > 0) {
            await supabase.from('ledger_transactions').insert({
              shift_id: activeShift.id,
              staff_name: activeShift.staff_name,
              room_id: room.id,
              booking_id: insertedBooking.id,
              transaction_type: 'revenue',
              category: 'ค่ามัดจำกุญแจ',
              amount: Number(keyDepositAmount)
            });
          }

          if (type === 'overnight') {
            if (dailyBreakdown.length > 0) {
                // --- 2. บันทึกราคาห้องพักรายวัน (Booking Daily Rates) ---
                const inserts = dailyBreakdown.map(d => ({
                  booking_id: insertedBooking.id,
                  target_date: d.date,
                  amount: d.actualPrice === '' ? 0 : d.actualPrice,
                  original_rate_plan_id: selectedRatePlanId,
                  is_manual_override: d.isOverride
                }));
                await supabase.from('booking_daily_rates').insert(inserts);

                // --- 3. บันทึกรายการเพิ่ม/ส่วนลด (Booking Daily Extras) ---
                if (dailyExtras.length > 0) {
                  const extraInserts = dailyExtras.map(ext => ({
                    booking_id: insertedBooking.id,
                    target_date: ext.target_date,
                    category: ext.category,
                    description: ext.description,
                    amount: ext.amount
                  }));
                  await supabase.from('booking_daily_extras').insert(extraInserts);
                }
  
                // --- 4. บันทึกบัญชี (Ledger) สำหรับ "คืนแรก" ทันที ---
                const firstNightDate = dailyBreakdown[0].date;
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

                // นำ Extras ของคืนแรกมาบันทึกบัญชีทันที (ไม่ต้องรอ Night Audit)
                const firstNightExtras = dailyExtras.filter(e => e.target_date === firstNightDate);
                for (const ext of firstNightExtras) {
                  if (Number(ext.amount) !== 0) {
                    await supabase.from('ledger_transactions').insert({
                      shift_id: activeShift.id,
                      staff_name: activeShift.staff_name,
                      room_id: room.id,
                      booking_id: insertedBooking.id,
                      transaction_type: 'revenue',
                      category: ext.category,
                      notes: ext.description,
                      amount: Number(ext.amount)
                    });
                  }
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
          }

          // --- 5. บันทึกการรับชำระเงิน (Payment) ยอดรวมทั้งหมด ---
          if (paymentMethod !== 'unpaid' && totalToPay > 0) {
            await supabase.from('ledger_transactions').insert({
              shift_id: activeShift.id,
              staff_name: activeShift.staff_name,
              room_id: room.id,
              booking_id: insertedBooking.id,
              transaction_type: 'payment',
              category: paymentMethod,
              amount: -Number(totalToPay),
              notes: paymentTime ? \`โอนเวลา: \${paymentTime.replace('T', ' ')}\` : undefined
            });
          }
      }
`;

const regex = /\/\/ 1\.5 บันทึกรายได้ค่าห้อง.*?\}\n\s*\}\n\s*\}\n\s*\}\n\s*\}/s;
content = content.replace(regex, replacementLogic.trim() + '\n');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
console.log('Insert logic injected.');
