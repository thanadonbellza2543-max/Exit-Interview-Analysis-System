/**
 * Supabase Edge Function: summarize
 * ---------------------------------
 * สรุปบทสัมภาษณ์พนักงานลาออก (Exit Interview) ด้วย Claude แล้วคืนค่าเป็น JSON ที่มีโครงสร้างแน่นอน
 *
 * โหมดการทำงาน
 *   mode: "single"    — สรุปบทสัมภาษณ์ 1 คน (และบันทึกลงตาราง exit_interviews ถ้า save = true)
 *   mode: "aggregate" — สรุปภาพรวมผู้บริหารจากผลสรุปหลายคน
 *
 * Environment variables ที่ต้องตั้ง (supabase secrets set ...)
 *   ANTHROPIC_API_KEY              — API key จาก console.anthropic.com
 *   SUPABASE_URL                   — Supabase ใส่ให้อัตโนมัติ
 *   SUPABASE_ANON_KEY              — Supabase ใส่ให้อัตโนมัติ
 *   SUPABASE_SERVICE_ROLE_KEY      — Supabase ใส่ให้อัตโนมัติ
 *   ALLOWED_ORIGIN (ไม่บังคับ)     — โดเมน GitHub Pages เช่น https://myorg.github.io
 */

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";
const MAX_INPUT_CHARS = 300_000;

/* ------------------------------------------------------------------ CORS */

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/* ------------------------------------------------------- โครงสร้าง JSON */

const CATEGORY_ENUM = [
  "compensation", "career_growth", "management", "culture", "workload",
  "work_life_balance", "safety_environment", "training", "commute",
  "policy", "new_job_offer", "education", "personal", "other",
];

const RISK_ENUM = [
  "harassment", "discrimination", "safety", "wage",
  "compliance", "legal", "burnout", "knowledge_loss", "other",
];

const OWNER_ENUM = ["hr", "line_manager", "management", "safety", "training", "other"];
const PRIORITY_ENUM = ["high", "medium", "low"];
const YESNO_ENUM = ["yes", "no", "unclear"];

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const SINGLE_SCHEMA = obj({
  headline: { type: "string", description: "ประเด็นหลักในหนึ่งประโยคสั้น ๆ ภาษาไทย ไม่เกิน 90 ตัวอักษร" },
  summary: { type: "string", description: "สรุปเนื้อหาบทสัมภาษณ์ 4-7 ประโยค ภาษาไทย เขียนเป็นย่อหน้าเดียว อ่านแล้วเข้าใจเรื่องทั้งหมดโดยไม่ต้องอ่านต้นฉบับ" },
  primary_reason: { type: "string", description: "เหตุผลหลักที่ทำให้ตัดสินใจลาออก 1-2 ประโยค ภาษาไทย" },
  reason_categories: {
    type: "array",
    description: "หมวดปัจจัยที่พบจริงในบทสัมภาษณ์ เรียงจากรุนแรงมากไปน้อย ไม่เกิน 6 รายการ ห้ามใส่หมวดที่ไม่มีหลักฐานในข้อความ",
    items: obj({
      category: { type: "string", enum: CATEGORY_ENUM },
      severity: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1 = พูดถึงผ่าน ๆ, 5 = เป็นเหตุผลหลักที่ทำให้ลาออก" },
      evidence: { type: "string", description: "ข้อความอ้างอิงจากบทสัมภาษณ์ที่สนับสนุนหมวดนี้ ยกมาตามต้นฉบับ" },
    }),
  },
  sentiment: obj({
    overall: { type: "string", enum: ["positive", "neutral", "mixed", "negative"] },
    score: { type: "number", description: "-1.0 (ลบมาก) ถึง 1.0 (บวกมาก)" },
  }),
  would_recommend: { type: "string", enum: YESNO_ENUM, description: "พนักงานยังจะแนะนำองค์กรให้คนอื่นหรือไม่" },
  would_return: { type: "string", enum: YESNO_ENUM, description: "พนักงานเปิดโอกาสจะกลับมาทำงานอีกหรือไม่" },
  preventable: { type: "string", enum: YESNO_ENUM, description: "องค์กรน่าจะรั้งพนักงานคนนี้ไว้ได้หรือไม่ ถ้าแก้ปัญหาที่พูดถึงทัน" },
  positives: { type: "array", items: { type: "string" }, description: "สิ่งที่พนักงานพูดถึงในแง่ดี ภาษาไทย ไม่เกิน 5 ข้อ (ถ้าไม่มีให้ส่ง [])" },
  key_quotes: { type: "array", items: { type: "string" }, description: "คำพูดต้นฉบับที่สำคัญที่สุด 2-4 ประโยค ยกมาตามคำพูดจริง ห้ามแต่งเติม (ถ้าไม่มีให้ส่ง [])" },
  risk_flags: {
    type: "array",
    description: "ประเด็นที่ HR ต้องตรวจสอบเพิ่ม เช่น การคุกคาม ความปลอดภัย หรือประเด็นกฎหมายแรงงาน ถ้าไม่มีให้ส่ง []",
    items: obj({
      type: { type: "string", enum: RISK_ENUM },
      detail: { type: "string", description: "อธิบายสั้น ๆ ภาษาไทย ว่าพบอะไรและอยู่ตรงไหนของบทสัมภาษณ์" },
      urgency: { type: "string", enum: PRIORITY_ENUM },
    }),
  },
  action_items: {
    type: "array",
    description: "ข้อเสนอแนะที่ลงมือทำได้จริง อ้างอิงจากเนื้อหาเท่านั้น 2-5 ข้อ",
    items: obj({
      owner: { type: "string", enum: OWNER_ENUM },
      action: { type: "string", description: "สิ่งที่ควรทำ เขียนเป็นประโยคคำสั่งภาษาไทย ระบุให้ชัดว่าทำอะไร" },
      priority: { type: "string", enum: PRIORITY_ENUM },
    }),
  },
  data_quality: obj({
    completeness: { type: "string", enum: ["high", "medium", "low"] },
    note: { type: "string", description: "ถ้าข้อมูลสั้น กำกวม หรือขาดบางประเด็นสำคัญ ให้บอกตรงนี้ ถ้าครบถ้วนดีให้ส่งสตริงว่าง" },
  }),
});

