const fs = require('fs');
let content = fs.readFileSync('src/app/energy/DeviceSummary.tsx', 'utf8');

// If already modified, we don't want to break it, but we haven't run it yet.
const insertPos = content.indexOf('const sortedLocations = Object.keys(stats).sort(');

const totalStatsLogic = `
  const totalStats = Object.values(stats).reduce((acc, curr) => {
    acc.total += curr.total;
    acc.online += curr.online;
    acc.offline += curr.offline;
    acc.inUse += curr.inUse;
    acc.standby += curr.standby;
    return acc;
  }, { total: 0, online: 0, offline: 0, inUse: 0, standby: 0 });

  stats["รวม"] = totalStats;

`;

content = content.substring(0, insertPos) + totalStatsLogic + content.substring(insertPos);

content = content.replace(
  `if (a === "ไม่ได้ระบุสถานที่") return 1;`,
  `if (a === "รวม") return -1;\n    if (b === "รวม") return 1;\n    if (a === "ไม่ได้ระบุสถานที่") return 1;`
);

fs.writeFileSync('src/app/energy/DeviceSummary.tsx', content, 'utf8');
