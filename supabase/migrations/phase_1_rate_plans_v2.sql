-- ==========================================
-- PHASE 1 v2: Rate Plan with Room Types
-- ==========================================

-- ลบตารางเก่าทิ้งก่อน (ถ้าเคยรัน v1 ไปแล้ว)
DROP TABLE IF EXISTS public.booking_daily_rates CASCADE;
DROP TABLE IF EXISTS public.rate_plan_calendar CASCADE;
DROP TABLE IF EXISTS public.rate_plans CASCADE;
DROP TABLE IF EXISTS public.rate_plan_room_types CASCADE;

-- 1. ตาราง Master สำหรับชื่อและรายละเอียดของ Rate Plan
CREATE TABLE public.rate_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL, -- เช่น 'Standard Rate', 'Corporate Rate'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. ตาราง Base Price แยกตาม Room Type ของแต่ละ Rate Plan
CREATE TABLE public.rate_plan_room_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rate_plan_id UUID NOT NULL REFERENCES public.rate_plans(id) ON DELETE CASCADE,
    room_type VARCHAR(255) NOT NULL, -- ต้องตรงกับ room_type ในตาราง rooms
    base_price NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(rate_plan_id, room_type)
);

-- 3. ตารางปฏิทินเรทราคา (เก็บราคาพิเศษรายวัน แยกตาม Room Type)
CREATE TABLE public.rate_plan_calendar (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rate_plan_id UUID NOT NULL REFERENCES public.rate_plans(id) ON DELETE CASCADE,
    room_type VARCHAR(255) NOT NULL,
    target_date DATE NOT NULL, -- วันที่บังคับใช้ราคา (เช่น 2026-10-01)
    price NUMERIC NOT NULL, -- ราคาพิเศษสำหรับวันนั้น
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(rate_plan_id, room_type, target_date)
);

-- 4. ตาราง Snapshot ราคาติดการจอง (Booking Daily Rates)
CREATE TABLE public.booking_daily_rates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    target_date DATE NOT NULL, -- คืนที่เข้าพัก
    amount NUMERIC NOT NULL, -- ราคาที่ตกลงในคืนนั้น
    original_rate_plan_id UUID REFERENCES public.rate_plans(id) ON DELETE SET NULL,
    is_manual_override BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(booking_id, target_date)
);

-- เปิด RLS
ALTER TABLE public.rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_plan_room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_plan_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_daily_rates ENABLE ROW LEVEL SECURITY;

-- อนุญาต Read/Write แบบชั่วคราว
CREATE POLICY "Enable all access" ON public.rate_plans FOR ALL USING (true);
CREATE POLICY "Enable all access" ON public.rate_plan_room_types FOR ALL USING (true);
CREATE POLICY "Enable all access" ON public.rate_plan_calendar FOR ALL USING (true);
CREATE POLICY "Enable all access" ON public.booking_daily_rates FOR ALL USING (true);
