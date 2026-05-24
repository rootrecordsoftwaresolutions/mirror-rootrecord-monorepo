/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui'],
        display: ['"Bricolage Grotesque"', 'Outfit', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Bold gradient theme — twilight sky meets sunset.
        app: '#0a0a1f',
        container: 'rgba(255, 255, 255, 0.04)',
        containerHover: 'rgba(255, 255, 255, 0.08)',
        elevated: 'rgba(255, 255, 255, 0.10)',
        subtle: 'rgba(255, 255, 255, 0.12)',
        accent: '#ffb86b',
        accentHover: '#ffd494',
        coral: '#ff5e9c',
        sky: '#5ec8ff',
        violet: '#9d6bff',
        sev: {
          minor: '#FBBF24',
          moderate: '#F97316',
          severe: '#EF4444',
          extreme: '#991B1B',
        },
        mag: {
          low: '#94A3B8',
          mid: '#FACC15',
          high: '#F97316',
          critical: '#DC2626',
        },
      },
      backgroundImage: {
        'sunset-gradient':
          'linear-gradient(135deg, #0a0a1f 0%, #1d1148 22%, #6b2476 50%, #d4456f 75%, #ff8a4c 100%)',
        'aurora-gradient':
          'radial-gradient(circle at 20% 10%, rgba(255, 94, 156, 0.35), transparent 45%), radial-gradient(circle at 80% 0%, rgba(94, 200, 255, 0.30), transparent 50%), radial-gradient(circle at 60% 90%, rgba(255, 184, 107, 0.25), transparent 55%), linear-gradient(180deg, #0a0a1f 0%, #14112e 100%)',
        'card-gradient':
          'linear-gradient(135deg, rgba(255, 184, 107, 0.10) 0%, rgba(255, 94, 156, 0.06) 50%, rgba(94, 200, 255, 0.10) 100%)',
        'hero-gradient':
          'linear-gradient(135deg, rgba(255, 184, 107, 0.18) 0%, rgba(255, 94, 156, 0.14) 45%, rgba(157, 107, 255, 0.18) 100%)',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(8, 8, 30, 0.45)',
        glow: '0 0 32px 0 rgba(255, 184, 107, 0.35)',
        'glow-coral': '0 0 24px 0 rgba(255, 94, 156, 0.40)',
      },
      backdropBlur: {
        xs: '6px',
      },
      animation: {
        fadein: 'fadein .35s ease-out',
        slideup: 'slideup .35s ease-out',
        spinSlow: 'spin 1.4s linear infinite',
        shimmer: 'shimmer 2.5s ease-in-out infinite',
        'gradient-shift': 'gradientShift 16s ease infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadein: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideup: {
          '0%': { transform: 'translateY(16px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        shimmer: {
          '0%, 100%': { opacity: 0.6 },
          '50%': { opacity: 1 },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
};
