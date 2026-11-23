import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PAPEL_ROTULO } from '@/types/database';
import { Button } from '@/components/ui';
import { UnidadeSelector } from './UnidadeSelector';

const TITULOS: [RegExp, string][] = [
  [/^\/$/, 'Painel'],
  [/^\/etiquetas\/nova/, 'Emitir etiqueta'],
  [/^\/etiquetas\/baixa/, 'Baixa rápida'],
  [/^\/etiquetas\/[^/]+/, 'Etiqueta'],
  [/^\/etiquetas/, 'Etiquetas'],
  [/^\/recebimentos\/novo/, 'Novo recebimento'],
  [/^\/recebimentos\/[^/]+/, 'Recebimento'],
  [/^\/recebimentos/, 'Recebimentos'],
  [/^\/temperaturas/, 'Temperaturas'],
  [/^\/equipamentos/, 'Equipamentos'],
  [/^\/descartes/, 'Descartes'],
  [/^\/checklists\/[^/]+\/executar/, 'Executar checklist'],
  [/^\/checklists/, 'Checklists'],
  [/^\/produtos/, 'Produtos'],
  [/^\/categorias/, 'Categorias'],
  [/^\/fornecedores/, 'Fornecedores'],
  [/^\/modelos/, 'Modelos de etiqueta'],
  [/^\/relatorios/, 'Relatórios'],
  [/^\/usuarios/, 'Usuários'],
  [/^\/unidades/, 'Unidades'],
];

export function tituloDaRota(pathname: string): string {
  return TITULOS.find(([re]) => re.test(pathname))?.[1] ?? 'Etiquetas Macaw';
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '·';
}

export interface HeaderProps {
  onMenu?(): void;
}

export function Header({ onMenu }: HeaderProps): JSX.Element {
  const { perfil, signOut } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [saindo, setSaindo] = useState(false);

  const sair = async () => {
    setSaindo(true);
    try {
      await signOut();
    } finally {
      setSaindo(false);
      navigate('/login', { replace: true });
    }
  };

  return (
    <header className="app-header">
      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm app-header-menu" onClick={onMenu} aria-label="Abrir menu">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
          <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
        </svg>
      </button>
      <div className="app-header-title">{tituloDaRota(pathname)}</div>
      <div className="spacer" />
      <UnidadeSelector />
      {perfil && (
        <div className="app-header-user">
          <div className="app-header-user-info">
            <span className="app-header-user-name">{perfil.nome}</span>
            <span className="app-header-user-role">{PAPEL_ROTULO[perfil.papel]}</span>
          </div>
          <span className="avatar" aria-hidden="true">{iniciais(perfil.nome)}</span>
          <Button variant="ghost" size="sm" onClick={sair} loading={saindo} title="Sair">
            Sair
          </Button>
        </div>
      )}
    </header>
  );
}

export default Header;
