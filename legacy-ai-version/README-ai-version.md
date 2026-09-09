# Exit Interview AI

เว็บสรุปบทสัมภาษณ์พนักงานลาออก (Exit Interview) ด้วย AI — โยนข้อความหรือไฟล์ Excel ลงไป
ระบบจะสรุปออกมาเป็นรายงานที่มีโครงสร้าง พร้อมเหตุผลการลาออก หมวดปัจจัย ประเด็นที่ต้องเฝ้าระวัง
และข้อเสนอแนะเชิงปฏิบัติ

- **Frontend** — HTML/CSS/JS ล้วน ไม่มี build step โฮสต์ฟรีบน **GitHub Pages**
- **Backend** — **Supabase** (Auth + Postgres + Edge Function)
- **AI** — Claude (`claude-opus-5`) ผ่าน Anthropic Messages API เรียกจากฝั่งเซิร์ฟเวอร์เท่านั้น

```
เบราว์เซอร์ (GitHub Pages)
   │  ล็อกอินด้วย Supabase Auth ได้ JWT
   ├──────────────► Supabase Edge Function "summarize"  ──► Anthropic API (Claude)
   │                        │
   │                        └──► ตาราง exit_interviews (Postgres + RLS)
   └──────────────► อ่านประวัติจาก Postgres ตรง (ผ่าน RLS)
```

> **API key ของ Anthropic อยู่บน Supabase เท่านั้น** ไม่เคยถูกส่งมาที่เบราว์เซอร์
> ข้อมูล Exit Interview เป็นข้อมูลส่วนบุคคล ระบบจึงบังคับให้ล็อกอินก่อนใช้งานทุกกรณี

---

## ความสามารถ

| หน้า | ทำอะไรได้ |
|---|---|
| **สรุปรายคน** | วาง/พิมพ์ข้อความ หรือลากไฟล์ `.txt .md .csv .json` มาวาง แล้วกดสรุป |
| **สรุปทั้งไฟล์ (Batch)** | อัปโหลด `.xlsx .xls .csv` เลือกคอลัมน์ที่เป็นเนื้อหาสัมภาษณ์ แล้วสรุปทั้งไฟล์รวด พร้อมแดชบอร์ดภาพรวมและบทสรุปผู้บริหาร |
| **ประวัติ** | ดูผลสรุปย้อนหลังที่บันทึกไว้ ค้นหาได้ |

ส่งออกได้เป็น **CSV** (เปิดใน Excel ภาษาไทยได้เลย), **JSON** และสั่ง**พิมพ์**เป็นรายงานได้

ผลสรุปแต่ละคนประกอบด้วย: ประเด็นหลัก · สรุปย่อ · เหตุผลหลัก · หมวดปัจจัยพร้อมระดับความรุนแรง 1–5
· อารมณ์โดยรวม · องค์กรรั้งไว้ได้หรือไม่ · สิ่งที่พนักงานชื่นชม · คำพูดสำคัญ
· ประเด็นเฝ้าระวัง (ความปลอดภัย/กฎหมายแรงงาน/การคุกคาม) · ข้อเสนอแนะพร้อมผู้รับผิดชอบ

---

## ติดตั้ง

