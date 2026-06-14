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
- **Role-switch button in `src/components/layout/TitleBar.tsx`** — the admin/staff toggle for testing (the `switchRole` handler + `currentUser`/`useUserStore` wiring + the `import.meta.env.DEV && currentUser` button block + `ShieldCheck`/`User` imports, each tagged `DEV ONLY`). Also remove its IPC: `auth:devSetRole` handler in `electron/ipc/auth.ts`, the `devSetRole` line in `electron/preload.ts`, and its type in `electron/preload.d.ts`. All three layers are hard-gated (`import.meta.env.DEV` + `app.isPackaged`) so a packaged build is already inert, but strip them anyway.

Related: [[project_refine_schema_checklist]] (DEAD columns to DROP before launch), [[project_login_mockup]], [[project_user_login_licensing]].
