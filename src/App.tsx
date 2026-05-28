import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import Index from './pages/Index';
import QuickCapture from './components/QuickCapture';
import { AuthProvider } from './context/AuthContext';
import { useState, useEffect } from 'react';

const App = () => {
  const isQCPopup = !!(window as any).electronAPI?.__isQCPopup;
  if (isQCPopup) return <QuickCapture />;

  const [qcEnabled, setQcEnabled] = useState(false);
  useEffect(() => {
    try { setQcEnabled(localStorage.getItem('quick_collect_enabled') === 'true'); } catch {}
    const h = (e: Event) => setQcEnabled((e as CustomEvent<{enabled:boolean}>).detail.enabled);
    window.addEventListener('quick-collect-toggle', h);
    return () => window.removeEventListener('quick-collect-toggle', h);
  }, []);

  return (
    <AuthProvider>
      <MemoryRouter>
        <Index />
        {qcEnabled && <QuickCapture />}
        <Toaster position="top-right" />
      </MemoryRouter>
    </AuthProvider>
  );
};

export default App;