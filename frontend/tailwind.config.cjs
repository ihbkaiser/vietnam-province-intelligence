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
        ink: '#102430',
        tide: '#0f6d70',
        sand: '#f6efe2',
        coral: '#dc7f5f',
        mist: '#dce8e6'
      },
      boxShadow: {
        panel: '0 24px 60px rgba(16, 36, 48, 0.14)'
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(16,36,48,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,36,48,0.06) 1px, transparent 1px)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};

