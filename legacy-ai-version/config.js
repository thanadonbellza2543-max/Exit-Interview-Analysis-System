/**
 * ค่าเชื่อมต่อ Supabase (public — ปลอดภัยที่จะ commit ลง GitHub)
 *
 * Anon key ถูกออกแบบมาให้เปิดเผยได้ ความปลอดภัยจริงอยู่ที่ Row Level Security
 * ในฐานข้อมูล (ดู supabase/schema.sql) — ห้ามใส่ service_role key ที่นี่เด็ดขาด
 *
 * เติมค่าจาก Supabase Dashboard → Project Settings → API
 * ถ้าปล่อยว่างไว้ ผู้ใช้จะกรอกเองได้ผ่านปุ่ม "ตั้งค่าการเชื่อมต่อ" (เก็บใน localStorage)
 */
window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
};
