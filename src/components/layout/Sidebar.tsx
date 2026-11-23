import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { PapelUsuario } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from './Logo';

/* Ícones de traço fino (16×16, stroke currentColor). */
const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
export const icons: Record<string, ReactNode> = {
  painel: (<svg viewBox="0 0 16 16" {...s}><rect x="2" y="2" width="5" height="6" rx=".6" /><rect x="9" y="2" width="5" height="3.5" rx=".6" /><rect x="2" y="10" width="5" height="4" rx=".6" /><rect x="9" y="7.5" width="5" height="6.5" rx=".6" /></svg>),
  emitir: (<svg viewBox="0 0 16 16" {...s}><path d="M8 3v10M3 8h10" /></svg>),
  etiquetas: (<svg viewBox="0 0 16 16" {...s}><path d="M2.5 3.5v4.1c0 .3.1.5.3.7l5.4 5.4c.4.4 1 .4 1.4 0l3.7-3.7c.4-.4.4-1 0-1.4L7.9 3.2a1 1 0 0 0-.7-.3H3.1a.6.6 0 0 0-.6.6z" /><circle cx="5.3" cy="5.7" r=".9" /></svg>),
  baixa: (<svg viewBox="0 0 16 16" {...s}><path d="M2 4V2.5h2M12 2.5h2V4M14 12v1.5h-2M4 13.5H2V12" /><path d="M4.5 5v6M6.5 5v6M8.5 5v6M11.5 5v6M10 5v6" /></svg>),
  recebimento: (<svg viewBox="0 0 16 16" {...s}><path d="M2.5 5.5L8 2.5l5.5 3v5L8 13.5l-5.5-3z" /><path d="M2.5 5.5L8 8.5l5.5-3M8 8.5v5" /></svg>),
  temperaturas: (<svg viewBox="0 0 16 16" {...s}><path d="M6.5 9.4V3a1.5 1.5 0 0 1 3 0v6.4a2.8 2.8 0 1 1-3 0z" /><path d="M8 10.5V6" /></svg>),
  descartes: (<svg viewBox="0 0 16 16" {...s}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.3 4.5l.6 8.5c0 .3.3.5.6.5h5c.3 0 .6-.2.6-.5l.6-8.5" /><path d="M6.8 7v4M9.2 7v4" /></svg>),
  checklists: (<svg viewBox="0 0 16 16" {...s}><path d="M7 4h6.5M7 8h6.5M7 12h6.5" /><path d="M2.5 4l1 1 1.7-2M2.5 8l1 1 1.7-2M2.5 12l1 1 1.7-2" /></svg>),
  produtos: (<svg viewBox="0 0 16 16" {...s}><path d="M3 6.5h10l-.8 6.4c0 .4-.4.6-.7.6H4.5c-.3 0-.7-.2-.7-.6z" /><path d="M5.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" /></svg>),
  categorias: (<svg viewBox="0 0 16 16" {...s}><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="2.25" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="2.25" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></svg>),
  fornecedores: (<svg viewBox="0 0 16 16" {...s}><path d="M1.5 4.5h8v6h-8zM9.5 6.5h2.8l2.2 2.3v1.7h-5" /><circle cx="4.3" cy="11.5" r="1.2" /><circle cx="11.8" cy="11.5" r="1.2" /></svg>),
  modelos: (<svg viewBox="0 0 16 16" {...s}><rect x="2" y="3.5" width="12" height="9" rx="1" /><path d="M4.5 6.5h4M4.5 9h3" /><rect x="10" y="6" width="2" height="2" /></svg>),
  equipamentos: (<svg viewBox="0 0 16 16" {...s}><rect x="3.5" y="1.5" width="9" height="13" rx="1" /><path d="M3.5 6.5h9M5.5 3.5v1.5M5.5 8.5v2.5" /></svg>),
  relatorios: (<svg viewBox="0 0 16 16" {...s}><path d="M2.5 13.5h11" /><path d="M4.5 11V8M7.5 11V4.5M10.5 11V6.5" /></svg>),
  usuarios: (<svg viewBox="0 0 16 16" {...s}><circle cx="6" cy="5.5" r="2.3" /><path d="M2 13.2c.4-2.2 2-3.5 4-3.5s3.6 1.3 4 3.5" /><path d="M10.5 3.5a2.1 2.1 0 0 1 0 4M12 9.9c1.1.5 1.8 1.6 2 3.1" /></svg>),
  unidades: (<svg viewBox="0 0 16 16" {...s}><path d="M2 13.5h12M3 13.5V6l5-3 5 3v7.5" /><path d="M6.5 13.5v-3.5h3v3.5" /></svg>),
};

export interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof icons;
  papeis?: PapelUsuario[];
  end?: boolean;
}

