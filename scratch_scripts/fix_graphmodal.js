const fs = require('fs');
let content = fs.readFileSync('src/app/audit/GraphModal.tsx', 'utf8');

const pattern = /const\s+\{\s*data\s*:\s*logs\s*\}\s*=\s*await\s+supabase\s*\.\s*from\(\s*"energy_logs"\s*\)[\s\S]*?\.order\(\s*"recorded_at"\s*,\s*\{\s*ascending\s*:\s*true\s*\}\s*\)\s*(?:;\s*\/\/[^\n]*\n|;)/;

const match = content.match(pattern);
if (match) {
  const newBlock = `let logs = [];
      let from = 0;
      const limit = 1000;
      while (true) {
        const { data } = await supabase
          .from("energy_logs")
          .select("wattage, recorded_at")
          .eq("room_id", booking.roomId)
          .gte("recorded_at", booking.checkIn.toISOString())
          .lte("recorded_at", booking.effectiveCheckOut.toISOString())
          .order("recorded_at", { ascending: true })
          .range(from, from + limit - 1);
          
        if (data) {
          logs = logs.concat(data);
          if (data.length < limit) break;
        } else {
          break;
        }
        from += limit;
      }`;
  content = content.replace(pattern, newBlock);
  fs.writeFileSync('src/app/audit/GraphModal.tsx', content);
  console.log("GraphModal.tsx updated with pagination.");
}
