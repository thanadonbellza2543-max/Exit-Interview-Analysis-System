/* ============================================================================
   cloud.js — ชั้นเชื่อมต่อ Supabase (ล็อกอิน + ที่เก็บข้อมูลกลางของทีม)

   ถ้ายังไม่ได้ตั้งค่าใน config.js ไฟล์นี้จะรายงานว่า enabled = false
   แล้วแอปจะกลับไปใช้โหมดออฟไลน์เก็บลง localStorage เหมือนเดิมทุกอย่าง
   จึงยังดับเบิลคลิก index.html ใช้คนเดียวได้โดยไม่ต้องมี Supabase

   หมายเหตุ: การวิเคราะห์ทั้งหมดยังทำในเบราว์เซอร์ ไม่มีการส่งข้อความ
   บทสัมภาษณ์ไปประมวลผลที่ไหน Supabase ทำหน้าที่แค่เก็บผลกับตรวจสิทธิ์
   ========================================================================== */

(function (global) {
  "use strict";

  const cfg = global.APP_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(cfg.SUPABASE_ANON_KEY || "").trim();
  const libReady = typeof global.supabase !== "undefined" && global.supabase.createClient;

  const Cloud = {
    enabled: Boolean(url && key && libReady),
    configured: Boolean(url && key),
    libReady,
    client: null,
    user: null,
  };

  if (Cloud.enabled) {
    Cloud.client = global.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  /* ---------------------------------------------------------------- auth */

  Cloud.currentSession = async function () {
    if (!Cloud.enabled) return null;
    const { data } = await Cloud.client.auth.getSession();
    Cloud.user = data.session ? data.session.user : null;
    return data.session;
  };

  Cloud.onAuthChange = function (cb) {
    if (!Cloud.enabled) return;
    Cloud.client.auth.onAuthStateChange((_event, session) => {
      Cloud.user = session ? session.user : null;
      cb(session);
    });
  };

  Cloud.signIn = async function (email, password) {
    const { error } = await Cloud.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(
        error.message === "Invalid login credentials"
          ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
          : error.message
      );
    }
  };

  Cloud.signOut = async function () {
    await Cloud.client.auth.signOut();
  };

  /* --------------------------------------------------------------- แปลงรูป */

  /** แถวในฐานข้อมูล → รูปแบบที่หน้าเว็บใช้ */
  function toRecord(row) {
    return {
      id: row.id,
      at: row.created_at,
      mine: Cloud.user ? row.created_by === Cloud.user.id : false,
      meta: {
        analyst: row.analyst,
        employee_name: row.employee_name,
        employee_code: row.employee_code,
        department: row.department,
        position: row.position,
        tenure: row.tenure,
        last_day: row.last_day,
        interviewer: row.interviewer,
        interview_date: row.interview_date,
      },
      summary: row.summary,
    };
  }

  /** รูปแบบที่หน้าเว็บใช้ → แถวสำหรับเขียนลงฐานข้อมูล */
  function toRow(rec, userId) {
    const m = rec.meta || {};
    return {
      created_by: userId,
      created_at: rec.at || new Date().toISOString(),
      analyst: m.analyst || null,
      source: rec.source || null,
      employee_name: m.employee_name || null,
      employee_code: m.employee_code || null,
      department: m.department || null,
      position: m.position || null,
      tenure: m.tenure || null,
      last_day: m.last_day || null,
      interviewer: m.interviewer || null,
      interview_date: m.interview_date || null,
      summary: rec.summary,
      raw_text: rec.raw_text || null,
      fingerprint: rec.fingerprint,
    };
  }

  /* --------------------------------------------------------------- ข้อมูล */

  Cloud.list = async function (limit) {
    const { data, error } = await Cloud.client
      .from("exit_interviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit || 2000);
    if (error) throw new Error("โหลดข้อมูลไม่สำเร็จ: " + error.message);
    return (data || []).map(toRecord);
  };

  /**
   * บันทึกผลลงฐานข้อมูลกลาง
   * ใช้ upsert บน fingerprint + ignoreDuplicates เพื่อให้หลายคนอัปโหลด
   * ไฟล์ชุดเดียวกันแล้วไม่เกิดรายการซ้ำ
   */
  Cloud.add = async function (records) {
    if (!Cloud.user) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    const rows = records.filter((r) => r && r.summary && r.fingerprint)
      .map((r) => toRow(r, Cloud.user.id));
    if (!rows.length) return { added: 0, skipped: 0 };

    const { data, error } = await Cloud.client
      .from("exit_interviews")
      .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error("บันทึกไม่สำเร็จ: " + error.message);

    const added = (data || []).length;
    return { added, skipped: rows.length - added };
  };

  Cloud.remove = async function (id) {
    const { error } = await Cloud.client.from("exit_interviews").delete().eq("id", id);
    if (error) throw new Error("ลบไม่สำเร็จ: " + error.message);
  };

  /** ลบเฉพาะรายการที่ตัวเองสร้าง — RLS กันไม่ให้ลบของคนอื่นอยู่แล้ว */
  Cloud.clearMine = async function () {
    if (!Cloud.user) return 0;
    const { data, error } = await Cloud.client
      .from("exit_interviews").delete().eq("created_by", Cloud.user.id).select("id");
    if (error) throw new Error("ลบไม่สำเร็จ: " + error.message);
    return (data || []).length;
  };

  global.Cloud = Cloud;
})(window);
