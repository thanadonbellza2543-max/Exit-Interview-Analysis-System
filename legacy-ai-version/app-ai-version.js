import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* ============================================================
   ค่าคงที่ / พจนานุกรม
   ============================================================ */

const LS_KEY = "toyota_exit_ai_cfg";

const CATS = {
  compensation:      "ค่าตอบแทน / สวัสดิการ",
  career_growth:     "ความก้าวหน้า / โอกาสเติบโต",
  management:        "หัวหน้างาน / การบริหาร",
  culture:           "เพื่อนร่วมงาน / วัฒนธรรมองค์กร",
  workload:          "ภาระงาน / ความเครียด",
  work_life_balance: "กะงาน / OT / สมดุลชีวิต",
  safety_environment:"ความปลอดภัย / สภาพแวดล้อม",
  training:          "การฝึกอบรม / ระบบงาน",
  commute:           "การเดินทาง / ที่ตั้งโรงงาน",
  policy:            "นโยบาย / กฎระเบียบ",
  new_job_offer:     "ได้งานใหม่ / ข้อเสนอที่ดีกว่า",
  education:         "ศึกษาต่อ",
  personal:          "ส่วนตัว / ครอบครัว / สุขภาพ",
  other:             "อื่น ๆ",
};

const SENTIMENT = {
  positive: { th: "บวก",     cls: "chip-ok" },
  neutral:  { th: "กลาง",    cls: "" },
  mixed:    { th: "ผสม",     cls: "chip-warn" },
  negative: { th: "ลบ",      cls: "chip-danger" },
};

const YESNO = { yes: "ใช่", no: "ไม่", unclear: "ไม่ชัดเจน" };

const URGENCY = { high: "เร่งด่วน", medium: "ปานกลาง", low: "เฝ้าระวัง" };

const RISK_TYPES = {
  harassment:     "การคุกคาม / กลั่นแกล้ง",
  discrimination: "การเลือกปฏิบัติ",
  safety:         "ความปลอดภัยในการทำงาน",
  wage:           "ค่าจ้าง / OT / กฎหมายแรงงาน",
  compliance:     "การปฏิบัติตามกฎระเบียบ",
  legal:          "ความเสี่ยงทางกฎหมาย",
  burnout:        "ภาวะหมดไฟ / สุขภาพจิต",
  knowledge_loss: "การสูญเสียองค์ความรู้",
  other:          "อื่น ๆ",
};

const OWNERS = {
  hr: "HR",
  line_manager: "หัวหน้างาน",
  management: "ผู้บริหาร",
  safety: "ความปลอดภัย",
  training: "ฝ่ายฝึกอบรม",
  other: "อื่น ๆ",
};

/* ============================================================
   ยูทิลิตี้
   ============================================================ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const catLabel = (k) => CATS[k] || k || "อื่น ๆ";

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2800);
}

function busy(btn, on) {
  btn.disabled = on;
  btn.classList.toggle("is-busy", on);
}

function download(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

/* ============================================================
   การตั้งค่า + Supabase client
   ============================================================ */

function getConfig() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { /* ignore */ }
  const base = window.APP_CONFIG || {};
  return {
    url: (stored.url || base.SUPABASE_URL || "").replace(/\/+$/, ""),
    key: stored.key || base.SUPABASE_ANON_KEY || "",
  };
}

let sb = null;
let session = null;

function initClient() {
  const { url, key } = getConfig();
  if (!url || !key) { sb = null; return false; }
  sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return true;
}

/* ---- โมดัลตั้งค่า ---- */
const configModal = $("#configModal");

function openConfig() {
  const { url, key } = getConfig();
  $("#cfgUrl").value = url;
  $("#cfgKey").value = key;
  configModal.showModal();
}

$("#openConfig").onclick = openConfig;
$("#openConfigFromGate").onclick = openConfig;
$("#cfgCancel").onclick = () => configModal.close();

