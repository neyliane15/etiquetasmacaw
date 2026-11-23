import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormRow,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import { useUnidade } from '@/contexts/UnidadeContext';
import { criarRecebimento, listCategorias, listFornecedores, listProdutos } from '@/lib/api';
import { formatarTemperatura } from '@/lib/format';
import { UNIDADE_MEDIDA_ROTULO } from '@/types/database';
import type {
  Categoria,
  Fornecedor,
  NovoRecebimentoInput,
  ProdutoComCategoria,
  StatusRecebimento,
  UnidadeMedida,
} from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';
import '@/pages/recebimentos/recebimentos.css';

interface ItemForm {
  key: number;
  produto_id: string;
  produto_nome: string;
  quantidade: string;
  unidade_medida: UnidadeMedida;
  lote: string;
  data_fabricacao: string;
  data_validade: string;
  temperatura_c: string;
  sif: string;
  embalagem_integra: boolean;
  conforme: boolean;
  motivo_nao_conformidade: string;
}

let seq = 1;
function novoItem(): ItemForm {
  return {
    key: seq++,
    produto_id: '',
    produto_nome: '',
    quantidade: '',
    unidade_medida: 'kg',
    lote: '',
    data_fabricacao: '',
    data_validade: '',
    temperatura_c: '',
    sif: '',
    embalagem_integra: true,
    conforme: true,
    motivo_nao_conformidade: '',
  };
}

