import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tokens.css';
import '@/styles/global.css';
import '@/styles/ui.css';
import '@/styles/layout.css';
import '@/styles/print.css';
import { ToastProvider } from '@/components/ui';
import App from '@/App';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado.');

createRoot(container).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
