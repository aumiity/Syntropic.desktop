// เอฟเฟกต์เด้งตอนสุดขอบ (rubber-band) สำหรับ panel ที่เลื่อนภายในแอป
//
// Chromium เด้ง rubber-band ให้เฉพาะ document root เท่านั้น ไม่เด้งให้ panel
// `overflow-y:auto` ด้านใน ไฟล์นี้เลยจำลองเอฟเฟกต์ยืด-เด้งสไตล์ iOS/macOS ให้
//
// ใช้สูตรแรงต้านตัวจริงของ Apple (UIScrollView rubber-band):
//     b = (1 − 1 / (x·c/d + 1)) · d        ; c = 0.55
//   x = ระยะดิบที่ดึงเลยขอบ, d = ความสูงของ panel, b = ระยะที่แสดงจริง (ถูกหน่วง)
// ยิ่งดึงไกลยิ่งฝืด (asymptote เข้าหา d) — ได้ "ความหนืด" แบบ native โดยไม่ต้องเดาค่า
// พอปล่อย ระยะดิบหดกลับหา 0 แบบ exponential ทางเดียว ไม่ข้ามศูนย์ = ไม่แกว่ง
//
// เด้ง "ทีเดียว" ต่อการสะบัดหนึ่งครั้ง: macOS ยิง wheel event แบบ momentum ต่อเนื่อง
// หลังยกนิ้วเป็นวินาที ถ้าปล่อยไว้ event เหล่านี้จะจุดชนวนให้เด้งซ้ำ 2-3 ที เราจึง
//   1) พอ delta เริ่มเล็กลง (เข้าช่วง momentum) → ล็อกเข้าโหมดเด้งกลับ ไม่ยืดเพิ่ม
//   2) คงล็อกไว้จน wheel "เงียบจริง" (ไม่มี event เกิน REARM_MS) ค่อยปลดล็อกรับครั้งใหม่
// → สะบัดแรงแค่ไหนก็เด้งครั้งเดียวตามแรงกระแทก แล้วจบ
//
// ทั้งแอป: ใช้ wheel listener ตัวเดียวใน capture phase เลือก panel ที่เลื่อนได้
// ชั้นในสุดใต้เมาส์ และทำงานเฉพาะตอนที่ทุกชั้นชนขอบหมดแล้ว เลยไม่กระทบการเลื่อน
// ปกติกลางทาง และเคารพ reduced-motion (ถ้าผู้ใช้ปิด motion ไว้ จะไม่ทำงาน)
//
// อ้างอิงสูตร: https://medium.com/@esskeetit/how-uiscrollview-works-e418adc47060

const COEFF = 0.55 // ค่าคงที่ของ Apple — ยิ่งมากยิ่งหนืดน้อย/ยืดง่าย (ปกติคงไว้ 0.55)
const PULL = 0.65 // ตัวคูณความไวต่อ delta ของล้อ — หรี่ให้เมาส์ (โน้ตชใหญ่) ไม่เด้งแรงเกิน; trackpad (delta เล็ก) ยังสะสมได้
const DECEL = 0.6 // ล็อก (จบการยืด) เมื่อ delta ตกต่ำกว่า 60% ของพีค = momentum ชัดแล้ว — สูงไป=ไวเกิน/เด้งน้อย, ต่ำไป=ค้างนาน
const RETURN = 0.7 // อัตราที่ระยะดิบหดกลับต่อเฟรม 0..1 (น้อย = เด้งกลับไว/กระชับขึ้น)
const MAX_STRETCH = 90 // px — เพดานระยะที่แสดงจริง กันเด้งเว่อร์บน panel สูง ๆ
const REST = 0.5 // px ต่ำกว่านี้ถือว่า panel เข้าที่แล้ว (หยุด loop)
const REARM_MS = 120 // ms — wheel ต้องเงียบนานเท่านี้ ถึงจะรับการเด้งครั้งใหม่ (กันเด้งซ้ำจาก momentum)

let el: HTMLElement | null = null
let raw = 0 // ระยะดึงดิบสะสมก่อนผ่านสูตรหน่วง (px, มีเครื่องหมายบอกทิศ)
let dim = 1 // ความสูงของ panel ที่กำลังเด้ง (ตัว d ในสูตร)
let peakDelta = 0 // ความแรงสูงสุดของการสะบัดรอบนี้ (ใช้จับจังหวะเริ่มชะลอ)
let locked = false // ล็อกแล้ว = อยู่ในโหมดเด้งกลับ ไม่รับการยืดเพิ่มจนกว่าจะ re-arm
let rearmTimer: ReturnType<typeof setTimeout> | 0 = 0
let raf = 0

