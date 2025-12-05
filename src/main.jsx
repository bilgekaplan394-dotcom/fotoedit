import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './global.css'; // DÜZELTME: Dosya adını 'global.css' (tek L) ile eşleştirdik

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);