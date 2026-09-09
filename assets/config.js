/**
 * ค่าเชื่อมต่อ Supabase
 *
 * ปล่อยว่างไว้ = โหมดออฟไลน์ (เก็บประวัติในเบราว์เซอร์ของแต่ละคน ไม่ต้องล็อกอิน)
 * ใส่ค่า       = โหมดใช้งานร่วมกันทั้งทีม (ต้องล็อกอิน ข้อมูลอยู่ในฐานข้อมูลกลาง)
 *
 * ค่าทั้งสองตัวหาได้จาก Supabase Dashboard → Project Settings → API
 *
 * anon key เป็นค่า public โดยการออกแบบ ปลอดภัยที่จะ commit ลง GitHub
 * ความปลอดภัยจริงอยู่ที่ Row Level Security ใน supabase/schema.sql
 * ⚠️ ห้ามใส่ service_role key ที่นี่เด็ดขาด — คีย์นั้นข้าม RLS ได้ทั้งหมด
 *
 * ถ้า deploy ผ่าน GitHub Actions ไม่ต้องแก้ไฟล์นี้
 * ให้ไปตั้งค่าที่ Settings → Secrets and variables → Actions → Variables แทน
 */
window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
};