function isScrollable(node: HTMLElement): boolean {
  const oy = getComputedStyle(node).overflowY
  return (oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight
}

// แปลงระยะดิบ x เป็นระยะที่แสดงจริงตามสูตร rubber-band ของ Apple
function rubberBand(x: number): number {
  const b = (1 - 1 / (Math.abs(x) * COEFF / dim + 1)) * dim
  const clamped = Math.min(b, MAX_STRETCH)
  return x < 0 ? -clamped : clamped
}

// คืน element ที่จะให้เด้ง หรือ null เมื่อมีชั้นบนที่ยังเลื่อนปกติได้ในทิศนี้
// (กรณีนั้นปล่อย wheel event ไว้เฉย ๆ ไม่แตะ)
function pick(node: EventTarget | null, deltaY: number): HTMLElement | null {
  let cur = node instanceof HTMLElement ? node : null
  let innermost: HTMLElement | null = null
  while (cur && cur !== document.documentElement) {
    if (isScrollable(cur)) {
      if (!innermost) innermost = cur
      const atTop = cur.scrollTop <= 0
      const atBottom = cur.scrollTop + cur.clientHeight >= cur.scrollHeight - 1
      const canScroll = (deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)
      if (canScroll) return null // ชั้นบนยังรับการเลื่อนได้ — ไม่ต้องเด้ง
    }
    cur = cur.parentElement
  }
  return innermost // ทุกชั้นที่เลื่อนได้ชนขอบหมดแล้ว
}

// ปลดล็อกรับการสะบัดครั้งใหม่ (เรียกเมื่อ wheel เงียบครบ REARM_MS = momentum จบแล้ว)
function rearm() {
  locked = false
  peakDelta = 0
  rearmTimer = 0
}

// จบ animation รอบนี้ — แต่ไม่ปลด `locked`/timer (momentum อาจยังยิงต่อ)
function release() {
  if (el) {
    el.style.transform = ''
    el.style.willChange = ''
  }
  el = null
  raw = 0
  raf = 0
}

function loop() {
  raw *= RETURN // ระยะดิบหดกลับเข้าหาจุดพักแบบ exponential
  const visible = rubberBand(raw)
  if (Math.abs(visible) < REST) {
    release()
    return
  }
  if (el) el.style.transform = `translateY(${visible.toFixed(2)}px)`
  raf = requestAnimationFrame(loop)
}

function onWheel(e: WheelEvent) {
  const next = pick(e.target, e.deltaY)
  if (!next) return // ไม่ได้ overscroll; ถ้ามีเด้งค้างอยู่ก็ปล่อยให้หดกลับเอง

  e.preventDefault()

  // สลับ panel ระหว่างเด้งค้าง: ล้างตัวเก่า + เริ่มนับใหม่หมด
  if (el && el !== next) {
    el.style.transform = ''
    el.style.willChange = ''
    raw = 0
    locked = false
    peakDelta = 0
  }
  el = next
  dim = el.clientHeight || 1 // ตัว d ในสูตร = ขนาด panel จริง
  el.style.willChange = 'transform'

  // ยืดเพิ่มเฉพาะตอนยังออกแรงจริง (delta คงที่/เพิ่มขึ้น) — พอ delta เริ่มเล็กลง
  // = เข้าช่วง momentum → ล็อก แล้วจะไม่เด้งซ้ำจนกว่า wheel จะเงียบครบ REARM_MS
  const mag = Math.abs(e.deltaY)
  if (!locked) {
    if (mag >= peakDelta * DECEL) {
      raw += -e.deltaY * PULL
      peakDelta = Math.max(peakDelta, mag)
    } else {
      locked = true // delta ตกต่ำกว่า 60% ของพีค = เข้าช่วง momentum → หยุดยืด เด้งกลับ
    }
  }

  // ทุก event เลื่อน timer ปลดล็อกออกไป — ปลดล็อกเฉพาะเมื่อ wheel หยุดยิงจริง
  if (rearmTimer) clearTimeout(rearmTimer)
  rearmTimer = setTimeout(rearm, REARM_MS)

  if (!raf) raf = requestAnimationFrame(loop)
}

let started = false

export function initOverscrollBounce() {
  if (started || typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  started = true
  // Capture phase + non-passive so we can preventDefault only while bouncing.
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
}
