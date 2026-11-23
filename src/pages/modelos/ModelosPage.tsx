import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, FormRow, Input, PageHeader, Select, Spinner, useToast } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidade } from '@/contexts/UnidadeContext';
import { createModelo, deleteModelo, listModelos, updateModelo } from '@/lib/api';
import { CAMPOS_ETIQUETA } from '@/types/database';
import type { CampoEtiqueta, Insert, LabelData, ModeloEtiqueta } from '@/types/database';
import { LabelPreview } from '@/components/label/LabelPreview';
import { imprimirEtiquetas } from '@/components/label/printLabels';
import '@/pages/etiquetas/etiquetas.css';
import '@/pages/modelos/modelos.css';

const PRESETS: { nome: string; l: number; a: number }[] = [
  { nome: '60×40', l: 60, a: 40 },
  { nome: '60×60', l: 60, a: 60 },
  { nome: '50×30', l: 50, a: 30 },
  { nome: '100×50', l: 100, a: 50 },
  { nome: '40×40', l: 40, a: 40 },
];

const PADRAO_CAMPOS: CampoEtiqueta[] = ['produto', 'metodo', 'data_manipulacao', 'validade', 'responsavel', 'qr'];

function amostra(unidadeNome: string | null): LabelData {
  const agora = new Date();
  const val = new Date(agora.getTime() + 72 * 3600 * 1000);
  const fab = new Date(agora.getTime() + 30 * 24 * 3600 * 1000);
  return {
    codigo: 'PREVIEW0',
    produto_nome: 'Filé mignon porcionado',
    tipo: 'porcionado',
    metodo: 'resfriado',
    data_manipulacao: agora.toISOString(),
    data_validade: val.toISOString(),
    data_validade_fabricante: fab.toISOString().slice(0, 10),
    responsavel_nome: 'Ana Souza',
    lote: 'L2311A',
    fornecedor_nome: 'Frigorífico Serrano',
    sif: 'SIF 1234',
    quantidade: 1.5,
    unidade_medida: 'kg',
    alergenicos: ['leite', 'gluten'],
    observacoes: 'Manter na prateleira inferior.',
    unidade_nome: unidadeNome ?? 'Macaw Camboinhas',
  };
}

type Rascunho = Insert<ModeloEtiqueta> & { id?: string };

function comLogo(m: ModeloEtiqueta): Rascunho {
  const campos = m.mostrar_logo && !m.campos.includes('logo') ? (['logo', ...m.campos] as CampoEtiqueta[]) : [...m.campos];
  return {
    id: m.id,
    nome: m.nome,
    largura_mm: Number(m.largura_mm),
    altura_mm: Number(m.altura_mm),
    campos,
    fonte_base_pt: Number(m.fonte_base_pt),
    mostrar_logo: m.mostrar_logo,
    unidade_id: m.unidade_id,
    padrao: m.padrao,
    ativo: m.ativo,
  };
}

function novoRascunho(unidadeId: string | null): Rascunho {
  return {
    nome: 'Novo modelo 60×40',
    largura_mm: 60,
    altura_mm: 40,
    campos: [...PADRAO_CAMPOS],
    fonte_base_pt: 7,
    mostrar_logo: false,
    unidade_id: unidadeId,
    padrao: false,
    ativo: true,
  };
}

