const fs = require('fs');

function applyPagination(filename) {
  let content = fs.readFileSync(filename, 'utf8');

  // Match the block starting with `await supabase.from("energy_logs")` or similar
  const pattern = /const\s+\{\s*data\s*:\s*(\w+)\s*\}\s*=\s*await\s+supabase\s*\.\s*from\(\s*"energy_logs"\s*\)[\s\S]*?\.order\(\s*"recorded_at"\s*,\s*\{\s*ascending\s*:\s*true\s*\}\s*\)\s*(?:;\s*\/\/[^\n]*\n|;)/;
  
  const match = content.match(pattern);
  if (match) {
    const dataVar = match[1]; // energyData
    const newBlock = `let ${dataVar} = [];
    let from = 0;
    const limit = 1000;
    while (true) {
      const { data } = await supabase
        .from("energy_logs")
        .select("room_id, wattage, recorded_at")
        .gte("recorded_at", startOfDay.toISOString())
        .lte("recorded_at", endOfDay.toISOString())
        .order("recorded_at", { ascending: true })
        .range(from, from + limit - 1);
        
      if (data) {
        ${dataVar} = ${dataVar}.concat(data);
        if (data.length < limit) break;
      } else {
        break;
      }
      from += limit;
    }`;
    content = content.replace(pattern, newBlock);
    fs.writeFileSync(filename, content);
    console.log(filename + " updated with pagination.");
  } else {
    console.log("Pattern not found in " + filename);
  }
}

applyPagination('src/app/audit/AnomalyReport.tsx');
applyPagination('src/app/audit/GuestReport.tsx');
