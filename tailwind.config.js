/** @type {import('tailwindcss').Config} */

export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
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
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
          hover: 'hsl(var(--secondary-hover))',
        },
        tertiary: {
          DEFAULT: 'hsl(var(--tertiary))',
          foreground: 'hsl(var(--tertiary-foreground))',
          hover: 'hsl(var(--tertiary-hover))',
        },
        'brand-soft': {
          DEFAULT: 'hsl(var(--brand-soft))',
          foreground: 'hsl(var(--brand-soft-foreground))',
          hover: 'hsl(var(--brand-soft-hover))',
        },
        'info-soft': {
          DEFAULT: 'hsl(var(--info-soft))',
          foreground: 'hsl(var(--info-soft-foreground))',
          hover: 'hsl(var(--info-soft-hover))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        warm: {
          DEFAULT: 'hsl(var(--warm))',
          hover: 'hsl(var(--warm-hover))',
          foreground: 'hsl(var(--warm-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          hover: 'hsl(var(--destructive-hover))',
          soft: 'hsl(var(--destructive-soft))',
          strong: 'hsl(var(--destructive-strong))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          hover: 'hsl(var(--success-hover))',
          soft: 'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          hover: 'hsl(var(--warning-hover))',
          soft: 'hsl(var(--warning-soft))',
          'soft-hover': 'hsl(var(--warning-soft-hover))',
          strong: 'hsl(var(--warning-strong))',
        },
        violet: {
          DEFAULT: 'hsl(var(--violet))',
          foreground: 'hsl(var(--violet-foreground))',
          soft: 'hsl(var(--violet-soft))',
          strong: 'hsl(var(--violet-strong))',
        },
        teal: {
          DEFAULT: 'hsl(var(--teal))',
          foreground: 'hsl(var(--teal-foreground))',
          soft: 'hsl(var(--teal-soft))',
          strong: 'hsl(var(--teal-strong))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
          hover: 'hsl(var(--muted-hover))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          soft: 'hsl(var(--accent-soft))',
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
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          foreground: 'hsl(var(--sidebar-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
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
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

