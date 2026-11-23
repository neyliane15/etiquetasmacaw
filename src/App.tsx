import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import type { PapelUsuario } from '@/types/database';
import { AuthProvider } from '@/contexts/AuthContext';
import { UnidadeProvider } from '@/contexts/UnidadeContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { RequireRole } from '@/components/layout/RequireRole';
import { Spinner } from '@/components/ui';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import NotFoundPage from '@/pages/NotFoundPage';

// Páginas de domínio (Frontend B) — carregadas sob demanda
const EtiquetasPage = lazy(() => import('@/pages/etiquetas/EtiquetasPage'));
const EmitirEtiquetaPage = lazy(() => import('@/pages/etiquetas/EmitirEtiquetaPage'));
const BaixaRapidaPage = lazy(() => import('@/pages/etiquetas/BaixaRapidaPage'));
const EtiquetaDetalhePage = lazy(() => import('@/pages/etiquetas/EtiquetaDetalhePage'));
const RecebimentosPage = lazy(() => import('@/pages/recebimentos/RecebimentosPage'));
const NovoRecebimentoPage = lazy(() => import('@/pages/recebimentos/NovoRecebimentoPage'));
const RecebimentoDetalhePage = lazy(() => import('@/pages/recebimentos/RecebimentoDetalhePage'));
const TemperaturasPage = lazy(() => import('@/pages/temperaturas/TemperaturasPage'));
const EquipamentosPage = lazy(() => import('@/pages/temperaturas/EquipamentosPage'));
const DescartesPage = lazy(() => import('@/pages/descartes/DescartesPage'));
const ChecklistsPage = lazy(() => import('@/pages/checklists/ChecklistsPage'));
const ExecutarChecklistPage = lazy(() => import('@/pages/checklists/ExecutarChecklistPage'));
const ProdutosPage = lazy(() => import('@/pages/produtos/ProdutosPage'));
const CategoriasPage = lazy(() => import('@/pages/categorias/CategoriasPage'));
const FornecedoresPage = lazy(() => import('@/pages/fornecedores/FornecedoresPage'));
const ModelosPage = lazy(() => import('@/pages/modelos/ModelosPage'));
const RelatoriosPage = lazy(() => import('@/pages/relatorios/RelatoriosPage'));
const UsuariosPage = lazy(() => import('@/pages/usuarios/UsuariosPage'));
const UnidadesPage = lazy(() => import('@/pages/unidades/UnidadesPage'));
const ConsultaQrPage = lazy(() => import('@/pages/publico/ConsultaQrPage'));

const GESTOR: PapelUsuario[] = ['admin', 'gerente'];
const ADMIN: PapelUsuario[] = ['admin'];

function Carregando(): JSX.Element {
  return (
    <div className="ui-spinner-page">
      <Spinner label="Carregando…" />
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }): JSX.Element {
  return <Suspense fallback={<Carregando />}>{children}</Suspense>;
}

function Papel({ papeis, children }: { papeis: PapelUsuario[]; children: ReactNode }): JSX.Element {
  return (
    <RequireRole papeis={papeis}>
      <Lazy>{children}</Lazy>
    </RequireRole>
  );
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/q/:codigo" element={<Lazy><ConsultaQrPage /></Lazy>} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <UnidadeProvider>
                  <AppLayout />
                </UnidadeProvider>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="etiquetas" element={<Lazy><EtiquetasPage /></Lazy>} />
            <Route path="etiquetas/nova" element={<Lazy><EmitirEtiquetaPage /></Lazy>} />
            <Route path="etiquetas/baixa" element={<Lazy><BaixaRapidaPage /></Lazy>} />
            <Route path="etiquetas/:id" element={<Lazy><EtiquetaDetalhePage /></Lazy>} />
            <Route path="recebimentos" element={<Lazy><RecebimentosPage /></Lazy>} />
            <Route path="recebimentos/novo" element={<Lazy><NovoRecebimentoPage /></Lazy>} />
            <Route path="recebimentos/:id" element={<Lazy><RecebimentoDetalhePage /></Lazy>} />
            <Route path="temperaturas" element={<Lazy><TemperaturasPage /></Lazy>} />
            <Route path="equipamentos" element={<Papel papeis={GESTOR}><EquipamentosPage /></Papel>} />
            <Route path="descartes" element={<Lazy><DescartesPage /></Lazy>} />
            <Route path="checklists" element={<Lazy><ChecklistsPage /></Lazy>} />
            <Route path="checklists/:id/executar" element={<Lazy><ExecutarChecklistPage /></Lazy>} />
            <Route path="produtos" element={<Lazy><ProdutosPage /></Lazy>} />
            <Route path="categorias" element={<Papel papeis={GESTOR}><CategoriasPage /></Papel>} />
            <Route path="fornecedores" element={<Papel papeis={GESTOR}><FornecedoresPage /></Papel>} />
            <Route path="modelos" element={<Papel papeis={GESTOR}><ModelosPage /></Papel>} />
            <Route path="relatorios" element={<Papel papeis={GESTOR}><RelatoriosPage /></Papel>} />
            <Route path="usuarios" element={<Papel papeis={ADMIN}><UsuariosPage /></Papel>} />
            <Route path="unidades" element={<Papel papeis={ADMIN}><UnidadesPage /></Papel>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