$("#configForm").addEventListener("submit", () => {
  localStorage.setItem(LS_KEY, JSON.stringify({
    url: $("#cfgUrl").value.trim().replace(/\/+$/, ""),
    key: $("#cfgKey").value.trim(),
  }));
  toast("บันทึกการตั้งค่าแล้ว — กำลังโหลดใหม่");
  setTimeout(() => location.reload(), 500);
});

/* ============================================================
   Auth
   ============================================================ */

async function boot() {
  const ok = initClient();
  $("#gateConfigWarn").hidden = ok;
  $("#loginBtn").disabled = !ok;
  if (!ok) return;

  const { data } = await sb.auth.getSession();
  applySession(data.session);
  sb.auth.onAuthStateChange((_e, s) => applySession(s));
}

function applySession(s) {
  session = s;
  const signedIn = !!s;
  $("#gate").hidden = signedIn;
  $("#app").hidden = !signedIn;
  if (signedIn) {
    $("#userChip").textContent = s.user.email;
    loadHistory();
  }
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = $("#loginError");
  errBox.hidden = true;
  const btn = $("#loginBtn");
  busy(btn, true);
  const { error } = await sb.auth.signInWithPassword({
    email: $("#email").value.trim(),
    password: $("#password").value,
  });
  busy(btn, false);
  if (error) {
    errBox.textContent = error.message === "Invalid login credentials"
      ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      : error.message;
    errBox.hidden = false;
  }
});

$("#logoutBtn").onclick = async () => { await sb.auth.signOut(); location.reload(); };

/* ============================================================
   เรียก Edge Function
   ============================================================ */

async function callFunction(body) {
  const { url, key } = getConfig();
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");

  const res = await fetch(`${url}/functions/v1/summarize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (HTTP ${res.status}): ${text.slice(0, 200)}`); }

  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/* ============================================================
   แสดงผลสรุป
   ============================================================ */

