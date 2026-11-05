/* ============================================================================
   engine.js — เครื่องมือวิเคราะห์บทสัมภาษณ์พนักงานลาออก (Exit Interview)

   ทำงานในเบราว์เซอร์ล้วน ไม่เรียกเซิร์ฟเวอร์ ไม่ใช้ API ข้อมูลไม่ออกจากเครื่อง
   วิธีวิเคราะห์คือการจับคู่คำสำคัญภาษาไทย + ให้น้ำหนักตามคำขยายความรุนแรง
   + ตรวจการปฏิเสธ (ไม่/ไม่ได้) แล้วสกัดประโยคที่เกี่ยวข้องออกมาเป็นหลักฐาน

   ข้อจำกัดที่ต้องรู้: ระบบนี้ "จับคำ" ไม่ได้ "เข้าใจบริบท"
   เช่น ประโยคประชด หรือกรณีที่พนักงานพูดเหตุผลบังหน้าไว้ ระบบจะจับไม่ได้
   ผลลัพธ์จึงเป็นตัวช่วยร่างรายงาน ไม่ใช่ข้อสรุปสุดท้าย — HR ต้องอ่านต้นฉบับเสมอ
   ========================================================================== */

(function (global) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 1. พจนานุกรมหมวดปัจจัย                                              */
  /* ------------------------------------------------------------------ */

  const CATEGORIES = {
    compensation: {
      label: "ค่าตอบแทน / สวัสดิการ",
      kw: ["เงินเดือน", "ค่าจ้าง", "ค่าตอบแทน", "โบนัส", "ขึ้นเงิน", "ปรับเงิน", "ปรับฐาน",
        "สวัสดิการ", "เบี้ยขยัน", "ค่ากะ", "ค่าครองชีพ", "ค่าอาหาร", "ประกันสุขภาพ",
        "ประกันกลุ่ม", "กองทุนสำรอง", "เงินไม่พอ", "รายได้", "ค่าแรง", "ค่าตำแหน่ง",
        "ที่ใหม่ให้", "ได้เพิ่ม", "salary", "bonus", "incentive", "benefit", "allowance"],
      action: { owner: "hr", text: "เทียบโครงสร้างค่าตอบแทนและสวัสดิการกับที่อื่นในพื้นที่ แล้วอธิบายวิธีคิดโบนัสให้พนักงานเข้าใจตรงกัน" },
    },
    career_growth: {
      label: "ความก้าวหน้า / โอกาสเติบโต",
      kw: ["ความก้าวหน้า", "ก้าวหน้า", "เส้นทางอาชีพ", "career", "โปรโมท", "เลื่อนตำแหน่ง",
        "เลื่อนขั้น", "ขึ้นตำแหน่ง", "ตำแหน่งเดิม", "ไม่โต", "ทางตัน", "ตำแหน่งตัน", "อนาคต", "โอกาสเติบโต", "ไม่มีโอกาส",
        "รุ่นน้องได้", "รอไปก่อน", "ไม่มีแผน", "ไม่เห็นอนาคต", "อยู่มานาน", "promotion", "growth"],
      action: { owner: "hr", text: "เขียนเส้นทางความก้าวหน้าของแต่ละตำแหน่งเป็นลายลักษณ์อักษร ระบุเกณฑ์เลื่อนขั้นและกรอบเวลา" },
    },
    management: {
      label: "หัวหน้างาน / การบริหาร",
      kw: ["หัวหน้า", "ผู้จัดการ", "ผจก", "ซุปเปอร์ไวเซอร์", "supervisor", "manager", "ผู้บังคับบัญชา",
        "ข้างบน", "ผู้บริหาร", "สั่งงาน", "ไม่รับฟัง", "ไม่ฟัง", "ไม่ตอบ", "เงียบ", "ไม่สื่อสาร",
        "ไม่ชัดเจน", "ไม่มีอำนาจ", "ตัดสินใจช้า", "เสนอไปแล้ว", "ไม่เคยแก้", "ลำเอียง", "เส้นสาย",
        "ระบบพวกพ้อง", "ไม่ยุติธรรม", "ไม่แฟร์", "leadership"],
      action: { owner: "line_manager", text: "อบรมทักษะการสื่อสารและการรับฟังให้หัวหน้างาน และกำหนดว่าข้อเสนอของพนักงานต้องได้คำตอบกลับภายในกี่วัน" },
    },
    culture: {
      label: "เพื่อนร่วมงาน / วัฒนธรรมองค์กร",
      kw: ["เพื่อนร่วมงาน", "เพื่อน", "ทีม", "บรรยากาศ", "วัฒนธรรม", "การเมือง", "นินทา",
        "แบ่งพวก", "ไม่ช่วยเหลือ", "ตัวใครตัวมัน", "เข้ากันไม่ได้", "มีปัญหากับ", "ขัดแย้ง",
        "ทะเลาะ", "culture", "teamwork"],
      action: { owner: "hr", text: "สำรวจบรรยากาศการทำงานในหน่วยงานที่พบปัญหา แล้วหาจังหวะให้ทีมได้ทำงานร่วมกันนอกเหนือจากงานประจำ" },
    },
    workload: {
      label: "ภาระงาน / กำลังคน",
      kw: ["ภาระงาน", "งานหนัก", "งานเยอะ", "งานล้น", "ทำไม่ทัน", "กำลังคน", "คนไม่พอ",
        "ขาดคน", "ไม่เติมคน", "คนออก", "งานเท่าเดิม", "ทำหลายหน้าที่", "รับผิดชอบเยอะ",
        "เป้าสูง", "เป้าการขาย", "คิวจอง", "คิวยาว", "จำนวนคันต่อวัน", "แบกงาน", "workload"],
      action: { owner: "management", text: "เทียบอัตรากำลังของหน่วยงานกับปริมาณงานจริง แล้วเร่งเติมอัตราที่ว่างก่อนจะมีคนลาออกตามกันไปอีก" },
    },
    work_life_balance: {
      label: "เวลาทำงาน / วันหยุด / สมดุลชีวิต",
      kw: ["โอที", "ล่วงเวลา", "อยู่เกินเวลา", "เลิกงานดึก", "เข้าเสาร์", "เข้าอาทิตย์",
        "ทำงาน 6 วัน", "ทำงานทุกวัน", "ไม่มีวันหยุด", "วันหยุด", "ลาไม่ได้", "ไม่ได้พัก",
        "เวลาส่วนตัว", "ครอบครัวไม่ได้เจอ", "กลับดึก", "ปิดร้านดึก", "work life", "overtime"],
      action: { owner: "management", text: "จัดตารางเวรและเวลาล่วงเวลาให้อยู่ในระดับที่ทำได้ทั้งปี อย่าใช้การอยู่เกินเวลาแทนกำลังคนที่ขาด" },
    },
    safety_environment: {
      label: "ความปลอดภัย / สภาพแวดล้อม",
      kw: ["ความปลอดภัย", "ไม่ปลอดภัย", "อุบัติเหตุ", "บาดเจ็บ", "เจ็บ", "ปวดหลัง", "ปวดเมื่อย",
        "ปวดไหล่", "ปวดเข่า", "ท่าทาง", "เอี้ยวตัว", "ยกของหนัก", "ฝุ่น", "เสียงดัง", "ร้อน",
        "สารเคมี", "ทินเนอร์", "ไอระเหย", "กลิ่น", "แพ้", "หน้ากาก", "อุปกรณ์ป้องกัน", "เซฟตี้",
        "ห้องพ่นสี", "ดูดอากาศ", "ระบายอากาศ", "ลิฟต์ยกรถ", "รถยก", "แสงสว่าง", "ห้องน้ำ"],
      action: { owner: "safety", text: "ให้ผู้รับผิดชอบความปลอดภัยลงตรวจพื้นที่ที่ถูกกล่าวถึง ทั้งช่องซ่อม ห้องพ่นสี และคลังอะไหล่ ดูการยศาสตร์ของจุดทำงานและความพร้อมของอุปกรณ์ป้องกันส่วนบุคคล" },
    },
    training: {
      label: "การฝึกอบรม / ระบบงาน",
      kw: ["อบรม", "ฝึกอบรม", "training", "สอนงาน", "ไม่มีคนสอน", "ไม่ได้เรียนรู้", "ไม่ได้พัฒนา",
        "ทำงานซ้ำ", "งานเดิม", "ไม่ท้าทาย", "ระบบงาน", "ขั้นตอนเยอะ", "เอกสารเยอะ", "ระบบล้าสมัย",
        "โปรแกรม", "เครื่องมือไม่พอ", "ใบรับรอง", "อบรมเทคนิค", "skill"],
      action: { owner: "training", text: "วางแผนพัฒนาทักษะรายคนและหมุนงานให้ได้เจองานใหม่ จะได้ไม่รู้สึกว่าทำอยู่อย่างเดิมทุกวัน" },
    },
    commute: {
      label: "การเดินทาง / ที่ตั้งสาขา",
      factual: true,
      kw: ["เดินทาง", "รถรับส่ง", "รถบัส", "ระยะทาง", "ไกลบ้าน", "ใกล้บ้าน", "ค่าน้ำมัน",
        "รถติด", "ย้ายบ้าน", "ย้ายที่อยู่", "ขับรถ", "หอพัก", "ที่พัก", "commute"],
      action: { owner: "hr", text: "ดูค่าเดินทางและที่จอดรถสำหรับคนที่บ้านไกลสาขา ถ้ามีสาขาใกล้บ้านกว่าก็พิจารณาย้ายให้" },
    },
    policy: {
      label: "นโยบาย / กฎระเบียบ",
      kw: ["นโยบาย", "กฎระเบียบ", "ระเบียบ", "กฎ", "ขั้นตอน", "ตอกบัตร", "สแกนนิ้ว", "มาสาย", "เข้างานสาย",
        "ลงโทษ", "หักเงิน", "ใบเตือน", "ประเมินผล", "kpi", "vdqi", "การประเมิน", "ไม่โปร่งใส", "policy"],
      action: { owner: "hr", text: "รื้อกฎระเบียบและเกณฑ์ประเมินที่พนักงานมองว่าไม่โปร่งใส แล้วบอกเหตุผลเบื้องหลังของแต่ละข้อ" },
    },
    new_job_offer: {
      label: "ได้งานใหม่ / ข้อเสนอที่ดีกว่า",
      factual: true,
      kw: ["ได้งานใหม่", "ที่ใหม่", "บริษัทใหม่", "งานใหม่", "ข้อเสนอ", "offer", "เรียกสัมภาษณ์",
        "รับเข้าทำงาน", "เริ่มงานที่ใหม่", "ย้ายงาน"],
      action: { owner: "hr", text: "เก็บข้อมูลว่าที่อื่นในพื้นที่เสนออะไรเหนือกว่า เอามาปรับข้อเสนอสำหรับพนักงานกลุ่มที่เสี่ยงจะออก" },
    },
    education: {
      label: "ศึกษาต่อ",
      factual: true,
      kw: ["เรียนต่อ", "ศึกษาต่อ", "ปริญญาโท", "ปริญญาตรี", "สอบเข้า", "ติวสอบ", "สอบราชการ",
        "สอบบรรจุ", "เรียนหนังสือ"],
      action: { owner: "hr", text: "พิจารณานโยบายสนับสนุนการเรียนต่อหรือการลาไปศึกษา เพื่อไม่ให้เสียคนที่มีศักยภาพไปถาวร" },
    },
    personal: {
      label: "ส่วนตัว / ครอบครัว / สุขภาพ",
      factual: true,
      kw: ["ครอบครัว", "พ่อแม่", "ลูกสาว", "ลูกชาย", "เลี้ยงลูก", "ดูแลลูก", "ตั้งท้อง", "ตั้งครรภ์", "คลอด", "ดูแลพ่อ", "ดูแลแม่",
        "สามี", "ภรรยา", "ย้ายตาม", "ย้ายไปอยู่", "สุขภาพ", "ป่วย", "โรคประจำตัว", "ผ่าตัด",
        "รักษาตัว", "กลับบ้านเกิด", "ทำธุรกิจ", "ทำกิจการ", "ค้าขาย", "ไปหาหมอ", "หมอบอก", "พบแพทย์",
        "ทางบ้าน", "ที่บ้าน", "กลับไปช่วย", "กลับไปดูแล", "ช่วยที่บ้าน", "กลับไปอยู่บ้าน",
        "พ่ออายุ", "แม่อายุ", "พ่อป่วย", "แม่ป่วย", "คนแก่", "ดูแลครอบครัว", "ภาระที่บ้าน"],
      action: { owner: "hr", text: "บันทึกไว้ดูแนวโน้ม และดูว่ารูปแบบการทำงานยืดหยุ่นให้ได้แค่ไหน แม้องค์กรจะควบคุมเหตุผลส่วนตัวได้จำกัด" },
    },
    other: { label: "อื่น ๆ", kw: [], action: null },
  };

  /* ------------------------------------------------------------------ */
  /* 2. พจนานุกรมประเด็นเฝ้าระวัง                                        */
  /* ------------------------------------------------------------------ */

  const RISKS = {
    harassment: {
      label: "การคุกคาม / กลั่นแกล้ง",
      urgency: "high",
      kw: ["คุกคาม", "ลวนลาม", "กลั่นแกล้ง", "บูลลี่", "ข่มขู่", "ตะคอก", "ด่า", "ดูถูก",
        "ประจาน", "พูดจาหยาบคาย", "หยาบคาย", "ทำร้าย", "ผลัก", "ขว้างของ", "เหยียด"],
    },
    discrimination: {
      label: "การเลือกปฏิบัติ",
      urgency: "high",
      kw: ["เลือกปฏิบัติ", "ลำเอียง", "สองมาตรฐาน", "เส้นสาย", "ระบบพวกพ้อง", "เหยียด",
        "ไม่ให้โอกาสเพราะ", "เพราะเป็นผู้หญิง", "เพราะเป็นผู้ชาย", "เพราะอายุ"],
    },
    safety: {
      label: "ความปลอดภัยในการทำงาน",
      urgency: "high",
      kw: ["อุบัติเหตุ", "บาดเจ็บ", "ไม่ปลอดภัย", "เกือบโดน", "ไฟไหม้", "สารเคมี", "สารระเหย",
        "แพ้", "ปวดหลัง", "ปวดเมื่อย", "หน้ากากไม่พอ", "อุปกรณ์ป้องกัน", "ของหมด", "เครื่องเก่า",
        "เครื่องเสีย", "การ์ดเซฟตี้", "ฝุ่น", "เสียงดัง"],
    },
    wage: {
      label: "ค่าจ้าง / OT / กฎหมายแรงงาน",
      urgency: "high",
      kw: ["ไม่จ่าย", "ค้างจ่าย", "จ่ายช้า", "หักเงิน", "ไม่ได้ค่าล่วงเวลา", "โอทีไม่ได้",
        "ot ไม่ได้", "ไม่ได้โอที", "ต่ำกว่าค่าแรงขั้นต่ำ", "กฎหมายแรงงาน", "ประกันสังคม",
        "ไม่ได้วันหยุด", "ลาป่วยไม่ได้", "ไม่ให้ลา", "บังคับทำ"],
    },
    burnout: {
      label: "ภาวะหมดไฟ / สุขภาพจิต",
      urgency: "medium",
      kw: ["เครียด", "หมดไฟ", "burnout", "ซึมเศร้า", "นอนไม่หลับ", "ทนไม่ไหว", "ท้อ", "หมดกำลังใจ",
        "กดดันมาก", "สุขภาพจิต", "แพนิค", "ร้องไห้", "เหนื่อยมาก", "พังแล้ว"],
    },
    compliance: {
      label: "การปฏิบัติตามกฎระเบียบ",
      urgency: "medium",
      kw: ["ร้องเรียน", "แจ้งความ", "ฟ้อง", "ทนาย", "แรงงานจังหวัด", "สหภาพ", "ตรวจสอบ",
        "ทุจริต", "โกง", "ปลอมเอกสาร", "เซ็นแทน"],
    },
  };

  /* ------------------------------------------------------------------ */
  /* 3. คำขยาย / คำบอกอารมณ์                                             */
  /* ------------------------------------------------------------------ */

  const INTENSIFIERS = ["มากๆ", "มาก ๆ", "มาก", "ที่สุด", "เหลือเกิน", "สุดๆ", "สุด ๆ", "หลัก",
    "ทนไม่ไหว", "ทนไม่ได้", "รับไม่ได้", "เยอะ", "ตลอด", "ทุกวัน", "ทุกครั้ง", "บ่อย", "ประจำ",
    "เรื้อรัง", "หนัก", "หลายรอบ", "หลายครั้ง", "ซ้ำ ๆ", "ซ้ำๆ", "ตั้งแต่ปีที่แล้ว", "สองปี", "หลายปี"];

  const POSITIVE = ["ดีมาก", "ดีจริง", "ประทับใจ", "ชอบ", "ขอบคุณ", "อบอุ่น", "ช่วยเหลือ",
    "น่ารัก", "สนุก", "ได้เรียนรู้", "ได้ความรู้", "ภูมิใจ", "พอใจ", "เยี่ยม", "สอนดี",
    "ดูแลดี", "เป็นกันเอง", "โอเค", "ไม่มีปัญหา", "แนะนำ", "ดี"];

  const NEGATIVE = ["ไม่ดี", "แย่", "เบื่อ", "เหนื่อย", "เครียด", "ท้อ", "ผิดหวัง", "ไม่ไหว",
    "ทนไม่ไหว", "น้อยใจ", "ไม่แฟร์", "ไม่ยุติธรรม", "กดดัน", "ปัญหา", "ไม่พอใจ", "ไม่สนใจ",
    "เงียบ", "ไม่ตอบ", "ช้า", "ปวด", "เจ็บ", "ลำเอียง", "ด่า", "ไม่เคยแก้",
    "หมดกำลังใจ", "เสียใจ", "ไม่คุ้ม", "ไม่พอ", "ไม่ทัน", "ไม่ชัดเจน"];

  const NEGATORS = ["ไม่", "มิได้", "ไม่ได้", "ไม่มี", "ไม่ค่อย", "ไม่ใช่"];

  /* หมวดที่องค์กรแก้ไขได้เอง — ใช้ประเมินว่า "รั้งไว้ได้ไหม" */
  const CONTROLLABLE = ["compensation", "career_growth", "management", "culture", "workload",
    "work_life_balance", "safety_environment", "training", "policy"];

  /* ------------------------------------------------------------------ */
  /* 4. ยูทิลิตี้ข้อความ                                                 */
  /* ------------------------------------------------------------------ */

  const norm = (s) => String(s || "").replace(/​/g, "").replace(/[ \t]+/g, " ");

  /** หาตำแหน่งทุกครั้งที่พบคำ พร้อมบอกว่าถูกปฏิเสธด้วย "ไม่" นำหน้าหรือไม่ */
  const SHORT_LATIN = /^[a-z0-9]{1,3}$/;
  const isLatin = (ch) => ch !== undefined && /[a-z0-9]/.test(ch);

  function findAll(haystack, needle) {
    const hits = [];
    if (!needle) return hits;
    const h = haystack.toLowerCase();
    const n = needle.toLowerCase();
    const strict = SHORT_LATIN.test(n);   // "ot", "gl", "tl", "ppe" ...
    let i = h.indexOf(n);
    while (i !== -1) {
      // คำอังกฤษสั้นต้องมีขอบเขตคำ ไม่งั้น "ot" จะไปจับกลางคำว่า "toyota"
      const bounded = !strict || (!isLatin(h[i - 1]) && !isLatin(h[i + n.length]));
      if (bounded) {
        const before = h.slice(Math.max(0, i - 14), i);
        hits.push({ index: i, negated: NEGATORS.some((g) => before.includes(g)) });
      }
      i = h.indexOf(n, i + n.length);
    }
    return hits;
  }

  /** ซอยท่อนที่ยาวเกินไปให้เป็นวลีสั้น ๆ ที่ขอบเขตช่องว่าง
      จำเป็นสำหรับข้อความที่มาจากช่องเซลล์ Excel ซึ่งมักเป็นย่อหน้าเดียวยาว ๆ
      ไม่มีจุดและไม่มีการขึ้นบรรทัด ถ้าไม่ซอย ท่อนเดียวจะมีทั้งคำชมและคำบ่นปนกัน
      จนการให้คะแนนอารมณ์ระดับประโยคใช้ไม่ได้ */
  function chunkLong(s, target) {
    target = target || 95;
    if (s.length <= target * 1.4) return [s];

    const out = [];
    let cur = "";
    s.split(" ").forEach((w) => {
      if (cur && (cur.length + 1 + w.length) > target) { out.push(cur); cur = w; }
      else cur = cur ? cur + " " + w : w;
    });
    if (cur) out.push(cur);

    // ข้อความไทยบางชุดแทบไม่มีช่องว่างเลย ต้องตัดตามจำนวนอักขระเป็นทางสุดท้าย
    const final = [];
    out.forEach((piece) => {
      if (piece.length <= target * 2) { final.push(piece); return; }
      for (let i = 0; i < piece.length; i += target) final.push(piece.slice(i, i + target));
    });
    return final;
  }

  /** ตัดข้อความเป็นประโยค/ท่อนสั้น ๆ สำหรับใช้เป็นหลักฐานอ้างอิง
      บรรทัดที่เป็นคำถามของผู้สัมภาษณ์ถูกตัดทิ้ง เพราะไม่ใช่คำพูดของพนักงาน
      และมักมีคำสำคัญปนอยู่ (เช่น "เรื่องค่าตอบแทนล่ะครับ") จนทำให้หลักฐานเพี้ยน */
  function segment(text) {
    const chunks = [], parents = [];
    norm(text).split(/\r?\n+/).forEach((line) => {
      if (/^\s*(ถาม|คำถาม|q)\s*[:：.]/i.test(line)) return;
      line = line.replace(/^\s*(ตอบ|คำตอบ|a)\s*[:：.]\s*/i, "");

      line.split(/(?<=[.!?…])\s+|\s{3,}/).forEach((seg) => {
        const pieces = seg.length > 90
          ? seg.split(/\s+(?=(?:แต่|แล้วก็|นอกจากนี้|อีกอย่าง|ส่วน|ปัญหาคือ|เรื่องนี้|ที่สำคัญ|สุดท้าย|ผมเคย|ดิฉันเคย))/)
          : [seg];
        pieces.forEach((piece) => {
          const parent = piece.trim();          // ประโยคเต็มไว้แสดงผล
          if (parent.length < 8) return;
          chunkLong(parent).forEach((c) => {    // ท่อนย่อยไว้ให้คะแนน
            const t = c.trim();
            if (t.length >= 8) { chunks.push(t); parents.push(parent); }
          });
        });
      });
    });
    return { chunks, parents };
  }

  function splitSentences(text) { return segment(text).chunks; }

  /* ------------------------------------------------------------------ */
  /* 5. ตัววิเคราะห์หลัก                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * @param {string} rawText  บทสัมภาษณ์
   * @param {object} meta     ข้อมูลพนักงาน { employee_name, department, position, tenure, ... }
   * @param {object} custom   คำสำคัญเพิ่มเติมที่ผู้ใช้กำหนดเอง { categoryKey: [คำ, ...] }
   */
  function analyze(rawText, meta = {}, custom = {}) {
    const text = norm(rawText);
    const lower = text.toLowerCase();
    const seg = segment(text);
    const sentences = seg.chunks;    // ใช้ให้คะแนน
    const parents = seg.parents;     // ใช้แสดงผล
    const len = text.length;

    /* ---- 5.1 หมวดปัจจัย ----
       คิดคะแนนที่ระดับ "ประโยค" ไม่ใช่ระดับเอกสาร เพื่อให้แยกออกว่า
       หมวดนั้นถูกพูดถึงในเชิงบ่น หรือถูกพูดถึงในเชิงชม
       (เช่น "เพื่อนร่วมงานดีมาก" ต้องไม่ถูกนับเป็นสาเหตุการลาออก) */
    const tones = sentences.map(toneOf);
    const scored = [];
    const praisedAreas = [];

    for (const [key, def] of Object.entries(CATEGORIES)) {
      if (key === "other") continue;
      const words = dedupeWords(def.kw.concat(custom[key] || []));

      let problem = 0, praise = 0, earliest = Infinity;
      const matchedWords = [];
      const problemIdx = [];

      sentences.forEach((s, si) => {
        const l = s.toLowerCase();
        const hitWords = words.filter((w) => findAll(l, w).some((x) => !x.negated));
        if (!hitWords.length) return;
        hitWords.forEach((w) => { if (matchedWords.indexOf(w) === -1) matchedWords.push(w); });

        // หมวดข้อเท็จจริง (ย้ายบ้าน เรียนต่อ ได้งานใหม่) นับเสมอ ไม่ต้องดูน้ำเสียง
        if (!def.factual && (tones[si].tone >= 2 || (tones[si].tone > 0 && tones[si].n === 0))) {
          praise += hitWords.length;        // ประโยคนี้เป็นคำชมชัดเจน ไม่ใช่ปัญหา
          return;
        }
        const intens = INTENSIFIERS.filter((w) => l.indexOf(w) !== -1).length;
        problem += hitWords.length + intens * 0.7 + (tones[si].tone < 0 ? 1 : 0);
        problemIdx.push(si);
        const at = text.indexOf(s);
        if (at !== -1) earliest = Math.min(earliest, at);
      });

      if (problem <= 0) {
        if (praise > 0) praisedAreas.push(def.label);
        continue;
      }
      if (earliest < len * 0.35) problem += 1;   // พูดถึงตั้งแต่ต้น มักเป็นเหตุผลหลัก

      scored.push({
        category: key, label: def.label, raw: problem,
        evidence: evidenceFrom(problemIdx, matchedWords, sentences, parents),
        words: matchedWords,
      });
    }

    // ให้คะแนน 1-5 โดยผสมเกณฑ์สัมบูรณ์ (หนักแค่ไหนในตัวเอง)
    // กับเกณฑ์สัมพัทธ์ (หนักแค่ไหนเทียบกับหมวดอื่นในบทสัมภาษณ์เดียวกัน)
    const maxRaw = scored.reduce((m, c) => Math.max(m, c.raw), 0) || 1;
    scored.forEach((c) => {
      const abs = c.raw <= 1.2 ? 1 : c.raw <= 2.2 ? 2 : c.raw <= 3.5 ? 3 : c.raw <= 5.5 ? 4 : 5;
      const rel = 1 + 4 * (c.raw / maxRaw);
      c.severity = Math.max(1, Math.min(5, Math.round((abs + rel) / 2)));
    });

    const cats = scored.sort((a, b) => b.severity - a.severity || b.raw - a.raw);
    const topCats = cats.slice(0, 6);

    /* ---- 5.2 ประเด็นเฝ้าระวัง ---- */
    const riskFlags = [];
    for (const [key, def] of Object.entries(RISKS)) {
      const matched = def.kw.filter((w) => findAll(lower, w).some((x) => !x.negated));
      if (!matched.length) continue;
      riskFlags.push({
        type: key,
        label: def.label,
        urgency: matched.length >= 3 ? "high" : def.urgency,
        detail: evidenceFrom(sentences.map((_, i) => i), matched, sentences, parents)
          || `พบคำที่เกี่ยวข้อง: ${matched.slice(0, 4).join(", ")}`,
        matched,
      });
    }
    // สูญเสียองค์ความรู้ — อนุมานจากอายุงานและตำแหน่ง ไม่ได้มาจากคำในข้อความ
    const years = parseTenureYears(meta.tenure);
    const senior = /leader|หัวหน้า|วิศวกร|engineer|supervisor|gl|tl|ช่าง|เทคนิค/i.test(meta.position || "");
    if ((years !== null && years >= 5) || (senior && (years === null || years >= 3))) {
      riskFlags.push({
        type: "knowledge_loss",
        label: "การสูญเสียองค์ความรู้",
        urgency: years !== null && years >= 8 ? "medium" : "low",
        detail: `พนักงาน${meta.position ? `ตำแหน่ง ${meta.position}` : ""}${years !== null ? ` อายุงาน ${meta.tenure}` : ""} ควรวางแผนถ่ายทอดงานก่อนวันสุดท้าย`,
        matched: [],
      });
    }
    riskFlags.sort((a, b) => rank(b.urgency) - rank(a.urgency));

    /* ---- 5.3 อารมณ์โดยรวม ----
       นับที่ระดับประโยค ไม่ใช่นับจำนวนคำทั้งเอกสาร เพราะคำว่า "ดี" ที่กระจายอยู่
       ทำให้บทสัมภาษณ์ที่มีปัญหาหนักถูกตัดสินว่าเป็นบวกได้ง่ายเกินไป
       และถ้ามีหมวดปัจจัยที่รุนแรง 4-5 จะไม่อนุญาตให้สรุปว่าเป็นบวก */
    let posSent = 0, negSent = 0;
    tones.forEach((t) => { if (t.tone > 0) posSent++; else if (t.tone < 0) negSent++; });
    const totalTone = posSent + negSent;
    const heavy = topCats.filter((c) => c.severity >= 4).length;

    let score = totalTone ? (posSent - negSent) / totalTone : 0;
    if (heavy) score = Math.min(score, heavy >= 2 ? -0.2 : 0.1);
    score = +score.toFixed(2);

    const overall = !totalTone && !topCats.length ? "neutral"
      : score >= 0.35 ? "positive"
      : score <= -0.35 ? "negative"
      : (posSent >= 2 && (negSent >= 2 || heavy)) ? "mixed" : "neutral";

    /* ---- 5.4 สิ่งที่ชื่นชม ---- */
    const positives = uniq(sentences
      .map((s2, i) => ({ i, ok: tones[i].tone >= 1 && tones[i].p >= 2 && s2.length >= 15 }))
      .filter((x) => x.ok)
      .map((x) => parents[x.i])).slice(0, 4);

    /* ---- 5.5 คำพูดสำคัญ ---- */
    const allCatWords = topCats.flatMap((c) => c.words);
    const keyQuotes = uniq(sentences
      .map((s2, idx) => {
        const l = s2.toLowerCase();
        const k = allCatWords.filter((w) => l.includes(w.toLowerCase())).length;
        const i = INTENSIFIERS.filter((w) => l.includes(w)).length;
        const fit = s2.length >= 25 && s2.length <= 180 ? 1 : 0;
        return { idx, score: k * 2 + i + fit };
      })
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score)
      .map((x) => parents[x.idx]))
      .slice(0, 3);

    /* ---- 5.6 สัญญาณเจตนา ---- */
    const would_return = detectIntent(lower,
      ["กลับมาทำงาน", "กลับมาอีก", "กลับมา", "ยินดีกลับ", "อยากกลับ"],
      ["ไม่กลับ", "ไม่คิดจะกลับ", "ไม่อยากกลับ", "ไม่กลับมาอีก"]);
    const would_recommend = detectIntent(lower,
      ["แนะนำเพื่อน", "แนะนำให้มาสมัคร", "แนะนำให้มาทำ", "ยังแนะนำ", "แนะนำ"],
      ["ไม่แนะนำ", "ไม่กล้าแนะนำ", "ไม่บอกให้ใครมา"]);

    /* ---- 5.7 องค์กรรั้งไว้ได้ไหม ---- */
    const controllableTop = topCats.filter((c) => CONTROLLABLE.includes(c.category) && c.severity >= 3);
    const personalTop = topCats.filter((c) => ["personal", "education", "commute"].includes(c.category) && c.severity >= 4);
    const preventable = controllableTop.length >= 1 && !(personalTop.length && !controllableTop.length)
      ? (controllableTop.length >= 2 || controllableTop[0].severity >= 4 ? "yes" : "unclear")
      : personalTop.length ? "no" : "unclear";

    /* ---- 5.8 ข้อเสนอแนะ ---- */
    const action_items = topCats
      .filter((c) => CATEGORIES[c.category].action && c.severity >= 2)
      .slice(0, 5)
      .map((c) => ({
        owner: CATEGORIES[c.category].action.owner,
        action: CATEGORIES[c.category].action.text,
        priority: c.severity >= 4 ? "high" : c.severity >= 3 ? "medium" : "low",
      }));
    riskFlags.filter((f) => f.urgency === "high" && f.type !== "knowledge_loss").forEach((f) => {
      action_items.unshift({
        owner: f.type === "safety" ? "safety" : "hr",
        action: `ตรวจสอบข้อเท็จจริงเรื่อง${f.label}ที่พนักงานกล่าวถึง ก่อนปิดเคสการลาออกรายนี้`,
        priority: "high",
        urgent: true,   // มาจากธงเฝ้าระวัง ใช้เน้นด้วยสีแดงในหน้าผล
      });
    });
    action_items.splice(5);   // เกิน 5 ข้อคนอ่านไม่ไหว และข้อท้าย ๆ ก็คะแนนต่ำอยู่แล้ว

    /* ---- 5.9 คุณภาพข้อมูล ---- */
    const completeness = len >= 600 && topCats.length >= 3 ? "high"
      : len >= 200 && topCats.length >= 1 ? "medium" : "low";
    const notes = [];
    if (len < 200) notes.push("บทสัมภาษณ์สั้นมาก ผลวิเคราะห์อาจไม่ครอบคลุม");
    if (!topCats.length) notes.push("ไม่พบคำสำคัญที่ตรงกับหมวดใดเลย บทสัมภาษณ์อาจใช้คำเฉพาะของศูนย์ที่ยังไม่อยู่ในพจนานุกรม ลองเพิ่มคำในแท็บ “คำสำคัญ”");
    if (!keyQuotes.length && topCats.length) notes.push("ไม่พบประโยคที่เด่นพอจะยกมาเป็นคำพูดสำคัญ");

    /* ---- 5.10 ประกอบร่าง ---- */
    const primary = topCats[0];
    const headline = primary
      ? `เหตุผลหลักเกี่ยวข้องกับ${primary.label}${topCats[1] ? ` และ${topCats[1].label}` : ""}`
      : "ไม่พบประเด็นเด่นจากคำสำคัญที่มีอยู่";

    return {
      headline,
      summary: buildSummary({ meta, topCats, overall, positives, riskFlags, preventable, years, praisedAreas }),
      primary_reason: primary
        ? `${primary.label}${primary.evidence ? `: ${primary.evidence}` : ""}`
        : "ไม่สามารถระบุได้จากคำสำคัญที่ตรวจพบ",
      reason_categories: topCats.map((c) => ({
        category: c.category, label: c.label, severity: c.severity, evidence: c.evidence,
      })),
      sentiment: { overall, score },
      would_recommend, would_return, preventable,
      positives,
      key_quotes: keyQuotes,
      risk_flags: riskFlags.map((f) => ({
        type: f.type, label: f.label, detail: f.detail, urgency: f.urgency,
      })),
      action_items,
      data_quality: { completeness, note: notes.join(" · ") },
    };
  }

  /* ------------------------------------------------------------------ */
  /* 6. ตัวช่วย                                                          */
  /* ------------------------------------------------------------------ */

  const rank = (u) => ({ high: 3, medium: 2, low: 1 }[u] || 0);

  /** ตัดรายการซ้ำโดยคงลำดับเดิม (ท่อนย่อยหลายท่อนอาจมาจากประโยคแม่เดียวกัน) */
  function uniq(list) {
    const seen = new Set();
    return list.filter((x) => x && !seen.has(x) && seen.add(x));
  }

  /** เลือกท่อนที่มีคำสำคัญหนาแน่นที่สุด แล้วคืน "ประโยคแม่" ของท่อนนั้นเพื่อให้อ่านรู้เรื่อง */
  function evidenceFrom(indices, words, chunks, parents) {
    let best = -1, bestScore = 0;
    indices.forEach((i) => {
      const l = chunks[i].toLowerCase();
      const hits = words.filter((w) => l.includes(w.toLowerCase())).length;
      if (!hits) return;
      const richness = Math.min((parents[i] || "").length, 200) / 400;
      const score = hits + richness;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    // คืนประโยคเต็ม ไม่ตัดกลางทาง เพราะนี่คือหลักฐานที่ HR ต้องอ่านจริง
    // 190 ตัวอักษรเดิมตัดคาประโยคจนอ่านไม่รู้เรื่อง ต้องเปิดไฟล์ต้นฉบับประกบ
    // เหลือเพดาน 800 ไว้กันกรณีคำตอบในฟอร์มยาวผิดปกติจนท่วมการ์ด
    return best === -1 ? null : snippet(parents[best], words, 800);
  }

  function pickEvidence(sentences, words) {
    let best = null, bestScore = 0;
    for (const s of sentences) {
      const l = s.toLowerCase();
      const score = words.filter((w) => l.includes(w.toLowerCase())).length;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  /** ตัดคำที่เป็นส่วนหนึ่งของคำอื่นออก กัน "ก้าวหน้า" ถูกนับซ้ำกับ "ความก้าวหน้า" */
  function dedupeWords(ws) {
    return ws.filter((w) => !ws.some((o) => o !== w && o.length > w.length && o.indexOf(w) !== -1));
  }

  /** ให้คะแนนอารมณ์ระดับประโยค */
  function toneOf(sentence) {
    const l = sentence.toLowerCase();
    let p = 0, n = 0;
    POSITIVE.forEach((w) => { p += findAll(l, w).filter((x) => !x.negated).length; });
    NEGATIVE.forEach((w) => { n += findAll(l, w).filter((x) => !x.negated).length; });
    return { p, n, tone: p - n };
  }

  /** ถ้าท่อนหลักฐานยาวเกินไป ตัดเอาเฉพาะช่วงที่มีคำสำคัญหนาแน่นที่สุด */
  function snippet(sentence, words, max) {
    max = max || 150;
    if (!sentence || sentence.length <= max) return sentence;
    const l = sentence.toLowerCase();
    let best = -1, bestIdx = 0;
    for (let i = 0; i < sentence.length - 20; i += 10) {
      const win = l.slice(i, i + max);
      const c = words.filter((w) => win.indexOf(w.toLowerCase()) !== -1).length;
      if (c > best) { best = c; bestIdx = i; }
    }
    const head = bestIdx > 0 ? "…" : "";
    const tail = bestIdx + max < sentence.length ? "…" : "";
    return head + sentence.slice(bestIdx, bestIdx + max).trim() + tail;
  }

  function detectIntent(lower, yesPhrases, noPhrases) {
    for (const p of noPhrases) if (lower.includes(p)) return "no";
    for (const p of yesPhrases) {
      const hits = findAll(lower, p);
      if (hits.some((h) => !h.negated)) return "yes";
      if (hits.length) return "no";
    }
    return "unclear";
  }

  function parseTenureYears(tenure) {
    if (!tenure) return null;
    const s = String(tenure);
    const y = s.match(/(\d+(?:\.\d+)?)\s*(?:ปี|year|yr)/i);
    const m = s.match(/(\d+)\s*(?:เดือน|month|mo)/i);
    if (!y && !m) {
      const bare = s.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
      return bare ? parseFloat(bare[1]) : null;
    }
    return (y ? parseFloat(y[1]) : 0) + (m ? parseInt(m[1], 10) / 12 : 0);
  }

  function buildSummary({ meta, topCats, overall, positives, riskFlags, preventable, years, praisedAreas }) {
    const who = [
      meta.position ? `พนักงานตำแหน่ง ${meta.position}` : "พนักงาน",
      meta.department ? `หน่วยงาน ${meta.department}` : "",
      years !== null ? `อายุงาน ${meta.tenure}` : "",
    ].filter(Boolean).join(" ");

    const parts = [];

    if (topCats.length) {
      const first = topCats[0];
      parts.push(`${who} ระบุประเด็นที่เกี่ยวข้องกับ${first.label}เป็นเรื่องเด่นที่สุดในบทสัมภาษณ์ (ระดับความรุนแรง ${first.severity}/5)`);
      if (first.evidence) parts.push(`โดยมีข้อความอ้างอิงว่า “${trim(first.evidence, 160)}”`);
      const rest = topCats.slice(1, 4);
      if (rest.length) parts.push(`นอกจากนี้ยังพบการกล่าวถึง${rest.map((c) => `${c.label} (${c.severity}/5)`).join(" และ ")}`);
    } else {
      parts.push(`ระบบไม่พบคำสำคัญที่ตรงกับหมวดปัจจัยใดในบทสัมภาษณ์ของ${who} ต้องอ่านต้นฉบับแล้วสรุปเอง`);
    }

    const toneTh = { positive: "เชิงบวก", negative: "เชิงลบ", mixed: "ผสมทั้งบวกและลบ", neutral: "ค่อนข้างเป็นกลาง" }[overall];
    parts.push(`น้ำเสียงโดยรวมของบทสัมภาษณ์อยู่ในระดับ${toneTh}`);

    if (praisedAreas && praisedAreas.length)
      parts.push(`หมวดที่ถูกพูดถึงในเชิงบวกและไม่ได้ถูกนับเป็นสาเหตุการลาออกคือ${praisedAreas.slice(0, 3).join(" และ ")}`);
    if (positives.length) parts.push(`โดยพนักงานกล่าวว่า “${trim(positives[0], 120)}”`);

    const high = riskFlags.filter((f) => f.urgency === "high");
    if (high.length) parts.push(`มีประเด็นที่ควรตรวจสอบเพิ่มเติมด้าน${high.map((f) => f.label).join(" และ ")}`);

    if (preventable === "yes") parts.push("ปัจจัยส่วนใหญ่อยู่ในวิสัยที่องค์กรแก้ไขได้ จึงมีโอกาสรักษาพนักงานลักษณะนี้ไว้ได้หากแก้ปัญหาทัน");
    else if (preventable === "no") parts.push("เหตุผลหลักเป็นเรื่องส่วนบุคคลที่องค์กรควบคุมได้จำกัด");

    return parts.join(" ") + ".";
  }

  const trim = (s, n) => (s.length > n ? s.slice(0, n).trim() + "…" : s);

  /* ------------------------------------------------------------------ */
  /* 7. สรุปภาพรวมหลายคน                                                 */
  /* ------------------------------------------------------------------ */

  function aggregate(records) {
    const n = records.length;
    const catCount = {}, catSeverity = {}, riskCount = {}, deptCount = {};
    let negative = 0, preventable = 0;

    records.forEach(({ meta, summary: s }) => {
      (s.reason_categories || []).forEach((c) => {
        catCount[c.category] = (catCount[c.category] || 0) + 1;
        catSeverity[c.category] = (catSeverity[c.category] || 0) + (c.severity || 0);
      });
      (s.risk_flags || []).forEach((f) => { riskCount[f.type] = (riskCount[f.type] || 0) + 1; });
      if (["negative", "mixed"].includes(s.sentiment?.overall)) negative++;
      if (s.preventable === "yes") preventable++;
      const d = (meta.department || "").trim();
      if (d) {
        deptCount[d] = deptCount[d] || { n: 0, cats: {}, risks: 0, negative: 0 };
        deptCount[d].n++;
        deptCount[d].risks += (s.risk_flags || []).filter((f) => f.urgency === "high").length;
        if (["negative", "mixed"].includes(s.sentiment?.overall)) deptCount[d].negative++;
        (s.reason_categories || []).slice(0, 2).forEach((c) => {
          deptCount[d].cats[c.category] = (deptCount[d].cats[c.category] || 0) + 1;
        });
      }
    });

    const themes = Object.entries(catCount)
      .sort((a, b) => b[1] - a[1] || catSeverity[b[0]] - catSeverity[a[0]])
      .slice(0, 6)
      .map(([k, c]) => ({
        category: k,
        theme: CATEGORIES[k]?.label || k,
        affected: c,
        avgSeverity: +(catSeverity[k] / c).toFixed(1),
        detail: `พบใน ${c} จาก ${n} คน (${Math.round((c / n) * 100)}%) ระดับความรุนแรงเฉลี่ย ${(catSeverity[k] / c).toFixed(1)}/5`,
      }));

    const watch = Object.entries(deptCount)
      .filter(([, v]) => v.n >= 2)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 5)
      .map(([d, v]) => {
        const top = Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0];
        return `${d} ลาออก ${v.n} คน${top ? ` ประเด็นเด่นคือ${CATEGORIES[top[0]]?.label || top[0]}` : ""}`;
      });

    const recommendations = themes
      .filter((t) => CATEGORIES[t.category]?.action && t.affected >= Math.max(2, n * 0.25))
      .slice(0, 5)
      .map((t) => ({
        owner: CATEGORIES[t.category].action.owner,
        action: CATEGORIES[t.category].action.text,
        priority: t.affected >= n * 0.5 ? "high" : "medium",
      }));

    const lead = themes.length
      ? `จากบทสัมภาษณ์ ${n} คน ประเด็นที่ถูกกล่าวถึงมากที่สุดคือ${themes[0].theme} (${themes[0].affected} คน)${themes[1] ? ` รองลงมาคือ${themes[1].theme} (${themes[1].affected} คน)` : ""}`
      : `จากบทสัมภาษณ์ ${n} คน ไม่พบประเด็นร่วมที่ชัดเจน`;

    const overview = [
      lead,
      `มีผู้ที่น้ำเสียงโดยรวมออกไปทางลบหรือผสม ${negative} คน (${Math.round((negative / n) * 100)}%)`,
      `และประเมินว่าองค์กรน่าจะรั้งไว้ได้ ${preventable} คน (${Math.round((preventable / n) * 100)}%)`,
      Object.keys(riskCount).length
        ? `พบประเด็นที่ต้องเฝ้าระวังรวม ${Object.values(riskCount).reduce((a, b) => a + b, 0)} รายการ ประเภทที่พบบ่อยที่สุดคือ${RISKS[Object.entries(riskCount).sort((a, b) => b[1] - a[1])[0][0]]?.label || "อื่น ๆ"}`
        : "ไม่พบประเด็นที่ต้องเฝ้าระวังเป็นพิเศษ",
      n < 5 ? "หมายเหตุ: กลุ่มตัวอย่างมีขนาดเล็ก ควรระวังการสรุปเป็นแนวโน้มขององค์กร" : "",
    ].filter(Boolean).join(" · ");

    const departments = Object.entries(deptCount)
      .sort((a, b) => b[1].risks - a[1].risks || b[1].n - a[1].n)
      .map(([name, v]) => {
        const top = Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0];
        return {
          name, count: v.n, risks: v.risks, negative: v.negative,
          topCategory: top ? (CATEGORIES[top[0]] ? CATEGORIES[top[0]].label : top[0]) : null,
        };
      });

    return { n, overview, themes, recommendations, watch_list: watch,
             negative, preventable, catCount, departments };
  }

  /* ------------------------------------------------------------------ */
  /* 8. มุมมองผู้บริหาร — เพิ่มมิติเวลาเข้าไปในภาพรวม                      */
  /* ------------------------------------------------------------------ */

  /**
   * สรุปสำหรับผู้บริหาร ต่างจาก aggregate() ตรงที่ตอบคำถาม "แนวโน้มเป็นยังไง"
   * ไม่ใช่แค่ "ตอนนี้เป็นยังไง" จึงต้องเทียบกับช่วงเวลาก่อนหน้าที่ยาวเท่ากัน
   *
   * @param {Array}  records     รายการผลวิเคราะห์ทั้งหมด
   * @param {number} monthsBack  ย้อนหลังกี่เดือน (0 = ทั้งหมดเท่าที่มี)
   */
  function executive(records, monthsBack) {
    const now = new Date();
    const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const shift = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
    const when = (r) => new Date(r.at || Date.now());

    const thisMonth = monthStart(now);
    const from = monthsBack ? shift(thisMonth, -(monthsBack - 1)) : null;
    const prevFrom = monthsBack ? shift(thisMonth, -(monthsBack * 2 - 1)) : null;

    const current = from ? records.filter((r) => when(r) >= from) : records.slice();
    const previous = from ? records.filter((r) => when(r) >= prevFrom && when(r) < from) : [];

    const highRisks = (r) => (r.summary.risk_flags || []).filter((f) => f.urgency === "high");
    const isNegative = (r) => ["negative", "mixed"].indexOf(r.summary.sentiment.overall) !== -1;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

    /* ---- ตัวเลขหลัก พร้อมส่วนต่างจากช่วงก่อนหน้า ---- */
    const kpi = {
      total: current.length,
      totalPrev: previous.length,
      preventable: current.filter((r) => r.summary.preventable === "yes").length,
      negative: current.filter(isNegative).length,
      urgent: current.reduce((n, r) => n + highRisks(r).length, 0),
      urgentPrev: previous.reduce((n, r) => n + highRisks(r).length, 0),
      departments: new Set(current.map((r) => String(r.meta.department || "").trim()).filter(Boolean)).size,
    };
    kpi.preventablePct = pct(kpi.preventable, kpi.total);
    kpi.negativePct = pct(kpi.negative, kpi.total);

    /* ---- แนวโน้มรายเดือน ---- */
    const oldest = records.length
      ? monthStart(new Date(Math.min.apply(null, records.map((r) => when(r).getTime()))))
      : thisMonth;
    let cursor = from || oldest;
    if ((thisMonth - cursor) / 2.6e9 > 23) cursor = shift(thisMonth, -23);   // เพดาน 24 แท่ง

    const monthly = [];
    const index = {};
    while (cursor <= thisMonth) {
      const key = cursor.getFullYear() + "-" + String(cursor.getMonth() + 1).padStart(2, "0");
      const bucket = { key, date: new Date(cursor), total: 0, risk: 0 };
      index[key] = bucket;
      monthly.push(bucket);
      cursor = shift(cursor, 1);
    }
    current.forEach((r) => {
      const d = when(r);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      const b = index[key];
      if (!b) return;
      b.total++;
      if (highRisks(r).length) b.risk++;
    });

    /* ---- ปัจจัยหลัก เทียบกับช่วงก่อนหน้า ---- */
    const countCats = (list) => {
      const out = {};
      list.forEach((r) => (r.summary.reason_categories || []).slice(0, 3).forEach((c) => {
        out[c.category] = (out[c.category] || 0) + 1;
      }));
      return out;
    };
    /* ความรุนแรงเฉลี่ยต่อหมวด เพื่อให้แถบเทียบใช้สเกลเดียวกับมาตรวัดระดับ */
    const sevCats = (list) => {
      const sum = {}, n = {};
      list.forEach((r) => (r.summary.reason_categories || []).slice(0, 3).forEach((c) => {
        sum[c.category] = (sum[c.category] || 0) + (c.severity || 0);
        n[c.category] = (n[c.category] || 0) + 1;
      }));
      const out = {};
      Object.keys(sum).forEach((k) => { out[k] = +(sum[k] / n[k]).toFixed(1); });
      return out;
    };
    const curCats = countCats(current);
    const prevCats = countCats(previous);
    const curSev = sevCats(current);

    const themes = Object.keys(curCats)
      .sort((a, b) => curCats[b] - curCats[a])
      .slice(0, 5)
      .map((k) => ({
        category: k,
        label: CATEGORIES[k] ? CATEGORIES[k].label : k,
        count: curCats[k],
        share: pct(curCats[k], current.length),
        prev: prevCats[k] || 0,
        delta: curCats[k] - (prevCats[k] || 0),
        avgSeverity: curSev[k] || 0,
        controllable: CONTROLLABLE.indexOf(k) !== -1,
      }));

    /* ---- หน่วยงาน เรียงตามความเสี่ยง ---- */
    const base = aggregate(current.length ? current : records);
    const departments = (base.departments || []).slice(0, 8);

    /* ---- ประเด็นที่ต้องสอบข้อเท็จจริง ---- */
    const urgent = [];
    current.forEach((r) => highRisks(r).forEach((f) => urgent.push({
      label: f.label,
      detail: f.detail,
      who: r.meta.employee_name || r.meta.employee_code || "ไม่ระบุชื่อ",
      department: r.meta.department || null,
      at: r.at,
    })));
    urgent.sort((a, b) => String(b.at).localeCompare(String(a.at)));

    /* ---- เรื่องที่ต้องตัดสินใจ ---- */
    const decisions = themes
      .filter((t) => t.controllable && CATEGORIES[t.category] && CATEGORIES[t.category].action)
      .slice(0, 4)
      .map((t) => ({
        owner: CATEGORIES[t.category].action.owner,
        action: CATEGORIES[t.category].action.text,
        because: `พบใน ${t.count} จาก ${current.length} คน (${t.share}%)`,
        priority: t.share >= 50 ? "high" : "medium",
      }));

    return {
      monthsBack: monthsBack || 0,
      from, to: now,
      hasPrev: previous.length > 0,
      current, previous,
      kpi, monthly, themes, departments, urgent, decisions,
      overview: base.overview,
    };
  }

  /* ------------------------------------------------------------------ */

  global.ExitEngine = { analyze, aggregate, executive, CATEGORIES, RISKS, splitSentences, parseTenureYears };
})(window);
