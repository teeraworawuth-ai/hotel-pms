const fs = require('fs');

// Checkin
let checkin = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');
if (!checkin.includes('RoomIcons')) {
  checkin = checkin.replace('import { supabase } from "@/lib/supabase";', 'import { supabase } from "@/lib/supabase";\nimport { renderIcon } from "../components/RoomIcons";');
  fs.writeFileSync('src/app/checkin/page.tsx', checkin, 'utf8');
}

// Settings
let settings = fs.readFileSync('src/app/settings/page.tsx', 'utf8');
if (!settings.includes('RoomIcons')) {
  settings = settings.replace('import { supabase } from "@/lib/supabase";', 'import { supabase } from "@/lib/supabase";\nimport { AVAILABLE_ICONS, renderIcon } from "../components/RoomIcons";');
  fs.writeFileSync('src/app/settings/page.tsx', settings, 'utf8');
}

console.log('Fixed imports');
