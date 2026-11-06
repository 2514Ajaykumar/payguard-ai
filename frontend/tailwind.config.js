/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#080B11',
          surface: '#0E131F',
          card: '#131A2B',
          elevated: '#1A233A',
        },
        border: {
          subtle: '#1E293B',
          muted: '#27354E',
        },
        accent: {
          primary: '#0070BA', // PayPal blue heritage
          secondary: '#009CDE',
          cyan: '#06B6D4',
        },
        status: {
          approved: {
            DEFAULT: '#10B981',
            muted: 'rgba(16, 185, 129, 0.12)',
            border: 'rgba(16, 185, 129, 0.25)',
          },
          review: {
            DEFAULT: '#F59E0B',
            muted: 'rgba(245, 158, 11, 0.12)',
            border: 'rgba(245, 158, 11, 0.25)',
          },
          blocked: {
            DEFAULT: '#EF4444',
            muted: 'rgba(239, 68, 68, 0.12)',
            border: 'rgba(239, 68, 68, 0.25)',
          },
          info: {
            DEFAULT: '#3B82F6',
            muted: 'rgba(59, 130, 246, 0.12)',
            border: 'rgba(59, 130, 246, 0.25)',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
