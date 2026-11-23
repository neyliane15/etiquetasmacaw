import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { MOTIVO_DESCARTE_ROTULO } from '@/types/database';
import type { BaixaInput, Etiqueta, EtiquetaDetalhe, MotivoDescarte } from '@/types/database';
import { darBaixa } from '@/lib/api';
import { formatarDataCurta } from '@/lib/format';

const MOTIVOS = Object.entries(MOTIVO_DESCARTE_ROTULO).map(([value, label]) => ({ value, label }));

/** Modal de baixa (consumida/descartada) de uma etiqueta. */
export function BaixaEtiquetaModal(p: {
  etiqueta: Etiqueta | EtiquetaDetalhe | null;
  statusInicial?: BaixaInput['status'];
  onClose(): void;
  onDone(e: Etiqueta): void;
}): JSX.Element | null {
  const toast = useToast();
  const e = p.etiqueta;
  const [status, setStatus] = useState<BaixaInput['status']>('consumida');
  const [motivo, setMotivo] = useState<MotivoDescarte>('outro');
  const [quantidade, setQuantidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!e) return;
    const vencida = e.status === 'vencida' || new Date(e.data_validade).getTime() <= Date.now();
    setStatus(p.statusInicial ?? (vencida ? 'descartada' : 'consumida'));
    setMotivo(vencida ? 'vencido' : 'outro');
    setQuantidade(e.quantidade != null ? String(e.quantidade) : '');
    setObservacao('');
  }, [e, p.statusInicial]);

  if (!e) return null;

  async function confirmar() {
    if (!e) return;
    setSalvando(true);
    try {
      const input: BaixaInput = { status };
      if (status === 'descartada') {
        input.motivo = motivo;
        const q = Number(quantidade.replace(',', '.'));
        if (quantidade.trim() && Number.isFinite(q) && q > 0) input.quantidade = q;
      }
      if (observacao.trim()) input.observacao = observacao.trim();
      const r = await darBaixa(e.id, input);
      toast.success(status === 'consumida' ? 'Etiqueta marcada como consumida.' : 'Descarte registrado.');
      p.onDone(r);
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={!!e}
      onClose={p.onClose}
      title={`Dar baixa · ${e.codigo}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={p.onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            variant={status === 'descartada' ? 'danger' : 'primary'}
            loading={salvando}
            onClick={confirmar}
          >
            {status === 'consumida' ? 'Confirmar consumo' : 'Confirmar descarte'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="muted">
          <strong style={{ color: 'var(--text)' }}>{e.produto_nome}</strong> · validade{' '}
          {formatarDataCurta(e.data_validade)}
        </div>
        <div className="row" role="radiogroup" aria-label="Tipo de baixa">
          <Button
            size="sm"
            variant={status === 'consumida' ? 'success' : 'secondary'}
            aria-pressed={status === 'consumida'}
            onClick={() => setStatus('consumida')}
          >
            Consumida
          </Button>
          <Button
            size="sm"
            variant={status === 'descartada' ? 'danger' : 'secondary'}
            aria-pressed={status === 'descartada'}
            onClick={() => setStatus('descartada')}
          >
            Descartada
          </Button>
        </div>
        {status === 'descartada' && (
          <>
            <Select
              label="Motivo"
              value={motivo}
              onChange={(ev) => setMotivo(ev.target.value as MotivoDescarte)}
              options={MOTIVOS}
            />
            <Input
              label="Quantidade descartada"
              inputMode="decimal"
              value={quantidade}
              onChange={(ev) => setQuantidade(ev.target.value)}
              suffix={e.unidade_medida ?? undefined}
              hint="Em branco: usa a quantidade da etiqueta."
            />
          </>
        )}
        <Textarea
          label="Observação"
          rows={2}
          value={observacao}
          onChange={(ev) => setObservacao(ev.target.value)}
        />
      </div>
    </Modal>
  );
}
