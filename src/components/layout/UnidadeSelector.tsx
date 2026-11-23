import { useId } from 'react';
import { useUnidade } from '@/contexts/UnidadeContext';

const TODAS = '__todas__';

export function UnidadeSelector(): JSX.Element | null {
  const { unidades, unidadeId, unidadeAtual, podeTrocar, setUnidadeId, carregando } = useUnidade();
  const id = useId();

  if (carregando && unidades.length === 0) return null;

  if (!podeTrocar) {
    return (
      <div className="unidade-selector">
        <span className="unidade-selector-fixed" title="Unidade">{unidadeAtual?.nome ?? 'Sem unidade'}</span>
      </div>
    );
  }

  return (
    <div className="unidade-selector">
      <label className="unidade-selector-label" htmlFor={id}>Unidade</label>
      <select id={id} value={unidadeId ?? TODAS} onChange={(e) => setUnidadeId(e.target.value === TODAS ? null : e.target.value)}>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>{u.nome}</option>
        ))}
        <option value={TODAS}>Todas as unidades</option>
      </select>
    </div>
  );
}

export default UnidadeSelector;
