-- ==========================================================
-- ระบบแม่บ้าน: ประวัติการทำความสะอาด + ที่เก็บรูปภาพ
-- วิธีใช้: เปิด Supabase > SQL Editor > วางทั้งไฟล์นี้ > กด Run (รันซ้ำได้ ไม่เป็นไร)
-- ==========================================================

-- 1) ตารางประวัติ (เริ่ม/เสร็จ/ยกเลิก + หมายเหตุ + รูป)
create table if not exists public.housekeeping_logs (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null,
  room_no     text,
  location    text,
  staff_name  text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'cleaning',   -- cleaning | done | cancelled
  note        text,
  photo_urls  text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists housekeeping_logs_room_idx    on public.housekeeping_logs (room_id, started_at desc);
create index if not exists housekeeping_logs_started_idx on public.housekeeping_logs (started_at desc);

alter table public.housekeeping_logs enable row level security;
drop policy if exists "hk_logs_all" on public.housekeeping_logs;
create policy "hk_logs_all" on public.housekeeping_logs for all using (true) with check (true);

-- 2) ที่เก็บรูปภาพ (bucket สาธารณะ อ่านรูปได้ด้วยลิงก์)
insert into storage.buckets (id, name, public)
values ('housekeeping-photos', 'housekeeping-photos', true)
on conflict (id) do nothing;

drop policy if exists "hk_photos_read"   on storage.objects;
drop policy if exists "hk_photos_insert" on storage.objects;
create policy "hk_photos_read"   on storage.objects for select using (bucket_id = 'housekeeping-photos');
create policy "hk_photos_insert" on storage.objects for insert with check (bucket_id = 'housekeeping-photos');

-- 3) เผื่อตาราง staff มีข้อจำกัดชนิดสิทธิ์ ให้รองรับ housekeeper
alter table public.staff drop constraint if exists staff_role_check;
