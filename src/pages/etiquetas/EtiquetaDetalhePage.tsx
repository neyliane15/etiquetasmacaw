import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, useToast } from '@/components/ui';
import { getEtiqueta, listMovimentacoes } from '@/lib/api';
import {
  corSituacao,
  formatarData,
  formatarDataHora,
  formatarQuantidade,
  formatarRelativo,
  rotuloSituacao,
} from '@/lib/format';
import { FAIXA_METODO, METODO_ROTULO, STATUS_ROTULO, TIPO_ETIQUETA_ROTULO } from '@/types/database';
import type { EtiquetaDetalhe, EtiquetaMovimentacao, ModeloEtiqueta, TipoMovimentacao } from '@/types/database';
import { LabelPreview } from '@/components/label/LabelPreview';
import type { LabelPreviewProps } from '@/components/label/LabelPreview';
import { BaixaEtiquetaModal } from '@/components/label/BaixaEtiquetaModal';
import { etiquetaParaLabelData, reimprimirEtiqueta, resolverModelo } from '@/components/label/printLabels';
import { textoAlergenicos } from '@/components/label/labelFields';
import '@/pages/etiquetas/etiquetas.css';

const MOV_ROTULO: Record<TipoMovimentacao, string> = {
  emissao: 'Emissão',
  reimpressao: 'Reimpressão',
  consumo: 'Baixa: consumida',
  descarte: 'Baixa: descartada',
  vencimento: 'Vencimento automático',
  alteracao: 'Alteração',
  reativacao: 'Reativação',
};

