import { MemoryRouter } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import Index from './pages/Index';
import UpdateDialog from './components/UpdateDialog';
import { AgentOSProvider } from './context/AgentOSContext';
import { useState, useEffect, lazy, Suspense, useRef } from 'react';

const QuickCapture = lazy(() => import('./components/QuickCapture'));

const App = () => {
  const isQCPopup = !!window.electronAPI?.__isQCPopup;
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
      const anchor = target.closest('a') || target.closest('button');
      if (!anchor) return;
      // Skip elements explicitly marked for external/system browser
      if (anchor.hasAttribute('data-bypass-interceptor')) return;
      const href = anchor.getAttribute('href') || (anchor as HTMLAnchorElement).href;
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
      <MemoryRouter>
        <AgentOSProvider>
          <Index />
          <UpdateDialog />
        </AgentOSProvider>
        {qcEnabled && <Suspense fallback={null}><QuickCapture /></Suspense>}
        <Toaster position="top-right" />
      </MemoryRouter>
  );
};

export default App;