const AGGREGATE_SCHEMA = obj({
  overview: { type: "string", description: "บทสรุปผู้บริหาร 5-8 ประโยค ภาษาไทย ระบุแนวโน้มการลาออกที่เห็นจากข้อมูลชุดนี้" },
  themes: {
    type: "array",
    description: "ประเด็นร่วมที่พบซ้ำข้ามหลายคน เรียงจากสำคัญมากไปน้อย ไม่เกิน 6 รายการ",
    items: obj({
      theme: { type: "string", description: "ชื่อประเด็นสั้น ๆ ภาษาไทย" },
      detail: { type: "string", description: "อธิบายประเด็นและผลกระทบ 1-3 ประโยค" },
      affected: { type: "integer", description: "จำนวนพนักงานในชุดข้อมูลนี้ที่พูดถึงประเด็นดังกล่าว" },
    }),
  },
  recommendations: {
    type: "array",
    description: "ข้อเสนอแนะระดับองค์กร 3-6 ข้อ",
    items: obj({
      owner: { type: "string", enum: OWNER_ENUM },
      action: { type: "string" },
      priority: { type: "string", enum: PRIORITY_ENUM },
    }),
  },
  watch_list: {
    type: "array",
    items: { type: "string" },
    description: "หน่วยงาน ตำแหน่ง หรือกลุ่มที่ควรจับตาเป็นพิเศษ พร้อมเหตุผลสั้น ๆ (ถ้าไม่มีให้ส่ง [])",
  },
});

/* ------------------------------------------------------------- Prompts */

