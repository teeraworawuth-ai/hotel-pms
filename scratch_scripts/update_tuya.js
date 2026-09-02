const fs = require('fs');
let content = fs.readFileSync('src/app/components/TuyaApiSettings.tsx', 'utf8');

// Insert import
content = content.replace(
  "import { supabase } from '@/lib/supabase';",
  "import { supabase } from '@/lib/supabase';\nimport TuyaQuotaWidget from './TuyaQuotaWidget';"
);

// Insert component
content = content.replace(
  '<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">',
  '<TuyaQuotaWidget />\n    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">'
);

fs.writeFileSync('src/app/components/TuyaApiSettings.tsx', content);
console.log("Updated TuyaApiSettings.tsx");
