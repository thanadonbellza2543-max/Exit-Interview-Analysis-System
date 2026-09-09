-- =====================================================================
--  Exit Interview AI — Database schema
--  รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) สิทธิ์ผู้ใช้ภายในแอป
--    role = 'admin'  → เห็นผลสรุปของทุกคนในทีม HR
--    role = 'member' → เห็นเฉพาะรายการที่ตัวเองสร้าง
-- ---------------------------------------------------------------------
create table if not exists public.app_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  full_name  text,
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;

-- ผู้ใช้อ่านแถวของตัวเองได้ (ไม่มี policy ให้เขียน — เพิ่ม/แก้ผ่าน Dashboard เท่านั้น)
drop policy if exists "read own app_user row" on public.app_users;
create policy "read own app_user row"
  on public.app_users for select
  to authenticated
  using (user_id = auth.uid());

-- ฟังก์ชันตรวจสิทธิ์ admin — security definer เพื่อไม่ให้ RLS ของ app_users วนซ้ำ
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
-- 2) ตารางผลสรุป Exit Interview
-- ---------------------------------------------------------------------
create table if not exists public.exit_interviews (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid not null references auth.users(id) on delete cascade,
  batch_id      uuid,                       -- จัดกลุ่มรายการที่มาจากไฟล์เดียวกัน

  employee_name text,
  employee_code text,
  department    text,
  position      text,
  tenure        text,
  last_day      date,

  raw_text      text  not null,             -- บทสัมภาษณ์ต้นฉบับ
  summary       jsonb not null,             -- ผลสรุปจาก AI

  model         text,
  input_tokens  integer,
  output_tokens integer
);

create index if not exists exit_interviews_created_at_idx on public.exit_interviews (created_at desc);
create index if not exists exit_interviews_created_by_idx on public.exit_interviews (created_by);
create index if not exists exit_interviews_batch_idx      on public.exit_interviews (batch_id);
create index if not exists exit_interviews_dept_idx       on public.exit_interviews (department);
create index if not exists exit_interviews_summary_idx    on public.exit_interviews using gin (summary);

alter table public.exit_interviews enable row level security;

-- อ่าน: เจ้าของแถว หรือผู้ที่มี role = 'admin'
drop policy if exists "read own or admin" on public.exit_interviews;
create policy "read own or admin"
  on public.exit_interviews for select
  to authenticated
  using (created_by = auth.uid() or public.is_hr_admin());

-- เขียน: ผ่าน Edge Function (service_role ข้าม RLS อยู่แล้ว)
-- policy นี้เผื่อกรณีต้องการให้ client เขียนตรง — บังคับว่า created_by ต้องเป็นตัวเอง
drop policy if exists "insert own" on public.exit_interviews;
create policy "insert own"
  on public.exit_interviews for insert
  to authenticated
  with check (created_by = auth.uid());

-- ลบ: เจ้าของแถว หรือ admin
drop policy if exists "delete own or admin" on public.exit_interviews;
create policy "delete own or admin"
  on public.exit_interviews for delete
  to authenticated
  using (created_by = auth.uid() or public.is_hr_admin());

-- ---------------------------------------------------------------------
-- 3) มุมมองสำหรับทำรายงาน — กาง jsonb ออกเป็นคอลัมน์
--    (view สืบทอด RLS ของตารางต้นทางผ่าน security_invoker)
-- ---------------------------------------------------------------------
create or replace view public.exit_interview_report
with (security_invoker = true) as
select
  id,
  created_at,
  employee_name,
  employee_code,
  department,
  position,
  tenure,
  last_day,
  summary ->> 'headline'                       as headline,
  summary ->> 'primary_reason'                 as primary_reason,
  summary -> 'sentiment' ->> 'overall'         as sentiment,
  (summary -> 'sentiment' ->> 'score')::numeric as sentiment_score,
  summary ->> 'preventable'                    as preventable,
  summary ->> 'would_recommend'                as would_recommend,
  summary ->> 'would_return'                   as would_return,
  (
    select array_agg(c ->> 'category')
    from jsonb_array_elements(summary -> 'reason_categories') as c
  )                                            as categories,
  jsonb_array_length(coalesce(summary -> 'risk_flags', '[]'::jsonb)) as risk_flag_count
from public.exit_interviews;

-- ---------------------------------------------------------------------
-- 4) หลังสร้าง user ใน Dashboard (Authentication → Users → Add user)
--    ให้รันคำสั่งนี้เพื่อกำหนดสิทธิ์
-- ---------------------------------------------------------------------
-- insert into public.app_users (user_id, role, full_name)
-- select id, 'admin', 'ชื่อผู้ดูแล' from auth.users where email = 'hr@example.com'
-- on conflict (user_id) do update set role = excluded.role;
