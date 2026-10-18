/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#15142A',
        ink: '#0F0E1E',
        orange: '#E8440A',
        ember: '#FF5A1F',
        amber: '#FFB347',
        violet: '#3B2FF5',
        lilac: '#A99EFF',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-orange': '0 4px 24px -6px rgba(232, 68, 10, 0.55)',
        'glow-amber': '0 4px 24px -6px rgba(255, 179, 71, 0.45)',
        card: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px -12px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'ember-gradient': 'linear-gradient(135deg, #FF5A1F 0%, #E8440A 60%, #D03D09 100%)',
      },
    },
  },
  plugins: [],
};
