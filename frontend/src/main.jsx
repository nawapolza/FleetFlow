import './ledger.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './redesign.css';
import './mobile-home.css';
import './accessible-update.css';
import './responsive-ton-layout.css';

function markDeviceMode() {
  try {
    const ua = navigator.userAgent || '';
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Line|FBAN|FBAV/i.test(ua);
    const touchSmall = navigator.maxTouchPoints > 1 && Math.min(window.screen.width || 0, window.innerWidth || 0) <= 900;
    document.documentElement.dataset.device = mobileUa || touchSmall ? 'mobile' : 'desktop';
  } catch (_) {
    document.documentElement.dataset.device = 'desktop';
  }
}

markDeviceMode();

createRoot(document.getElementById('root')).render(
  <App />,
);
