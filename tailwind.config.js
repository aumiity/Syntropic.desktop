/** @type {import('tailwindcss').Config} */

export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      // `aria-invalid` ไม่ใช่ default aria variant ของ Tailwind v3 — ต้อง register เอง
      // ไม่งั้นคลาส `aria-invalid:*` (เช่นกรอบแดงใน input.tsx) จะไม่ถูก generate เป็น CSS เลย.
      aria: {
        invalid: 'invalid="true"',
      },
      colors: {
        border: 'hsl(var(--border))',
        'border-strong': 'hsl(var(--border-strong))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: {
          DEFAULT: 'hsl(var(--foreground))',
          subtle: 'hsl(var(--foreground-subtle))',
        },
        'surface-hover': 'hsl(var(--surface-hover))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          soft: 'hsl(var(--primary-soft))',
          'soft-hover': 'hsl(var(--primary-soft-hover))',
          'soft-border': 'hsl(var(--primary-soft-border))',
          strong: 'hsl(var(--primary-strong))',
        },
        'info-soft': {
          DEFAULT: 'hsl(var(--info-soft))',
          foreground: 'hsl(var(--info-soft-foreground))',
          hover: 'hsl(var(--info-soft-hover))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          hover: 'hsl(var(--info-hover))',
        },
        'accent-soft': {
          DEFAULT: 'hsl(var(--accent-soft))',
          hover: 'hsl(var(--accent-soft-hover))',
          foreground: 'hsl(var(--accent-soft-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          hover: 'hsl(var(--destructive-hover))',
          soft: 'hsl(var(--destructive-soft))',
          'soft-hover': 'hsl(var(--destructive-soft-hover))',
          strong: 'hsl(var(--destructive-strong))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          hover: 'hsl(var(--success-hover))',
          soft: 'hsl(var(--success-soft))',
          'soft-hover': 'hsl(var(--success-soft-hover))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          hover: 'hsl(var(--warning-hover))',
          soft: 'hsl(var(--warning-soft))',
          'soft-hover': 'hsl(var(--warning-soft-hover))',
          'soft-foreground': 'hsl(var(--warning-soft-foreground))',
        },
        violet: {
          DEFAULT: 'hsl(var(--violet))',
          foreground: 'hsl(var(--violet-foreground))',
          hover: 'hsl(var(--violet-hover))',
          soft: 'hsl(var(--violet-soft))',
          'soft-hover': 'hsl(var(--violet-soft-hover))',
          strong: 'hsl(var(--violet-strong))',
        },
        teal: {
          DEFAULT: 'hsl(var(--teal))',
          foreground: 'hsl(var(--teal-foreground))',
          hover: 'hsl(var(--teal-hover))',
          soft: 'hsl(var(--teal-soft))',
          'soft-hover': 'hsl(var(--teal-soft-hover))',
          strong: 'hsl(var(--teal-strong))',
        },
        amber: {
          DEFAULT: 'hsl(var(--amber))',
          foreground: 'hsl(var(--amber-foreground))',
          hover: 'hsl(var(--amber-hover))',
          soft: 'hsl(var(--amber-soft))',
          'soft-hover': 'hsl(var(--amber-soft-hover))',
          strong: 'hsl(var(--amber-strong))',
        },
        sand: {
          DEFAULT: 'hsl(var(--sand))',
          foreground: 'hsl(var(--sand-foreground))',
          hover: 'hsl(var(--sand-hover))',
          soft: 'hsl(var(--sand-soft))',
          'soft-hover': 'hsl(var(--sand-soft-hover))',
          strong: 'hsl(var(--sand-strong))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
          hover: 'hsl(var(--muted-hover))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          hover: 'hsl(var(--accent-hover))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
        },
        // Theme Lab only — scoped under .theme-lab in index.css, never affects
        // the real app's tokens. See src/pages/ThemeLab.
        'lab-bg': 'hsl(var(--lab-bg))',
        'lab-card': 'hsl(var(--lab-card))',
        'lab-sidebar': {
          DEFAULT: 'hsl(var(--lab-sidebar))',
          foreground: 'hsl(var(--lab-sidebar-foreground))',
          border: 'hsl(var(--lab-sidebar-border))',
        },
        'lab-forest': {
          DEFAULT: 'hsl(var(--lab-forest))',
          hover: 'hsl(var(--lab-forest-hover))',
          foreground: 'hsl(var(--lab-forest-foreground))',
          soft: 'hsl(var(--lab-forest-soft))',
          'soft-foreground': 'hsl(var(--lab-forest-soft-foreground))',
        },
        'lab-amber': {
          DEFAULT: 'hsl(var(--lab-amber))',
          foreground: 'hsl(var(--lab-amber-foreground))',
          soft: 'hsl(var(--lab-amber-soft))',
          'soft-foreground': 'hsl(var(--lab-amber-soft-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
      },
      fontFamily: {
        sans: ['var(--font-latin)', 'var(--font-thai)', 'sans-serif'],
        brand: ['var(--font-brand)', 'sans-serif'],
        // Prominent numeric readouts (POS slot totals, big money figures).
        'serif-num': ["'Source Serif 4'", 'serif'],
        // Theme Lab only — serif comparison candidates + the picked-winner var.
        // Not used anywhere outside src/pages/ThemeLab.
        'lab-serif': ['var(--lab-font-serif)', 'serif'],
        'lab-serif-source': ['Source Serif 4', 'serif'],
        'lab-serif-lora': ['Lora', 'serif'],
        'lab-serif-newsreader': ['Newsreader', 'serif'],
        'lab-serif-fraunces': ['Fraunces', 'serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      keyframes: {
        // Horizontal shake for an invalid-password field (login screen).
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-5px)' },
          '40%, 80%': { transform: 'translateX(5px)' },
        },
      },
      animation: {
        shake: 'shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

