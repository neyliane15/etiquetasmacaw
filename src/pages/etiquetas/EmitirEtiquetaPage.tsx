import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormRow,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidade } from '@/contexts/UnidadeContext';
import {
  emitirEtiquetaDerivada,
  emitirEtiquetas,
  getEtiqueta,
  getModeloPadrao,
  listFornecedores,
  listModelos,
  listProdutos,
  registrarImpressao,
} from '@/lib/api';
import {
  calcularValidade,
  descreverPrazo,
  diasHorasParaHoras,
  horasParaDiasHoras,
  horasValidadeProduto,
  metodosDisponiveis,
  validarPrazoEmissao,
} from '@/lib/validade';
import { formatarDataCurta, formatarRelativo } from '@/lib/format';
import {
  ALERGENICOS,
  FAIXA_METODO,
  METODO_ROTULO,
  TIPO_ETIQUETA_ROTULO,
  UNIDADE_MEDIDA_ROTULO,
} from '@/types/database';
import type {
  Etiqueta,
  EtiquetaDetalhe,
  Fornecedor,
  LabelData,
  MetodoConservacao,
  ModeloEtiqueta,
  NovaEtiquetaInput,
  ProdutoComCategoria,
  TipoEtiqueta,
  UnidadeMedida,
} from '@/types/database';
import { LabelPreview } from '@/components/label/LabelPreview';
import { MODELO_FALLBACK, etiquetaParaLabelData, imprimirEtiquetas } from '@/components/label/printLabels';
import { rotuloAlergenico } from '@/components/label/labelFields';
import '@/pages/etiquetas/etiquetas.css';

const TODOS_METODOS: MetodoConservacao[] = ['resfriado', 'congelado', 'ambiente', 'descongelando'];
const TIPOS = Object.keys(TIPO_ETIQUETA_ROTULO) as TipoEtiqueta[];