const SYSTEM_SINGLE = `คุณคือนักวิเคราะห์ทรัพยากรบุคคลอาวุโสของบริษัทผู้ผลิตยานยนต์ในประเทศไทย
หน้าที่ของคุณคืออ่านบันทึกการสัมภาษณ์พนักงานที่ลาออก (Exit Interview) แล้วสรุปให้ทีม HR และผู้บริหารสายการผลิตนำไปใช้ตัดสินใจได้ทันที

บริบทที่ต้องเข้าใจ
- ผู้ให้สัมภาษณ์อาจเป็นพนักงานฝ่ายผลิต (Operator, Team Leader, Group Leader), ช่างเทคนิค, วิศวกร หรือพนักงานสำนักงาน
- ศัพท์ที่พบบ่อย: ไลน์ผลิต, กะ, OT, Shop, Section, TPS, Kaizen, Andon, Takt time, Standard work, QC, ชิ้นส่วน, Supplier
- ข้อความอาจสะกดผิด ใช้ภาษาพูด ปนภาษาอังกฤษ หรือเป็นบันทึกย่อของผู้สัมภาษณ์ ไม่ใช่คำพูดเต็ม

หลักการวิเคราะห์ที่ต้องยึด
1. อ้างอิงจากข้อความที่ได้รับเท่านั้น ห้ามเดา ห้ามเติมเรื่องที่ไม่ได้พูดถึง ถ้าไม่มีข้อมูลให้ตอบ "unclear" หรือส่งอาร์เรย์ว่าง
2. แยกให้ออกระหว่างเหตุผลที่พนักงาน "พูดออกมา" กับสาเหตุที่แท้จริงซึ่งอ่านได้จากบริบท เช่น พูดว่าลาออกเพราะเงิน แต่เนื้อหาชี้ว่าเป็นเรื่องความก้าวหน้าและหัวหน้างาน ให้ระบุทั้งสองส่วนใน summary
3. severity สะท้อนน้ำหนักในการตัดสินใจลาออก ไม่ใช่จำนวนครั้งที่พูดถึง
4. evidence และ key_quotes ต้องยกข้อความจากต้นฉบับ ห้ามเรียบเรียงใหม่จนเปลี่ยนความหมาย
5. risk_flags ใส่เฉพาะเมื่อมีสัญญาณจริงในข้อความ เช่น การคุกคาม การเลือกปฏิบัติ อุบัติเหตุหรือความไม่ปลอดภัย ปัญหาค่าจ้าง/OT ที่อาจขัดกฎหมายแรงงาน หรือภาวะหมดไฟ — การบ่นทั่วไปไม่ใช่ risk flag
6. action_items ต้องเจาะจงและทำได้จริง เชื่อมโยงกับปัญหาที่พบ เช่น "ทบทวน layout จุดวางชิ้นส่วนที่ station 4 ตามที่พนักงานเสนอเมื่อปีที่แล้ว" ไม่ใช่ "ปรับปรุงสภาพแวดล้อมการทำงาน"
7. เขียนทุกฟิลด์ที่เป็นข้อความเป็นภาษาไทยแบบทางการที่อ่านง่าย ยกเว้นคำพูดต้นฉบับและศัพท์เทคนิคที่ใช้ภาษาอังกฤษอยู่แล้ว
8. เป็นกลาง ไม่เข้าข้างองค์กรหรือพนักงาน รายงานสิ่งที่ข้อมูลบอก แม้จะเป็นข้อวิจารณ์องค์กรก็ตาม`;

const SYSTEM_AGGREGATE = `คุณคือนักวิเคราะห์ทรัพยากรบุคคลอาวุโสของบริษัทผู้ผลิตยานยนต์ในประเทศไทย
คุณจะได้รับผลสรุป Exit Interview ของพนักงานหลายคนในรูปแบบ JSON แล้วต้องเรียบเรียงเป็นบทสรุปสำหรับผู้บริหาร

หลักการ
1. มองหารูปแบบร่วมข้ามหลายคน ไม่ใช่เล่าซ้ำทีละคน — ประเด็นที่พบซ้ำในหลายคนสำคัญกว่าประเด็นที่พบคนเดียว
2. ระบุตัวเลขให้ชัดเมื่อทำได้ เช่น "7 จาก 12 คนพูดถึงเรื่องเส้นทางอาชีพ"
3. ถ้าเห็นการกระจุกตัวในหน่วยงาน ตำแหน่ง หรือช่วงอายุงานใดเป็นพิเศษ ต้องชี้ให้เห็น
4. แยกปัญหาเชิงระบบที่องค์กรแก้ได้ ออกจากเหตุผลส่วนตัวที่ควบคุมไม่ได้
5. อ้างอิงจากข้อมูลที่ได้รับเท่านั้น ห้ามสรุปเกินตัวอย่างที่มี และถ้ากลุ่มตัวอย่างเล็กให้ระบุข้อจำกัดนั้นไว้ใน overview
6. เขียนเป็นภาษาไทยแบบทางการ กระชับ ตรงประเด็น`;

