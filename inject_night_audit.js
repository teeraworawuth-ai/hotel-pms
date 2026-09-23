const fs = require('fs');
let content = fs.readFileSync('src/app/api/cron/night-audit/route.ts', 'utf8');

const replacementLogic = `
        // Check if a room_charge has already been posted TODAY for this booking
        const { data: existingCharges, error: txError } = await supabase
          .from('ledger_transactions')
          .select('id, category')
          .eq('booking_id', booking.id)
          .gte('created_at', \`\${todayStr}T00:00:00.000Z\`)
          .lte('created_at', \`\${todayStr}T23:59:59.999Z\`);
          
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
        
        // --- [NEW] Post Daily Extras for today ---
        const { data: extras } = await supabase
          .from('booking_daily_extras')
          .select('*')
          .eq('booking_id', booking.id)
          .eq('target_date', targetDateStr);
          
        if (extras && extras.length > 0) {
          for (const ext of extras) {
            // Check if this extra was already posted today (match category)
            const alreadyPosted = existingCharges?.some(tx => tx.category === ext.category);
            if (!alreadyPosted && Number(ext.amount) !== 0) {
              await supabase.from('ledger_transactions').insert({
                staff_name: simulatedDate ? 'SYSTEM (Simulated)' : 'SYSTEM (Night Audit)',
                room_id: booking.room_id,
                booking_id: booking.id,
                transaction_type: 'revenue',
                category: ext.category,
                notes: ext.description,
                amount: Number(ext.amount)
              });
            }
          }
        }
`;

const regex = /\/\/ Check if a room_charge.*?postedCount\+\+;\n\s*\}/s;
content = content.replace(regex, replacementLogic.trim());

fs.writeFileSync('src/app/api/cron/night-audit/route.ts', content, 'utf8');
console.log('Night audit injected.');
