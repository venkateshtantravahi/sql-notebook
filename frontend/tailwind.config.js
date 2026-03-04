/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
      "./index.html",
      "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
      },
      fontSize: {
        'xs': ['13px', { lineHeight: '1.55' }],
        'sm': ['14.5px', { lineHeight: '1.6'  }],
      },
      },
  },
  plugins: [],
}