function renderSummary(s, meta = {}) {
  const sent = SENTIMENT[s.sentiment?.overall] || SENTIMENT.neutral;
  const cats = (s.reason_categories || []).slice().sort((a, b) => (b.severity || 0) - (a.severity || 0));

  const subParts = [meta.employee_code, meta.department, meta.position, meta.tenure].filter(Boolean);

  return `
    <div class="res-head">
      <div class="res-name">${esc(meta.employee_name || s.headline || "ผลสรุป Exit Interview")}</div>
      ${subParts.length ? `<div class="res-sub">${esc(subParts.join(" · "))}</div>` : ""}
      <div class="res-chips">
        <span class="chip ${sent.cls}">อารมณ์โดยรวม: ${esc(sent.th)}</span>
        ${s.preventable ? `<span class="chip ${s.preventable === "yes" ? "chip-warn" : ""}">ป้องกันได้: ${esc(YESNO[s.preventable] || s.preventable)}</span>` : ""}
        ${s.would_recommend ? `<span class="chip">แนะนำองค์กรต่อ: ${esc(YESNO[s.would_recommend] || s.would_recommend)}</span>` : ""}
        ${s.would_return ? `<span class="chip">ยินดีกลับมา: ${esc(YESNO[s.would_return] || s.would_return)}</span>` : ""}
        ${s.data_quality?.completeness ? `<span class="chip chip-info">ความครบถ้วนข้อมูล: ${esc({high:"สูง",medium:"ปานกลาง",low:"ต่ำ"}[s.data_quality.completeness] || s.data_quality.completeness)}</span>` : ""}
      </div>
    </div>

    ${s.headline && meta.employee_name ? `<div class="res-block"><h3>ประเด็นหลัก</h3><p class="res-summary"><b>${esc(s.headline)}</b></p></div>` : ""}

    <div class="res-block">
      <h3>สรุปย่อ</h3>
      <p class="res-summary">${esc(s.summary)}</p>
    </div>

    <div class="res-block">
      <h3>เหตุผลหลักในการลาออก</h3>
      <p class="res-summary">${esc(s.primary_reason)}</p>
    </div>

    ${cats.length ? `
    <div class="res-block">
      <h3>หมวดปัจจัย (ระดับความรุนแรง 1–5)</h3>
      <div class="bars">
        ${cats.map((c) => `
          <div class="bar-row">
            <span title="${esc(catLabel(c.category))}">${esc(catLabel(c.category))}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${(Number(c.severity) || 0) * 20}%"></span></span>
            <span class="bar-val">${esc(c.severity ?? "-")}/5</span>
          </div>
          ${c.evidence ? `<div class="quote">${esc(c.evidence)}</div>` : ""}
        `).join("")}
      </div>
    </div>` : ""}

    ${s.positives?.length ? `
    <div class="res-block">
      <h3>สิ่งที่พนักงานชื่นชม</h3>
      <ul class="actions-list">
        ${s.positives.map((p) => `<li><span class="chip chip-ok">+</span><span>${esc(p)}</span></li>`).join("")}
      </ul>
    </div>` : ""}

    ${s.key_quotes?.length ? `
    <div class="res-block">
      <h3>คำพูดสำคัญ</h3>
      <div class="quotes">${s.key_quotes.map((q) => `<div class="quote">“${esc(q)}”</div>`).join("")}</div>
    </div>` : ""}

    ${s.risk_flags?.length ? `
    <div class="res-block">
      <h3>ประเด็นที่ต้องเฝ้าระวัง</h3>
      ${s.risk_flags.map((f) => `
        <div class="flag ${f.urgency === "medium" ? "flag-med" : f.urgency === "low" ? "flag-low" : ""}">
          <span>⚑</span>
          <span><b>${esc(RISK_TYPES[f.type] || f.type)} · ${esc(URGENCY[f.urgency] || f.urgency)}</b>${esc(f.detail)}</span>
        </div>`).join("")}
    </div>` : ""}

    ${s.action_items?.length ? `
    <div class="res-block">
      <h3>ข้อเสนอแนะเชิงปฏิบัติ</h3>
      <ul class="actions-list">
        ${s.action_items.map((a) => `
          <li>
            <span class="chip ${a.priority === "high" ? "chip-danger" : a.priority === "medium" ? "chip-warn" : ""}">${esc(OWNERS[a.owner] || a.owner)}</span>
            <span>${esc(a.action)}</span>
          </li>`).join("")}
      </ul>
    </div>` : ""}

    ${s.data_quality?.note ? `<p class="hint" style="margin:0">หมายเหตุ: ${esc(s.data_quality.note)}</p>` : ""}
  `;
}

/* ============================================================
   โหมดสรุปรายคน
   ============================================================ */

const rawText = $("#rawText");
let lastSingle = null;

rawText.addEventListener("input", () => {
  $("#charCount").textContent = `${rawText.value.length.toLocaleString("th-TH")} ตัวอักษร`;
});

function metaFromForm() {
  return {
    employee_name: $("#m_name").value.trim() || null,
    employee_code: $("#m_code").value.trim() || null,
    department:    $("#m_dept").value.trim() || null,
    position:      $("#m_pos").value.trim() || null,
    tenure:        $("#m_tenure").value.trim() || null,
    last_day:      $("#m_lastday").value || null,
  };
}

