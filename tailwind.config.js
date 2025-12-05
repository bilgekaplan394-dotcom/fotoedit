/** @type {import('tailwindcss').Config} */
export default {
  // Projedeki tüm .html, .jsx, .js vb. dosyalarını taramasını sağlıyoruz.
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Custom Colors (Koyu temayı ve cyan rengini desteklemek için)
      colors: {
        'cyan': {
          400: '#22d3ee', // Özellikle kullanılan cyan tonu
          500: '#06b6d4'
        },
        'slate': {
            950: '#020617'
        }
      }
    },
  },
  plugins: [],
}