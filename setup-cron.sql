-- 1. เปิดใช้งานส่วนขยายที่จำเป็นสำหรับการตั้งเวลา (Cron) และการเรียก API (Net)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. ตั้งค่าให้เรียก API ของ Vercel ทุกๆ 5 นาที
SELECT cron.schedule(
  'tuya-sync-every-5-minutes', -- ชื่อของ Cron Job
  '*/5 * * * *', -- รันทุกๆ 5 นาที
  
    -- โปรดเปลี่ยน URL ด้านล่างนี้ให้เป็น URL ของเว็บคุณ (เช่น https://hotel-pms-xxx.vercel.app/api/cron/tuya-sync)
    SELECT net.http_get(
      url:='https://[YOUR_VERCEL_APP_URL]/api/cron/tuya-sync'
    );
  
);