function agoraLocal(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function numero(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function EmitirEtiquetaPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { perfil, temPapel } = useAuth();
  const gestor = temPapel('admin', 'gerente');
  const { unidadeId, unidadeAtual } = useUnidade();

  const origemId = params.get('origem');
  const produtoParam = params.get('produto');

  const [carregando, setCarregando] = useState(true);
  const [produtos, setProdutos] = useState<ProdutoComCategoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [modelos, setModelos] = useState<ModeloEtiqueta[]>([]);
  const [origem, setOrigem] = useState<EtiquetaDetalhe | null>(null);

  const [produto, setProduto] = useState<ProdutoComCategoria | null>(null);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [avulso, setAvulso] = useState(false);
  const [comboAberto, setComboAberto] = useState(false);
  const [comboIdx, setComboIdx] = useState(0);

  const [tipo, setTipo] = useState<TipoEtiqueta>((params.get('tipo') as TipoEtiqueta) || 'manipulacao');
  const [metodo, setMetodo] = useState<MetodoConservacao>('resfriado');
  const [dias, setDias] = useState('');
  const [horas, setHoras] = useState('');
  const [manipulacao, setManipulacao] = useState(agoraLocal());
  const [lote, setLote] = useState(params.get('lote') ?? '');
  const [fornecedorId, setFornecedorId] = useState(params.get('fornecedor') ?? '');
  const [sif, setSif] = useState(params.get('sif') ?? '');
  const [quantidade, setQuantidade] = useState(params.get('qtd') ?? '');
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeMedida | ''>((params.get('um') as UnidadeMedida) || '');
  const [validadeFab, setValidadeFab] = useState(params.get('validade_fab') ?? '');
  const [observacoes, setObservacoes] = useState('');
  const [alergenicos, setAlergenicos] = useState<string[]>([]);
  const [modeloId, setModeloId] = useState('');
  const [copias, setCopias] = useState('1');

  const [emitindo, setEmitindo] = useState(false);
  const [emitidas, setEmitidas] = useState<Etiqueta[]>([]);
  const comboRef = useRef<HTMLDivElement>(null);

  const recebimentoItemId = params.get('item');

  // Carga inicial
  useEffect(() => {
    if (!unidadeId) {
      setCarregando(false);
      return;
    }
    let vivo = true;
    setCarregando(true);
    (async () => {
      try {
        const [ps, fs, ms, padrao, org] = await Promise.all([
          listProdutos({ unidadeId }),
          listFornecedores(),
          listModelos(unidadeId),
          getModeloPadrao(unidadeId).catch(() => null),
          origemId ? getEtiqueta(origemId) : Promise.resolve(null),
        ]);
        if (!vivo) return;
        setProdutos(ps);
        setFornecedores(fs);
        const ativos = ms.filter((m) => m.ativo);
        setModelos(ativos);
        setModeloId(padrao?.id ?? ativos.find((m) => m.padrao)?.id ?? ativos[0]?.id ?? '');
        if (org) {
          setOrigem(org);
          const p = ps.find((x) => x.id === org.produto_id) ?? null;
          aplicarProduto(p, org.produto_nome);
          const derivTipo: TipoEtiqueta = org.metodo === 'congelado' ? 'descongelamento' : 'porcionado';
          const derivMetodo: MetodoConservacao = org.metodo === 'congelado' ? 'descongelando' : org.metodo;
          setTipo(derivTipo);
          trocarMetodo(derivMetodo, p);
          setLote(org.lote ?? '');
          setFornecedorId(org.fornecedor_id ?? '');
          setSif(org.sif ?? '');
          setAlergenicos(org.alergenicos ?? []);
          setUnidadeMedida(org.unidade_medida ?? '');
        } else if (produtoParam) {
          const p = ps.find((x) => x.id === produtoParam) ?? null;
          if (p) aplicarProduto(p);
        }
      } catch (err) {
        toast.error(err);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId, origemId, produtoParam]);

  // Fecha o autocomplete ao clicar fora
  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(ev.target as Node)) setComboAberto(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function definirValidade(h: number | null) {
    if (h == null) {
      setDias('');
      setHoras('');
      return;
    }
    const dh = horasParaDiasHoras(h);
    setDias(String(dh.dias));
    setHoras(String(dh.horas));
  }

  function trocarMetodo(m: MetodoConservacao, p: ProdutoComCategoria | null = produto) {
    setMetodo(m);
    definirValidade(p ? horasValidadeProduto(p, m) : null);
  }

  function aplicarProduto(p: ProdutoComCategoria | null, nomeAvulso?: string) {
    setProduto(p);
    setComboAberto(false);
    if (!p) {
      setAvulso(!!nomeAvulso);
      setBuscaProduto(nomeAvulso ?? '');
      definirValidade(null);
      return;
    }
    setAvulso(false);
    setBuscaProduto(p.nome);
    const disp = metodosDisponiveis(p);
    const m = disp.includes(p.metodo_padrao) ? p.metodo_padrao : (disp[0] ?? p.metodo_padrao);
    setMetodo(m);
    definirValidade(horasValidadeProduto(p, m));
    setAlergenicos(p.alergenicos ?? []);
    setUnidadeMedida((u) => (params.get('um') ? u : p.unidade_medida));
    setFornecedorId((f) => (params.get('fornecedor') ? f : (p.fornecedor_padrao_id ?? '')));
    setSif((s) => (params.get('sif') ? s : (p.sif ?? '')));
  }

  const sugestoes = useMemo(() => {
    const q = semAcento(buscaProduto.trim());
    const base = produtos.filter((p) => p.ativo);
    if (!q) return base.slice(0, 30);
    return base.filter((p) => semAcento(p.nome).includes(q)).slice(0, 30);
  }, [buscaProduto, produtos]);

  const metodosPermitidos = useMemo<MetodoConservacao[]>(() => {
    if (!produto) return TODOS_METODOS;
    const d = metodosDisponiveis(produto);
    return d.length ? d : TODOS_METODOS;
  }, [produto]);

  const horasPadrao = produto ? horasValidadeProduto(produto, metodo) : null;
  const horasTotal = (() => {
    const d = numero(dias) ?? 0;
    const h = numero(horas) ?? 0;
    if (!dias.trim() && !horas.trim()) return null;
    const t = diasHorasParaHoras(d, h);
    return t > 0 ? t : null;
  })();

  const dataManip = manipulacao ? new Date(manipulacao) : new Date();
  const manipValida = !Number.isNaN(dataManip.getTime());
  let dataValidade: Date | null = null;
  if (horasTotal && manipValida) {
    try {
      dataValidade = calcularValidade(dataManip, horasTotal);
    } catch {
      dataValidade = null;
    }
  }
  // Derivada no mesmo método não ultrapassa a validade da origem (mesma regra da RPC)
  if (dataValidade && origem && origem.metodo === metodo) {
    const limite = new Date(origem.data_validade);
    if (limite.getTime() < dataValidade.getTime()) dataValidade = limite;
  }

  const modelo: ModeloEtiqueta | typeof MODELO_FALLBACK = modelos.find((m) => m.id === modeloId) ?? MODELO_FALLBACK;
  const fornecedorNome = fornecedores.find((f) => f.id === fornecedorId)?.nome ?? null;
  const nomeProduto = produto?.nome ?? buscaProduto.trim();
  const qtd = numero(quantidade);
  const nCopias = Math.max(1, Math.min(100, Math.floor(numero(copias) ?? 1)));

  const labelData: LabelData = {
    codigo: 'PREVIEW0',
    produto_nome: nomeProduto || 'Produto',
    tipo,
    metodo,
    data_manipulacao: (manipValida ? dataManip : new Date()).toISOString(),
    data_validade: (dataValidade ?? (manipValida ? dataManip : new Date())).toISOString(),
    data_validade_fabricante: validadeFab || null,
    responsavel_nome: perfil?.nome ?? null,
    lote: lote || null,
    fornecedor_nome: fornecedorNome,
    sif: sif || null,
    quantidade: qtd,
    unidade_medida: unidadeMedida || null,
    alergenicos,
    observacoes: observacoes || null,
    unidade_nome: unidadeAtual?.nome ?? null,
  };

  const erros: string[] = [];
  if (!nomeProduto) erros.push('Escolha um produto.');
  if (!produto && !avulso && nomeProduto) erros.push('Selecione o produto da lista ou use como avulso.');
  if (!horasTotal) erros.push('Informe a validade (dias/horas).');
  if (!manipValida) erros.push('Data de manipulação inválida.');
  else
    erros.push(
      ...validarPrazoEmissao({
        horas: horasTotal,
        horasPadrao,
        manipulacao: dataManip,
        gestor,
        manipulacaoMinima: origem ? new Date(origem.data_manipulacao) : null,
      }),
    );
  if (quantidade.trim() && (qtd == null || qtd < 0)) erros.push('Quantidade inválida.');

  function alternarAlergenico(a: string) {
    setAlergenicos((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a]));
  }

  async function emitir(imprimir: boolean) {
    if (!unidadeId) return;
    if (erros.length) {
      toast.error(erros[0]);
      return;
    }
    setEmitindo(true);
    try {
      let criadas: Etiqueta[] = [];
      if (origem) {
        // Uma chamada para todas as cópias (a origem congelada só é baixada no fim)
        criadas = await emitirEtiquetaDerivada(origem.id, tipo, metodo, {
          quantidade: qtd ?? undefined,
          validadeHoras: horasTotal ?? undefined,
          copias: nCopias,
          dataManipulacao: dataManip.toISOString(),
        });
      } else {
        const input: NovaEtiquetaInput = {
          unidade_id: unidadeId,
          produto_id: produto?.id ?? null,
          produto_nome: nomeProduto,
          tipo,
          metodo,
          data_manipulacao: dataManip.toISOString(),
          validade_horas: horasTotal,
          data_validade_fabricante: validadeFab || null,
          lote: lote.trim() || null,
          fornecedor_id: fornecedorId || null,
          sif: sif.trim() || null,
          quantidade: qtd,
          unidade_medida: unidadeMedida || null,
          alergenicos,
          observacoes: observacoes.trim() || null,
          modelo_id: modelos.find((m) => m.id === modeloId) ? modeloId : null,
          recebimento_item_id: recebimentoItemId || null,
        };
        criadas = await emitirEtiquetas(input, nCopias);
      }
      setEmitidas(criadas);
      if (imprimir && criadas.length) {
        await imprimirEtiquetas(
          criadas.map((e) => etiquetaParaLabelData(e, unidadeAtual?.nome)),
          modelo,
        );
        await registrarImpressao(criadas.map((e) => e.id));
      }
      toast.success(
        criadas.length === 1
          ? `Etiqueta ${criadas[0].codigo} emitida.`
          : `${criadas.length} etiquetas emitidas.`,
      );
      setManipulacao(agoraLocal());
    } catch (err) {
      toast.error(err);
    } finally {
      setEmitindo(false);
    }
  }

  async function reimprimirLote() {
    if (!emitidas.length) return;
    try {
      await imprimirEtiquetas(
        emitidas.map((e) => etiquetaParaLabelData(e, unidadeAtual?.nome)),
        modelo,
      );
    } catch (err) {
      toast.error(err);
    }
  }

  if (!unidadeId) {
    return (
      <div className="fb-page">
        <PageHeader title="Emitir etiqueta" back="/etiquetas" />
        <EmptyState
          title="Escolha uma unidade"
          description="A emissão de etiquetas precisa de uma unidade específica. Selecione-a no topo da página."
        />
      </div>
    );
  }

  if (carregando) return <Spinner label="Carregando…" />;

  const escalaPreview = Math.min(2, 78 / (Number(modelo.largura_mm) || 60));

  return (
    <div className="fb-page">
      <PageHeader
        title={origem ? 'Etiqueta derivada' : 'Emitir etiqueta'}
        subtitle={
          origem ? (
            <>
              A partir de <Link to={`/etiquetas/${origem.id}`} className="fb-code">{origem.codigo}</Link> ·{' '}
              {origem.produto_nome} ({METODO_ROTULO[origem.metodo].toLowerCase()})
            </>
          ) : (
            unidadeAtual?.nome
          )
        }
        back="/etiquetas"
      />

      <div className="fb-split">
        <div className="stack" style={{ gap: 'var(--sp-5)' }}>
          <Card title="Produto">
            <div className="stack">
              <div className="fb-combo" ref={comboRef}>
                <Input
                  label="Produto"
                  placeholder="Digite para buscar…"
                  value={buscaProduto}
                  disabled={!!origem}
                  autoFocus={!origem && !produtoParam}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={comboAberto}
                  aria-controls="emitir-produtos"
                  onFocus={() => setComboAberto(true)}
                  onChange={(e) => {
                    setBuscaProduto(e.target.value);
                    setProduto(null);
                    setAvulso(false);
                    setComboAberto(true);
                    setComboIdx(0);
                  }}
                  onKeyDown={(e) => {
                    if (!comboAberto) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setComboIdx((i) => Math.min(i + 1, sugestoes.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setComboIdx((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const s = sugestoes[comboIdx];
                      if (s) aplicarProduto(s);
                    } else if (e.key === 'Escape') {
                      setComboAberto(false);
                    }
                  }}
                  hint={
                    produto?.categoria
                      ? `${produto.categoria.nome}${produto.observacoes ? ` · ${produto.observacoes}` : ''}`
                      : avulso
                        ? 'Produto avulso (sem cadastro): informe a validade manualmente.'
                        : undefined
                  }
                />
                {comboAberto && !origem && (
                  <ul className="fb-combo__list" id="emitir-produtos" role="listbox">
                    {sugestoes.map((p, i) => (
                      <li
                        key={p.id}
                        role="option"
                        aria-selected={i === comboIdx}
                        className="fb-combo__opt"
                        onMouseEnter={() => setComboIdx(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          aplicarProduto(p);
                        }}
                      >
                        <span>{p.nome}</span>
                        <small>{p.categoria?.nome ?? ''}</small>
                      </li>
                    ))}
                    {buscaProduto.trim() && (
                      <li
                        role="option"
                        aria-selected={false}
                        className="fb-combo__opt"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          aplicarProduto(null, buscaProduto.trim());
                        }}
                      >
                        <span>
                          Usar “{buscaProduto.trim()}” sem cadastro
                        </span>
                        <small>avulso</small>
                      </li>
                    )}
                    {!sugestoes.length && !buscaProduto.trim() && (
                      <li className="fb-combo__opt muted">Nenhum produto cadastrado.</li>
                    )}
                  </ul>
                )}
              </div>

              <div>
                <div className="caps muted" style={{ marginBottom: 4 }}>Tipo de etiqueta</div>
                <div className="fb-chips">
                  {TIPOS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="fb-chip"
                      aria-pressed={tipo === t}
                      onClick={() => setTipo(t)}
                    >
                      {TIPO_ETIQUETA_ROTULO[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Conservação e validade">
            <div className="stack">
              <div>
                <div className="caps muted" style={{ marginBottom: 4 }}>Método</div>
                <div className="fb-chips">
                  {metodosPermitidos.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="fb-chip"
                      aria-pressed={metodo === m}
                      onClick={() => trocarMetodo(m)}
                      title={FAIXA_METODO[m]}
                    >
                      {METODO_ROTULO[m]} <span className="muted">· {FAIXA_METODO[m]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <FormRow cols={4}>
                <Input
                  label="Manipulação"
                  type="datetime-local"
                  value={manipulacao}
                  onChange={(e) => setManipulacao(e.target.value)}
                  required
                />
                <Input
                  label="Validade (dias)"
                  type="number"
                  min={0}
                  value={dias}
                  onChange={(e) => setDias(e.target.value)}
                />
                <Input
                  label="+ horas"
                  type="number"
                  min={0}
                  max={23}
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                />
                <div className="stack" style={{ gap: 2, justifyContent: 'flex-end' }}>
                  <span className="caps muted">Vence em</span>
                  <strong style={{ fontSize: 'var(--fs-md)' }}>
                    {dataValidade ? formatarDataCurta(dataValidade) : '—'}
                  </strong>
                  {dataValidade && <span className="fb-sub">{formatarRelativo(dataValidade)}</span>}
                </div>
              </FormRow>
              <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                {horasPadrao != null ? (
                  <>
                    Padrão do produto para {METODO_ROTULO[metodo].toLowerCase()}: {descreverPrazo(horasPadrao)}.{' '}
                    {horasTotal !== horasPadrao && (
                      <button type="button" className="fb-chip" onClick={() => definirValidade(horasPadrao)}>
                        Restaurar padrão
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-warning">
                    Sem validade cadastrada para este método — informe a validade manualmente.
                  </span>
                )}
              </div>
            </div>
          </Card>

          <Card title="Rastreabilidade">
            <div className="stack">
              <FormRow cols={3}>
                <Input
                  label="Lote"
                  value={lote}
                  disabled={!!origem}
                  onChange={(e) => setLote(e.target.value)}
                />
                <Select
                  label="Fornecedor"
                  value={fornecedorId}
                  disabled={!!origem}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  placeholder="—"
                  options={fornecedores.filter((f) => f.ativo || f.id === fornecedorId).map((f) => ({ value: f.id, label: f.nome }))}
                />
                <Input label="SIF / SIE" value={sif} disabled={!!origem} onChange={(e) => setSif(e.target.value)} />
              </FormRow>
              <FormRow cols={3}>
                <Input
                  label="Quantidade"
                  inputMode="decimal"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
                <Select
                  label="Unidade de medida"
                  value={unidadeMedida}
                  onChange={(e) => setUnidadeMedida(e.target.value as UnidadeMedida | '')}
                  placeholder="—"
                  options={Object.entries(UNIDADE_MEDIDA_ROTULO).map(([value, label]) => ({ value, label }))}
                />
                {(tipo === 'produto_aberto' || tipo === 'recebimento' || validadeFab) && (
                  <Input
                    label="Validade do fabricante"
                    type="date"
                    value={validadeFab}
                    onChange={(e) => setValidadeFab(e.target.value)}
                  />
                )}
              </FormRow>
              <div>
                <div className="caps muted" style={{ marginBottom: 4 }}>Alergênicos</div>
                <div className="fb-chips">
                  {ALERGENICOS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className="fb-chip"
                      aria-pressed={alergenicos.includes(a)}
                      disabled={!!origem}
                      onClick={() => alternarAlergenico(a)}
                    >
                      {rotuloAlergenico(a)}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                label="Observações"
                rows={2}
                value={observacoes}
                disabled={!!origem}
                onChange={(e) => setObservacoes(e.target.value)}
              />
              {origem && (
                <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
                  Lote, fornecedor, SIF e alergênicos são herdados da etiqueta de origem.
                  {origem.metodo === 'congelado' && metodo === 'descongelando'
                    ? ' A etiqueta de origem será marcada como consumida.'
                    : ''}
                </p>
              )}
            </div>
          </Card>
        </div>

        <aside className="fb-split__aside">
          <Card title="Pré-visualização" padding="sm">
            <div className="stack">
              <div className="fb-paper">
                <LabelPreview data={labelData} modelo={modelo} escala={escalaPreview} />
              </div>
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', margin: 0 }}>
                QR de exemplo: o código real é gerado ao emitir e só então funciona na leitura pelo celular.
              </p>
              <FormRow cols={2}>
                <Select
                  label="Modelo"
                  value={modeloId}
                  onChange={(e) => setModeloId(e.target.value)}
                  options={
                    modelos.length
                      ? modelos.map((m) => ({
                          value: m.id,
                          label: `${m.nome} (${Number(m.largura_mm)}×${Number(m.altura_mm)})`,
                        }))
                      : [{ value: '', label: 'Padrão 60×40' }]
                  }
                />
                <Input
                  label="Cópias"
                  type="number"
                  min={1}
                  max={100}
                  value={copias}
                  onChange={(e) => setCopias(e.target.value)}
                  hint="Cada cópia recebe um código único."
                />
              </FormRow>
              {erros.length > 0 && (
                <ul className="text-warning" style={{ margin: 0, paddingLeft: 16, fontSize: 'var(--fs-sm)' }}>
                  {erros.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <Button
                variant="primary"
                block
                loading={emitindo}
                disabled={erros.length > 0}
                onClick={() => emitir(true)}
              >
                Emitir e imprimir{nCopias > 1 ? ` (${nCopias})` : ''}
              </Button>
              <Button variant="ghost" size="sm" block disabled={emitindo || erros.length > 0} onClick={() => emitir(false)}>
                Só emitir (imprimir depois)
              </Button>
            </div>
          </Card>

          {emitidas.length > 0 && (
            <Card
              title="Emitidas agora"
              padding="sm"
              actions={
                <Button size="sm" variant="ghost" onClick={reimprimirLote}>
                  Imprimir novamente
                </Button>
              }
            >
              <div className="fb-chips">
                {emitidas.map((e) => (
                  <Link key={e.id} to={`/etiquetas/${e.id}`} className="fb-chip fb-code">
                    {e.codigo}
                  </Link>
                ))}
              </div>
              <div className="row" style={{ marginTop: 'var(--sp-3)' }}>
                <Badge variant="success">{emitidas.length} emitida{emitidas.length > 1 ? 's' : ''}</Badge>
                <Button size="sm" variant="ghost" onClick={() => navigate('/etiquetas')}>
                  Ver lista
                </Button>
              </div>
            </Card>
          )}
        </aside>
      </div>

      <div className="fb-emitir-fixo" role="region" aria-label="Emitir etiqueta">
        <span className="fb-emitir-fixo__info muted">
          {erros.length ? erros[0] : dataValidade ? `Vence ${formatarDataCurta(dataValidade)}` : ''}
        </span>
        <Button variant="primary" loading={emitindo} disabled={erros.length > 0} onClick={() => emitir(true)}>
          Emitir e imprimir{nCopias > 1 ? ` (${nCopias})` : ''}
        </Button>
      </div>
    </div>
  );
}