function num(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const UMS = Object.entries(UNIDADE_MEDIDA_ROTULO).map(([value, label]) => ({ value, label }));
const triOpts = [
  { value: '', label: '—' },
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
];
const tri = (v: string): boolean | null => (v === 'sim' ? true : v === 'nao' ? false : null);

export default function NovoRecebimentoPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { unidadeId, unidadeAtual } = useUnidade();

  const [carregando, setCarregando] = useState(true);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<ProdutoComCategoria[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [fornecedorId, setFornecedorId] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [recebidoEm, setRecebidoEm] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [tempVeiculo, setTempVeiculo] = useState('');
  const [veiculoLimpo, setVeiculoLimpo] = useState('sim');
  const [uniformizado, setUniformizado] = useState('sim');
  const [observacoes, setObservacoes] = useState('');
  const [itens, setItens] = useState<ItemForm[]>([novoItem()]);
  const [statusManual, setStatusManual] = useState<StatusRecebimento | ''>('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!unidadeId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    Promise.all([listFornecedores(), listProdutos({ unidadeId }), listCategorias()])
      .then(([fs, ps, cs]) => {
        setFornecedores(fs);
        setProdutos(ps);
        setCategorias(cs);
      })
      .catch((err) => toast.error(err))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId]);

  const hoje = format(new Date(), 'yyyy-MM-dd');

  function tempMax(item: ItemForm): number | null {
    const p = produtos.find((x) => x.id === item.produto_id);
    const c = p?.categoria_id ? categorias.find((x) => x.id === p.categoria_id) : null;
    return c?.temp_recebimento_max_c ?? null;
  }

  function alertas(item: ItemForm): string[] {
    const a: string[] = [];
    const t = num(item.temperatura_c);
    const max = tempMax(item);
    if (t != null && max != null && t > max) a.push(`Temperatura acima do limite da categoria (≤ ${formatarTemperatura(max)}).`);
    if (item.data_validade && item.data_validade < hoje) a.push('Validade do fabricante vencida.');
    if (!item.embalagem_integra) a.push('Embalagem danificada.');
    return a;
  }

  function atualizar(key: number, patch: Partial<ItemForm>) {
    setItens((l) =>
      l.map((i) => {
        if (i.key !== key) return i;
        const novo = { ...i, ...patch };
        // Reavalia conformidade automaticamente quando dados críticos mudam
        if ('temperatura_c' in patch || 'data_validade' in patch || 'embalagem_integra' in patch || 'produto_id' in patch) {
          novo.conforme = alertas(novo).length === 0;
        }
        return novo;
      }),
    );
  }

  function escolherProduto(key: number, id: string) {
    const p = produtos.find((x) => x.id === id);
    atualizar(key, {
      produto_id: id,
      produto_nome: p?.nome ?? '',
      unidade_medida: p?.unidade_medida ?? 'kg',
      sif: p?.sif ?? '',
    });
    if (p?.fornecedor_padrao_id && !fornecedorId) setFornecedorId(p.fornecedor_padrao_id);
  }

  const statusSugerido: StatusRecebimento = useMemo(() => {
    const validos = itens.filter((i) => i.produto_nome.trim());
    if (!validos.length) return 'conforme';
    const nc = validos.filter((i) => !i.conforme).length;
    if (nc === 0) return 'conforme';
    if (nc === validos.length) return 'recusado';
    return 'parcial';
  }, [itens]);
  const status = statusManual || statusSugerido;

  async function salvar() {
    if (!unidadeId) return;
    const validos = itens.filter((i) => i.produto_nome.trim());
    if (!validos.length) {
      toast.error('Inclua ao menos um item.');
      return;
    }
    for (const i of validos) {
      const q = num(i.quantidade);
      if (q == null || q <= 0) {
        toast.error(`Quantidade inválida em “${i.produto_nome}”.`);
        return;
      }
      if (!i.conforme && !i.motivo_nao_conformidade.trim()) {
        toast.error(`Informe o motivo da não conformidade de “${i.produto_nome}”.`);
        return;
      }
    }
    const input: NovoRecebimentoInput = {
      unidade_id: unidadeId,
      fornecedor_id: fornecedorId || null,
      nota_fiscal: notaFiscal.trim() || null,
      recebido_em: new Date(recebidoEm).toISOString(),
      temperatura_veiculo_c: num(tempVeiculo),
      veiculo_limpo: tri(veiculoLimpo),
      entregador_uniformizado: tri(uniformizado),
      status,
      observacoes: observacoes.trim() || null,
      itens: validos.map((i) => ({
        produto_id: i.produto_id || null,
        produto_nome: i.produto_nome.trim(),
        quantidade: num(i.quantidade) as number,
        unidade_medida: i.unidade_medida,
        lote: i.lote.trim() || null,
        data_fabricacao: i.data_fabricacao || null,
        data_validade: i.data_validade || null,
        temperatura_c: num(i.temperatura_c),
        sif: i.sif.trim() || null,
        embalagem_integra: i.embalagem_integra,
        conforme: i.conforme,
        motivo_nao_conformidade: i.conforme ? null : i.motivo_nao_conformidade.trim() || null,
      })),
    };
    setSalvando(true);
    try {
      const r = await criarRecebimento(input);
      toast.success('Recebimento registrado.');
      navigate(`/recebimentos/${r.id}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  if (!unidadeId) {
    return (
      <div className="fb-page">
        <PageHeader title="Novo recebimento" back="/recebimentos" />
        <EmptyState title="Escolha uma unidade" description="Selecione no topo a unidade que está recebendo a mercadoria." />
      </div>
    );
  }
  if (carregando) return <Spinner label="Carregando…" />;

  return (
    <div className="fb-page">
      <PageHeader title="Novo recebimento" subtitle={unidadeAtual?.nome} back="/recebimentos" />

      <Card title="Entrega">
        <div className="stack">
          <FormRow cols={3}>
            <Select
              label="Fornecedor"
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
              placeholder="—"
              options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
            />
            <Input label="Nota fiscal" value={notaFiscal} onChange={(e) => setNotaFiscal(e.target.value)} />
            <Input label="Recebido em" type="datetime-local" value={recebidoEm} onChange={(e) => setRecebidoEm(e.target.value)} />
          </FormRow>
          <FormRow cols={3}>
            <Input
              label="Temperatura do veículo"
              inputMode="decimal"
              suffix="°C"
              value={tempVeiculo}
              onChange={(e) => setTempVeiculo(e.target.value)}
            />
            <Select label="Veículo limpo" value={veiculoLimpo} onChange={(e) => setVeiculoLimpo(e.target.value)} options={triOpts} />
            <Select
              label="Entregador uniformizado"
              value={uniformizado}
              onChange={(e) => setUniformizado(e.target.value)}
              options={triOpts}
            />
          </FormRow>
        </div>
      </Card>

      <Card
        title={`Itens (${itens.length})`}
        actions={
          <Button size="sm" onClick={() => setItens((l) => [...l, novoItem()])}>
            + Adicionar item
          </Button>
        }
      >
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          {itens.map((i, idx) => {
            const al = alertas(i);
            return (
              <div key={i.key} className={`rcb-item${i.conforme ? '' : ' rcb-item--nc'}`}>
                <div className="rcb-item__head">
                  <span className="caps muted">Item {idx + 1}</span>
                  {itens.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => setItens((l) => l.filter((x) => x.key !== i.key))}>
                      Remover
                    </Button>
                  )}
                </div>
                <FormRow cols={4}>
                  <Select
                    label="Produto"
                    value={i.produto_id}
                    onChange={(e) => escolherProduto(i.key, e.target.value)}
                    placeholder="Avulso (digitar nome)"
                    options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
                  />
                  <Input
                    label="Nome"
                    value={i.produto_nome}
                    disabled={!!i.produto_id}
                    onChange={(e) => atualizar(i.key, { produto_nome: e.target.value })}
                  />
                  <Input
                    label="Quantidade"
                    inputMode="decimal"
                    value={i.quantidade}
                    onChange={(e) => atualizar(i.key, { quantidade: e.target.value })}
                  />
                  <Select
                    label="Unidade"
                    value={i.unidade_medida}
                    onChange={(e) => atualizar(i.key, { unidade_medida: e.target.value as UnidadeMedida })}
                    options={UMS}
                  />
                </FormRow>
                <FormRow cols={4}>
                  <Input label="Lote" value={i.lote} onChange={(e) => atualizar(i.key, { lote: e.target.value })} />
                  <Input
                    label="Fabricação"
                    type="date"
                    value={i.data_fabricacao}
                    onChange={(e) => atualizar(i.key, { data_fabricacao: e.target.value })}
                  />
                  <Input
                    label="Validade (fabricante)"
                    type="date"
                    value={i.data_validade}
                    onChange={(e) => atualizar(i.key, { data_validade: e.target.value })}
                  />
                  <Input
                    label="Temperatura"
                    inputMode="decimal"
                    suffix="°C"
                    value={i.temperatura_c}
                    onChange={(e) => atualizar(i.key, { temperatura_c: e.target.value })}
                    hint={tempMax(i) != null ? `Máx. ${formatarTemperatura(tempMax(i))}` : undefined}
                  />
                </FormRow>
                <FormRow cols={4}>
                  <Input label="SIF / SIE" value={i.sif} onChange={(e) => atualizar(i.key, { sif: e.target.value })} />
                  <div className="stack" style={{ gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
                    <Checkbox
                      label="Embalagem íntegra"
                      checked={i.embalagem_integra}
                      onChange={(e) => atualizar(i.key, { embalagem_integra: e.target.checked })}
                    />
                    <Checkbox
                      label="Conforme"
                      checked={i.conforme}
                      onChange={(e) => atualizar(i.key, { conforme: e.target.checked })}
                    />
                  </div>
                  {!i.conforme && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <Input
                        label="Motivo da não conformidade"
                        value={i.motivo_nao_conformidade}
                        onChange={(e) => atualizar(i.key, { motivo_nao_conformidade: e.target.value })}
                        error={!i.motivo_nao_conformidade.trim() ? 'Obrigatório' : undefined}
                      />
                    </div>
                  )}
                </FormRow>
                {al.length > 0 && (
                  <ul className="rcb-alertas">
                    {al.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Conclusão">
        <div className="stack">
          <FormRow cols={2}>
            <Select
              label="Status do recebimento"
              value={status}
              onChange={(e) => setStatusManual(e.target.value as StatusRecebimento)}
              options={[
                { value: 'conforme', label: 'Conforme' },
                { value: 'parcial', label: 'Parcial (itens recusados)' },
                { value: 'recusado', label: 'Recusado' },
              ]}
              hint={statusManual && statusManual !== statusSugerido ? `Sugerido pelos itens: ${statusSugerido}` : 'Calculado a partir dos itens.'}
            />
            <Textarea label="Observações" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </FormRow>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => navigate('/recebimentos')}>
              Cancelar
            </Button>
            <Button variant="primary" loading={salvando} onClick={salvar}>
              Registrar recebimento
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