$("#runSingle").addEventListener("click", async () => {
  const text = rawText.value.trim();
  if (text.length < 30) return toast("กรุณาใส่ข้อความบทสัมภาษณ์ให้ยาวกว่านี้");

  const btn = $("#runSingle");
  busy(btn, true);
  $("#singleOut").innerHTML = `<div class="empty"><span class="empty-icon">⏳</span><p>AI กำลังอ่านและสรุป…</p><small>โดยทั่วไปใช้เวลา 10–30 วินาที</small></div>`;

  try {
    const meta = metaFromForm();
    const out = await callFunction({ mode: "single", text, meta, save: $("#saveToDb").checked });
    lastSingle = { summary: out.summary, meta };
    $("#singleOut").innerHTML = renderSummary(out.summary, meta);
    $("#singleActions").hidden = false;
    if (out.saved) { toast("สรุปเสร็จ และบันทึกลงฐานข้อมูลแล้ว"); loadHistory(); }
    else toast("สรุปเสร็จแล้ว");
  } catch (err) {
    $("#singleOut").innerHTML = `<div class="notice notice-error">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  } finally {
    busy(btn, false);
  }
});

$("#copyResult").onclick = async () => {
  if (!lastSingle) return;
  await navigator.clipboard.writeText(summaryToText(lastSingle.summary, lastSingle.meta));
  toast("คัดลอกข้อความสรุปแล้ว");
};

$("#downloadJson").onclick = () => {
  if (!lastSingle) return;
  download(`exit-interview-${stamp()}.json`, JSON.stringify(lastSingle, null, 2));
};

function summaryToText(s, meta = {}) {
  const L = [];
  L.push(`สรุป Exit Interview`);
  if (meta.employee_name) L.push(`พนักงาน: ${meta.employee_name}`);
  if (meta.department) L.push(`แผนก: ${meta.department}`);
  if (meta.position) L.push(`ตำแหน่ง: ${meta.position}`);
  if (meta.tenure) L.push(`อายุงาน: ${meta.tenure}`);
  L.push("", `ประเด็นหลัก: ${s.headline || "-"}`, "", `สรุปย่อ:`, s.summary, "", `เหตุผลหลัก: ${s.primary_reason}`);
  L.push("", `อารมณ์โดยรวม: ${SENTIMENT[s.sentiment?.overall]?.th || "-"}`);
  if (s.reason_categories?.length) {
    L.push("", "หมวดปัจจัย:");
    s.reason_categories.forEach((c) => L.push(`  - ${catLabel(c.category)} (${c.severity}/5)${c.evidence ? ` — ${c.evidence}` : ""}`));
  }
  if (s.risk_flags?.length) {
    L.push("", "ประเด็นเฝ้าระวัง:");
    s.risk_flags.forEach((f) => L.push(`  ⚑ [${URGENCY[f.urgency] || f.urgency}] ${RISK_TYPES[f.type] || f.type}: ${f.detail}`));
  }
  if (s.action_items?.length) {
    L.push("", "ข้อเสนอแนะ:");
    s.action_items.forEach((a) => L.push(`  - [${OWNERS[a.owner] || a.owner}] ${a.action}`));
  }
  return L.join("\n");
}

$("#fillSample").onclick = () => {
  $("#m_name").value = "สมชาย ใจดี";
  $("#m_code").value = "TMT-48213";
  $("#m_dept").value = "Assembly Shop — Line 2";
  $("#m_pos").value = "Team Leader";
  $("#m_tenure").value = "6 ปี 2 เดือน";
  rawText.value = `ถาม: อะไรคือเหตุผลหลักที่ตัดสินใจลาออกครับ
ตอบ: หลัก ๆ คือเรื่องความก้าวหน้าครับ ผมอยู่ตำแหน่ง TL มา 4 ปีแล้ว เห็นรุ่นน้องที่เข้าทีหลังได้ขึ้น GL ไปสองคน ผมถามหัวหน้าเรื่องเส้นทางอาชีพหลายรอบ ก็ได้คำตอบว่า "รอไปก่อน" ทุกครั้ง ไม่เคยมีแผนที่ชัดเจน

ถาม: เรื่องค่าตอบแทนล่ะครับ
ตอบ: เงินเดือนถือว่าโอเคเมื่อเทียบกับที่อื่นในนิคม แต่ปีที่แล้วโบนัสลดลงเยอะ แล้วก็ไม่มีใครอธิบายเหตุผลให้ฟัง พนักงานในไลน์คุยกันเองไปต่าง ๆ นานา ที่ใหม่ให้เพิ่มประมาณ 15% แต่ถ้าเรื่องความก้าวหน้าชัดเจน ผมก็อาจจะยังอยู่

ถาม: เรื่องภาระงานและ OT
ตอบ: ช่วงที่ยอดผลิตขึ้น เราทำ OT กันเกือบทุกวัน บางสัปดาห์ 6 วัน ผมเข้าใจว่ามันเป็นช่วงพีค แต่ปัญหาคือกำลังคนไม่พอมาสองปีแล้ว คนออกไปแล้วไม่เติม ทีมผมเหลือ 11 คนจาก 15 คน งานเท่าเดิม สุดท้ายพวกที่อยู่ก็เหนื่อยแล้วก็ทยอยออกตามกัน

ถาม: เรื่องหัวหน้างานและการสื่อสาร
ตอบ: หัวหน้าโดยตรงเป็นคนดีนะครับ แต่เขาก็ไม่มีอำนาจตัดสินใจอะไร ทุกอย่างต้องรอข้างบน บางเรื่องเสนอไปเป็นเดือนก็เงียบ ผมเคยเสนอปรับ layout จุดวางชิ้นส่วนที่ station 4 เพราะพนักงานต้องเอี้ยวตัวหยิบตลอด ปวดหลังกันหลายคน เรื่องนี้ผมเสนอตั้งแต่ปีที่แล้ว ยังไม่มีอะไรเกิดขึ้น

ถาม: มีอะไรที่ประทับใจไหมครับ
ตอบ: เพื่อนร่วมงานดีมากครับ ทีมช่วยเหลือกันดี แล้วก็ระบบ training ตอนเข้าใหม่ดีจริง ๆ ผมได้ความรู้เรื่อง TPS เยอะมาก อันนี้ต้องยอมรับว่าที่นี่สอนดี

ถาม: ถ้ามีโอกาสจะกลับมาทำงานที่นี่อีกไหม
ตอบ: ถ้าเรื่องเส้นทางอาชีพชัดเจนกว่านี้ก็อาจจะกลับครับ ผมก็ยังแนะนำเพื่อนให้มาสมัครอยู่นะ แต่จะบอกตามตรงว่าอย่าหวังเรื่องโปรโมทเร็ว`;
  rawText.dispatchEvent(new Event("input"));
  toast("ใส่ตัวอย่างแล้ว — กดปุ่มสรุปได้เลย");
};

/* ---- อ่านไฟล์ลงช่องข้อความ ---- */
function wireDrop(zone, input, handler) {
  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("is-over"); }));
  zone.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handler(f); });
  input.addEventListener("change", () => { const f = input.files[0]; if (f) handler(f); });
}

wireDrop($("#dropzone"), $("#fileInput"), async (file) => {
  const text = await file.text();
  rawText.value = text;
  rawText.dispatchEvent(new Event("input"));
  toast(`อ่านไฟล์ ${file.name} แล้ว`);
});
$("#browseBtn").onclick = () => $("#fileInput").click();

/* ============================================================
   โหมด Batch
   ============================================================ */

let batchRows = [];
let batchHeaders = [];
let batchResults = [];

wireDrop($("#batchDrop"), $("#batchFile"), async (file) => {
  // CSV/TSV ต้องอ่านเป็นข้อความ ไม่ใช่ไบต์ดิบ ไม่งั้น SheetJS จะตีความ UTF-8 เป็น Latin-1
  // แล้วภาษาไทยจะกลายเป็นตัวอักษรเพี้ยน (à¸...)
  const isText = /\.(csv|tsv|txt)$/i.test(file.name);
  const wb = isText
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) return toast("ไม่พบข้อมูลในไฟล์");

  batchRows = rows;
  batchHeaders = Object.keys(rows[0]);
  buildColumnPickers();
  $("#batchMap").hidden = false;
  $("#batchInfo").textContent = `${rows.length} แถว · ${batchHeaders.length} คอลัมน์`;
  toast(`อ่าน ${file.name} แล้ว (${rows.length} แถว)`);
});
$("#batchBrowse").onclick = () => $("#batchFile").click();

function buildColumnPickers() {
  const guess = (...words) =>
    batchHeaders.find((h) => words.some((w) => h.toLowerCase().includes(w))) || "";

  const pickers = {
    col_text:   { req: true,  guess: guess("สัมภาษณ์", "ความเห็น", "เหตุผล", "comment", "interview", "feedback", "remark", "detail") },
    col_name:   { req: false, guess: guess("ชื่อ", "name") },
    col_code:   { req: false, guess: guess("รหัส", "code", "id", "emp") },
    col_dept:   { req: false, guess: guess("แผนก", "หน่วย", "dept", "section", "shop") },
    col_pos:    { req: false, guess: guess("ตำแหน่ง", "position", "title", "role") },
    col_tenure: { req: false, guess: guess("อายุงาน", "tenure", "service", "year") },
  };

  for (const [id, cfg] of Object.entries(pickers)) {
    const sel = $(`#${id}`);
    sel.innerHTML = (cfg.req ? "" : `<option value="">— ไม่ระบุ —</option>`) +
      batchHeaders.map((h) => `<option value="${esc(h)}">${esc(h)}</option>`).join("");
    sel.value = cfg.guess || (cfg.req ? batchHeaders[0] : "");
  }
}

async function pool(items, limit, worker, onTick) {
  const results = new Array(items.length);
  let index = 0, done = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        try { results[i] = { ok: true, value: await worker(items[i], i) }; }
        catch (err) { results[i] = { ok: false, error: err.message }; }
        onTick(++done);
      }
    })
  );
  return results;
}

