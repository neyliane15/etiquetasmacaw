import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Checkbox, FormRow, Input, Select, Textarea, useToast } from '@/components/ui';
import { createProduto, updateProduto } from '@/lib/api';
import { diasHorasParaHoras, horasParaDiasHoras, descreverPrazo } from '@/lib/validade';
import {
  ALERGENICOS,
  FAIXA_METODO,
  METODO_ROTULO,
  UNIDADE_MEDIDA_ROTULO,
} from '@/types/database';
import type {
  Categoria,
  Fornecedor,
  Insert,
  MetodoConservacao,
  Produto,
  Unidade,
  UnidadeMedida,
} from '@/types/database';
import { rotuloAlergenico } from '@/components/label/labelFields';
import '@/pages/etiquetas/etiquetas.css';

const METODOS: MetodoConservacao[] = ['resfriado', 'congelado', 'ambiente', 'descongelando'];

type Prazo = { dias: string; horas: string };

function prazoDe(h: number | null | undefined): Prazo {
  if (h == null) return { dias: '', horas: '' };
  const dh = horasParaDiasHoras(h);
  return { dias: String(dh.dias), horas: dh.horas ? String(dh.horas) : '' };
}

function horasDe(p: Prazo): number | null {
  if (!p.dias.trim() && !p.horas.trim()) return null;
  const d = Number(p.dias || 0);
  const h = Number(p.horas || 0);
  if (!Number.isFinite(d) || !Number.isFinite(h)) return null;
  const t = diasHorasParaHoras(d, h);
  return t > 0 ? Math.round(t) : null;
}

function numOuNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export interface ProdutoFormProps {
  produto?: Produto | null;
  categorias: Categoria[];
  fornecedores: Fornecedor[];
  unidades: Unidade[];
  /** Admin pode criar produto global (todas as unidades). */
  podeGlobal: boolean;
  /** Unidade usada por padrão quando não for global. */
  unidadePadraoId: string | null;
  onSaved(p: Produto): void;
  onCancel(): void;
}

