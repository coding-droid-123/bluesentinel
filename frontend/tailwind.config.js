/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // 60% Dominant: Crisp White & Light Surfaces
        primary: '#f8fafc',
        secondary: '#ffffff',
        card: '#ffffff',
        cardHover: '#f1f5f9',
        cardSubtle: '#f8fafc',
        border: '#e2e8f0',
        borderLight: '#cbd5e1',
        textPrimary: '#0f172a',
        textSecondary: '#334155',
        textMuted: '#64748b',

        // 30% Secondary: Marine & Ocean Blues
        oceanNavy: '#0b2545',
        oceanDeep: '#0f2e5a',
        accentBlue: '#2563eb',
        oceanBlue: '#1d4ed8',
        oceanSky: '#0284c7',
        oceanLight: '#eff6ff',
        oceanBorder: '#bfdbfe',

        // 10% Accent: Eco Emerald Green (CTAs, Status & Success)
        accentGreen: '#10b981',
        greenHover: '#059669',
        greenLight: '#ecfdf5',
        greenBorder: '#a7f3d0',
        greenDark: '#047857',

        // Indicator hues
        accentOrange: '#f97316',
        accentRed: '#ef4444',
        accentYellow: '#eab308',
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04)',
        'card': '0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
        'card-hover': '0 10px 15px -3px rgba(15, 23, 42, 0.09), 0 4px 6px -4px rgba(15, 23, 42, 0.06)',
        'blue-glow': '0 0 15px rgba(37, 99, 235, 0.2)',
        'green-glow': '0 0 15px rgba(16, 185, 129, 0.25)',
      }
    },
  },
  plugins: [],
}
