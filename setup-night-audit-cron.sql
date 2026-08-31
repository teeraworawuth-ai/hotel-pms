-- สร้าง Cron Job สำหรับ Night Audit ให้ทำงานทุกวันเวลาตี 2 (02:00 น. ตามเวลาไทย)
-- หมายเหตุ: เวลาใน Supabase ปกติจะเป็น UTC ดังนั้นตี 2 ไทย (UTC+7) = 19:00 UTC ของวันก่อนหน้า
SELECT cron.schedule(
  'night-audit-daily', -- ชื่อของ Cron Job
  '0 19 * * *', -- รันทุกวันเวลา 19:00 UTC (02:00 ไทย)
  $$
    SELECT net.http_post(
      url:='https://hotel-pms-run.vercel.app/api/cron/night-audit'
    );
  $$
);
