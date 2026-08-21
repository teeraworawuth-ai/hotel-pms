const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const fetchFunc = `
  const fetchData = async (currentExpandedOffset: number) => {
    try {
      setLoading(true);

      const targetDate = new Date();
      const totalOffset = isFullScreen ? dateOffset + currentExpandedOffset : dateOffset;
      targetDate.setDate(targetDate.getDate() + totalOffset);

      const startOfRange = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
      
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      let endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);

      if (totalOffset === 0) {
        const now = new Date();
        if (now < endOfDay) {
          endOfDay = now;
        }
      }

      const { data: logData, error } = await supabase
        .from("energy_logs")
        .select("wattage, recorded_at")
        .eq("room_id", roomId)
        .gte("recorded_at", startOfRange.toISOString())
        .lte("recorded_at", endOfDay.toISOString())
        .order("recorded_at", { ascending: true });

      if (error) {
        console.error("Error fetching energy logs:", error);
        return;
      }

      let formattedData = (logData || []).map((log) => {
        const d = new Date(log.recorded_at);
        const wattVal = Number(log.wattage);
        return {
          time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
          fullTime: d.getTime(), 
          watt: (log.wattage !== null && wattVal > 0) ? wattVal : null,
        };
      });

      formattedData = formattedData.map((point, i, arr) => {
        if (point.watt === null) return point;
        let hasNeighbor = false;
        for (let j = i - 1; j >= 0; j--) {
          const neighbor = arr[j];
          if (point.fullTime - neighbor.fullTime > 360000) break;
          if (neighbor.watt !== null && neighbor.watt > 0) {
            hasNeighbor = true;
            break;
          }
        }
        if (!hasNeighbor) {
          for (let j = i + 1; j < arr.length; j++) {
            const neighbor = arr[j];
            if (neighbor.fullTime - point.fullTime > 360000) break;
            if (neighbor.watt !== null && neighbor.watt > 0) {
              hasNeighbor = true;
              break;
            }
          }
        }
        return hasNeighbor ? point : { ...point, watt: null };
      });

      setData(formattedData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
`;

const insertMarker = "const graphRef = useRef<HTMLDivElement>(null);";
const insertPos = content.indexOf(insertMarker) + insertMarker.length;
content = content.substring(0, insertPos) + '\n' + fetchFunc + '\n' + content.substring(insertPos);

// Wait, I should also make sure to remove any existing fetchData just in case.
// If it exists, I'll let the typescript compiler complain, but earlier it said it didn't exist.

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content, 'utf8');
