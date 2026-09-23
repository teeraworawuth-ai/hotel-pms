const fs = require('fs');
let code = fs.readFileSync('src/app/api/cron/night-audit/route.ts', 'utf8');

const skipLogic = `      // Find the room
      const room = rooms?.find(r => r.id === booking.room_id);
      if (!room) continue;

      // DO NOT post charge if targetDate is the check-out day or later
      if (booking.check_out_time) {
        const checkoutDate = new Date(booking.check_out_time);
        
        // Use local Thai time logic to ensure we are comparing correct days
        const checkoutYear = checkoutDate.getFullYear();
        const checkoutMonth = checkoutDate.getMonth();
        const checkoutDay = checkoutDate.getDate();
        
        const targetYear = targetDate.getFullYear();
        const targetMonth = targetDate.getMonth();
        const targetDay = targetDate.getDate();
        
        // If the target date (today in the loop) is >= the checkout date, we don't charge for this night.
        // Because a checkout day means they stay until noon, they don't sleep over that night.
        if (new Date(targetYear, targetMonth, targetDay).getTime() >= new Date(checkoutYear, checkoutMonth, checkoutDay).getTime()) {
          console.log(\`Skipping charge for booking \${booking.id}: Target date (\${todayStr}) is >= Checkout date\`);
          continue; 
        }
      }`;

code = code.replace(/      \/\/ Find the room\n      const room = rooms\?\.find\(r => r\.id === booking\.room_id\);\n      if \(!room\) continue;/g, skipLogic);

fs.writeFileSync('src/app/api/cron/night-audit/route.ts', code);
console.log('Fixed night audit logic');
