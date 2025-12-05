/** @type {import('tailwindcss').Config} */
export default {
  // Projenizdeki tüm Tailwind sınıflarını içeren dosyaların yolları.
  // Bu, Vite'ın App.jsx ve diğer tüm .jsx dosyalarınızdaki sınıfları bulmasını sağlar.
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Özel renklerinizi veya fontlarınızı buraya ekleyebilirsiniz (örn: cyan-900/30)
      colors: {
        'cyan': {
          50: '#ecfeff', 
          // Diğer tonlar (kullanılan cyan renklerini desteklemek için)
        },
      }
    },
  },
  plugins: [],
}