const fs = require('fs');
let content = fs.readFileSync('src/app/api/cron/tuya-sync/route.ts', 'utf8');

// Remove the first "  try {" (which is on line 6)
content = content.replace('export async function GET(request: Request) {\n  try {\n    // 1. Rate Limiting Check', 'export async function GET(request: Request) {\n    // 1. Rate Limiting Check');

fs.writeFileSync('src/app/api/cron/tuya-sync/route.ts', content);
console.log('Fixed double try block');
