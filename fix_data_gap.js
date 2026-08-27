const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const oldLogic = `      let formattedData = (logData || []).map((log) => {
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
        if (!hasNeighbor) return { ...point, watt: null };
        return point;
      });`;

const newLogic = `      let rawData = (logData || []).map((log) => {
        const d = new Date(log.recorded_at);
        const wattVal = Number(log.wattage);
        return {
          time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
          fullTime: d.getTime(), 
          watt: (log.wattage !== null && wattVal > 0) ? wattVal : null,
        };
      });

      // Inject null points to break the line when gap > 15 minutes
      let formattedData = [];
      for (let i = 0; i < rawData.length; i++) {
        formattedData.push(rawData[i]);
        if (i < rawData.length - 1) {
          const curr = rawData[i];
          const next = rawData[i + 1];
          // If gap is more than 15 minutes, insert a null point in the middle to break the chart line
          if (next.fullTime - curr.fullTime > 15 * 60 * 1000) {
            formattedData.push({
              time: "",
              fullTime: curr.fullTime + 1000, // 1 second after current
              watt: null
            });
            formattedData.push({
              time: "",
              fullTime: next.fullTime - 1000, // 1 second before next
              watt: null
            });
          }
        }
      }`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Fixed data processing to inject nulls');