export default function EtiquetaDetalhePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [etiqueta, setEtiqueta] = useState<EtiquetaDetalhe | null>(null);
  const [movs, setMovs] = useState<EtiquetaMovimentacao[]>([]);
  const [modelo, setModelo] = useState<ModeloEtiqueta | LabelPreviewProps['modelo'] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [baixaAberta, setBaixaAberta] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const e = await getEtiqueta(id);
      setEtiqueta(e);
      setNaoEncontrada(false);
      const [m, mv] = await Promise.all([
        resolverModelo(e.modelo_id, e.unidade_id),
        listMovimentacoes(id).catch(() => [] as EtiquetaMovimentacao[]),
      ]);
      setModelo(m);
      setMovs(mv);
    } catch {
      setNaoEncontrada(true);
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function reimprimir() {
    if (!etiqueta) return;
    setImprimindo(true);
    try {
      const n = await reimprimirEtiqueta(etiqueta);
      setEtiqueta({ ...etiqueta, impressoes: n });
      toast.success('Reimpressão registrada.');
      listMovimentacoes(id).then(setMovs).catch(() => undefined);
    } catch (err) {
      toast.error(err);
    } finally {
      setImprimindo(false);
    }
  }

  if (carregando && !etiqueta) return <Spinner label="Carregando etiqueta…" />;
  if (naoEncontrada || !etiqueta) {
    return (
      <div className="fb-page">
        <PageHeader title="Etiqueta" back="/etiquetas" />
        <EmptyState
          title="Etiqueta não encontrada"
          description="Ela pode ter sido removida ou pertencer a outra unidade."
          action={<Button onClick={() => navigate('/etiquetas')}>Voltar à lista</Button>}
        />
      </div>
    );
  }

  const e = etiqueta;
  const podeBaixar = e.status === 'ativa' || e.status === 'vencida';
  const larg = Number(modelo?.largura_mm ?? 60);

  return (
    <div className="fb-page">
      <PageHeader
        title={e.produto_nome}
        subtitle={
          <span className="row" style={{ gap: 'var(--sp-3)' }}>
            <span className="fb-code">{e.codigo}</span>
            <Badge variant={corSituacao(e.situacao)}>{rotuloSituacao(e.situacao)}</Badge>
            <span className="muted">{e.unidade_nome}</span>
          </span>
        }
        back="/etiquetas"
        actions={
          <>
            <Button onClick={() => window.open(`/q/${e.codigo}`, '_blank', 'noopener')}>Página pública</Button>
            <Button onClick={() => navigate(`/etiquetas/nova?origem=${e.id}`)}>
              {e.metodo === 'congelado' ? 'Descongelar / derivar' : 'Derivar'}
            </Button>
            <Button loading={imprimindo} onClick={reimprimir}>
              Reimprimir
            </Button>
            {podeBaixar && (
              <Button variant="primary" onClick={() => setBaixaAberta(true)}>
                Dar baixa
              </Button>
            )}
          </>
        }
      />

      <div className="fb-split">
        <div className="stack" style={{ gap: 'var(--sp-5)' }}>
          <Card title="Dados da etiqueta">
            <dl className="fb-kv">
              <div>
                <dt>Tipo</dt>
                <dd>{TIPO_ETIQUETA_ROTULO[e.tipo]}</dd>
              </div>
              <div>
                <dt>Método</dt>
                <dd>
                  <span className={`fb-metodo fb-metodo--${e.metodo}`}>{METODO_ROTULO[e.metodo]}</span>
                  <span className="fb-sub">{FAIXA_METODO[e.metodo]}</span>
                </dd>
              </div>
              <div>
                <dt>Manipulação</dt>
                <dd>{formatarDataHora(e.data_manipulacao)}</dd>
              </div>
              <div>
                <dt>Validade</dt>
                <dd>
                  <strong>{formatarDataHora(e.data_validade)}</strong>
                  {e.status === 'ativa' && <span className="fb-sub">{formatarRelativo(e.data_validade)}</span>}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {STATUS_ROTULO[e.status]}
                  {e.status_em && <span className="fb-sub">em {formatarDataHora(e.status_em)}</span>}
                </dd>
              </div>
              <div>
                <dt>Responsável</dt>
                <dd>{e.responsavel_nome ?? '—'}</dd>
              </div>
              <div>
                <dt>Categoria</dt>
                <dd>{e.categoria_nome ?? '—'}</dd>
              </div>
              <div>
                <dt>Quantidade</dt>
                <dd>{e.quantidade != null ? formatarQuantidade(e.quantidade, e.unidade_medida) : '—'}</dd>
              </div>
              <div>
                <dt>Lote</dt>
                <dd>{e.lote ?? '—'}</dd>
              </div>
              <div>
                <dt>Fornecedor</dt>
                <dd>{e.fornecedor_nome ?? '—'}</dd>
              </div>
              <div>
                <dt>SIF / SIE</dt>
                <dd>{e.sif ?? '—'}</dd>
              </div>
              <div>
                <dt>Validade do fabricante</dt>
                <dd>{e.data_validade_fabricante ? formatarData(e.data_validade_fabricante) : '—'}</dd>
              </div>
              <div>
                <dt>Modelo</dt>
                <dd>{e.modelo_nome ?? '—'}</dd>
              </div>
              <div>
                <dt>Impressões</dt>
                <dd>{e.impressoes}</dd>
              </div>
              {e.etiqueta_origem_id && (
                <div>
                  <dt>Origem</dt>
                  <dd>
                    <Link to={`/etiquetas/${e.etiqueta_origem_id}`}>Ver etiqueta de origem</Link>
                  </dd>
                </div>
              )}
            </dl>
            {(e.alergenicos.length > 0 || e.observacoes) && (
              <div className="stack" style={{ marginTop: 'var(--sp-4)' }}>
                {e.alergenicos.length > 0 && (
                  <div>
                    <span className="caps muted">Alergênicos</span>
                    <div>{textoAlergenicos(e.alergenicos)}</div>
                  </div>
                )}
                {e.observacoes && (
                  <div>
                    <span className="caps muted">Observações</span>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{e.observacoes}</div>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Histórico">
            {movs.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Sem movimentações registradas.</p>
            ) : (
              <ol className="fb-timeline">
                {movs.map((m) => (
                  <li key={m.id}>
                    <strong style={{ fontWeight: 600 }}>{MOV_ROTULO[m.tipo] ?? m.tipo}</strong>{' '}
                    <span className="muted">
                      · {formatarDataHora(m.created_at)}
                      {m.usuario?.nome ? ` · ${m.usuario.nome}` : ''}
                    </span>
                    {typeof m.detalhes?.motivo === 'string' && (
                      <span className="fb-sub">Motivo: {String(m.detalhes.motivo)}</span>
                    )}
                    {typeof m.detalhes?.observacao === 'string' && (
                      <span className="fb-sub">{String(m.detalhes.observacao)}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="fb-split__aside">
          <Card title="Etiqueta" padding="sm">
            <div className="fb-paper">
              {modelo && (
                <LabelPreview
                  data={etiquetaParaLabelData(e)}
                  modelo={modelo}
                  escala={Math.min(2, 78 / (larg || 60))}
                />
              )}
            </div>
          </Card>
        </aside>
      </div>

      <BaixaEtiquetaModal
        etiqueta={baixaAberta ? e : null}
        onClose={() => setBaixaAberta(false)}
        onDone={() => {
          setBaixaAberta(false);
          void carregar();
        }}
      />
    </div>
  );
}
