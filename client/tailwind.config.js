/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Light editorial theme: "white" is the ink colour, so every text-white/60,
        // bg-white/5 and border-white/10 in the app becomes ink on warm paper.
        white: '#211C17',
        paper: '#FFFFFF', // real white, for text on coloured buttons and avatars
        cream: '#FAF6EF', // page background
        navy: '#FFFDF9', // raised surfaces (navbar, selects)
        ink: '#211C17',
        orange: '#D9480F',
        ember: '#E8590C',
        amber: '#B86E00',
        violet: '#4C3FD9',
        lilac: '#5B4BDB',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-orange': '0 4px 14px -6px rgba(217, 72, 15, 0.45)',
        'glow-amber': '0 4px 14px -6px rgba(184, 110, 0, 0.35)',
        card: '0 1px 2px rgba(33, 28, 23, 0.04), 0 8px 24px -16px rgba(33, 28, 23, 0.18)',
      },
      backgroundImage: {
        'ember-gradient': 'linear-gradient(135deg, #E8590C 0%, #D9480F 60%, #C2410C 100%)',
      },
    },
  },
  plugins: [],
};