const GESTOR: PapelUsuario[] = ['admin', 'gerente'];
const ADMIN: PapelUsuario[] = ['admin'];

export const NAV_PRINCIPAL: NavItem[] = [
  { to: '/', label: 'Painel', icon: 'painel', end: true },
  { to: '/etiquetas', label: 'Etiquetas', icon: 'etiquetas', end: true },
  { to: '/etiquetas/baixa', label: 'Baixa rápida', icon: 'baixa' },
  { to: '/recebimentos', label: 'Recebimento', icon: 'recebimento' },
  { to: '/temperaturas', label: 'Temperaturas', icon: 'temperaturas' },
  { to: '/descartes', label: 'Descartes', icon: 'descartes' },
  { to: '/checklists', label: 'Checklists', icon: 'checklists' },
];
export const NAV_CADASTROS: NavItem[] = [
  { to: '/produtos', label: 'Produtos', icon: 'produtos' },
  { to: '/categorias', label: 'Categorias', icon: 'categorias', papeis: GESTOR },
  { to: '/fornecedores', label: 'Fornecedores', icon: 'fornecedores', papeis: GESTOR },
  { to: '/modelos', label: 'Modelos', icon: 'modelos', papeis: GESTOR },
  { to: '/equipamentos', label: 'Equipamentos', icon: 'equipamentos', papeis: GESTOR },
];
export const NAV_GESTAO: NavItem[] = [
  { to: '/relatorios', label: 'Relatórios', icon: 'relatorios', papeis: GESTOR },
  { to: '/usuarios', label: 'Usuários', icon: 'usuarios', papeis: ADMIN },
  { to: '/unidades', label: 'Unidades', icon: 'unidades', papeis: ADMIN },
];

export interface SidebarProps {
  open?: boolean;
  onNavigate?(): void;
}

export function Sidebar({ open = false, onNavigate }: SidebarProps): JSX.Element {
  const { temPapel } = useAuth();
  const visivel = (i: NavItem) => !i.papeis || temPapel(...i.papeis);

  const renderGrupo = (titulo: string | null, itens: NavItem[]) => {
    const lista = itens.filter(visivel);
    if (lista.length === 0) return null;
    return (
      <>
        {titulo && <div className="sidebar-section">{titulo}</div>}
        {lista.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            onClick={onNavigate}
          >
            {icons[i.icon]}
            <span>{i.label}</span>
          </NavLink>
        ))}
      </>
    );
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Navegação principal">
      <Link to="/" className="sidebar-brand" onClick={onNavigate}>
        <Logo size={30} title="Macaw" />
        <span className="sidebar-brand-text">
          <span className="sidebar-brand-name">Macaw</span>
          <span className="sidebar-brand-sub">Etiquetas</span>
        </span>
      </Link>
      <div className="sidebar-cta">
        <Link to="/etiquetas/nova" className="ui-btn ui-btn-primary ui-btn-block" onClick={onNavigate}>
          <span className="ui-btn-icon" aria-hidden="true">{icons.emitir}</span>
          Emitir etiqueta
        </Link>
      </div>
      <nav className="sidebar-nav">
        {renderGrupo(null, NAV_PRINCIPAL)}
        {renderGrupo('Cadastros', NAV_CADASTROS)}
        {renderGrupo('Gestão', NAV_GESTAO)}
      </nav>
      <div className="sidebar-foot">Segurança de alimentos · RDC 216</div>
    </aside>
  );
}

export default Sidebar;
