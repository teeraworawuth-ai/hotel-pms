const fs = require('fs');

// 1. Fix EnergyGraph.tsx
let egContent = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const oldFetchBlock = `const { data: logData, error } = await supabase
          .from("energy_logs")
          .select("wattage, recorded_at")
          .eq("room_id", roomId)
          .gte("recorded_at", startOfRange.toISOString())
          .lte("recorded_at", endOfDay.toISOString())
          .order("recorded_at", { ascending: true })
          .limit(50000);
  
        if (error) {
          console.error("Error fetching energy logs:", error);
          return;
        }`;

const newFetchBlock = `let allLogs = [];
        let from = 0;
        const limit = 1000;
        let fetchError = null;
        
        while (true) {
          const { data: logData, error } = await supabase
            .from("energy_logs")
            .select("wattage, recorded_at")
            .eq("room_id", roomId)
            .gte("recorded_at", startOfRange.toISOString())
            .lte("recorded_at", endOfDay.toISOString())
            .order("recorded_at", { ascending: true })
            .range(from, from + limit - 1);
            
          if (error) {
            fetchError = error;
            break;
          }
          if (logData) {
            allLogs = allLogs.concat(logData);
            if (logData.length < limit) break;
          } else {
            break;
          }
          from += limit;
        }
  
        if (fetchError) {
          console.error("Error fetching energy logs:", fetchError);
          return;
        }
        const logData = allLogs;`;

egContent = egContent.replace(oldFetchBlock, newFetchBlock);
fs.writeFileSync('src/app/components/EnergyGraph.tsx', egContent);
console.log("EnergyGraph.tsx updated with pagination.");

// 2. Fix OfflineSensors.tsx
let osContent = fs.readFileSync('src/app/audit/OfflineSensors.tsx', 'utf8');

const oldOsFetchBlock = `const { data: logs } = await supabase
        .from("energy_logs")
        .select("room_id, recorded_at")
        .gte("recorded_at", startOfDay.toISOString())
        .lte("recorded_at", endOfDay.toISOString())
        .order("recorded_at", { ascending: true })
        .limit(100000);`;

const newOsFetchBlock = `let logs = [];
      let from = 0;
      const limit = 1000;
      while (true) {
        const { data } = await supabase
          .from("energy_logs")
          .select("room_id, recorded_at")
          .gte("recorded_at", startOfDay.toISOString())
          .lte("recorded_at", endOfDay.toISOString())
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

osContent = osContent.replace(oldOsFetchBlock, newOsFetchBlock);
// Also need to handle case where it was .limit(50000) instead of 100000 if my previous replacement varied
osContent = osContent.replace(/const { data: logs } = await supabase[\s\S]*?\.limit\(\d+\);/, newOsFetchBlock);

fs.writeFileSync('src/app/audit/OfflineSensors.tsx', osContent);
console.log("OfflineSensors.tsx updated with pagination.");
