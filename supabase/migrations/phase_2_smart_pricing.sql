-- ==========================================
-- PHASE 2: Daily Pricing Settings & Yield Management
-- ==========================================

-- ตารางสำหรับผูก Rate Plan และเปิด/ปิด Smart Rules รายวัน
CREATE TABLE public.daily_pricing_settings (
    target_date DATE PRIMARY KEY,
    rate_plan_id UUID NOT NULL REFERENCES public.rate_plans(id) ON DELETE CASCADE,
    enable_time_discount BOOLEAN DEFAULT false,
    enable_occupancy_sale BOOLEAN DEFAULT false,
    enable_occupancy_surge BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- เปิด RLS
ALTER TABLE public.daily_pricing_settings ENABLE ROW LEVEL SECURITY;

-- อนุญาต Read/Write แบบชั่วคราว
CREATE POLICY "Enable all access" ON public.daily_pricing_settings FOR ALL USING (true);


-- ค่าเริ่มต้นสำหรับ Smart Pricing Rules (Yield Management)
INSERT INTO public.system_settings (key, value) VALUES (
  'yield_management_rules',
  '{"surge_threshold_percent": 20, "surge_adjustment_percent": 10, "sale_threshold_percent": 60, "sale_adjustment_percent": 10, "time_discount_start_time": "22:00", "time_discount_percent": 15}'::jsonb
) ON CONFLICT (key) DO NOTHING;
