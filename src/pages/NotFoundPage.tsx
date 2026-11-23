import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';

export default function NotFoundPage(): JSX.Element {
  return (
    <div className="center-page">
      <EmptyState
        icon={<Logo size={20} />}
        title="Página não encontrada"
        description="O endereço acessado não existe ou foi movido."
        action={<Link to="/" className="ui-btn ui-btn-secondary">Voltar ao painel</Link>}
      />
    </div>
  );
}
