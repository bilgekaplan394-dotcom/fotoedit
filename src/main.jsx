import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
// Tailwind CSS'in inşa sürecinde çalışması için gerekli global CSS (Bu dosyayı manuel olarak oluşturmanız gerekmez, Vite/Tailwind bunu halleder.)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);