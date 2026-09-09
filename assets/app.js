/* ============================================================================
   app.js — ส่วนติดต่อผู้ใช้ (ไม่มีการเรียกเครือข่ายใด ๆ)
   ========================================================================== */

(function () {
  "use strict";

  const E = window.ExitEngine;

  /* CLOUD = true เมื่อ config.js มีค่า Supabase ครบ — ประวัติจะอยู่ในฐานข้อมูลกลาง
     ที่ทั้งทีมเห็นร่วมกันและต้องล็อกอินก่อน ถ้าไม่ตั้งค่าจะกลับไปเก็บใน localStorage
     ของแต่ละเครื่องเหมือนเดิม ทำให้ยังดับเบิลคลิกเปิดใช้คนเดียวได้ */
  const CLOUD = Boolean(window.Cloud && window.Cloud.enabled);
  const LS_HISTORY = "exitiv_history";
  const LS_LEXICON = "exitiv_lexicon";
  const LS_ANALYST = "exitiv_analyst";
  const HISTORY_MAX = 1000;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const SENTIMENT = {
    positive: { th: "บวก", cls: "chip-ok" },
    neutral: { th: "กลาง", cls: "" },
    mixed: { th: "ผสม", cls: "chip-warn" },
    negative: { th: "ลบ", cls: "chip-danger" },
  };
  const YESNO = { yes: "ใช่", no: "ไม่", unclear: "ไม่ชัดเจน" };
  const URGENCY = { high: "เร่งด่วน", medium: "ปานกลาง", low: "เฝ้าระวัง" };
  const OWNERS = {
    hr: "HR", line_manager: "หัวหน้างาน", management: "ผู้บริหาร",
    safety: "ความปลอดภัย", training: "ฝ่ายฝึกอบรม", other: "อื่น ๆ",
  };
  const COMPLETENESS = { high: "สูง", medium: "ปานกลาง", low: "ต่ำ" };

  /* ------------------------------------------------------------------ */
  /* ยูทิลิตี้                                                           */
  /* ------------------------------------------------------------------ */

  function setTabCount(sel, n) {
    const el = $(sel);
    if (!el) return;
    el.textContent = n;
    el.hidden = !n;
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: (mime || "application/json") + ";charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  /* บางสภาพแวดล้อมปิด localStorage ไว้ เช่น เปิดไฟล์ตรงด้วย file:// ในบางเบราว์เซอร์
     หรือโหมดส่วนตัวที่ตั้งค่าบล็อกข้อมูลเว็บไซต์ — ต้องตรวจก่อนแล้วบอกผู้ใช้ตรง ๆ
     ไม่ใช่ปล่อยให้กดบันทึกแล้วเงียบหายไปเฉย ๆ */
  const STORAGE_OK = (function () {
    try {
      localStorage.setItem("__probe__", "1");
      localStorage.removeItem("__probe__");
      return true;
    } catch (e) { return false; }
  })();

  function readLS(key, fallback) {
    if (!STORAGE_OK) return fallback;
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function writeLS(key, value) {
    if (!STORAGE_OK) return false;
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) {
      toast("พื้นที่จัดเก็บในเบราว์เซอร์เต็ม — กรุณาสำรองข้อมูลแล้วล้างประวัติเก่า");
      return false;
    }
  }

  /** ถ้าเก็บข้อมูลไม่ได้ ให้ปิดตัวเลือกบันทึกและอธิบายเหตุผล */
  function applyStorageState() {
    if (STORAGE_OK) return;
    ["#saveHistory", "#batchSaveHistory"].forEach((sel) => {
      const el = $(sel);
      el.checked = false;
      el.disabled = true;
      el.parentElement.title = "เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูล";
      el.parentElement.style.opacity = ".55";
    });
    const msg = `เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูลในเครื่อง จึงใช้ประวัติไม่ได้
      (พบบ่อยเมื่อเปิดไฟล์ตรงด้วย file:// หรืออยู่ในโหมดส่วนตัว)
      — การวิเคราะห์และการส่งออกไฟล์ยังทำงานได้ครบ
      ถ้าต้องการเก็บประวัติ ให้เปิดผ่าน GitHub Pages หรือเซิร์ฟเวอร์ในเครื่อง`;
    $("#historyList").innerHTML = `<div class="notice notice-warn">${esc(msg)}</div>`;
    $(".wrap").insertAdjacentHTML("afterbegin",
      `<div class="notice notice-warn" style="margin-bottom:16px">${esc(msg)}</div>`);
  }

  /* ------------------------------------------------------------------ */
  /* พจนานุกรมที่ผู้ใช้เพิ่มเอง                                          */
  /* ------------------------------------------------------------------ */

  let lexicon = readLS(LS_LEXICON, {});
  const getLexicon = () => lexicon;

  function renderLexicon() {
    $("#lexiconList").innerHTML = Object.keys(E.CATEGORIES)
      .filter((k) => k !== "other")
      .map((k) => {
        const def = E.CATEGORIES[k];
        return `
          <div class="lex-row">
            <div class="lex-head">
              <b>${esc(def.label)}</b>
              <span class="chip">คำมาตรฐาน ${def.kw.length} คำ</span>
            </div>
            <details class="lex-default"><summary>ดูคำมาตรฐาน</summary><p>${esc(def.kw.join(", "))}</p></details>
            <input type="text" data-cat="${esc(k)}" class="lex-input"
                   placeholder="เพิ่มคำของหน่วยงาน คั่นด้วย , เช่น ไลน์ 2, สถานี 4"
                   value="${esc((lexicon[k] || []).join(", "))}">
          </div>`;
      }).join("");

    $$(".lex-input").forEach((input) => {
      input.addEventListener("change", () => {
        const cat = input.dataset.cat;
        const words = input.value.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
        if (words.length) lexicon[cat] = words; else delete lexicon[cat];
        writeLS(LS_LEXICON, lexicon);
        toast("บันทึกคำสำคัญแล้ว");
      });
    });
  }

  $("#resetLexicon").onclick = () => {
    if (!confirm("ลบคำสำคัญที่เพิ่มเองทั้งหมด กลับไปใช้ค่ามาตรฐาน?")) return;
    lexicon = {};
    writeLS(LS_LEXICON, lexicon);
    renderLexicon();
    toast("คืนค่าเริ่มต้นแล้ว");
  };

  /* ------------------------------------------------------------------ */
  /* แสดงผลวิเคราะห์                                                     */
  /* ------------------------------------------------------------------ */

  /** จุด 5 ระดับ อ่านง่ายกว่าตัวเลขลอย ๆ และเทียบข้ามหมวดได้ทันที */
  function dots(n) {
    const lvl = n >= 4 ? "sev-high" : n === 3 ? "sev-mid" : "sev-low";
    let out = `<span class="dots ${lvl}" title="ความรุนแรง ${n} จาก 5">`;
    for (let i = 1; i <= 5; i++) out += `<i class="${i <= n ? "on" : ""}"></i>`;
    return out + "</span>";
  }

  const VERDICT = {
    would_return: {
      yes: { txt: "ยินดีกลับมา", cls: "tile-ok", sub: "เก็บไว้ในทะเบียนจ้างกลับ" },
      no: { txt: "ไม่กลับแล้ว", cls: "tile-danger", sub: "" },
      unclear: { txt: "ไม่ได้พูดถึง", cls: "", sub: "" },
    },
    would_recommend: {
      yes: { txt: "ยังแนะนำองค์กร", cls: "tile-ok", sub: "" },
      no: { txt: "ไม่แนะนำองค์กร", cls: "tile-danger", sub: "กระทบภาพลักษณ์การจ้างงาน" },
      unclear: { txt: "ไม่ได้พูดถึง", cls: "", sub: "" },
    },
  };

  function renderSummary(s, meta) {
    meta = meta || {};
    const cats = s.reason_categories || [];
    const top = cats[0];
    const rest = cats.slice(1);
    const risks = s.risk_flags || [];
    const urgent = risks.filter((f) => f.urgency === "high");
    const later = risks.filter((f) => f.urgency !== "high");
    const sent = SENTIMENT[s.sentiment && s.sentiment.overall] || SENTIMENT.neutral;
    const sub = [meta.employee_code, meta.department, meta.position, meta.tenure,
      meta.interviewer ? "ผู้สัมภาษณ์ " + meta.interviewer : null].filter(Boolean);

    const tile = (label, key) => {
      const v = VERDICT[key][s[key]] || VERDICT[key].unclear;
      return `<div class="tile ${v.cls}">
        <div class="tile-label">${esc(label)}</div>
        <div class="tile-value">${esc(v.txt)}</div>
        ${v.sub ? `<div class="tile-sub">${esc(v.sub)}</div>` : ""}
      </div>`;
    };

    return `
      <div class="res-head">
        <div class="res-name">${esc(meta.employee_name || "ผลวิเคราะห์ Exit Interview")}</div>
        ${sub.length ? `<div class="res-sub">${esc(sub.join(" · "))}</div>` : ""}
      </div>

      ${top ? `
      <div class="hero">
        <div class="hero-label">เหตุผลหลัก</div>
        <div class="hero-title">${esc(top.label)}</div>
        <div class="hero-meta">${dots(top.severity)}<span>ความรุนแรง ${esc(top.severity)} จาก 5</span></div>
        ${top.evidence ? `<blockquote class="hero-quote">${esc(top.evidence)}</blockquote>` : ""}
      </div>` : `
      <div class="notice notice-warn">ไม่พบคำสำคัญที่ตรงกับหมวดใดเลย — ต้องอ่านบทสัมภาษณ์ต้นฉบับเอง
      หรือเพิ่มคำเฉพาะขององค์กรในแท็บ “คำสำคัญ”</div>`}

      ${urgent.length ? `
      <div class="alert">
        <div class="alert-head">🚩 ต้องตรวจสอบข้อเท็จจริงก่อนปิดเคส (${urgent.length})</div>
        ${urgent.map((f) => `
          <div class="alert-item">
            <b>${esc(f.label)}</b>
            <span>${esc(f.detail)}</span>
          </div>`).join("")}
        <div class="alert-foot">ระบบตรวจจากคำสำคัญเท่านั้น ยังไม่ใช่ข้อสรุป — HR ต้องสอบกับคนจริงก่อนเสมอ</div>
      </div>` : ""}

      <div class="tiles">
        <div class="tile ${sent.cls === "chip-danger" ? "tile-danger" : sent.cls === "chip-warn" ? "tile-warn" : sent.cls === "chip-ok" ? "tile-ok" : ""}">
          <div class="tile-label">น้ำเสียงโดยรวม</div>
          <div class="tile-value">${esc(sent.th)}</div>
        </div>
        ${tile("กลับมาทำงานอีกไหม", "would_return")}
        ${tile("ยังแนะนำองค์กรไหม", "would_recommend")}
      </div>

      ${rest.length ? `
      <div class="res-block">
        <h3>ปัจจัยอื่นที่พบ</h3>
        <div class="factors">
          ${rest.map((c) => `
            <details class="factor">
              <summary>
                <span class="factor-name">${esc(c.label)}</span>
                ${dots(c.severity)}
              </summary>
              ${c.evidence ? `<blockquote>${esc(c.evidence)}</blockquote>`
                : `<p class="muted">ไม่มีประโยคอ้างอิงที่ชัดเจน</p>`}
            </details>`).join("")}
        </div>
      </div>` : ""}

      ${s.action_items && s.action_items.length ? `
      <div class="res-block">
        <h3>สิ่งที่ควรทำต่อ</h3>
        <ol class="steps">
          ${s.action_items.map((a) => `
            <li class="step ${a.urgent ? "step-high" : ""}">
              <span class="step-owner">${esc(OWNERS[a.owner] || a.owner)}</span>
              <span class="step-text">${esc(a.action)}</span>
            </li>`).join("")}
        </ol>
      </div>` : ""}

      <details class="more">
        <summary>ดูรายละเอียดทั้งหมด — สรุปย่อ · คำพูดสำคัญ · สิ่งที่ชื่นชม</summary>
        <div class="more-body">
          <div class="res-block">
            <h3>สรุปย่อ</h3>
            <p class="res-summary">${esc(s.summary)}</p>
          </div>

          ${s.key_quotes && s.key_quotes.length ? `
          <div class="res-block">
            <h3>คำพูดสำคัญ (ยกจากต้นฉบับ)</h3>
            <div class="quotes">${s.key_quotes.map((q) => `<div class="quote">“${esc(q)}”</div>`).join("")}</div>
          </div>` : ""}

          ${s.positives && s.positives.length ? `
          <div class="res-block">
            <h3>สิ่งที่พนักงานพูดถึงในแง่ดี</h3>
            <ul class="plain-list">
              ${s.positives.map((p) => `<li><span class="plus">+</span>${esc(p)}</li>`).join("")}
            </ul>
          </div>` : ""}

          ${later.length ? `
          <div class="res-block">
            <h3>ประเด็นเฝ้าระวังระดับรอง</h3>
            ${later.map((f) => `
              <div class="flag ${f.urgency === "medium" ? "flag-med" : "flag-low"}">
                <span>⚑</span>
                <span><b>${esc(f.label)} · ${esc(URGENCY[f.urgency] || f.urgency)}</b>${esc(f.detail)}</span>
              </div>`).join("")}
          </div>` : ""}

          ${cats.length ? `
          <div class="res-block">
            <h3>คะแนนทุกหมวดที่ตรวจพบ</h3>
            <div class="bars">
              ${cats.map((c) => `
                <div class="bar-row">
                  <span>${esc(c.label)}</span>
                  <span class="bar-track"><span class="bar-fill" style="width:${(c.severity || 0) * 20}%"></span></span>
                  <span class="bar-val">${esc(c.severity)}/5</span>
                </div>`).join("")}
            </div>
          </div>` : ""}

          <p class="muted">ความครบถ้วนของข้อมูล: ${esc(COMPLETENESS[s.data_quality && s.data_quality.completeness] || "-")}
          ${s.data_quality && s.data_quality.note ? " · " + esc(s.data_quality.note) : ""}</p>
        </div>
      </details>
    `;
  }

  function summaryToText(s, meta) {
    meta = meta || {};
    const L = ["สรุป Exit Interview"];
    if (meta.employee_name) L.push("พนักงาน: " + meta.employee_name);
    if (meta.department) L.push("แผนก: " + meta.department);
    if (meta.position) L.push("ตำแหน่ง: " + meta.position);
    if (meta.tenure) L.push("อายุงาน: " + meta.tenure);
    L.push("", "ประเด็นหลัก: " + s.headline, "", "สรุปย่อ:", s.summary, "", "เหตุผลหลัก: " + s.primary_reason);
    L.push("", "น้ำเสียงโดยรวม: " + (SENTIMENT[s.sentiment.overall] || {}).th);
    if (s.reason_categories.length) {
      L.push("", "หมวดปัจจัย:");
      s.reason_categories.forEach((c) =>
        L.push(`  - ${c.label} (${c.severity}/5)` + (c.evidence ? ` — ${c.evidence}` : "")));
    }
    if (s.risk_flags.length) {
      L.push("", "ประเด็นเฝ้าระวัง (ต้องสอบข้อเท็จจริงก่อน):");
      s.risk_flags.forEach((f) => L.push(`  ! [${URGENCY[f.urgency]}] ${f.label}: ${f.detail}`));
    }
    if (s.action_items.length) {
      L.push("", "ข้อเสนอแนะตั้งต้น:");
      s.action_items.forEach((a) => L.push(`  - [${OWNERS[a.owner] || a.owner}] ${a.action}`));
    }
    L.push("", "— วิเคราะห์ด้วยระบบคำสำคัญอัตโนมัติ ต้องตรวจทานกับต้นฉบับก่อนนำไปใช้ —");
    return L.join("\n");
  }

  /* ------------------------------------------------------------------ */
  /* ประวัติ                                                             */
  /* ------------------------------------------------------------------ */

  let history = CLOUD ? [] : readLS(LS_HISTORY, []);
  let analyst = readLS(LS_ANALYST, "") || "";

  $("#analystName").value = analyst;
  $("#analystName").addEventListener("change", function () {
    analyst = this.value.trim();
    writeLS(LS_ANALYST, analyst);
    toast(analyst ? `บันทึกชื่อผู้วิเคราะห์: ${analyst}` : "ล้างชื่อผู้วิเคราะห์แล้ว");
  });

  /** ติดชื่อผู้วิเคราะห์ไปกับผล เพื่อให้ตอนรวมไฟล์หลายคนยังรู้ว่าใครทำรายการไหน */
  const stampAnalyst = (meta) => Object.assign({}, meta, { analyst: analyst || null });

  /** ใช้ระบุว่าเป็นรายการเดียวกันหรือไม่ ตอนรวมไฟล์จากหลายเครื่อง
      ไม่ใช้ timestamp เต็มเพราะคนละเครื่องกดคนละวินาที แต่เป็นคนเดียวกัน */
  const fingerprint = (r) => [
    r.meta.employee_name || "", r.meta.employee_code || "", r.meta.department || "",
    r.summary.headline || "", String(r.at || "").slice(0, 10),
  ].join("|");

  async function loadHistory() {
    if (CLOUD) {
      try {
        history = await Cloud.list();
      } catch (err) {
        history = [];
        toast(err.message);
      }
    } else {
      history = readLS(LS_HISTORY, []);
    }
    renderHistory();
  }

  async function addHistory(entries) {
    if (CLOUD) {
      const withFp = entries.map((r) => Object.assign({}, r, { fingerprint: fingerprint(r) }));
      try {
        const res = await Cloud.add(withFp);
        await loadHistory();
        return res;
      } catch (err) {
        toast(err.message);
        return { added: 0, skipped: 0 };
      }
    }

    const seen = new Set(history.map(fingerprint));
    const fresh = entries.filter((r) => {
      const fp = fingerprint(r);
      if (seen.has(fp)) return false;
      seen.add(fp);
      return true;
    });
    history = fresh.concat(history).slice(0, HISTORY_MAX);
    writeLS(LS_HISTORY, history);
    renderHistory();
    return { added: fresh.length, skipped: entries.length - fresh.length };
  }

  /* ---- ประวัติสะสม: กรอง ค้นหา และดูภาพรวมรวมทุกคน ------------------
     แท็บนี้คือจุดที่งานของทีมมารวมกัน คนที่ทำสรุปภาพรวมจะรวมไฟล์จากเพื่อน
     แล้วดูแนวโน้มข้ามเดือน ข้ามแผนก และข้ามคนสัมภาษณ์ได้จากที่เดียว */

  const histState = { q: "", from: "", to: "", filter: "all" };
  let teamViewOpen = false;

  const hasHighRisk = (r) => (r.summary.risk_flags || []).some((f) => f.urgency === "high");
  const dayOf = (r) => String(r.at || "").slice(0, 10);

  function filteredHistory() {
    let rows = history.slice();
    if (histState.from) rows = rows.filter((r) => dayOf(r) >= histState.from);
    if (histState.to) rows = rows.filter((r) => dayOf(r) <= histState.to);

    const f = histState.filter;
    if (f === "risk") rows = rows.filter(hasHighRisk);
    else if (f === "preventable") rows = rows.filter((r) => r.summary.preventable === "yes");
    else if (f.indexOf("dept:") === 0) {
      const d = f.slice(5);
      rows = rows.filter((r) => String(r.meta.department || "").trim() === d);
    } else if (f.indexOf("analyst:") === 0) {
      const a = f.slice(8);
      rows = rows.filter((r) => String(r.meta.analyst || "") === a);
    }

    const q = histState.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().indexOf(q) !== -1);
    return rows;
  }

  function renderHistoryFilters(rows) {
    const depts = {}, analysts = {};
    history.forEach((r) => {
      const d = String(r.meta.department || "").trim();
      if (d) depts[d] = (depts[d] || 0) + 1;
      const a = String(r.meta.analyst || "").trim();
      if (a) analysts[a] = (analysts[a] || 0) + 1;
    });

    const items = [{ key: "all", label: "ทั้งหมด", n: history.length }];
    const risk = history.filter(hasHighRisk).length;
    const prev = history.filter((r) => r.summary.preventable === "yes").length;
    if (risk) items.push({ key: "risk", label: "🚩 มีธงแดง", n: risk });
    if (prev) items.push({ key: "preventable", label: "รั้งไว้ได้", n: prev });

    Object.keys(analysts).sort((a, b) => analysts[b] - analysts[a]).slice(0, 6)
      .forEach((a) => items.push({ key: "analyst:" + a, label: "โดย " + a, n: analysts[a] }));
    Object.keys(depts).sort((a, b) => depts[b] - depts[a]).slice(0, 10)
      .forEach((d) => items.push({ key: "dept:" + d, label: d, n: depts[d] }));

    $("#historyFilters").innerHTML = items.map((it) =>
      `<button class="fchip ${histState.filter === it.key ? "is-on" : ""}" data-filter="${esc(it.key)}">${esc(it.label)} <b>${it.n}</b></button>`
    ).join("");
  }

  function renderHistory() {
    setTabCount("#tabCountHistory", history.length);
    const rows = filteredHistory();

    $("#histCount").textContent = rows.length === history.length
      ? `${history.length} รายการ`
      : `แสดง ${rows.length} จาก ${history.length} รายการ`;

    renderHistoryFilters(rows);

    /* ---- ภาพรวมรวมทุกคน ---- */
    const dash = $("#historyDashboard");
    if (teamViewOpen && rows.length) {
      dash.innerHTML = dashboardHTML(E.aggregate(rows), rows, 0);
      dash.hidden = false;
    } else {
      dash.hidden = true;
      dash.innerHTML = "";
    }

    /* ---- รายการ ---- */
    if (!rows.length) {
      const filtering = histState.q || histState.from || histState.to || histState.filter !== "all";
      $("#historyList").innerHTML = `<div class="empty"><span class="empty-icon">🗂️</span>
        <p>${filtering ? "ไม่มีรายการตรงกับเงื่อนไข" : "ยังไม่มีประวัติ"}</p>
        <small>${filtering ? "ลองกดล้างตัวกรอง" : "ผลที่ติ๊ก “บันทึกลงประวัติ” จะมาอยู่ตรงนี้"}</small></div>`;
      return;
    }

    $("#historyList").innerHTML = rows.map((r) => {
      const s2 = r.summary, sent = SENTIMENT[s2.sentiment.overall] || SENTIMENT.neutral;
      const risks = (s2.risk_flags || []).filter((f) => f.urgency === "high").length;
      return `
        <details class="batch-item">
          <summary>
            <strong>${esc(r.meta.employee_name || "ไม่ระบุชื่อ")}</strong>
            <span class="chip ${sent.cls}">${esc(sent.th)}</span>
            ${risks ? `<span class="badge-flag">🚩 ${risks}</span>` : ""}
            ${r.meta.department ? `<span class="muted">${esc(r.meta.department)}</span>` : ""}
            <span class="muted">${new Date(r.at).toLocaleDateString("th-TH", { dateStyle: "medium" })}</span>
            ${r.meta.analyst ? `<span class="muted">· โดย ${esc(r.meta.analyst)}</span>` : ""}
            <span class="muted">— ${esc(s2.headline)}</span>
          </summary>
          <div class="batch-body">${renderSummary(s2, r.meta)}</div>
        </details>`;
    }).join("");
  }

  $("#historySearch").addEventListener("input", function () { histState.q = this.value; renderHistory(); });
  $("#histFrom").addEventListener("change", function () { histState.from = this.value; renderHistory(); });
  $("#histTo").addEventListener("change", function () { histState.to = this.value; renderHistory(); });
  $("#historyFilters").addEventListener("click", (e) => {
    const btn = e.target.closest(".fchip");
    if (!btn) return;
    histState.filter = btn.dataset.filter;
    renderHistory();
  });
  $("#histReset").onclick = () => {
    histState.q = ""; histState.from = ""; histState.to = ""; histState.filter = "all";
    $("#historySearch").value = ""; $("#histFrom").value = ""; $("#histTo").value = "";
    renderHistory();
  };
  $("#toggleTeamView").onclick = function () {
    teamViewOpen = !teamViewOpen;
    this.textContent = teamViewOpen ? "ซ่อนภาพรวม" : "ดูภาพรวมรวมทุกคน";
    renderHistory();
    if (teamViewOpen) $("#historyDashboard").scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  /* ---- ล้าง / ส่งออก / รวมไฟล์จากทีม ---- */

  $("#clearHistory").onclick = async () => {
    if (!history.length) return toast("ไม่มีประวัติให้ล้าง");

    if (CLOUD) {
      const mine = history.filter((r) => r.mine).length;
      if (!mine) return toast("ไม่มีรายการที่คุณสร้างเอง — ลบของคนอื่นไม่ได้");
      if (!confirm(`ลบ ${mine} รายการที่คุณสร้างออกจากฐานข้อมูลกลางถาวร?\n\nรายการของคนอื่นจะไม่ถูกแตะต้อง`)) return;
      try {
        const n = await Cloud.clearMine();
        await loadHistory();
        toast(`ลบ ${n} รายการแล้ว`);
      } catch (err) { toast(err.message); }
      return;
    }

    if (!confirm(`ลบประวัติทั้งหมด ${history.length} รายการถาวร?\n\nกด "ส่งออกเพื่อแชร์" ก่อนถ้ายังต้องการเก็บไว้`)) return;
    history = [];
    writeLS(LS_HISTORY, history);
    renderHistory();
    toast("ล้างประวัติแล้ว");
  };

  $("#exportHistory").onclick = () => {
    if (!history.length) return toast("ไม่มีประวัติให้ส่งออก");
    const pack = {
      app: "exit-interview-analyzer",
      version: 1,
      exported_at: new Date().toISOString(),
      analyst: analyst || null,
      records: history,
    };
    const who = analyst ? "-" + analyst.replace(/[^\wก-๙]+/g, "") : "";
    download(`exit-interview${who}-${stamp()}.json`, JSON.stringify(pack, null, 2));
    toast(`ส่งออก ${history.length} รายการแล้ว`);
  };

  $("#exportHistoryCsv").onclick = () => {
    const rows = filteredHistory();
    if (!rows.length) return toast("ไม่มีรายการให้ส่งออก");
    download(`exit-interview-history-${stamp()}.csv`, resultsToCsv(rows), "text/csv");
  };

  $("#importHistory").onclick = () => $("#importFile").click();
  $("#importFile").addEventListener("change", async function () {
    const files = Array.from(this.files || []);
    this.value = "";
    if (!files.length) return;

    let added = 0, skipped = 0, bad = [];
    for (const f of files) {
      try {
        const data = JSON.parse(await f.text());
        // รับได้ทั้งไฟล์รูปแบบใหม่ (มี records) และไฟล์เก่าที่เป็นอาร์เรย์ล้วน
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.records) ? data.records : null);
        if (!list) throw new Error("ไม่ใช่ไฟล์ส่งออกของระบบนี้");
        const valid = list.filter((r) => r && r.summary && r.meta && r.summary.sentiment);
        if (!valid.length) throw new Error("ไม่พบรายการที่ใช้ได้");
        const res = await addHistory(valid);
        added += res.added;
        skipped += res.skipped;
      } catch (err) {
        bad.push(`${f.name}: ${err.message}`);
      }
    }

    const parts = [`รวมเข้ามา ${added} รายการ`];
    if (skipped) parts.push(`ข้ามที่ซ้ำ ${skipped}`);
    if (bad.length) parts.push(`อ่านไม่ได้ ${bad.length} ไฟล์`);
    toast(parts.join(" · "));
    if (bad.length) console.warn("import errors:", bad);
  });

  /* ------------------------------------------------------------------ */
  /* วิเคราะห์รายคน                                                      */
  /* ------------------------------------------------------------------ */

  const rawText = $("#rawText");
  let lastSingle = null;

  rawText.addEventListener("input", () => {
    $("#charCount").textContent = rawText.value.length.toLocaleString("th-TH") + " ตัวอักษร";
  });

  let importedMeta = null;   // ข้อมูลจากฟอร์มที่ไม่มีช่องกรอกในหน้า (ผู้สัมภาษณ์ วันที่)

  function metaFromForm() {
    return {
      analyst: analyst || null,
      interviewer: importedMeta ? importedMeta.interviewer : null,
      interview_date: importedMeta ? importedMeta.interview_date : null,
      employee_name: $("#m_name").value.trim() || null,
      employee_code: $("#m_code").value.trim() || null,
      department: $("#m_dept").value.trim() || null,
      position: $("#m_pos").value.trim() || null,
      tenure: $("#m_tenure").value.trim() || null,
      last_day: $("#m_lastday").value || null,
    };
  }

  $("#runSingle").addEventListener("click", async () => {
    const text = rawText.value.trim();
    if (text.length < 30) return toast("กรุณาใส่ข้อความบทสัมภาษณ์ให้ยาวกว่านี้");

    const meta = metaFromForm();
    const summary = E.analyze(text, meta, getLexicon());
    lastSingle = { meta, summary, at: new Date().toISOString(), source: "single", raw_text: text };

    $("#singleOut").innerHTML = renderSummary(summary, meta);
    $("#singleActions").hidden = false;

    if ($("#saveHistory").checked) {
      const res = await addHistory([lastSingle]);
      toast(res.added ? "วิเคราะห์เสร็จ และบันทึกแล้ว"
                      : "วิเคราะห์เสร็จ — รายการนี้มีอยู่แล้ว จึงไม่บันทึกซ้ำ");
    } else {
      toast("วิเคราะห์เสร็จแล้ว");
    }
  });

  $("#clearSingle").onclick = () => {
    rawText.value = "";
    rawText.dispatchEvent(new Event("input"));
    ["m_name", "m_code", "m_dept", "m_pos", "m_tenure", "m_lastday"].forEach((id) => { $("#" + id).value = ""; });
    importedMeta = null;
    $("#singleOut").innerHTML = `<div class="empty"><span class="empty-icon">📋</span>
      <p>ยังไม่มีผลวิเคราะห์</p><small>ใส่ข้อความทางซ้าย แล้วกด “วิเคราะห์”</small></div>`;
    $("#singleActions").hidden = true;
    lastSingle = null;
  };

  $("#copyResult").onclick = async () => {
    if (!lastSingle) return;
    const txt = summaryToText(lastSingle.summary, lastSingle.meta);
    try {
      await navigator.clipboard.writeText(txt);
      toast("คัดลอกแล้ว");
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("คัดลอกแล้ว");
    }
  };

  $("#downloadJson").onclick = () => {
    if (!lastSingle) return;
    download(`exit-interview-${stamp()}.json`, JSON.stringify(lastSingle, null, 2));
  };

  /* ------------------------------------------------------------------ */
  /* อ่านไฟล์                                                            */
  /* ------------------------------------------------------------------ */

  function wireDrop(zone, input, handler, multi) {
    ["dragenter", "dragover"].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("is-over"); }));
    zone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files;
      if (f && f.length) handler(multi ? Array.from(f) : f[0]);
    });
    input.addEventListener("change", function () {
      if (this.files.length) { handler(multi ? Array.from(this.files) : this.files[0]); this.value = ""; }
    });
  }

  /** เติมข้อมูลพนักงานที่อ่านได้จากฟอร์มลงในช่องกรอก */
  function applyMeta(m) {
    const map = { m_name: m.employee_name, m_code: m.employee_code, m_dept: m.department,
                  m_pos: m.position, m_tenure: m.tenure };
    Object.keys(map).forEach((id) => { if (map[id]) $("#" + id).value = map[id]; });
    if (m.last_day) $("#m_lastday").value = m.last_day;
    $("#metaDetails").open = true;   // เปิดให้เห็นว่าระบบกรอกอะไรให้บ้าง จะได้ตรวจได้
  }

  wireDrop($("#dropzone"), $("#fileInput"), async (file) => {
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        if (typeof XLSX === "undefined") {
          return toast("อ่าน .xlsx ไม่ได้ในโหมดออฟไลน์ — ให้ Save As เป็น .txt ก่อน หรือเปิดหน้านี้ผ่านเซิร์ฟเวอร์");
        }
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const form = parseFormWorkbook(wb.Sheets[wb.SheetNames[0]]);
        if (!form) {
          return toast("ไฟล์นี้ไม่ใช่ฟอร์มสัมภาษณ์ — ถ้าเป็นตารางรวมหลายคน ให้ใช้แท็บ “ทั้งไฟล์”");
        }
        if (form.text.length < 40) {
          return toast("ฟอร์มนี้ยังไม่ได้กรอกคำตอบ");
        }
        importedMeta = form.meta;
        rawText.value = form.text;
        applyMeta(form.meta);
        rawText.dispatchEvent(new Event("input"));
        return toast(`อ่านฟอร์มของ ${form.meta.employee_name || file.name} แล้ว — กดวิเคราะห์ได้เลย`);
      }

      importedMeta = null;
      rawText.value = await file.text();
      rawText.dispatchEvent(new Event("input"));
      toast("อ่านไฟล์ " + file.name + " แล้ว");
    } catch (err) {
      toast("อ่านไฟล์ไม่สำเร็จ: " + err.message);
    }
  });
  $("#browseBtn").onclick = () => $("#fileInput").click();

  /** ตัวอ่าน CSV/TSV ในตัว — ไม่พึ่งไลบรารีภายนอก ใช้ได้แม้เปิดแบบออฟไลน์ */
  function parseDelimited(text, delimiter) {
    text = text.replace(/^﻿/, "");
    if (!delimiter) {
      const head = text.slice(0, 2000);
      delimiter = (head.split("\t").length > head.split(",").length) ? "\t" : ",";
    }
    const rows = [];
    let row = [], field = "", quoted = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += c;
      } else if (c === '"') {
        quoted = true;
      } else if (c === delimiter) {
        row.push(field); field = "";
      } else if (c === "\n") {
        row.push(field); field = ""; rows.push(row); row = [];
      } else if (c !== "\r") {
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }

    const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
    if (!nonEmpty.length) return [];
    const headers = nonEmpty[0].map((h, i) => String(h).trim() || `คอลัมน์ ${i + 1}`);
    return nonEmpty.slice(1).map((r) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i] == null ? "" : String(r[i]).trim(); });
      return o;
    });
  }

  /* ------------------------------------------------------------------ */
  /* ทั้งไฟล์                                                            */
  /* ------------------------------------------------------------------ */

  let batchRows = [], batchHeaders = [], batchResults = [], batchAgg = null;

  if (typeof XLSX === "undefined") {
    $("#xlsxNote").innerHTML = '<span class="muted">(.xlsx ต้องต่อเน็ตครั้งแรก — ตอนนี้ใช้ได้เฉพาะ CSV กรุณา Save As เป็น CSV UTF-8)</span>';
    $("#batchFile").accept = ".csv,.tsv";
  }

  /* ---- ฟอร์มสัมภาษณ์ของบริษัท (1 ไฟล์ = 1 คน) ----------------------
     โครงฟอร์ม: คอลัมน์คำถามอยู่ซ้าย ถัดมาเป็น "คำตอบ" และ "Comment"
     แต่ละหมวดใช้ merged cell ครอบคำตอบไว้ช่องเดียว
     สิ่งสำคัญคือ *ห้าม* เอาข้อความคำถามไปวิเคราะห์ เพราะคำถามในแม่แบบ
     มีคำอย่าง "หัวหน้า" "เพื่อนร่วมงาน" "ลาออก" อยู่แล้วทุกไฟล์
     ถ้านับด้วยจะได้ผลเหมือนกันหมดทุกคน จึงเก็บเฉพาะคำตอบกับ Comment */

  const QUESTION_TAIL = /(?:ไหม|มั้ย|อะไร|หรือไม่|ยังไง|อย่างไร|เท่าไหร่|เพราะอะไร)\s*[?？]?\s*$/;
  const looksLikeQuestion = (t) => QUESTION_TAIL.test(t);

  function parseFormWorkbook(ws) {
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: true })
      .map((r) => (r || []).map((c) => String(c == null ? "" : c).trim()));

    // แถวหัวหมวดคือแถวที่มีทั้งคำว่า "คำตอบ" และ "Comment"
    const heads = [];
    grid.forEach((r, i) => {
      const ansCol = r.findIndex((c) => /^คำตอบ$/.test(c));
      const comCol = r.findIndex((c) => /^comment$/i.test(c));
      if (ansCol !== -1 && comCol !== -1) {
        heads.push({ row: i, ansCol, comCol, name: r.slice(0, ansCol).filter(Boolean).pop() || "หมวด" });
      }
    });
    if (heads.length < 2) return null;          // ไม่ใช่ฟอร์มแบบนี้ ให้ไปเข้าทางตารางแทน

    /* ---- ข้อมูลพนักงานจากส่วนหัว ---- */
    const metaCells = [];
    for (let r = 0; r < heads[0].row; r++) (grid[r] || []).forEach((c) => { if (c) metaCells.push(c); });
    const pick = (...labels) => {
      for (const lb of labels) {
        for (const t of metaCells) {
          if (t.indexOf(lb) === 0) {
            const v = t.slice(lb.length).replace(/^[\s:：\-–]+/, "").trim();
            if (v) return v;
          }
        }
      }
      return null;
    };
    const name = pick("ชื่อ-นามสกุล", "ชื่อ-สกุล", "ชื่อพนักงาน");
    const nick = pick("ชื่อเล่น");
    const dept = pick("แผนก");
    const division = pick("ฝ่าย");

    /* ---- เนื้อหาแต่ละหมวด ---- */
    const blocks = [];
    heads.forEach((h, i) => {
      const end = i + 1 < heads.length ? heads[i + 1].row : grid.length;
      const answers = [], comments = [];
      for (let r = h.row + 1; r < end; r++) {
        const a = (grid[r] || [])[h.ansCol] || "";
        const c = (grid[r] || [])[h.comCol] || "";
        if (a) answers.push(a);
        if (c) comments.push(c);
      }
      if (!answers.length && !comments.length) return;
      // ขึ้นต้นด้วย "ถาม:" เพื่อให้ตัววิเคราะห์ข้ามชื่อหมวดไป ไม่เอาไปนับคะแนน
      blocks.push("ถาม: " + h.name
        + (answers.length ? "\nตอบ: " + answers.join("\n") : "")
        + (comments.length ? "\nบันทึกผู้สัมภาษณ์: " + comments.join("\n") : ""));
    });

    /* ---- ช่องเขียนอิสระท้ายฟอร์ม (merged cell ที่กินหลายแถว) ---- */
    const labelCol = Math.max(0, heads[0].ansCol - 1);
    const lastHeadRow = heads[heads.length - 1].row;
    (ws["!merges"] || []).forEach((m) => {
      if (m.s.c !== labelCol || m.e.r - m.s.r < 1 || m.s.r <= lastHeadRow) return;
      const v = (grid[m.s.r] || [])[labelCol] || "";
      if (v && !looksLikeQuestion(v)) blocks.push("ตอบ: " + v);
    });

    return {
      meta: {
        employee_name: name ? (nick ? `${name} (${nick})` : name) : null,
        employee_code: pick("รหัสพนักงาน", "รหัส"),
        department: [dept, division].filter(Boolean).join(" / ") || null,
        position: pick("ตำแหน่ง"),
        tenure: pick("อายุงาน"),
        last_day: null,
        interviewer: pick("ผู้สอบถาม", "ผู้สัมภาษณ์"),
        interview_date: pick("วันที่"),
      },
      text: blocks.join("\n\n"),
      sections: heads.length,
    };
  }

  /* ---- รับไฟล์: แยกเองว่าเป็นฟอร์มบริษัทหรือตารางรวม ---- */

  let formFiles = [];

  wireDrop($("#batchDrop"), $("#batchFile"), async (files) => {
    const forms = [], tables = [], failed = [];

    for (const file of files) {
      try {
        if (/\.(csv|tsv|txt)$/i.test(file.name)) {
          // อ่านเป็นข้อความเสมอ ไม่งั้น UTF-8 ภาษาไทยจะถูกตีความผิดเป็น Latin-1
          tables.push({ name: file.name, rows: parseDelimited(await file.text(), /\.tsv$/i.test(file.name) ? "\t" : null) });
          continue;
        }
        if (typeof XLSX === "undefined") {
          failed.push(`${file.name} — อ่าน .xlsx ไม่ได้ในโหมดออฟไลน์ ให้ Save As เป็น CSV UTF-8 ก่อน`);
          continue;
        }
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const form = parseFormWorkbook(ws);
        if (form) forms.push({ name: file.name, ...form });
        else tables.push({ name: file.name, rows: XLSX.utils.sheet_to_json(ws, { defval: "" }) });
      } catch (err) {
        failed.push(`${file.name} — ${err.message}`);
      }
    }

    $("#formBar").hidden = true;
    $("#batchMap").hidden = true;

    if (forms.length) {
      formFiles = forms;
      showFormBar(forms, tables.length, failed);
      return;
    }

    const table = tables.find((t) => t.rows && t.rows.length);
    if (!table) {
      return toast(failed.length ? failed[0] : "ไม่พบข้อมูลในไฟล์ที่เลือก");
    }
    if (tables.length > 1) toast(`ไฟล์ตารางรองรับทีละไฟล์ — ใช้ ${table.name}`);

    batchRows = table.rows;
    batchHeaders = Object.keys(table.rows[0]);
    buildColumnPickers();
    $("#batchMap").hidden = false;
    $("#batchInfo").textContent = `${table.rows.length} แถว · ${batchHeaders.length} คอลัมน์`;
    toast(`อ่าน ${table.name} แล้ว (${table.rows.length} แถว)`);
  }, true);

  $("#batchBrowse").onclick = () => $("#batchFile").click();

  function showFormBar(forms, tableCount, failed) {
    const usable = forms.filter((f) => f.text.length >= 40);
    const empty = forms.length - usable.length;

    $("#formInfo").innerHTML =
      `อ่านฟอร์มสัมภาษณ์ได้ <b>${usable.length} ไฟล์</b>`
      + (empty ? ` · ข้าม ${empty} ไฟล์ที่ยังไม่ได้กรอกคำตอบ` : "")
      + (tableCount ? ` · ข้ามไฟล์ตาราง ${tableCount} ไฟล์` : "")
      + (failed.length ? `<br>เปิดไม่ได้: ${esc(failed.join(" · "))}` : "");

    $("#formPreview").innerHTML = forms.map((f) => {
      const m = f.meta;
      const bits = [m.department, m.position, m.interviewer ? "ผู้สัมภาษณ์ " + m.interviewer : "",
        m.interview_date ? "วันที่ " + m.interview_date : ""].filter(Boolean);
      return `<div class="form-file">
        <b>${esc(m.employee_name || f.name)}</b>
        <div class="form-meta">${esc(f.name)}${bits.length ? " · " + esc(bits.join(" · ")) : ""}
          · ${f.sections} หมวด · ${f.text.length.toLocaleString("th-TH")} ตัวอักษร</div>
        ${f.text.length >= 40
          ? `<div class="form-text">${esc(f.text.slice(0, 400))}${f.text.length > 400 ? "…" : ""}</div>`
          : `<div class="form-bad">ไม่มีคำตอบในฟอร์มนี้ — ระบบจะข้ามไป</div>`}
      </div>`;
    }).join("");

    $("#runForms").disabled = !usable.length;
    $("#formBar").hidden = false;
    toast(`พบฟอร์มสัมภาษณ์ ${usable.length} ไฟล์`);
  }

  $("#runForms").addEventListener("click", async () => {
    const usable = formFiles.filter((f) => f.text.length >= 40);
    if (!usable.length) return toast("ไม่มีฟอร์มที่มีคำตอบให้วิเคราะห์");

    const lex = getLexicon();
    const at = new Date().toISOString();
    batchResults = usable.map((f) => {
      const meta = stampAnalyst(f.meta);
      return { meta, summary: E.analyze(f.text, meta, lex), at, source: "form", raw_text: f.text };
    });
    batchAgg = E.aggregate(batchResults);

    renderBatch(formFiles.length - usable.length);
    $("#batchResult").hidden = false;
    if ($("#formSaveHistory").checked) await addHistory(batchResults.slice());
    toast(`วิเคราะห์ ${usable.length} ไฟล์เสร็จแล้ว`);
  });

  function buildColumnPickers() {
    const guess = function () {
      const words = Array.prototype.slice.call(arguments);
      return batchHeaders.find((h) => words.some((w) => h.toLowerCase().indexOf(w) !== -1)) || "";
    };
    const pickers = {
      col_text: { req: true, g: guess("สัมภาษณ์", "ความเห็น", "เหตุผล", "บันทึก", "comment", "interview", "feedback", "remark", "detail", "note") },
      col_name: { req: false, g: guess("ชื่อ", "name") },
      col_code: { req: false, g: guess("รหัส", "code", "emp", "id") },
      col_dept: { req: false, g: guess("แผนก", "หน่วย", "ฝ่าย", "dept", "section", "shop", "division") },
      col_pos: { req: false, g: guess("ตำแหน่ง", "position", "title", "role") },
      col_tenure: { req: false, g: guess("อายุงาน", "tenure", "service", "year") },
    };
    Object.keys(pickers).forEach((id) => {
      const cfg = pickers[id], sel = $("#" + id);
      sel.innerHTML = (cfg.req ? "" : '<option value="">— ไม่ระบุ —</option>') +
        batchHeaders.map((h) => `<option value="${esc(h)}">${esc(h)}</option>`).join("");
      sel.value = cfg.g || (cfg.req ? batchHeaders[0] : "");
    });
  }

  $("#runBatch").addEventListener("click", async () => {
    const colText = $("#col_text").value;
    const pick = (row, id) => { const c = $("#" + id).value; return c ? (String(row[c] || "").trim() || null) : null; };

    const jobs = batchRows.map((row) => ({
      text: String(row[colText] || "").trim(),
      meta: {
        employee_name: pick(row, "col_name"),
        employee_code: pick(row, "col_code"),
        department: pick(row, "col_dept"),
        position: pick(row, "col_pos"),
        tenure: pick(row, "col_tenure"),
      },
    })).filter((j) => j.text.length >= 20);

    const skipped = batchRows.length - jobs.length;
    if (!jobs.length) return toast("ไม่พบแถวที่มีเนื้อหาสัมภาษณ์ยาวพอ (ต้องอย่างน้อย 20 ตัวอักษร)");

    const lex = getLexicon();
    const at = new Date().toISOString();
    batchResults = jobs.map((j) => {
      const meta = stampAnalyst(j.meta);
      return { meta, summary: E.analyze(j.text, meta, lex), at, source: "table", raw_text: j.text };
    });
    batchAgg = E.aggregate(batchResults);

    renderBatch(skipped);
    $("#batchResult").hidden = false;

    if ($("#batchSaveHistory").checked) await addHistory(batchResults.slice());
    toast(`วิเคราะห์ ${jobs.length} คนเสร็จแล้ว` + (skipped ? ` (ข้าม ${skipped} แถวที่เนื้อหาสั้นเกินไป)` : ""));
  });

  /** สร้าง HTML แดชบอร์ดจากผลชุดใดก็ได้ — ใช้ทั้งกับไฟล์ที่เพิ่งอัปโหลด
      และกับประวัติสะสมของทั้งทีมในแท็บประวัติ */
  function dashboardHTML(a, records, skipped) {
    const maxTheme = a.themes.length ? a.themes[0].affected : 1;
    const allRisks = [];
    records.forEach((r) => (r.summary.risk_flags || []).forEach((f) => {
      if (f.urgency === "high") allRisks.push({ f, who: r.meta.employee_name || r.meta.employee_code || "ไม่ระบุชื่อ" });
    }));

    return `
      <div class="stat-grid">
        <div class="stat"><div class="stat-num">${a.n}</div><div class="stat-label">วิเคราะห์แล้ว${skipped ? ` (ข้าม ${skipped})` : ""}</div></div>
        <div class="stat"><div class="stat-num">${Math.round((a.negative / a.n) * 100)}%</div><div class="stat-label">น้ำเสียงลบ / ผสม</div></div>
        <div class="stat"><div class="stat-num">${Math.round((a.preventable / a.n) * 100)}%</div><div class="stat-label">น่าจะรั้งไว้ได้</div></div>
        <div class="stat"><div class="stat-num">${allRisks.length}</div><div class="stat-label">ประเด็นเร่งด่วน</div></div>
      </div>

      <div class="res-block">
        <h3>สรุปภาพรวม</h3>
        <p class="res-summary">${esc(a.overview)}</p>
      </div>

      ${a.themes.length ? `
      <div class="res-block">
        <h3>ปัจจัยที่พบบ่อยที่สุด</h3>
        <div class="bars">
          ${a.themes.map((t) => `
            <div class="bar-row">
              <span>${esc(t.theme)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${(t.affected / maxTheme) * 100}%"></span></span>
              <span class="bar-val">${t.affected} คน</span>
            </div>
            <div class="quote">${esc(t.detail)}</div>
          `).join("")}
        </div>
      </div>` : ""}

      ${a.departments && a.departments.length ? `
      <div class="res-block">
        <h3>แยกตามหน่วยงาน</h3>
        <div class="table-scroll">
          <table class="dept-table">
            <thead><tr>
              <th>หน่วยงาน</th><th>ประเด็นเด่น</th>
              <th class="num">ลาออก</th><th class="num">น้ำเสียงลบ</th><th class="num">ธงแดง</th>
            </tr></thead>
            <tbody>
              ${a.departments.map((d) => `
                <tr>
                  <td><b>${esc(d.name)}</b></td>
                  <td>${esc(d.topCategory || "—")}</td>
                  <td class="num">${d.count}</td>
                  <td class="num">${d.negative || "—"}</td>
                  <td class="num ${d.risks ? "has-risk" : ""}">${d.risks || "—"}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>` : ""}

      ${allRisks.length ? `
      <div class="res-block">
        <h3>ประเด็นเร่งด่วนรวมทุกคน <em class="warn-note">ต้องสอบข้อเท็จจริงก่อนดำเนินการ</em></h3>
        ${allRisks.map((x) => `
          <div class="flag">
            <span>⚑</span>
            <span><b>${esc(x.f.label)} · ${esc(x.who)}</b>${esc(x.f.detail)}</span>
          </div>`).join("")}
      </div>` : ""}

      ${a.recommendations.length ? `
      <div class="res-block">
        <h3>ข้อเสนอแนะระดับองค์กร</h3>
        <ul class="actions-list">
          ${a.recommendations.map((r) => `
            <li><span class="chip ${r.priority === "high" ? "chip-danger" : "chip-warn"}">${esc(OWNERS[r.owner] || r.owner)}</span>
            <span>${esc(r.action)}</span></li>`).join("")}
        </ul>
      </div>` : ""}
    `;
  }

  function renderBatch(skipped) {
    $("#dashboard").innerHTML = dashboardHTML(batchAgg, batchResults, skipped);
    listState.q = "";
    listState.filter = "all";
    $("#batchSearch").value = "";
    renderFilters();
    renderPersonList();
    setTabCount("#tabCountBatch", batchResults.length);
  }

  /* ---- รายชื่อ: ค้นหา / เรียง / กรอง ------------------------------
     พอไฟล์เยอะ ๆ รายชื่อเรียงตามลำดับไฟล์ใช้งานไม่ได้จริง
     HR ต้องหาให้เจอก่อนว่า "ใครควรตามก่อน" จึงให้เรียงตามความรุนแรง
     เป็นค่าเริ่มต้น และกรองเฉพาะคนที่มีธงแดงได้ในคลิกเดียว */

  const listState = { q: "", sort: "severity", filter: "all" };

  const highRisks = (r) => (r.summary.risk_flags || []).filter((f) => f.urgency === "high").length;
  const isNegative = (r) => ["negative", "mixed"].indexOf(r.summary.sentiment.overall) !== -1;

  function renderFilters() {
    const withRisk = batchResults.filter((r) => highRisks(r) > 0).length;
    const prevent = batchResults.filter((r) => r.summary.preventable === "yes").length;
    const negative = batchResults.filter(isNegative).length;

    const depts = {};
    batchResults.forEach((r) => {
      const d = (r.meta.department || "").trim();
      if (d) depts[d] = (depts[d] || 0) + 1;
    });

    const items = [{ key: "all", label: "ทั้งหมด", n: batchResults.length }];
    if (withRisk) items.push({ key: "risk", label: "🚩 มีธงแดง", n: withRisk });
    if (prevent) items.push({ key: "preventable", label: "รั้งไว้ได้", n: prevent });
    if (negative) items.push({ key: "negative", label: "น้ำเสียงลบ / ผสม", n: negative });
    Object.keys(depts)
      .sort((a, b) => depts[b] - depts[a])
      .slice(0, 10)
      .forEach((d) => items.push({ key: "dept:" + d, label: d, n: depts[d] }));

    $("#batchFilters").innerHTML = items.map((it) =>
      `<button class="fchip ${listState.filter === it.key ? "is-on" : ""}" data-filter="${esc(it.key)}">${esc(it.label)} <b>${it.n}</b></button>`
    ).join("");
  }

  const SORTERS = {
    severity: (a, b) => b.sev - a.sev || b.risks - a.risks,
    risk: (a, b) => b.risks - a.risks || b.sev - a.sev,
    dept: (a, b) => String(a.r.meta.department || "ฮฮฮ").localeCompare(String(b.r.meta.department || "ฮฮฮ"), "th") || b.sev - a.sev,
    name: (a, b) => String(a.r.meta.employee_name || "ฮฮฮ").localeCompare(String(b.r.meta.employee_name || "ฮฮฮ"), "th"),
  };

  function renderPersonList() {
    let rows = batchResults.map((r, i) => {
      const top = (r.summary.reason_categories || [])[0];
      return { r, i, top, sev: top ? top.severity : 0, risks: highRisks(r) };
    });

    const f = listState.filter;
    if (f === "risk") rows = rows.filter((x) => x.risks > 0);
    else if (f === "preventable") rows = rows.filter((x) => x.r.summary.preventable === "yes");
    else if (f === "negative") rows = rows.filter((x) => isNegative(x.r));
    else if (f.indexOf("dept:") === 0) {
      const d = f.slice(5);
      rows = rows.filter((x) => String(x.r.meta.department || "").trim() === d);
    }

    const q = listState.q.trim().toLowerCase();
    if (q) rows = rows.filter((x) => JSON.stringify(x.r).toLowerCase().indexOf(q) !== -1);

    rows.sort(SORTERS[listState.sort] || SORTERS.severity);

    $("#listCount").textContent = rows.length === batchResults.length
      ? `${batchResults.length} คน`
      : `แสดง ${rows.length} จาก ${batchResults.length} คน`;

    if (!rows.length) {
      $("#batchList").innerHTML = `<div class="empty"><span class="empty-icon">🔍</span>
        <p>ไม่มีใครตรงกับเงื่อนไขนี้</p><small>ลองล้างคำค้นหรือกดตัวกรอง “ทั้งหมด”</small></div>`;
      return;
    }

    $("#batchList").innerHTML = rows.map((x, n) => {
      const s = x.r.summary, m = x.r.meta;
      const sent = SENTIMENT[s.sentiment.overall] || SENTIMENT.neutral;
      const sub = [m.department, m.position].filter(Boolean).join(" · ");
      return `
        <details class="person">
          <summary>
            <span class="person-num">${n + 1}</span>
            <span class="person-id">
              <b>${esc(m.employee_name || "แถว " + (x.i + 1))}</b>
              ${sub ? `<em>${esc(sub)}</em>` : ""}
            </span>
            <span class="person-reason">${esc(x.top ? x.top.label : "ไม่พบประเด็นเด่น")}</span>
            <span class="person-badges">
              ${x.top ? dots(x.top.severity) : ""}
              ${x.risks ? `<span class="badge-flag">🚩 ${x.risks}</span>` : ""}
              <span class="chip ${sent.cls}">${esc(sent.th)}</span>
            </span>
          </summary>
          <div class="batch-body">${renderSummary(s, m)}</div>
        </details>`;
    }).join("");
  }

  $("#batchSearch").addEventListener("input", function () {
    listState.q = this.value;
    renderPersonList();
  });
  $("#batchSort").addEventListener("change", function () {
    listState.sort = this.value;
    renderPersonList();
  });
  $("#batchFilters").addEventListener("click", (e) => {
    const btn = e.target.closest(".fchip");
    if (!btn) return;
    listState.filter = btn.dataset.filter;
    renderFilters();
    renderPersonList();
  });
  $("#toggleAll").addEventListener("click", function () {
    const items = $$("#batchList .person");
    const open = items.some((d) => !d.open);
    items.forEach((d) => { d.open = open; });
    this.textContent = open ? "ยุบทั้งหมด" : "กางทั้งหมด";
  });

  $("#exportJson").onclick = () => {
    if (!batchResults.length) return;
    download(`exit-interview-batch-${stamp()}.json`,
      JSON.stringify({ generated_at: new Date().toISOString(), overview: batchAgg, records: batchResults }, null, 2));
  };

  function resultsToCsv(records) {
    const rows = [["ชื่อ", "รหัสพนักงาน", "แผนก", "ตำแหน่ง", "อายุงาน", "ผู้วิเคราะห์", "วันที่บันทึก",
      "ประเด็นหลัก", "เหตุผลหลัก", "น้ำเสียง", "รั้งไว้ได้", "แนะนำองค์กรต่อ", "ยินดีกลับมา",
      "หมวดปัจจัย", "ประเด็นเฝ้าระวัง", "ข้อเสนอแนะ", "สรุปย่อ"]];
    records.forEach((r) => {
      const s = r.summary, m = r.meta;
      rows.push([
        m.employee_name, m.employee_code, m.department, m.position, m.tenure,
        m.analyst, r.at ? new Date(r.at).toLocaleDateString("th-TH") : "",
        s.headline, s.primary_reason,
        (SENTIMENT[s.sentiment.overall] || {}).th, YESNO[s.preventable],
        YESNO[s.would_recommend], YESNO[s.would_return],
        s.reason_categories.map((c) => `${c.label}(${c.severity})`).join(" | "),
        s.risk_flags.map((f) => `[${URGENCY[f.urgency]}] ${f.label}: ${f.detail}`).join(" | "),
        s.action_items.map((x) => `[${OWNERS[x.owner] || x.owner}] ${x.action}`).join(" | "),
        s.summary,
      ]);
    });
    return "﻿" + rows.map((r) =>
      r.map((c) => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  }

  $("#exportCsv").onclick = () => {
    if (!batchResults.length) return;
    download(`exit-interview-batch-${stamp()}.csv`, resultsToCsv(batchResults), "text/csv");
  };

  /* ------------------------------------------------------------------ */
  /* ตัวอย่าง                                                            */
  /* ------------------------------------------------------------------ */

  $("#fillSample").onclick = () => {
    $("#m_name").value = "สมชาย ใจดี";
    $("#m_code").value = "TMT-48213";
    $("#m_dept").value = "Assembly Shop — Line 2";
    $("#m_pos").value = "Team Leader";
    $("#m_tenure").value = "6 ปี 2 เดือน";
    rawText.value = `ถาม: อะไรคือเหตุผลหลักที่ตัดสินใจลาออกครับ
ตอบ: หลัก ๆ คือเรื่องความก้าวหน้าครับ ผมอยู่ตำแหน่ง TL มา 4 ปีแล้ว เห็นรุ่นน้องที่เข้าทีหลังได้ขึ้น GL ไปสองคน ผมถามหัวหน้าเรื่องเส้นทางอาชีพหลายรอบ ก็ได้คำตอบว่ารอไปก่อนทุกครั้ง ไม่เคยมีแผนที่ชัดเจน

ถาม: เรื่องค่าตอบแทนล่ะครับ
ตอบ: เงินเดือนถือว่าโอเคเมื่อเทียบกับที่อื่นในนิคม แต่ปีที่แล้วโบนัสลดลงเยอะ แล้วก็ไม่มีใครอธิบายเหตุผลให้ฟัง ที่ใหม่ให้เพิ่มประมาณ 15 เปอร์เซ็นต์ แต่ถ้าเรื่องความก้าวหน้าชัดเจน ผมก็อาจจะยังอยู่

ถาม: เรื่องภาระงานและ OT
ตอบ: ช่วงที่ยอดผลิตขึ้น เราทำ OT กันเกือบทุกวัน บางสัปดาห์ 6 วัน ปัญหาคือกำลังคนไม่พอมาสองปีแล้ว คนออกไปแล้วไม่เติม ทีมผมเหลือ 11 คนจาก 15 คน งานเท่าเดิม สุดท้ายพวกที่อยู่ก็เหนื่อยแล้วก็ทยอยออกตามกัน

ถาม: เรื่องหัวหน้างานและการสื่อสาร
ตอบ: หัวหน้าโดยตรงเป็นคนดีนะครับ แต่เขาไม่มีอำนาจตัดสินใจอะไร ทุกอย่างต้องรอข้างบน บางเรื่องเสนอไปเป็นเดือนก็เงียบ ผมเคยเสนอปรับ layout จุดวางชิ้นส่วนที่ station 4 เพราะพนักงานต้องเอี้ยวตัวหยิบตลอด ปวดหลังกันหลายคน เรื่องนี้ผมเสนอตั้งแต่ปีที่แล้ว ยังไม่มีอะไรเกิดขึ้น

ถาม: มีอะไรที่ประทับใจไหมครับ
ตอบ: เพื่อนร่วมงานดีมากครับ ทีมช่วยเหลือกันดี แล้วก็ระบบ training ตอนเข้าใหม่ดีจริง ๆ ผมได้ความรู้เรื่อง TPS เยอะมาก อันนี้ต้องยอมรับว่าที่นี่สอนดี

ถาม: ถ้ามีโอกาสจะกลับมาทำงานที่นี่อีกไหม
ตอบ: ถ้าเรื่องเส้นทางอาชีพชัดเจนกว่านี้ก็อาจจะกลับมาครับ ผมก็ยังแนะนำเพื่อนให้มาสมัครอยู่นะ แต่จะบอกตามตรงว่าอย่าหวังเรื่องโปรโมทเร็ว`;
    rawText.dispatchEvent(new Event("input"));
    toast("ใส่ตัวอย่างแล้ว — กดวิเคราะห์ได้เลย");
  };

  /* ------------------------------------------------------------------ */
  /* แท็บ                                                                */
  /* ------------------------------------------------------------------ */

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      $$("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
    });
  });

  /* ------------------------------------------------------------------ */

  // Ctrl/Cmd + Enter = วิเคราะห์ ไม่ต้องละมือจากคีย์บอร์ดไปหาปุ่ม
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
    const panel = $$("[data-panel]").find((p) => !p.hidden);
    if (panel && panel.dataset.panel === "single") {
      e.preventDefault();
      $("#runSingle").click();
    }
  });

  $("#emptySample").addEventListener("click", () => $("#fillSample").click());

  $("#printDate").textContent = new Date().toLocaleDateString("th-TH",
    { day: "numeric", month: "long", year: "numeric" });

  /* ---- เริ่มระบบ ------------------------------------------------- */

  function showApp(session) {
    const signedIn = Boolean(session);
    $("#gate").hidden = signedIn;
    $("#userChip").hidden = !signedIn;
    $("#logoutBtn").hidden = !signedIn;
    if (signedIn) {
      $("#userChip").textContent = session.user.email;
      loadHistory();
    } else {
      history = [];
      renderHistory();
    }
  }

  async function boot() {
    renderLexicon();

    if (!CLOUD) {
      // โหมดออฟไลน์ — ไม่ต้องล็อกอิน ข้อมูลอยู่ในเครื่องนี้เท่านั้น
      applyStorageState();
      if (window.Cloud && window.Cloud.configured && !window.Cloud.libReady) {
        toast("ตั้งค่า Supabase ไว้แล้ว แต่โหลดไลบรารีไม่ได้ — กำลังทำงานแบบออฟไลน์");
      }
      await loadHistory();
      return;
    }

    $("#modeChip").className = "chip chip-info";
    $("#modeChip").textContent = "👥 ใช้งานร่วมกันทั้งทีม";
    $("#modeChip").title = "ประวัติเก็บในฐานข้อมูลกลาง ทุกคนในทีมเห็นร่วมกัน";
    $("#teamHint").innerHTML =
      "ประวัติทั้งหมดอยู่ในฐานข้อมูลกลาง <b>ทุกคนในทีมเห็นข้อมูลชุดเดียวกันทันที</b> ไม่ต้องส่งไฟล์หากัน " +
      "· ปุ่มส่งออก/นำเข้ายังใช้ได้สำหรับสำรองข้อมูล หรือดึงงานเก่าจากเครื่องที่เคยใช้โหมดออฟไลน์เข้ามารวม " +
      "· ปุ่มล้างจะลบเฉพาะรายการที่คุณสร้างเอง";

    Cloud.onAuthChange(showApp);
    showApp(await Cloud.currentSession());
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#loginError");
    err.hidden = true;
    const btn = $("#loginBtn");
    btn.disabled = true;
    try {
      await Cloud.signIn($("#loginEmail").value.trim(), $("#loginPassword").value);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("#logoutBtn").onclick = async () => { await Cloud.signOut(); location.reload(); };

  boot();
})();