$("#runBatch").addEventListener("click", async () => {
  const colText = $("#col_text").value;
  const pick = (row, id) => { const c = $(`#${id}`).value; return c ? String(row[c] || "").trim() || null : null; };

  const jobs = batchRows
    .map((row) => ({
      text: String(row[colText] || "").trim(),
      meta: {
        employee_name: pick(row, "col_name"),
        employee_code: pick(row, "col_code"),
        department:    pick(row, "col_dept"),
        position:      pick(row, "col_pos"),
        tenure:        pick(row, "col_tenure"),
      },
    }))
    .filter((j) => j.text.length >= 20);

  if (!jobs.length) return toast("ไม่พบแถวที่มีเนื้อหาสัมภาษณ์เพียงพอ");

  const btn = $("#runBatch");
  busy(btn, true);
  $("#batchProgress").hidden = false;
  $("#batchResult").hidden = true;

  const batchId = crypto.randomUUID();
  const save = $("#batchSave").checked;
  const setProgress = (n) => {
    $("#batchBarFill").style.width = `${(n / jobs.length) * 100}%`;
    $("#batchStatus").textContent = `${n} / ${jobs.length}`;
  };
  setProgress(0);

  const raw = await pool(jobs, 3, async (job) => {
    const out = await callFunction({ mode: "single", text: job.text, meta: job.meta, save, batch_id: batchId });
    return out.summary;
  }, setProgress);

  batchResults = raw.map((r, i) => ({ ...jobs[i], ...r }));
  busy(btn, false);

  renderBatch();
  $("#batchResult").hidden = false;

  const okList = batchResults.filter((r) => r.ok);
  if (okList.length > 1) {
    $("#dashboard").insertAdjacentHTML("beforeend",
      `<div id="execBox" class="res-block"><h3>บทสรุปผู้บริหาร</h3><p class="hint">AI กำลังเรียบเรียง…</p></div>`);
    try {
      const out = await callFunction({
        mode: "aggregate",
        summaries: okList.map((r) => ({ meta: r.meta, summary: r.value })),
      });
      $("#execBox").innerHTML = `<h3>บทสรุปผู้บริหาร</h3>
        <p class="res-summary">${esc(out.overview)}</p>
        ${out.themes?.length ? `<ul class="actions-list" style="margin-top:12px">${out.themes.map((t) =>
          `<li><span class="chip chip-warn">${esc(t.affected ?? "")}</span><span><b>${esc(t.theme)}</b> — ${esc(t.detail)}</span></li>`).join("")}</ul>` : ""}
        ${out.recommendations?.length ? `<h3 style="margin-top:16px">ข้อเสนอแนะระดับองค์กร</h3>
          <ul class="actions-list">${out.recommendations.map((r) =>
            `<li><span class="chip ${r.priority === "high" ? "chip-danger" : r.priority === "medium" ? "chip-warn" : ""}">${esc(OWNERS[r.owner] || r.owner)}</span><span>${esc(r.action)}</span></li>`).join("")}</ul>` : ""}`;
    } catch (err) {
      $("#execBox").innerHTML = `<h3>บทสรุปผู้บริหาร</h3><div class="notice notice-error">สร้างบทสรุปไม่สำเร็จ: ${esc(err.message)}</div>`;
    }
  }
  if (save) loadHistory();
});

