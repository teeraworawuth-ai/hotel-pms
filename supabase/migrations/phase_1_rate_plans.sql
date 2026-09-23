-- ==========================================
-- PHASE 1: Rate Plan & Daily Rates Schema
-- ==========================================

-- 1. ตาราง Master สำหรับชื่อและรายละเอียดของ Rate Plan
CREATE TABLE public.rate_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL, -- เช่น 'Standard Rate', 'Corporate Rate'
    description TEXT,
    base_price NUMERIC NOT NULL, -- ราคาพื้นฐาน (กรณีไม่มีการกำหนดราคาพิเศษในวันนั้น)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. ตารางปฏิทินเรทราคา (เก็บราคาพิเศษรายวันของแต่ละ Rate Plan)
CREATE TABLE public.rate_plan_calendar (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rate_plan_id UUID NOT NULL REFERENCES public.rate_plans(id) ON DELETE CASCADE,
    target_date DATE NOT NULL, -- วันที่บังคับใช้ราคา (เช่น 2026-10-01)
    price NUMERIC NOT NULL, -- ราคาพิเศษสำหรับวันนั้น
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(rate_plan_id, target_date) -- ป้องกันการใส่ราคาวันเดียวกันซ้ำใน Rate Plan เดิม
);

-- 3. ตาราง Snapshot ราคาติดการจอง (Booking Daily Rates)
-- ทำหน้าที่ Copy ราคาตอนกดจอง เพื่อป้องกันเรทราคาเดิมเปลี่ยนเมื่อมีการแก้ Rate Plan หลังบ้าน
CREATE TABLE public.booking_daily_rates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    target_date DATE NOT NULL, -- คืนที่เข้าพัก
    amount NUMERIC NOT NULL, -- ราคาที่ตกลงในคืนนั้น
    original_rate_plan_id UUID REFERENCES public.rate_plans(id) ON DELETE SET NULL, -- อ้างอิงว่ามาจาก Rate Plan ไหน
    is_manual_override BOOLEAN DEFAULT false, -- เปิดไว้เช็คว่าพนักงานพิมพ์แก้ราคาเองหรือไม่
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(booking_id, target_date) -- 1 การจอง จะมีราคา 1 รายการต่อ 1 วันเท่านั้น
);

-- เพิ่ม Row Level Security (RLS) เพื่อความปลอดภัย
ALTER TABLE public.rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_plan_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_daily_rates ENABLE ROW LEVEL SECURITY;

-- อนุญาตให้ทุกคนในระบบอ่านและเขียนได้ (ตั้งค่าชั่วคราวเพื่อให้เทสได้ง่าย)
CREATE POLICY "Enable read access for all users" ON public.rate_plans FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.rate_plans FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.rate_plans FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.rate_plans FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.rate_plan_calendar FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.rate_plan_calendar FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.rate_plan_calendar FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.rate_plan_calendar FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.booking_daily_rates FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.booking_daily_rates FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.booking_daily_rates FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.booking_daily_rates FOR DELETE USING (true);
