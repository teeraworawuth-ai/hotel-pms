const fs = require('fs');
let code = fs.readFileSync('src/app/api/cron/night-audit/route.ts', 'utf8');

code = code.replace(
  "export async function POST(req: Request) {",
  `export async function POST(req: Request) {
  const url = new URL(req.url);
  const simulatedDate = url.searchParams.get('simulated_date');
  const targetDate = simulatedDate ? new Date(simulatedDate) : new Date();`
);

code = code.replace(
  "const todayStr = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD",
  "const todayStr = targetDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD"
);

fs.writeFileSync('src/app/api/cron/night-audit/route.ts', code, 'utf8');