function renderBatch() {
  const ok = batchResults.filter((r) => r.ok);
  const failed = batchResults.length - ok.length;

  const catCount = {};
  ok.forEach((r) => (r.value.reason_categories || []).forEach((c) => {
    catCount[c.category] = (catCount[c.category] || 0) + 1;
  }));
  const sortedCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
  const maxCat = sortedCats[0]?.[1] || 1;

  const negative = ok.filter((r) => ["negative", "mixed"].includes(r.value.sentiment?.overall)).length;
  const preventable = ok.filter((r) => r.value.preventable === "yes").length;
  const risks = ok.flatMap((r) => (r.value.risk_flags || []).map((f) => ({ ...f, who: r.meta.employee_name || r.meta.employee_code || "ไม่ระบุชื่อ" })));
  const highRisk = risks.filter((f) => f.urgency === "high");

  $("#dashboard").innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="stat-num">${ok.length}</div><div class="stat-label">สรุปสำเร็จ${failed ? ` (ล้มเหลว ${failed})` : ""}</div></div>
      <div class="stat"><div class="stat-num">${ok.length ? Math.round((negative / ok.length) * 100) : 0}%</div><div class="stat-label">อารมณ์ลบ / ผสม</div></div>
      <div class="stat"><div class="stat-num">${ok.length ? Math.round((preventable / ok.length) * 100) : 0}%</div><div class="stat-label">องค์กรน่าจะรั้งไว้ได้</div></div>
      <div class="stat"><div class="stat-num">${highRisk.length}</div><div class="stat-label">ประเด็นเร่งด่วน</div></div>
    </div>

    ${sortedCats.length ? `
    <div class="res-block">
      <h3>ปัจจัยที่พบบ่อยที่สุด</h3>
      <div class="bars">
        ${sortedCats.map(([k, n]) => `
          <div class="bar-row">
            <span>${esc(catLabel(k))}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${(n / maxCat) * 100}%"></span></span>
            <span class="bar-val">${n} คน</span>
          </div>`).join("")}
      </div>
    </div>` : ""}

    ${risks.length ? `
    <div class="res-block">
      <h3>ประเด็นที่ต้องเฝ้าระวัง (รวมทุกคน)</h3>
      ${risks.sort((a, b) => (b.urgency === "high") - (a.urgency === "high")).map((f) => `
        <div class="flag ${f.urgency === "medium" ? "flag-med" : f.urgency === "low" ? "flag-low" : ""}">
          <span>⚑</span>
          <span><b>${esc(RISK_TYPES[f.type] || f.type)} · ${esc(URGENCY[f.urgency] || f.urgency)} · ${esc(f.who)}</b>${esc(f.detail)}</span>
        </div>`).join("")}
    </div>` : ""}
  `;

  $("#batchList").innerHTML = batchResults.map((r, i) => {
    if (!r.ok) return `<div class="batch-item"><summary><span class="chip chip-danger">ล้มเหลว</span> <span class="muted">แถว ${i + 1}: ${esc(r.error)}</span></summary></div>`;
    const sent = SENTIMENT[r.value.sentiment?.overall] || SENTIMENT.neutral;
    return `
      <details class="batch-item">
        <summary>
          <strong>${esc(r.meta.employee_name || `แถว ${i + 1}`)}</strong>
          <span class="chip ${sent.cls}">${esc(sent.th)}</span>
          ${r.meta.department ? `<span class="muted">${esc(r.meta.department)}</span>` : ""}
          <span class="muted">— ${esc(r.value.headline || "")}</span>
        </summary>
        <div class="batch-body">${renderSummary(r.value, r.meta)}</div>
      </details>`;
  }).join("");
}

$("#exportJson").onclick = () =>
  download(`exit-interview-batch-${stamp()}.json`,
    JSON.stringify(batchResults.filter((r) => r.ok).map((r) => ({ meta: r.meta, summary: r.value })), null, 2));

$("#exportCsv").onclick = () => {
  const rows = [[
    "ชื่อ", "รหัสพนักงาน", "แผนก", "ตำแหน่ง", "อายุงาน",
    "ประเด็นหลัก", "เหตุผลหลัก", "อารมณ์", "ป้องกันได้", "แนะนำองค์กรต่อ",
    "หมวดปัจจัย", "ประเด็นเฝ้าระวัง", "ข้อเสนอแนะ", "สรุปย่อ",
  ]];
  batchResults.filter((r) => r.ok).forEach(({ meta, value: s }) => rows.push([
    meta.employee_name, meta.employee_code, meta.department, meta.position, meta.tenure,
    s.headline, s.primary_reason,
    SENTIMENT[s.sentiment?.overall]?.th, YESNO[s.preventable], YESNO[s.would_recommend],
    (s.reason_categories || []).map((c) => `${catLabel(c.category)}(${c.severity})`).join(" | "),
    (s.risk_flags || []).map((f) => `[${URGENCY[f.urgency]}] ${RISK_TYPES[f.type] || f.type}: ${f.detail}`).join(" | "),
    (s.action_items || []).map((a) => `[${OWNERS[a.owner] || a.owner}] ${a.action}`).join(" | "),
    s.summary,
  ]));
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  download(`exit-interview-batch-${stamp()}.csv`, "﻿" + csv, "text/csv");
};

/* ============================================================
   ประวัติ
   ============================================================ */

let historyRows = [];

async function loadHistory() {
  if (!sb || !session) return;
  const { data, error } = await sb
    .from("exit_interviews")
    .select("id, created_at, employee_name, employee_code, department, position, tenure, summary")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    $("#historyList").innerHTML = `<div class="notice notice-error">โหลดประวัติไม่สำเร็จ: ${esc(error.message)}</div>`;
    return;
  }
  historyRows = data || [];
  renderHistory();
}

function renderHistory() {
  const q = $("#historySearch").value.trim().toLowerCase();
  const rows = q
    ? historyRows.filter((r) => JSON.stringify(r).toLowerCase().includes(q))
    : historyRows;

  if (!rows.length) {
    $("#historyList").innerHTML = `<div class="empty"><span class="empty-icon">🗂️</span><p>${q ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีประวัติ"}</p><small>ผลสรุปที่เลือก “บันทึกลง Supabase” จะปรากฏที่นี่</small></div>`;
    return;
  }

  $("#historyList").innerHTML = rows.map((r) => {
    const s = r.summary || {};
    const sent = SENTIMENT[s.sentiment?.overall] || SENTIMENT.neutral;
    const meta = {
      employee_name: r.employee_name, employee_code: r.employee_code,
      department: r.department, position: r.position, tenure: r.tenure,
    };
    return `
      <details class="batch-item">
        <summary>
          <strong>${esc(r.employee_name || "ไม่ระบุชื่อ")}</strong>
          <span class="chip ${sent.cls}">${esc(sent.th)}</span>
          ${r.department ? `<span class="muted">${esc(r.department)}</span>` : ""}
          <span class="muted">${new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
          <span class="muted">— ${esc(s.headline || "")}</span>
        </summary>
        <div class="batch-body">${renderSummary(s, meta)}</div>
      </details>`;
  }).join("");
}

$("#historySearch").addEventListener("input", renderHistory);
$("#reloadHistory").onclick = () => { loadHistory(); toast("รีเฟรชแล้ว"); };

/* ============================================================
   แท็บ
   ============================================================ */

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
  });
});

boot();
