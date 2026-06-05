---
name: feedback_animation_reduced_motion
description: Never reset animation flags via onAnimationEnd — use setTimeout instead; animationend does not fire under prefers-reduced-motion
metadata:
  type: feedback
---

**Pitfall:** อย่า reset flag ที่คุม animation class ด้วย `onAnimationEnd` ถ้า element มี `motion-reduce:animate-none` หรือ Tailwind reduced-motion variant ใด ๆ

**สาเหตุ:** ภายใต้ `prefers-reduced-motion: reduce` browser suppress animation → event `animationend` **ไม่ยิงเลย** → flag ค้างถาวร → retrigger ไม่ทำงานอีก

**วิธีที่ถูก:** ใช้ `setTimeout` + cleanup ใน `useEffect`:

```tsx
useEffect(() => {
  if (!shaking) return;
  const t = setTimeout(() => setShaking(false), 600); // ตรงกับ duration animation
  return () => clearTimeout(t);
}, [shaking]);
```

**อย่าใช้:**
```tsx
<div onAnimationEnd={() => setShaking(false)} /> // พังถ้า reduced-motion
```

**เจอจริงตอนไหน:** shake animation รหัสผิดในหน้า Login (`src/pages/Auth/LoginScreen.tsx`) — priest review รอบ 2026-06-05.

**กฎทั่วไป:** flag ใด ๆ ที่ต้อง self-reset หลัง animation → reset ด้วย timer เสมอ ไม่ใช่ animation event.
