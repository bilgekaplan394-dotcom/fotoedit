import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './globals.css'; // BURASI ÇOK ÖNEMLİ: CSS dosyasını import etmeli

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);