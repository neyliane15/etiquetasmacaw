import type { ReactNode } from 'react';
import type { PapelUsuario } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyState } from '@/components/ui';

export interface RequireRoleProps {
  papeis: PapelUsuario[];
  children: ReactNode;
}

export function RequireRole({ papeis, children }: RequireRoleProps): JSX.Element {
  const { temPapel } = useAuth();
  if (!temPapel(...papeis)) {
    return (
      <EmptyState
        title="Sem permissão"
        description="Seu perfil não tem acesso a esta área. Fale com um gerente ou administrador."
        icon={
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="3.5" y="8" width="11" height="7.5" rx="1" />
            <path d="M6 8V5.8a3 3 0 0 1 6 0V8" />
          </svg>
        }
      />
    );
  }
  return <>{children}</>;
}

export default RequireRole;
