---
name: project_prebuild_cleanup
description: DEV-only code that MUST be stripped before compiling a production build (exact files + tags)
metadata:
  type: project
---

These exist for development convenience and MUST be stripped before compiling a real build. Each spot is tagged `DEV ONLY` in source — grep for it.

- **Setup-wizard preview in `src/pages/Settings/ShopTab.tsx`** — the "ดูตัวอย่าง Setup (DEV)" button + the full-screen overlay block + the `SetupWizard` import (3 spots, each tagged `DEV ONLY`). The `dryRun` prop on `SetupWizard` itself can stay (defaults false, no prod effect).
- **Login-screen mockup preview in `src/pages/Settings/ShopTab.tsx`** — the "ดูตัวอย่าง Login (DEV)" button + the `previewLogin` overlay block + the `LoginScreen` import (3 spots, each tagged `DEV ONLY`). `LoginScreen.tsx` itself stays (becomes the real login in Phase 2); only the Settings preview wiring is DEV. The `preview` prop / `PREVIEW_USERS` / `PREVIEW_PASSWORD` mock inside `LoginScreen` are placeholders until Phase 2 wires `window.api.auth.*`.
- **Seed test data in `electron/db/seed.ts`** — the `PRODUCTS` + `CUSTOMERS` imports and their insert blocks (Hygeia exports, tagged "Temporary dev seed … remove before compiling a production build").
- **UI review/annotation overlay `src/dev/ReviewOverlay.tsx`** — floating dev tool to pin notes on any page (localStorage `syntropic-review-notes-v1`, exports markdown). Mount is in `src/App.tsx`: the `ReviewOverlay = import.meta.env.DEV ? lazy(...) : null` const + the `{ReviewOverlay && (<Suspense…><ReviewOverlay/></Suspense>)}` block inside `<HashRouter>`. Both are hard-gated on `import.meta.env.DEV` so a packaged build already tree-shakes the whole file — but delete the file + the two App.tsx spots to fully remove.
- **Role-switch button in `src/components/layout/TitleBar.tsx`** — the admin/staff toggle for testing (the `switchRole` handler + `currentUser`/`useUserStore` wiring + the `import.meta.env.DEV && currentUser` button block + `ShieldCheck`/`User` imports, each tagged `DEV ONLY`). Also remove its IPC: `auth:devSetRole` handler in `electron/ipc/auth.ts`, the `devSetRole` line in `electron/preload.ts`, and its type in `electron/preload.d.ts`. All three layers are hard-gated (`import.meta.env.DEV` + `app.isPackaged`) so a packaged build is already inert, but strip them anyway.

- **Fontcraft trial fonts (FC Sara Samkan, FC Mission) — licensing, not code.** `src/assets/fonts/FCSaraSamkan-Regular/Bold.otf`, `FCMission-Medium.otf` + their `@font-face` blocks in `src/index.css` are **free non-commercial trial builds** from fontcraftstudio.com (Fontcraft foundry). Free tier is personal-use only — shipping this app commercially requires buying the 500 THB commercial license first at `www.fontcraftstudio.com/support`, **per type family**: FC Sara Samkan and FC Mission are each their own separate family/purchase (2 purchases total if both stay). Owner said they intend to buy before a real build. For any font that ends up NOT chosen, just delete its file(s) + `@font-face` block(s) + `FONT_ROWS` entry in `src/pages/CSS/index.tsx` instead of buying anything.
  - **2026-07-14: FC Vision, FC Iconic, FC Iconic Condensed, FC Paragraph, MiSans Thai, Sukhumvit Set, SF Thonburi, Bai Jamjuree, IBM Plex Sans Thai Looped, Prompt, Kanit were removed from the project** (picker option + `@font-face` + asset files) — owner confirmed unused; see [[project_font_picker_cleanup]] if that memory exists, otherwise this note is the record.
  - **This list keeps changing — if the owner keeps requesting more thaifaces.com/Fontcraft specimens, consider proactively asking whether they want a running tally of exactly which families they're leaning toward, so the final purchase list at build time doesn't get missed.**

Related: [[project_refine_schema_checklist]] (DEAD columns to DROP before launch), [[project_login_mockup]], [[project_user_login_licensing]].
