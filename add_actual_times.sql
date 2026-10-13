-- เวลาเช็คอิน/เช็คเอาท์จริง (ใช้ในรายงานผู้เข้าพักและรายงานความผิดปกติ)
-- รันใน Supabase SQL Editor ครั้งเดียว
alter table bookings add column if not exists actual_check_in_time timestamptz;
alter table bookings add column if not exists actual_check_out_time timestamptz;
