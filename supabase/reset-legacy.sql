-- =====================================================================
--  ล้างของเก่าจากเวอร์ชันแรก (ที่ใช้ Claude API สรุป) ก่อนติดตั้งเวอร์ชันปัจจุบัน
--
--  รันไฟล์นี้เฉพาะเมื่อ schema.sql ขึ้น error ทำนองว่า
--      column "fingerprint" does not exist
--      cannot change name of view column
--  ซึ่งแปลว่าเคยรันสคีมาของ legacy-ai-version ไว้ในโปรเจกต์นี้แล้ว
--
--  ⚠️ คำสั่งนี้ลบตาราง exit_interviews ทิ้งทั้งตาราง
--     ตรวจก่อนเสมอว่าไม่มีข้อมูลที่ต้องเก็บ:
--         select count(*) from public.exit_interviews;
--     ถ้าได้ 0 แปลว่าว่าง ลบได้เลย
--
--  หลังรันไฟล์นี้เสร็จ ให้กลับไปรัน schema.sql อีกครั้ง
-- =====================================================================

-- view ต้องไปก่อน เพราะอ้างถึงตาราง และ create or replace view
-- เปลี่ยนรายชื่อคอลัมน์ไม่ได้ ต้อง drop ทิ้งอย่างเดียว
drop view if exists public.exit_interview_report;

drop table if exists public.exit_interviews;

-- policy เก่าของ app_users จำกัดให้เห็นเฉพาะแถวตัวเอง
-- เวอร์ชันปัจจุบันให้ทั้งทีมเห็นกันได้ จึงต้องเอาอันเก่าออก
drop policy if exists "read own app_user row" on public.app_users;

-- ตาราง app_users โครงเหมือนเดิมทุกอย่าง จึงไม่ต้องลบ
-- บัญชีผู้ใช้ใน Authentication ก็ไม่ถูกแตะต้อง
