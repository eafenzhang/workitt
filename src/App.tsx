import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import Index from './pages/Index';
import { AuthProvider } from './context/AuthContext';
import { useState, useEffect, lazy, Suspense } from 'react';

const QuickCapture = lazy(() => import('./components/QuickCapture'));

const App = () => {
  const isQCPopup = !!(window as any).electronAPI?.__isQCPopup;
  if (isQCPopup) return <Suspense fallback={null}><QuickCapture /></Suspense>;

  const [qcEnabled, setQcEnabled] = useState(false);
  useEffect(() => {
    try { setQcEnabled(localStorage.getItem('quick_collect_enabled') === 'true'); } catch {}
    const h = (e: Event) => setQcEnabled((e as CustomEvent<{enabled:boolean}>).detail.enabled);
    window.addEventListener('quick-collect-toggle', h);
    return () => window.removeEventListener('quick-collect-toggle', h);
  }, []);

  // Global link interception: open external URLs in built-in browser tab
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href && /^https?:\/\//.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('open-browser-tab', { detail: { url: href } }));
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  return (
    <AuthProvider>
      <MemoryRouter>
        <Index />
        {qcEnabled && <Suspense fallback={null}><QuickCapture /></Suspense>}
        <Toaster position="top-right" />
      </MemoryRouter>
    </AuthProvider>
  );
};

export default App;