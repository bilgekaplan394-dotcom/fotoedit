/** @type {import('tailwindcss').Config} */
export default {
  // Bu ayar, Tailwind'e tüm .html ve .jsx dosyalarındaki sınıfları taramasını söyler
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Özel renkleriniz ve stilleriniz
      colors: {
        'cyan': {
          50: '#ecfeff', 
          // Diğer tonlar
        },
        'slate': {
            950: '#020617'
        }
      }
    },
  },
  plugins: [],
}