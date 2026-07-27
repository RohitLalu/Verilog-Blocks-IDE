// httpApi must be imported first — sets window.api for Docker/web mode
// In Electron, window.api is already set by preload.js and this is a no-op
import './lib/httpApi.js';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
