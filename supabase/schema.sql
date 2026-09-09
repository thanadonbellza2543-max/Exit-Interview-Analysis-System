-- =====================================================================
--  ระบบวิเคราะห์ Exit Interview — โครงฐานข้อมูล Supabase
--
--  บทบาทของ Supabase ในระบบนี้คือ "ที่เก็บข้อมูลกลาง + ระบบล็อกอิน" เท่านั้น
--  การวิเคราะห์ยังทำในเบราว์เซอร์ของผู้ใช้ทั้งหมด จึงไม่มี Edge Function
--  ไม่ต้องใช้ API key ของ AI และไม่มีค่าใช้จ่ายต่อการวิเคราะห์
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) สิทธิ์ผู้ใช้ในทีม HR
--    admin  = ลบรายการของคนอื่นได้
--    member = ลบได้เฉพาะรายการที่ตัวเองสร้าง
--    ทุกคนที่ล็อกอินได้จะ "เห็นข้อมูลทั้งหมด" เพราะเป็นเครื่องมือของทีมเดียวกัน
-- ---------------------------------------------------------------------
create table if not exists public.app_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  full_name  text,
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;

drop policy if exists "read team members" on public.app_users;
create policy "read team members"
  on public.app_users for select
  to authenticated
  using (true);

-- security definer กัน RLS ของ app_users วนเรียกตัวเอง
create or replace function public.is_hr_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 2) ผลวิเคราะห์
-- ---------------------------------------------------------------------
create table if not exists public.exit_interviews (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  created_by     uuid not null references auth.users(id) on delete cascade,

  analyst        text,          -- ชื่อผู้วิเคราะห์ที่พิมพ์ไว้ในแอป
  source         text,          -- single | table | form

  employee_name  text,
  employee_code  text,
  department     text,
  position       text,
  tenure         text,
  last_day       date,
  interviewer    text,          -- ผู้สัมภาษณ์ (ดึงจากหัวฟอร์ม)
  interview_date text,

  summary        jsonb not null,   -- ผลวิเคราะห์ทั้งก้อน

  -- บทสัมภาษณ์ต้นฉบับ เก็บไว้เพื่อวิเคราะห์ซ้ำเมื่อมีการเพิ่มคำสำคัญใหม่
  -- ถ้านโยบายบริษัทไม่อนุญาตให้เก็บ ให้ลบคอลัมน์นี้ทิ้งได้ ระบบยังทำงานปกติ
  raw_text       text,

  -- ลายนิ้วมือกันบันทึกซ้ำ เวลาหลายคนอัปโหลดไฟล์ชุดเดียวกัน
  fingerprint    text not null
);

create unique index if not exists exit_interviews_fingerprint_key
  on public.exit_interviews (fingerprint);

create index if not exists exit_interviews_created_at_idx on public.exit_interviews (created_at desc);
create index if not exists exit_interviews_dept_idx       on public.exit_interviews (department);
create index if not exists exit_interviews_analyst_idx    on public.exit_interviews (analyst);
create index if not exists exit_interviews_summary_idx    on public.exit_interviews using gin (summary);

alter table public.exit_interviews enable row level security;

-- อ่าน: ทุกคนในทีมที่ล็อกอินแล้ว
drop policy if exists "team read all" on public.exit_interviews;
create policy "team read all"
  on public.exit_interviews for select
  to authenticated
  using (true);

-- เขียน: บันทึกในนามตัวเองเท่านั้น
drop policy if exists "insert as self" on public.exit_interviews;
create policy "insert as self"
  on public.exit_interviews for insert
  to authenticated
  with check (created_by = auth.uid());

-- ลบ: เจ้าของรายการ หรือ admin
drop policy if exists "delete own or admin" on public.exit_interviews;
create policy "delete own or admin"
  on public.exit_interviews for delete
  to authenticated
  using (created_by = auth.uid() or public.is_hr_admin());

-- ---------------------------------------------------------------------
-- 3) มุมมองสำหรับทำรายงาน — กาง jsonb ออกเป็นคอลัมน์
--    (สืบทอด RLS ของตารางต้นทางผ่าน security_invoker)
-- ---------------------------------------------------------------------
create or replace view public.exit_interview_report
with (security_invoker = true) as
select
  id, created_at, analyst,
  employee_name, employee_code, department, position, tenure, interviewer,
  summary ->> 'headline'                         as headline,
  summary ->> 'primary_reason'                   as primary_reason,
  summary -> 'sentiment' ->> 'overall'           as sentiment,
  (summary -> 'sentiment' ->> 'score')::numeric  as sentiment_score,
  summary ->> 'would_recommend'                  as would_recommend,
  summary ->> 'would_return'                     as would_return,
  (
    select array_agg(c ->> 'category' order by (c ->> 'severity')::int desc)
    from jsonb_array_elements(summary -> 'reason_categories') as c
  )                                              as categories,
  (
    select count(*)
    from jsonb_array_elements(coalesce(summary -> 'risk_flags', '[]'::jsonb)) as f
    where f ->> 'urgency' = 'high'
  )                                              as high_risk_count
from public.exit_interviews;

-- ---------------------------------------------------------------------
-- 4) หลังสร้างผู้ใช้ใน Dashboard (Authentication → Users → Add user)
--    รันคำสั่งนี้เพื่อกำหนดสิทธิ์ (เปลี่ยนอีเมลให้ตรง)
-- ---------------------------------------------------------------------
-- insert into public.app_users (user_id, role, full_name)
-- select id, 'admin', 'ชื่อผู้ดูแล' from auth.users where email = 'hr@example.com'
-- on conflict (user_id) do update set role = excluded.role, full_name = excluded.full_name;
