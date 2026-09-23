const fs = require('fs');
let c = fs.readFileSync('supabase/migrations/phase_2_smart_pricing.sql', 'utf8');
c += `

-- ค่าเริ่มต้นสำหรับ Smart Pricing Rules (Yield Management)
INSERT INTO public.system_settings (key, value) VALUES (
  'yield_management_rules',
  '{"surge_threshold_percent": 20, "surge_adjustment_percent": 10, "sale_threshold_percent": 60, "sale_adjustment_percent": 10, "time_discount_start_time": "22:00", "time_discount_percent": 15}'::jsonb
) ON CONFLICT (key) DO NOTHING;
`;
fs.writeFileSync('supabase/migrations/phase_2_smart_pricing.sql', c);