export function ProdutoForm(p: ProdutoFormProps): JSX.Element {
  const toast = useToast();
  const prod = p.produto ?? null;
  const [nome, setNome] = useState(prod?.nome ?? '');
  const [categoriaId, setCategoriaId] = useState(prod?.categoria_id ?? '');
  const [fornecedorId, setFornecedorId] = useState(prod?.fornecedor_padrao_id ?? '');
  const [unidadeId, setUnidadeId] = useState<string>(
    prod ? (prod.unidade_id ?? '') : p.podeGlobal ? '' : (p.unidadePadraoId ?? ''),
  );
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeMedida>(prod?.unidade_medida ?? 'kg');
  const [metodoPadrao, setMetodoPadrao] = useState<MetodoConservacao>(prod?.metodo_padrao ?? 'resfriado');
  const [prazos, setPrazos] = useState<Record<MetodoConservacao, Prazo>>(() => ({
    resfriado: prazoDe(prod?.validade_resfriado_horas),
    congelado: prazoDe(prod?.validade_congelado_horas),
    ambiente: prazoDe(prod?.validade_ambiente_horas),
    descongelando: prazoDe(prod?.validade_descongelando_horas),
  }));
  const [alergenicos, setAlergenicos] = useState<string[]>(prod?.alergenicos ?? []);
  const [sif, setSif] = useState(prod?.sif ?? '');
  const [codigoBarras, setCodigoBarras] = useState(prod?.codigo_barras ?? '');
  const [custo, setCusto] = useState(prod?.custo_unitario != null ? String(prod.custo_unitario) : '');
  const [observacoes, setObservacoes] = useState(prod?.observacoes ?? '');
  const [ativo, setAtivo] = useState(prod?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);

  const horas = Object.fromEntries(METODOS.map((m) => [m, horasDe(prazos[m])])) as Record<
    MetodoConservacao,
    number | null
  >;
  const algumMetodo = METODOS.some((m) => horas[m] != null);
  const erroNome = !nome.trim() ? 'Informe o nome.' : undefined;
  const erroMetodo =
    algumMetodo && horas[metodoPadrao] == null ? 'O método padrão precisa ter validade definida.' : undefined;
  const erroUnidade = !p.podeGlobal && !unidadeId ? 'Escolha a unidade.' : undefined;

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (erroNome || erroMetodo || erroUnidade) {
      toast.error(erroNome ?? erroMetodo ?? erroUnidade ?? 'Verifique o formulário.');
      return;
    }
    const dados: Insert<Produto> = {
      nome: nome.trim(),
      categoria_id: categoriaId || null,
      fornecedor_padrao_id: fornecedorId || null,
      unidade_id: unidadeId || null,
      unidade_medida: unidadeMedida,
      metodo_padrao: metodoPadrao,
      validade_resfriado_horas: horas.resfriado,
      validade_congelado_horas: horas.congelado,
      validade_ambiente_horas: horas.ambiente,
      validade_descongelando_horas: horas.descongelando,
      alergenicos,
      sif: sif.trim() || null,
      codigo_barras: codigoBarras.trim() || null,
      custo_unitario: numOuNull(custo),
      observacoes: observacoes.trim() || null,
      ativo,
    };
    setSalvando(true);
    try {
      const salvo = prod ? await updateProduto(prod.id, dados) : await createProduto(dados);
      toast.success(prod ? 'Produto atualizado.' : 'Produto cadastrado.');
      p.onSaved(salvo);
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="stack" style={{ gap: 'var(--sp-4)' }} onSubmit={salvar}>
      <FormRow cols={2}>
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required error={nome ? undefined : erroNome} />
        <Select
          label="Categoria"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          placeholder="—"
          options={p.categorias.map((c) => ({ value: c.id, label: c.nome }))}
        />
      </FormRow>
      <FormRow cols={3}>
        <Select
          label="Fornecedor padrão"
          value={fornecedorId}
          onChange={(e) => setFornecedorId(e.target.value)}
          placeholder="—"
          options={p.fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
        />
        <Select
          label="Unidade de medida"
          value={unidadeMedida}
          onChange={(e) => setUnidadeMedida(e.target.value as UnidadeMedida)}
          options={Object.entries(UNIDADE_MEDIDA_ROTULO).map(([value, label]) => ({ value, label }))}
        />
        <Select
          label="Disponível em"
          value={unidadeId}
          onChange={(e) => setUnidadeId(e.target.value)}
          error={erroUnidade}
          options={[
            ...(p.podeGlobal || unidadeId === '' ? [{ value: '', label: 'Todas as unidades', disabled: !p.podeGlobal }] : []),
            ...p.unidades.map((u) => ({ value: u.id, label: u.nome })),
          ]}
        />
      </FormRow>

      <div>
        <h4 className="fb-section-title">Validade por método</h4>
        <p className="muted" style={{ margin: '0 0 var(--sp-3)', fontSize: 'var(--fs-sm)' }}>
          Deixe em branco os métodos não permitidos. Valores de referência (CVS-5) devem ser validados pelo RT.
        </p>
        <div className="stack" style={{ gap: 'var(--sp-2)' }}>
          {METODOS.map((m) => (
            <div key={m} className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="row" style={{ width: 190, gap: 6, cursor: 'pointer', paddingBottom: 6 }}>
                <input
                  type="radio"
                  name="metodo_padrao"
                  checked={metodoPadrao === m}
                  onChange={() => setMetodoPadrao(m)}
                  aria-label={`Método padrão: ${METODO_ROTULO[m]}`}
                />
                <span className={`fb-metodo fb-metodo--${m}`}>{METODO_ROTULO[m]}</span>
                <span className="fb-sub" style={{ display: 'inline' }}>{FAIXA_METODO[m]}</span>
              </label>
              <div style={{ width: 90 }}>
                <Input
                  label="Dias"
                  type="number"
                  min={0}
                  value={prazos[m].dias}
                  onChange={(e) => setPrazos((s) => ({ ...s, [m]: { ...s[m], dias: e.target.value } }))}
                />
              </div>
              <div style={{ width: 90 }}>
                <Input
                  label="Horas"
                  type="number"
                  min={0}
                  max={23}
                  value={prazos[m].horas}
                  onChange={(e) => setPrazos((s) => ({ ...s, [m]: { ...s[m], horas: e.target.value } }))}
                />
              </div>
              <span className="muted" style={{ paddingBottom: 6, fontSize: 'var(--fs-sm)' }}>
                {horas[m] != null ? `= ${descreverPrazo(horas[m] as number)}` : 'não permitido'}
              </span>
            </div>
          ))}
        </div>
        {erroMetodo && <p className="text-danger" style={{ margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-sm)' }}>{erroMetodo}</p>}
        <p className="muted" style={{ margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-xs)' }}>
          O botão de rádio marca o método padrão.
        </p>
      </div>

      <div>
        <h4 className="fb-section-title">Alergênicos (RDC 26/2015)</h4>
        <div className="fb-chips">
          {ALERGENICOS.map((a) => (
            <button
              key={a}
              type="button"
              className="fb-chip"
              aria-pressed={alergenicos.includes(a)}
              onClick={() =>
                setAlergenicos((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a]))
              }
            >
              {rotuloAlergenico(a)}
            </button>
          ))}
        </div>
      </div>

      <FormRow cols={3}>
        <Input label="SIF / SIE" value={sif} onChange={(e) => setSif(e.target.value)} />
        <Input label="Código de barras" value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} />
        <Input
          label={`Custo (R$ / ${unidadeMedida})`}
          inputMode="decimal"
          value={custo}
          onChange={(e) => setCusto(e.target.value)}
          hint="Usado para estimar o custo do desperdício."
        />
      </FormRow>
      <Textarea
        label="Observações / instruções de conservação"
        rows={2}
        value={observacoes}
        onChange={(e) => setObservacoes(e.target.value)}
      />
      <Checkbox label="Ativo" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={p.onCancel} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={salvando}>
          {prod ? 'Salvar alterações' : 'Cadastrar produto'}
        </Button>
      </div>
    </form>
  );
}

export default ProdutoForm;
