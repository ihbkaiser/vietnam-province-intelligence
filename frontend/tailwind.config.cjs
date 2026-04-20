/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif']
      },
      colors: {
        ink: '#17202a',
        tide: '#007a78',
        sand: '#f6f8fb',
        coral: '#e25f3f',
        mist: '#e6f3f1',
        signal: '#2563eb',
        field: '#eef4f7'
      },
      boxShadow: {
        panel: '0 14px 36px rgba(23, 32, 42, 0.10)',
        soft: '0 8px 22px rgba(23, 32, 42, 0.08)'
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(23,32,42,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(23,32,42,0.055) 1px, transparent 1px)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};
