/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm forest-inspired palette
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        // Warm neutral tones
        sand: {
          50: '#fdfcfb',
          100: '#f9f6f3',
          200: '#f3ede6',
          300: '#e8dfd3',
          400: '#d4c4b0',
          500: '#b8a389',
          600: '#9a8268',
          700: '#7d6852',
          800: '#5f4f40',
          900: '#453a30',
        },
        // Accent warm brown
        bark: {
          50: '#faf6f3',
          100: '#f0e8e0',
          200: '#e0d0c0',
          300: '#c9ad94',
          400: '#b38c6d',
          500: '#9a7355',
          600: '#825f47',
          700: '#6b4d3b',
          800: '#5a4234',
          900: '#4d392f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Cal Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 10px 40px -10px rgba(0, 0, 0, 0.1), 0 2px 10px -2px rgba(0, 0, 0, 0.04)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
