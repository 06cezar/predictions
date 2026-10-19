/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Playful "sticker" theme: "white" is the ink colour, so every text-white/60,
        // bg-white/5 and border-white/10 in the app becomes ink on a sunny page.
        white: '#1B1A1F',
        paper: '#FFFFFF', // real white, for text on coloured buttons and avatars
        cream: '#FFF3D1', // page background
        navy: '#FFFFFF', // raised surfaces (navbar, selects)
        ink: '#1B1A1F',
        orange: '#F2542D', // tomato: the main action colour
        ember: '#FF6B3D',
        amber: '#B76E00',
        violet: '#7B4DFF',
        lilac: '#6236E8',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      // Faint ink (text-white/30 and friends) was too light to read on the yellow page
      opacity: {
        25: '0.45',
        30: '0.5',
        35: '0.54',
        40: '0.58',
        45: '0.62',
        50: '0.66',
      },
      boxShadow: {
        'glow-orange': '2px 2px 0 #1B1A1F',
        'glow-amber': '2px 2px 0 #1B1A1F',
        card: '3px 3px 0 #1B1A1F',
      },
      backgroundImage: {
        'ember-gradient': 'linear-gradient(135deg, #FF6B3D 0%, #F2542D 100%)',
      },
    },
  },
  plugins: [],
};