/* ------------------------------------------------------------- Handler */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "รองรับเฉพาะ POST" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บน Supabase" }, 500);

  /* --- ตรวจสอบสิทธิ์: ต้องเป็นผู้ใช้ที่ล็อกอินแล้วเท่านั้น --- */
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) {
    return json({ error: "ไม่ได้รับอนุญาต กรุณาเข้าสู่ระบบใหม่" }, 401);
  }
  const user = userData.user;

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, 400); }

  const client = new Anthropic({ apiKey });

  try {
    /* ================= AGGREGATE ================= */
    if (body.mode === "aggregate") {
      const summaries = body.summaries;
      if (!Array.isArray(summaries) || summaries.length === 0) {
        return json({ error: "ไม่พบข้อมูลผลสรุปสำหรับทำภาพรวม" }, 400);
      }

      const payload = JSON.stringify(summaries);
      if (payload.length > MAX_INPUT_CHARS) {
        return json({
          error: `ข้อมูลรวมยาว ${payload.length.toLocaleString()} ตัวอักษร เกินขีดจำกัด ${MAX_INPUT_CHARS.toLocaleString()} ตัวอักษรต่อครั้ง กรุณาแบ่งเป็นหลายชุด (เช่น แยกตามแผนกหรือช่วงเดือน) แล้วสรุปทีละชุด`,
        }, 413);
      }

      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: [{ type: "text", text: SYSTEM_AGGREGATE, cache_control: { type: "ephemeral" } }],
        output_config: { format: { type: "json_schema", schema: AGGREGATE_SCHEMA } },
        messages: [{
          role: "user",
          content: `ผลสรุป Exit Interview จำนวน ${summaries.length} คน:\n\n${payload}`,
        }],
      });

      if (res.stop_reason === "refusal") {
        return json({ error: "โมเดลปฏิเสธคำขอนี้ กรุณาตรวจสอบเนื้อหาข้อมูลนำเข้า" }, 422);
      }

      const text = res.content.find((b: any) => b.type === "text")?.text ?? "{}";
      return json({ ...JSON.parse(text), usage: res.usage, model: res.model });
    }

    /* ================= SINGLE ================= */
    const text: string = (body.text ?? "").trim();
    if (text.length < 20) return json({ error: "ข้อความบทสัมภาษณ์สั้นเกินไป" }, 400);
    if (text.length > MAX_INPUT_CHARS) {
      return json({
        error: `บทสัมภาษณ์ยาว ${text.length.toLocaleString()} ตัวอักษร เกินขีดจำกัด ${MAX_INPUT_CHARS.toLocaleString()} ตัวอักษรต่อครั้ง กรุณาแบ่งเป็นหลายส่วนแล้วสรุปทีละส่วน (ระบบจะไม่ตัดข้อความให้อัตโนมัติเพื่อไม่ให้ข้อมูลหาย)`,
      }, 413);
    }

    const meta = body.meta ?? {};
    const metaLines = [
      meta.employee_name && `ชื่อ-สกุล: ${meta.employee_name}`,
      meta.employee_code && `รหัสพนักงาน: ${meta.employee_code}`,
      meta.department && `หน่วยงาน/แผนก: ${meta.department}`,
      meta.position && `ตำแหน่ง: ${meta.position}`,
      meta.tenure && `อายุงาน: ${meta.tenure}`,
      meta.last_day && `วันทำงานวันสุดท้าย: ${meta.last_day}`,
    ].filter(Boolean).join("\n");

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_SINGLE, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: SINGLE_SCHEMA } },
      messages: [{
        role: "user",
        content: `${metaLines ? `ข้อมูลพนักงาน\n${metaLines}\n\n` : ""}บันทึกการสัมภาษณ์\n---\n${text}\n---\n\nวิเคราะห์และสรุปตามโครงสร้างที่กำหนด`,
      }],
    });

    if (res.stop_reason === "refusal") {
      return json({ error: "โมเดลปฏิเสธคำขอนี้ กรุณาตรวจสอบเนื้อหาข้อมูลนำเข้า" }, 422);
    }

    const outText = res.content.find((b: any) => b.type === "text")?.text ?? "{}";
    const summary = JSON.parse(outText);

    /* --- บันทึกลงฐานข้อมูล --- */
    let saved = false;
    if (body.save) {
      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { error: dbError } = await admin.from("exit_interviews").insert({
        created_by: user.id,
        batch_id: body.batch_id ?? null,
        employee_name: meta.employee_name ?? null,
        employee_code: meta.employee_code ?? null,
        department: meta.department ?? null,
        position: meta.position ?? null,
        tenure: meta.tenure ?? null,
        last_day: meta.last_day || null,
        raw_text: text,
        summary,
        model: res.model,
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
      });
      if (dbError) console.error("insert failed:", dbError.message);
      else saved = true;
    }

    return json({ summary, saved, usage: res.usage, model: res.model });

  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.error("summarize error:", e.message);

    if (e.status === 429) return json({ error: "เรียกใช้ AI ถี่เกินไป (rate limit) กรุณารอสักครู่แล้วลองใหม่" }, 429);
    if (e.status === 401) return json({ error: "ANTHROPIC_API_KEY ไม่ถูกต้องหรือหมดอายุ" }, 500);
    if (e.status && e.status >= 500) return json({ error: "บริการ AI ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง" }, 502);

    return json({ error: e.message ?? "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ" }, 500);
  }
});
