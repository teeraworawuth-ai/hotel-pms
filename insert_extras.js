const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const insertExtrasLogic = `        // --- 1.6 บันทึก Extra Charges (ถ้ามี) ---
        if (dailyExtras.length > 0) {
          const ledgerExtras = dailyExtras.map(ext => ({
            shift_id: activeShift.id,
            staff_name: activeShift.staff_name,
            room_id: room.id,
            booking_id: insertedBooking.id,
            transaction_type: 'revenue',
            category: ext.name,
            notes: ext.isPerNight ? \`(\${nights || 1} คืน)\` : null,
            amount: ext.amount
          }));
          await supabase.from('ledger_transactions').insert(ledgerExtras);
        }`;

content = content.replace('// --- 2. บันทึกราคาห้องพักรายวัน (Booking Daily Rates) ---', insertExtrasLogic + '\n\n              // --- 2. บันทึกราคาห้องพักรายวัน (Booking Daily Rates) ---');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
