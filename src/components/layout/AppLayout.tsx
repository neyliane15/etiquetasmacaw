import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout(): JSX.Element {
  const [menuAberto, setMenuAberto] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  return (
    <div className="app-shell">
      <Sidebar open={menuAberto} onNavigate={() => setMenuAberto(false)} />
      <div className={`sidebar-backdrop${menuAberto ? ' open' : ''}`} onClick={() => setMenuAberto(false)} aria-hidden="true" />
      <div className="app-main">
        <Header onMenu={() => setMenuAberto((v) => !v)} />
        <main className="app-content" id="conteudo">
          <Suspense fallback={<div className="ui-spinner-page"><Spinner label="Carregando…" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