export default function ModelosPage() {
  const toast = useToast();
  const { temPapel } = useAuth();
  const isAdmin = temPapel('admin');
  const { unidadeId, unidades, unidadeAtual } = useUnidade();

  const [modelos, setModelos] = useState<ModeloEtiqueta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const ms = await listModelos(unidadeId);
      setModelos(ms);
      return ms;
    } catch (err) {
      toast.error(err);
      return [] as ModeloEtiqueta[];
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId]);

  useEffect(() => {
    void carregar().then((ms) => {
      setRascunho((r) => r ?? (ms[0] ? comLogo(ms[0]) : null));
    });
  }, [carregar]);

  const dados = useMemo(() => amostra(unidadeAtual?.nome ?? null), [unidadeAtual]);

  function editar<K extends keyof Rascunho>(k: K, v: Rascunho[K]) {
    setRascunho((r) => (r ? { ...r, [k]: v } : r));
  }

  function alternarCampo(c: CampoEtiqueta) {
    if (!rascunho) return;
    const tem = rascunho.campos.includes(c);
    editar('campos', tem ? rascunho.campos.filter((x) => x !== c) : [...rascunho.campos, c]);
  }

  function mover(c: CampoEtiqueta, d: -1 | 1) {
    if (!rascunho) return;
    const l = [...rascunho.campos];
    const i = l.indexOf(c);
    const j = i + d;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    editar('campos', l);
  }

  const largura = Number(rascunho?.largura_mm);
  const altura = Number(rascunho?.altura_mm);
  const erros: string[] = [];
  if (rascunho) {
    if (!rascunho.nome.trim()) erros.push('Informe o nome.');
    if (!(largura >= 20 && largura <= 150)) erros.push('Largura entre 20 e 150 mm.');
    if (!(altura >= 15 && altura <= 200)) erros.push('Altura entre 15 e 200 mm.');
    if (!rascunho.campos.length) erros.push('Escolha ao menos um campo.');
    const f = Number(rascunho.fonte_base_pt);
    if (!(f >= 4 && f <= 20)) erros.push('Fonte base entre 4 e 20 pt.');
    if (!isAdmin && rascunho.unidade_id === null) erros.push('Somente o admin edita modelos globais.');
  }

  async function salvar() {
    if (!rascunho || erros.length) {
      if (erros.length) toast.error(erros[0]);
      return;
    }
    setSalvando(true);
    try {
      const id = rascunho.id;
      const input: Insert<ModeloEtiqueta> = {
        nome: rascunho.nome.trim(),
        largura_mm: largura,
        altura_mm: altura,
        campos: rascunho.campos,
        fonte_base_pt: Number(rascunho.fonte_base_pt),
        mostrar_logo: rascunho.campos.includes('logo'),
        unidade_id: rascunho.unidade_id,
        padrao: rascunho.padrao,
        ativo: rascunho.ativo,
      };
      // Garante um único padrão por escopo: desmarca o anterior.
      if (input.padrao) {
        const anterior = modelos.find((m) => m.padrao && m.id !== id && m.unidade_id === input.unidade_id);
        if (anterior) await updateModelo(anterior.id, { padrao: false });
      }
      const salvo = id ? await updateModelo(id, input) : await createModelo(input);
      toast.success('Modelo salvo.');
      await carregar();
      setRascunho(comLogo(salvo));
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    if (!rascunho?.id) return;
    try {
      await deleteModelo(rascunho.id);
      toast.success('Modelo excluído.');
      setExcluir(false);
      const ms = await carregar();
      setRascunho(ms[0] ? comLogo(ms[0]) : null);
    } catch (err) {
      toast.error(err);
    }
  }

  async function testar() {
    if (!rascunho || erros.length) return;
    try {
      await imprimirEtiquetas([dados], {
        ...rascunho,
        largura_mm: largura,
        altura_mm: altura,
        mostrar_logo: rascunho.campos.includes('logo'),
      });
    } catch (err) {
      toast.error(err);
    }
  }

  const escala = Math.min(3, 300 / ((largura || 60) * 3.78), 420 / ((altura || 40) * 3.78));
  const disponiveis = CAMPOS_ETIQUETA.filter((c) => !rascunho?.campos.includes(c.valor));
  const rotulo = (c: CampoEtiqueta) => CAMPOS_ETIQUETA.find((x) => x.valor === c)?.rotulo ?? c;

  return (
    <div className="fb-page">
      <PageHeader
        title="Modelos de etiqueta"
        subtitle="Tamanho em mm, campos e ordem de exibição. A impressão usa exatamente estas dimensões."
        actions={
          <Button variant="primary" onClick={() => setRascunho(novoRascunho(unidadeId))}>
            Novo modelo
          </Button>
        }
      />

      <div className="mdl-layout">
        <Card title="Modelos" padding="none">
          {carregando ? (
            <Spinner />
          ) : modelos.length === 0 ? (
            <p className="muted" style={{ padding: 'var(--sp-4)', margin: 0 }}>Nenhum modelo.</p>
          ) : (
            <ul className="mdl-list">
              {modelos.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="mdl-item"
                    aria-current={rascunho?.id === m.id}
                    onClick={() => setRascunho(comLogo(m))}
                  >
                    <span className="mdl-thumb" style={{ aspectRatio: `${m.largura_mm} / ${m.altura_mm}` }} />
                    <span className="mdl-item__txt">
                      <strong>{m.nome}</strong>
                      <span className="fb-sub">
                        {Number(m.largura_mm)}×{Number(m.altura_mm)} mm ·{' '}
                        {m.unidade_id ? (unidades.find((u) => u.id === m.unidade_id)?.nome ?? 'Unidade') : 'Global'}
                      </span>
                    </span>
                    {m.padrao && <Badge variant="olive">Padrão</Badge>}
                    {!m.ativo && <Badge variant="neutral">Inativo</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {!rascunho ? (
          <EmptyState title="Selecione um modelo" description="Ou crie um novo para começar." />
        ) : (
          <div className="mdl-editor">
            <Card title={rascunho.id ? 'Editar modelo' : 'Novo modelo'}>
              <div className="stack" style={{ gap: 'var(--sp-4)' }}>
                <Input label="Nome" value={rascunho.nome} onChange={(e) => editar('nome', e.target.value)} />
                <div>
                  <div className="caps muted" style={{ marginBottom: 4 }}>Tamanhos usuais</div>
                  <div className="fb-presets">
                    {PRESETS.map((p) => (
                      <button
                        key={p.nome}
                        type="button"
                        className="fb-chip"
                        aria-pressed={largura === p.l && altura === p.a}
                        onClick={() => setRascunho((r) => (r ? { ...r, largura_mm: p.l, altura_mm: p.a } : r))}
                      >
                        {p.nome} mm
                      </button>
                    ))}
                  </div>
                </div>
                <FormRow cols={3}>
                  <Input
                    label="Largura"
                    type="number"
                    min={20}
                    max={150}
                    step={0.5}
                    suffix="mm"
                    value={String(rascunho.largura_mm)}
                    onChange={(e) => editar('largura_mm', Number(e.target.value))}
                  />
                  <Input
                    label="Altura"
                    type="number"
                    min={15}
                    max={200}
                    step={0.5}
                    suffix="mm"
                    value={String(rascunho.altura_mm)}
                    onChange={(e) => editar('altura_mm', Number(e.target.value))}
                  />
                  <Input
                    label="Fonte base"
                    type="number"
                    min={4}
                    max={20}
                    step={0.5}
                    suffix="pt"
                    value={String(rascunho.fonte_base_pt)}
                    onChange={(e) => editar('fonte_base_pt', Number(e.target.value))}
                  />
                </FormRow>
                <FormRow cols={2}>
                  <Select
                    label="Escopo"
                    value={rascunho.unidade_id ?? ''}
                    onChange={(e) => editar('unidade_id', e.target.value || null)}
                    options={[
                      { value: '', label: 'Global (todas as unidades)', disabled: !isAdmin },
                      ...unidades.map((u) => ({ value: u.id, label: u.nome })),
                    ]}
                  />
                  <div className="stack" style={{ gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
                    <Checkbox
                      label="Modelo padrão deste escopo"
                      checked={rascunho.padrao}
                      onChange={(e) => editar('padrao', e.target.checked)}
                    />
                    <Checkbox label="Ativo" checked={rascunho.ativo} onChange={(e) => editar('ativo', e.target.checked)} />
                  </div>
                </FormRow>

                <div>
                  <h4 className="fb-section-title">Campos na ordem de exibição</h4>
                  <ol className="mdl-campos">
                    {rascunho.campos.map((c, i) => (
                      <li key={c}>
                        <span className="mdl-campos__n">{i + 1}</span>
                        <span className="mdl-campos__r">{rotulo(c)}</span>
                        <Button size="sm" variant="ghost" aria-label={`Subir ${rotulo(c)}`} disabled={i === 0} onClick={() => mover(c, -1)}>
                          ↑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Descer ${rotulo(c)}`}
                          disabled={i === rascunho.campos.length - 1}
                          onClick={() => mover(c, 1)}
                        >
                          ↓
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={`Remover ${rotulo(c)}`} onClick={() => alternarCampo(c)}>
                          ×
                        </Button>
                      </li>
                    ))}
                  </ol>
                  {disponiveis.length > 0 && (
                    <div style={{ marginTop: 'var(--sp-3)' }}>
                      <div className="caps muted" style={{ marginBottom: 4 }}>Adicionar</div>
                      <div className="fb-chips">
                        {disponiveis.map((c) => (
                          <button key={c.valor} type="button" className="fb-chip" onClick={() => alternarCampo(c.valor)}>
                            + {c.rotulo}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)', margin: 'var(--sp-3) 0 0' }}>
                    Método aparece como faixa invertida no topo; produto e validade em destaque; QR à direita com o
                    código abaixo.
                  </p>
                </div>

                {erros.length > 0 && (
                  <ul className="text-warning" style={{ margin: 0, paddingLeft: 16, fontSize: 'var(--fs-sm)' }}>
                    {erros.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}

                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div className="row">
                    {rascunho.id && isAdmin && (
                      <Button variant="ghost" onClick={() => setExcluir(true)}>
                        Excluir
                      </Button>
                    )}
                  </div>
                  <div className="row">
                    <Button onClick={testar} disabled={erros.length > 0}>
                      Imprimir teste
                    </Button>
                    <Button variant="primary" loading={salvando} disabled={erros.length > 0} onClick={salvar}>
                      Salvar modelo
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Pré-visualização" padding="sm" className="mdl-preview">
              <div className="fb-paper" style={{ minHeight: 220 }}>
                {erros.some((e) => e.includes('mm')) ? (
                  <span className="muted">Dimensões inválidas</span>
                ) : (
                  <LabelPreview
                    data={dados}
                    modelo={{ ...rascunho, largura_mm: largura, altura_mm: altura, mostrar_logo: rascunho.campos.includes('logo') }}
                    escala={escala}
                  />
                )}
              </div>
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', margin: 'var(--sp-3) 0 0', textAlign: 'center' }}>
                {largura}×{altura} mm · ampliada {escala.toFixed(1)}× · dados de exemplo
              </p>
            </Card>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={excluir}
        title="Excluir modelo"
        message="Etiquetas já emitidas com este modelo continuam válidas; a reimpressão usará o modelo padrão."
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluir(false)}
      />
    </div>
  );
}
