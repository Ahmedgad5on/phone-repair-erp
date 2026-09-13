import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Install global fetch interceptor to ensure CSRF headers and auth tokens are attached to all /api calls
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  let url = '';
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.href;
  } else if (input && typeof input === 'object' && 'url' in input) {
    url = input.url;
  }

  if (url.startsWith('/api') || url.includes('/api/')) {
    const token = localStorage.getItem('erp_token') || localStorage.getItem('auth_token');
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : {}));

    if (!headers.has('X-Requested-With')) {
      headers.set('X-Requested-With', 'XMLHttpRequest');
    }
    if (!headers.has('X-ERP-Client')) {
      headers.set('X-ERP-Client', 'desktop');
    }
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return originalFetch(input, { ...init, headers });
  }

  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
