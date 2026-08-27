const fs = require('fs');
let content = fs.readFileSync('src/app/audit/OfflineSensors.tsx', 'utf8');

if (!content.includes('.limit(')) {
  content = content.replace(
    /\.order\("recorded_at", \{ ascending: true \}\);/g,
    '.order("recorded_at", { ascending: true }).limit(100000);'
  );
  fs.writeFileSync('src/app/audit/OfflineSensors.tsx', content);
  console.log("OfflineSensors updated.");
} else {
  console.log("OfflineSensors already has limit.");
}