ใช้เวลาประมาณ 20 นาที ต้องมี: บัญชี GitHub, บัญชี [Supabase](https://supabase.com), API key จาก [console.anthropic.com](https://console.anthropic.com)

> **รันคำสั่งไหนที่ไหน** — จุดที่คนพลาดบ่อยที่สุด
>
> | บล็อกโค้ดที่ขึ้นต้นด้วย | รันที่ |
> |---|---|
> | `create table`, `insert into`, `select` | Supabase Dashboard → **SQL Editor** |
> | `git`, `supabase`, `winget`, `python` | **Terminal / PowerShell** บนเครื่องคุณ |
>
> SQL Editor รันได้เฉพาะ SQL — วางคำสั่ง `supabase ...` หรือ path ไฟล์ลงไปจะขึ้น `syntax error`
> และ SQL Editor อ่านไฟล์จากเครื่องคุณไม่ได้ ต้องเปิดไฟล์ copy เนื้อหามาวางเอง

### 1. สร้าง repo และอัปโค้ดขึ้น GitHub

```bash
cd toyota-exit-ai
git init
git add .
git commit -m "Exit Interview AI"
git branch -M main
git remote add origin https://github.com/<ORG>/<REPO>.git
git push -u origin main
```

### 2. สร้างฐานข้อมูลบน Supabase

1. สร้างโปรเจกต์ใหม่ที่ [supabase.com/dashboard](https://supabase.com/dashboard)
2. ไปที่ **SQL Editor → New query** วางเนื้อหาทั้งหมดจาก [`supabase/schema.sql`](supabase/schema.sql) แล้วกด **Run**

จะได้ตาราง `exit_interviews`, ตารางสิทธิ์ `app_users`, view สำหรับทำรายงาน และ Row Level Security ครบ

### 3. สร้างบัญชีผู้ใช้ HR

ระบบ**ไม่เปิดให้สมัครเอง** — ผู้ดูแลสร้างบัญชีให้เท่านั้น

1. **Authentication → Users → Add user** ใส่อีเมลกับรหัสผ่าน แล้วติ๊ก *Auto Confirm User*
2. ปิดการสมัครเองที่ **Authentication → Sign In / Providers → Email** แล้วปิด *Allow new users to sign up*
3. กำหนดสิทธิ์ใน **SQL Editor**:

```sql
insert into public.app_users (user_id, role, full_name)
select id, 'admin', 'ชื่อผู้ดูแล' from auth.users where email = 'hr@example.com'
on conflict (user_id) do update set role = excluded.role;
```

`admin` เห็นผลสรุปของทุกคนในทีม · `member` เห็นเฉพาะที่ตัวเองสร้าง

### 4. Deploy Edge Function

เลือกทางใดทางหนึ่ง

#### ทาง ก) ผ่าน Dashboard — ไม่ต้องติดตั้งอะไรเลย (แนะนำถ้าเพิ่งเริ่ม)

1. **Edge Functions → Secrets → Add new secret** เพิ่ม
   - `ANTHROPIC_API_KEY` = key จาก [console.anthropic.com](https://console.anthropic.com)
   - `ALLOWED_ORIGIN` = `https://<ORG>.github.io` (ใส่ทีหลังได้)
2. **Edge Functions → Deploy a new function → Via Editor**
3. ตั้งชื่อฟังก์ชันว่า **`summarize`** — ต้องสะกดแบบนี้เป๊ะ ๆ เพราะหน้าเว็บเรียกไปที่ `/functions/v1/summarize`
4. ลบโค้ดตัวอย่างทิ้ง แล้ววางเนื้อหาทั้งหมดจาก `supabase/functions/summarize/index.ts` → **Deploy**

คัดลอกโค้ดขึ้นคลิปบอร์ดเร็ว ๆ ด้วย PowerShell:

```powershell
Get-Content -Raw supabase\functions\summarize\index.ts | Set-Clipboard
```

#### ทาง ข) ผ่าน Supabase CLI

คำสั่งชุดนี้รันใน **Terminal / PowerShell** เท่านั้น — เอาไปวางใน SQL Editor ไม่ได้

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
supabase secrets set ALLOWED_ORIGIN=https://<ORG>.github.io
supabase functions deploy summarize
```

ยังไม่มี CLI บน Windows ติดตั้งด้วย `winget install --id Supabase.CLI`
`<PROJECT_REF>` หาได้จาก **Project Settings → General → Reference ID**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` Supabase ใส่ให้เองอัตโนมัติ ไม่ต้องตั้ง

> ตั้ง `ALLOWED_ORIGIN` เป็นโดเมนจริงเสมอเมื่อขึ้น production
> ถ้าไม่ตั้ง ค่าเริ่มต้นคือ `*` ซึ่งเปิดให้เว็บใดก็ได้เรียก (ยังต้องมี JWT ที่ถูกต้องอยู่ดี แต่ควรจำกัดไว้)

### 5. เปิด GitHub Pages

1. **Settings → Pages → Source** เลือก **GitHub Actions**
2. **Settings → Secrets and variables → Actions → Variables → New repository variable** เพิ่ม 2 ตัว:
   - `SUPABASE_URL` = `https://xxxxxxxx.supabase.co`
   - `SUPABASE_ANON_KEY` = anon key จาก **Project Settings → API**
3. push อีกครั้ง (หรือสั่ง **Run workflow** เอง) เว็บจะขึ้นที่ `https://<ORG>.github.io/<REPO>/`

> anon key เป็นค่า **public โดยการออกแบบ** ปลอดภัยที่จะฝังในหน้าเว็บ
> ความปลอดภัยจริงมาจาก RLS ในข้อ 2 — **ห้ามใส่ `service_role` key ในฝั่ง frontend เด็ดขาด**
>
> ถ้าไม่อยากตั้ง Variables ก็ข้ามได้ ผู้ใช้กรอกค่าเองผ่านปุ่ม **ตั้งค่าการเชื่อมต่อ** ในหน้าล็อกอิน (เก็บใน localStorage)

### 6. ทดลองใช้

เปิดเว็บ → ล็อกอิน → แท็บ **สรุปรายคน** → กด **ใส่ตัวอย่าง** → **สรุปด้วย AI**
สำหรับโหมด Batch ลองอัปโหลด [`sample-data.csv`](sample-data.csv) ที่แถมมาในโปรเจกต์

---

## รันในเครื่อง

```bash
python -m http.server 5173
```

แล้วเปิด `http://localhost:5173` — กรอก Supabase URL/anon key ผ่านปุ่มตั้งค่า
(ต้องเปิดผ่าน http:// ไม่ใช่ file:// เพราะใช้ ES modules)

ระหว่างพัฒนา ให้เพิ่ม `ALLOWED_ORIGIN=http://localhost:5173` หรือใช้ `supabase functions serve summarize` ทดสอบฟังก์ชันในเครื่อง

---

## โครงสร้างไฟล์

```
index.html                          หน้าเว็บทั้งหมด
assets/style.css                    ธีม (รองรับโหมดมืดอัตโนมัติ) + สไตล์สำหรับพิมพ์
assets/app.js                       ตรรกะฝั่ง client: auth, อัปโหลด, เรียก API, แสดงผล, ส่งออก
assets/config.js                    ค่า Supabase URL/anon key (workflow เขียนทับตอน deploy)
supabase/schema.sql                 ตาราง + RLS + view รายงาน
supabase/config.toml                ค่าตั้งต้นสำหรับ Supabase CLI
supabase/functions/summarize/       Edge Function ที่เรียก Claude
.github/workflows/deploy.yml        deploy ขึ้น GitHub Pages อัตโนมัติเมื่อ push
sample-data.csv                     ไฟล์ตัวอย่างสำหรับทดสอบโหมด Batch
```

---

## ปรับแต่ง

**เปลี่ยนหมวดปัจจัย / คำถามที่ AI ต้องตอบ**
แก้ `SINGLE_SCHEMA` และ `SYSTEM_SINGLE` ใน [`supabase/functions/summarize/index.ts`](supabase/functions/summarize/index.ts)
แล้วแก้พจนานุกรม `CATS`, `RISK_TYPES`, `OWNERS` ที่หัวไฟล์ [`assets/app.js`](assets/app.js) ให้ตรงกัน แล้ว deploy ฟังก์ชันใหม่

**ปรับต้นทุน/ความเร็ว**
เพิ่ม `output_config: { effort: "medium", format: {...} }` ในการเรียก `messages.create`
`effort` ต่ำลง = ถูกลงและเร็วขึ้น แลกกับความละเอียดของการวิเคราะห์ (ค่าเริ่มต้นคือ `high`)
ถ้าต้องสรุปทีละหลายร้อยคนแบบไม่เร่งด่วน พิจารณาใช้ [Message Batches API](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing) ซึ่งลดค่าใช้จ่าย 50%

**ปรับจำนวนงานพร้อมกันในโหมด Batch**
แก้เลข `3` ใน `pool(jobs, 3, ...)` ที่ `assets/app.js` — สูงเกินไปอาจโดน rate limit ของ Anthropic

**ปักหมุดเวอร์ชัน SDK**
ฟังก์ชันใช้ `npm:@anthropic-ai/sdk` แบบไม่ระบุเวอร์ชัน (ดึงตัวล่าสุด) ถ้าต้องการความนิ่งใน production
เปลี่ยนเป็น `npm:@anthropic-ai/sdk@<เวอร์ชัน>` แล้ว deploy ใหม่

---

## ข้อควรระวังเรื่องข้อมูลส่วนบุคคล

- บทสัมภาษณ์ต้นฉบับถูกเก็บในคอลัมน์ `raw_text` — ถ้านโยบายบริษัทไม่อนุญาต ให้ลบฟิลด์นี้ออกจาก `insert` ในฟังก์ชัน
- ข้อความถูกส่งไปประมวลผลที่ Anthropic API ควรตรวจสอบกับฝ่ายกฎหมาย/DPO ก่อนใช้กับข้อมูลจริง
- ผลสรุปจาก AI เป็น**ข้อมูลประกอบการพิจารณา** ไม่ควรใช้ตัดสินใจเรื่องบุคคลโดยไม่มีมนุษย์ตรวจทาน
- ฟิลด์ `risk_flags` ที่เกี่ยวกับการคุกคามหรือความปลอดภัย ต้องให้ HR ตรวจสอบข้อเท็จจริงเสมอ ไม่ใช่เชื่อ AI ทันที
