const fs = require('fs');
let code = fs.readFileSync('src/app/api/cron/night-audit/route.ts', 'utf8');

// Change staff_name based on simulatedDate
code = code.replace(
  "staff_name: 'SYSTEM (Night Audit)',",
  "staff_name: simulatedDate ? 'SYSTEM (Simulated)' : 'SYSTEM (Night Audit)',"
);

fs.writeFileSync('src/app/api/cron/night-audit/route.ts', code, 'utf8');