import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Spinner, Textarea, useToast } from '@/components/ui';
import { useUnidade } from '@/contexts/UnidadeContext';
import { getChecklist, registrarExecucao } from '@/lib/api';
import { FREQUENCIA_ROTULO } from '@/types/database';
import type { ChecklistComItens } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';
import '@/pages/checklists/checklists.css';

type Resp = { conforme: boolean | null; observacao: string };

export default function ExecutarChecklistPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { unidadeId, unidadeAtual } = useUnidade();
  const [checklist, setChecklist] = useState<ChecklistComItens | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [resp, setResp] = useState<Record<string, Resp>>({});
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setCarregando(true);
    getChecklist(id)
      .then((c) => {
        const itens = [...c.itens].sort((a, b) => a.ordem - b.ordem);
        setChecklist({ ...c, itens });
        setResp(Object.fromEntries(itens.map((i) => [i.id, { conforme: null, observacao: '' }])));
      })
      .catch((err) => {
        toast.error(err);
        setChecklist(null);
      })
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!unidadeId) {
    return (
      <div className="fb-page">
        <PageHeader title="Executar checklist" back="/checklists" />
        <EmptyState title="Escolha uma unidade" description="A execução é registrada para uma unidade específica." />
      </div>
    );
  }
  if (carregando) return <Spinner label="Carregando checklist…" />;
  if (!checklist) {
    return (
      <div className="fb-page">
        <PageHeader title="Executar checklist" back="/checklists" />
        <EmptyState title="Checklist não encontrado" />
      </div>
    );
  }

  const itens = checklist.itens;
  const respondidos = itens.filter((i) => resp[i.id]?.conforme != null).length;
  const pendentesObrig = itens.filter((i) => i.obrigatorio && resp[i.id]?.conforme == null);
  const ncSemObs = itens.filter((i) => resp[i.id]?.conforme === false && !resp[i.id].observacao.trim());
  const conformes = itens.filter((i) => resp[i.id]?.conforme === true).length;

  function marcar(itemId: string, conforme: boolean) {
    setResp((r) => ({ ...r, [itemId]: { ...r[itemId], conforme } }));
  }

  function marcarTodosSim() {
    setResp((r) => {
      const n = { ...r };
      for (const i of itens) if (n[i.id].conforme == null) n[i.id] = { ...n[i.id], conforme: true };
      return n;
    });
  }

  async function concluir() {
    if (!checklist || !unidadeId) return;
    if (pendentesObrig.length) return toast.error(`Responda os ${pendentesObrig.length} itens obrigatórios.`);
    if (ncSemObs.length) return toast.error('Descreva a ação/observação nos itens não conformes.');
    setSalvando(true);
    try {
      await registrarExecucao({
        checklist_id: checklist.id,
        unidade_id: unidadeId,
        observacoes: observacoes.trim() || null,
        respostas: itens
          .filter((i) => resp[i.id]?.conforme != null)
          .map((i) => ({
            item_id: i.id,
            item_texto: i.texto,
            conforme: resp[i.id].conforme as boolean,
            observacao: resp[i.id].observacao.trim() || null,
          })),
      });
      toast.success('Checklist registrado.');
      navigate('/checklists');
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  const pct = itens.length ? Math.round((respondidos / itens.length) * 100) : 0;

  return (
    <div className="fb-page">
      <PageHeader
        title={checklist.nome}
        subtitle={`${FREQUENCIA_ROTULO[checklist.frequencia]} · ${unidadeAtual?.nome ?? ''}`}
        back="/checklists"
        actions={
          <Button size="sm" variant="ghost" onClick={marcarTodosSim}>
            Marcar pendentes como “Sim”
          </Button>
        }
      />
      {checklist.descricao && <p className="muted" style={{ margin: 0 }}>{checklist.descricao}</p>}

      <Card
        title={`Itens · ${respondidos}/${itens.length}`}
        actions={<Badge variant={conformes === itens.length ? 'success' : 'neutral'}>{conformes} conformes</Badge>}
      >
        <div className="chk-progress" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <ol className="chk-exec">
          {itens.map((i, idx) => {
            const r = resp[i.id];
            return (
              <li key={i.id} className={r?.conforme === false ? 'chk-exec--nc' : ''}>
                <span className="chk-exec__n">{idx + 1}</span>
                <span>
                  {i.texto}
                  {i.obrigatorio && <span className="text-danger" title="Obrigatório"> *</span>}
                </span>
                <span className="chk-exec__opts" role="group" aria-label={`Resposta do item ${idx + 1}`}>
                  <Button
                    size="sm"
                    variant={r?.conforme === true ? 'success' : 'secondary'}
                    aria-pressed={r?.conforme === true}
                    onClick={() => marcar(i.id, true)}
                  >
                    Sim
                  </Button>
                  <Button
                    size="sm"
                    variant={r?.conforme === false ? 'danger' : 'secondary'}
                    aria-pressed={r?.conforme === false}
                    onClick={() => marcar(i.id, false)}
                  >
                    Não
                  </Button>
                </span>
                {r?.conforme === false && (
                  <div className="chk-exec__obs">
                    <Input
                      aria-label={`Observação do item ${idx + 1}`}
                      placeholder="O que foi feito / ação corretiva"
                      value={r.observacao}
                      onChange={(e) =>
                        setResp((s) => ({ ...s, [i.id]: { ...s[i.id], observacao: e.target.value } }))
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      <Card title="Conclusão">
        <div className="stack">
          <Textarea label="Observações gerais" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              {pendentesObrig.length
                ? `${pendentesObrig.length} obrigatório(s) pendente(s)`
                : 'Todos os obrigatórios respondidos.'}
            </span>
            <div className="row">
              <Button variant="ghost" onClick={() => navigate('/checklists')}>
                Cancelar
              </Button>
              <Button variant="primary" loading={salvando} disabled={pendentesObrig.length > 0} onClick={concluir}>
                Concluir checklist
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
