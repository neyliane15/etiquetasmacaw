import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button, EmptyState, Spinner } from '@/components/ui';

export function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { userId, perfil, carregando, signOut } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="full-center">
        <Spinner label="Carregando…" />
      </div>
    );
  }

  if (!userId) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!perfil || !perfil.ativo) {
    return (
      <div className="full-center">
        <EmptyState
          title="Acesso bloqueado"
          description={
            perfil
              ? !perfil.unidade_id && perfil.papel === 'cozinheiro'
                ? 'Seu cadastro foi recebido e aguarda liberação por um administrador (papel e unidade).'
                : 'Seu usuário está inativo. Fale com o administrador da unidade.'
              : 'Não foi possível carregar seu perfil. Fale com o administrador.'
          }
          action={<Button onClick={() => void signOut()}>Sair</Button>}
        />
      </div>
    );
  }

  return <>{children}</>;
}

export default RequireAuth;
