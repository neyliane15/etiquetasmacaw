import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Unidade, UUID } from '@/types/database';
import { listUnidades } from '@/lib/api/unidades';
import { useAuth } from '@/contexts/AuthContext';

export interface UnidadeContextValue {
  unidades: Unidade[];
  unidadeAtual: Unidade | null;
  /** null só p/ admin em 'Todas' */
  unidadeId: UUID | null;
  podeTrocar: boolean;
  setUnidadeId(id: UUID | null): void;
  carregando: boolean;
}

const STORAGE_KEY = 'macaw.unidadeId';
const TODAS = '__todas__';

function lerPreferencia(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function salvarPreferencia(id: UUID | null): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id ?? TODAS);
  } catch {
    /* armazenamento indisponível */
  }
}

const UnidadeContext = createContext<UnidadeContextValue | null>(null);

export function UnidadeProvider({ children }: { children: ReactNode }): JSX.Element {
  const { perfil } = useAuth();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [escolhida, setEscolhida] = useState<UUID | null>(null);
  const [carregando, setCarregando] = useState(true);

  const isAdmin = perfil?.papel === 'admin';
  const podeTrocar = isAdmin;

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    listUnidades()
      .then((lista) => {
        if (!ativo) return;
        const ativas = lista.filter((u) => u.ativo);
        setUnidades(ativas);
        if (perfil?.papel === 'admin') {
          const pref = lerPreferencia();
          if (pref === TODAS) setEscolhida(null);
          else if (pref && ativas.some((u) => u.id === pref)) setEscolhida(pref);
          else setEscolhida(perfil.unidade_id ?? ativas[0]?.id ?? null);
        }
      })
      .catch((e) => {
        console.error('Falha ao carregar unidades', e);
        if (ativo) setUnidades([]);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [perfil?.id, perfil?.papel, perfil?.unidade_id]);

  const unidadeId: UUID | null = isAdmin ? escolhida : perfil?.unidade_id ?? null;

  const setUnidadeId = useCallback(
    (id: UUID | null) => {
      if (!isAdmin) return;
      setEscolhida(id);
      salvarPreferencia(id);
    },
    [isAdmin],
  );

  const unidadeAtual = useMemo(() => unidades.find((u) => u.id === unidadeId) ?? null, [unidades, unidadeId]);

  const value = useMemo<UnidadeContextValue>(
    () => ({ unidades, unidadeAtual, unidadeId, podeTrocar, setUnidadeId, carregando }),
    [unidades, unidadeAtual, unidadeId, podeTrocar, setUnidadeId, carregando],
  );

  return <UnidadeContext.Provider value={value}>{children}</UnidadeContext.Provider>;
}

export function useUnidade(): UnidadeContextValue {
  const ctx = useContext(UnidadeContext);
  if (!ctx) throw new Error('useUnidade deve ser usado dentro de <UnidadeProvider>.');
  return ctx;
}
