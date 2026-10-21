/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      colors: {
        brand: { 50: '#effcf9', 100: '#c9f6ec', 200: '#95ecdb', 300: '#59dac6', 400: '#28bfac', 500: '#0fa394', 600: '#0a8379', 700: '#0d6962', 800: '#10534f', 900: '#124542', 950: '#032a29' },
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)' },
    },
  },
  plugins: [],
};
