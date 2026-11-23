// Tipos de domínio — Etiquetas Macaw (contrato §6 de docs/PLANO.md)

export type UUID = string;
export type ISODateTime = string; // timestamptz ISO
export type ISODate = string; // 'yyyy-MM-dd'

export type PapelUsuario = 'admin' | 'gerente' | 'cozinheiro';
export type MetodoConservacao = 'resfriado' | 'congelado' | 'ambiente' | 'descongelando';
export type TipoEtiqueta =
  | 'manipulacao'
  | 'produto_aberto'
  | 'porcionado'
  | 'producao'
  | 'descongelamento'
  | 'amostra'
  | 'recebimento';
export type StatusEtiqueta = 'ativa' | 'consumida' | 'descartada' | 'vencida';
export type TipoMovimentacao =
  | 'emissao'
  | 'reimpressao'
  | 'consumo'
  | 'descarte'
  | 'vencimento'
  | 'alteracao'
  | 'reativacao';
export type MotivoDescarte =
  | 'vencido'
  | 'contaminado'
  | 'qualidade'
  | 'sobra_producao'
  | 'sobra_cliente'
  | 'queda_acidente'
  | 'temperatura_inadequada'
  | 'devolucao'
  | 'outro';
export type UnidadeMedida = 'kg' | 'g' | 'l' | 'ml' | 'un' | 'porcao' | 'cx' | 'pct';
export type TipoEquipamento =
  | 'geladeira'
  | 'freezer'
  | 'camara_fria'
  | 'camara_congelada'
  | 'balcao_refrigerado'
  | 'balcao_termico'
  | 'ultracongelador'
  | 'pass_through'
  | 'outro';
export type StatusRecebimento = 'conforme' | 'parcial' | 'recusado';
export type FrequenciaChecklist = 'diario' | 'abertura' | 'fechamento' | 'semanal' | 'mensal' | 'eventual';
export type SituacaoValidade = 'vencida' | 'vence_hoje' | 'vence_24h' | 'vence_72h' | 'ok';
export type SituacaoEtiqueta = SituacaoValidade | 'consumida' | 'descartada';

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'olive';

export type CampoEtiqueta =
  | 'logo'
  | 'unidade'
  | 'produto'
  | 'tipo'
  | 'metodo'
  | 'data_manipulacao'
  | 'validade'
  | 'responsavel'
  | 'lote'
  | 'fornecedor'
  | 'sif'
  | 'quantidade'
  | 'alergenicos'
  | 'observacoes'
  | 'validade_fabricante'
  | 'codigo'
  | 'qr';

export const CAMPOS_ETIQUETA: { valor: CampoEtiqueta; rotulo: string }[] = [
  { valor: 'logo', rotulo: 'Logo' },
  { valor: 'unidade', rotulo: 'Unidade' },
  { valor: 'produto', rotulo: 'Produto' },
  { valor: 'tipo', rotulo: 'Tipo de etiqueta' },
  { valor: 'metodo', rotulo: 'Método de conservação' },
  { valor: 'data_manipulacao', rotulo: 'Data de manipulação' },
  { valor: 'validade', rotulo: 'Validade' },
  { valor: 'responsavel', rotulo: 'Responsável' },
  { valor: 'lote', rotulo: 'Lote' },
  { valor: 'fornecedor', rotulo: 'Fornecedor' },
  { valor: 'sif', rotulo: 'SIF/SIE' },
  { valor: 'quantidade', rotulo: 'Quantidade' },
  { valor: 'alergenicos', rotulo: 'Alergênicos' },
  { valor: 'observacoes', rotulo: 'Observações' },
  { valor: 'validade_fabricante', rotulo: 'Validade do fabricante' },
  { valor: 'codigo', rotulo: 'Código' },
  { valor: 'qr', rotulo: 'QR Code' },
];

export const ALERGENICOS = [
  'gluten',
  'crustaceos',
  'ovos',
  'peixes',
  'amendoim',
  'soja',
  'leite',
  'lactose',
  'castanhas',
  'nozes',
  'macadamia',
  'pistache',
  'amendoas',
  'avelas',
  'latex',
  'sulfitos',
  'gergelim',
  'mostarda',
  'aipo',
  'moluscos',
] as const;
export type Alergenico = (typeof ALERGENICOS)[number];

export const ALERGENICO_ROTULO: Record<Alergenico, string> = {
  gluten: 'Glúten',
  crustaceos: 'Crustáceos',
  ovos: 'Ovos',
  peixes: 'Peixes',
  amendoim: 'Amendoim',
  soja: 'Soja',
  leite: 'Leite',
  lactose: 'Lactose',
  castanhas: 'Castanhas',
  nozes: 'Nozes',
  macadamia: 'Macadâmia',
  pistache: 'Pistache',
  amendoas: 'Amêndoas',
  avelas: 'Avelãs',
  latex: 'Látex natural',
  sulfitos: 'Sulfitos',
  gergelim: 'Gergelim',
  mostarda: 'Mostarda',
  aipo: 'Aipo',
  moluscos: 'Moluscos',
};

export const METODO_ROTULO: Record<MetodoConservacao, string> = {
  resfriado: 'RESFRIADO',
  congelado: 'CONGELADO',
  ambiente: 'AMBIENTE',
  descongelando: 'DESCONGELANDO',
};

export const FAIXA_METODO: Record<MetodoConservacao, string> = {
  resfriado: '0 a 5 °C',
  congelado: '≤ -18 °C',
  ambiente: 'Temp. ambiente',
  descongelando: 'Sob refrig. ≤ 5 °C',
};

export const TIPO_ETIQUETA_ROTULO: Record<TipoEtiqueta, string> = {
  manipulacao: 'Manipulação',
  produto_aberto: 'Produto aberto',
  porcionado: 'Porcionado',
  producao: 'Produção',
  descongelamento: 'Descongelamento',
  amostra: 'Amostra',
  recebimento: 'Recebimento',
};

export const STATUS_ROTULO: Record<StatusEtiqueta, string> = {
  ativa: 'Ativa',
  consumida: 'Consumida',
  descartada: 'Descartada',
  vencida: 'Vencida',
};

export const MOTIVO_DESCARTE_ROTULO: Record<MotivoDescarte, string> = {
  vencido: 'Vencido',
  contaminado: 'Contaminado',
  qualidade: 'Qualidade inadequada',
  sobra_producao: 'Sobra de produção',
  sobra_cliente: 'Sobra de cliente',
  queda_acidente: 'Queda / acidente',
  temperatura_inadequada: 'Temperatura inadequada',
  devolucao: 'Devolução',
  outro: 'Outro',
};

export const UNIDADE_MEDIDA_ROTULO: Record<UnidadeMedida, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'mL',
  un: 'un',
  porcao: 'porção',
  cx: 'cx',
  pct: 'pct',
};

export const TIPO_EQUIPAMENTO_ROTULO: Record<TipoEquipamento, string> = {
  geladeira: 'Geladeira',
  freezer: 'Freezer',
  camara_fria: 'Câmara fria',
  camara_congelada: 'Câmara congelada',
  balcao_refrigerado: 'Balcão refrigerado',
  balcao_termico: 'Balcão térmico',
  ultracongelador: 'Ultracongelador',
  pass_through: 'Pass-through',
  outro: 'Outro',
};

export const PAPEL_ROTULO: Record<PapelUsuario, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  cozinheiro: 'Cozinheiro',
};

export const FREQUENCIA_ROTULO: Record<FrequenciaChecklist, string> = {
  diario: 'Diário',
  abertura: 'Abertura',
  fechamento: 'Fechamento',
  semanal: 'Semanal',
  mensal: 'Mensal',
  eventual: 'Eventual',
};

export interface Unidade {
  id: UUID;
  nome: string;
  slug: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cnpj: string | null;
  telefone: string | null;
  responsavel_tecnico: string | null;
  registro_rt: string | null;
  ativo: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Perfil {
  id: UUID;
  nome: string;
  email: string;
  papel: PapelUsuario;
  unidade_id: UUID | null;
  ativo: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Categoria {
  id: UUID;
  nome: string;
  cor: string;
  ordem: number;
  temp_recebimento_max_c: number | null;
  ativo: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Fornecedor {
  id: UUID;
  nome: string;
  razao_social: string | null;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Produto {
  id: UUID;
  nome: string;
  categoria_id: UUID | null;
  fornecedor_padrao_id: UUID | null;
  unidade_id: UUID | null;
  unidade_medida: UnidadeMedida;
  metodo_padrao: MetodoConservacao;
  validade_resfriado_horas: number | null;
  validade_congelado_horas: number | null;
  validade_ambiente_horas: number | null;
  validade_descongelando_horas: number | null;
  alergenicos: string[];
  sif: string | null;
  codigo_barras: string | null;
  custo_unitario: number | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ProdutoComCategoria extends Produto {
  categoria: Pick<Categoria, 'id' | 'nome' | 'cor'> | null;
}

export interface ModeloEtiqueta {
  id: UUID;
  nome: string;
  largura_mm: number;
  altura_mm: number;
  campos: CampoEtiqueta[];
  fonte_base_pt: number;
  mostrar_logo: boolean;
  unidade_id: UUID | null;
  padrao: boolean;
  ativo: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Etiqueta {
  id: UUID;
  codigo: string;
  unidade_id: UUID;
  produto_id: UUID | null;
  produto_nome: string;
  categoria_nome: string | null;
  tipo: TipoEtiqueta;
  metodo: MetodoConservacao;
  data_manipulacao: ISODateTime;
  validade_horas: number | null;
  data_validade: ISODateTime;
  data_validade_fabricante: ISODate | null;
  lote: string | null;
  fornecedor_id: UUID | null;
  fornecedor_nome: string | null;
  sif: string | null;
  quantidade: number | null;
  unidade_medida: UnidadeMedida | null;
  alergenicos: string[];
  observacoes: string | null;
  responsavel_id: UUID | null;
  responsavel_nome: string | null;
  modelo_id: UUID | null;
  etiqueta_origem_id: UUID | null;
  recebimento_item_id: UUID | null;
  status: StatusEtiqueta;
  status_em: ISODateTime | null;
  status_por: UUID | null;
  impressoes: number;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface EtiquetaDetalhe extends Etiqueta {
  unidade_nome: string;
  modelo_nome: string | null;
  horas_restantes: number;
  situacao: SituacaoEtiqueta;
}

export interface EtiquetaPublica {
  codigo: string;
  produto_nome: string;
  tipo: TipoEtiqueta;
  metodo: MetodoConservacao;
  data_manipulacao: ISODateTime;
  data_validade: ISODateTime;
  status: StatusEtiqueta;
  situacao: SituacaoEtiqueta;
  unidade_nome: string;
  lote: string | null;
  alergenicos: string[];
  responsavel_primeiro_nome: string | null;
}

export interface EtiquetaMovimentacao {
  id: number;
  etiqueta_id: UUID;
  tipo: TipoMovimentacao;
  status_anterior: StatusEtiqueta | null;
  status_novo: StatusEtiqueta | null;
  detalhes: Record<string, unknown>;
  usuario_id: UUID | null;
  created_at: ISODateTime;
  usuario?: Pick<Perfil, 'id' | 'nome'> | null;
}

export interface Descarte {
  id: UUID;
  unidade_id: UUID;
  etiqueta_id: UUID | null;
  produto_id: UUID | null;
  produto_nome: string;
  motivo: MotivoDescarte;
  quantidade: number;
  unidade_medida: UnidadeMedida;
  peso_kg: number | null;
  custo_estimado: number | null;
  observacao: string | null;
  responsavel_id: UUID | null;
  descartado_em: ISODateTime;
  created_at: ISODateTime;
  responsavel?: Pick<Perfil, 'id' | 'nome'> | null;
}

export interface Recebimento {
  id: UUID;
  unidade_id: UUID;
  fornecedor_id: UUID | null;
  nota_fiscal: string | null;
  recebido_em: ISODateTime;
  temperatura_veiculo_c: number | null;
  veiculo_limpo: boolean | null;
  entregador_uniformizado: boolean | null;
  status: StatusRecebimento;
  observacoes: string | null;
  responsavel_id: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  fornecedor?: Pick<Fornecedor, 'id' | 'nome'> | null;
}

export interface RecebimentoItem {
  id: UUID;
  recebimento_id: UUID;
  produto_id: UUID | null;
  produto_nome: string;
  quantidade: number;
  unidade_medida: UnidadeMedida;
  lote: string | null;
  data_fabricacao: ISODate | null;
  data_validade: ISODate | null;
  temperatura_c: number | null;
  sif: string | null;
  embalagem_integra: boolean;
  conforme: boolean;
  motivo_nao_conformidade: string | null;
  created_at: ISODateTime;
}

export interface RecebimentoComItens extends Recebimento {
  itens: RecebimentoItem[];
}

export interface Equipamento {
  id: UUID;
  unidade_id: UUID;
  nome: string;
  tipo: TipoEquipamento;
  temp_min_c: number | null;
  temp_max_c: number | null;
  localizacao: string | null;
  ativo: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface RegistroTemperatura {
  id: UUID;
  equipamento_id: UUID;
  unidade_id: UUID;
  temperatura_c: number;
  conforme: boolean;
  acao_corretiva: string | null;
  responsavel_id: UUID | null;
  registrado_em: ISODateTime;
  created_at: ISODateTime;
  equipamento?: Pick<Equipamento, 'id' | 'nome' | 'tipo'> | null;
  responsavel?: Pick<Perfil, 'id' | 'nome'> | null;
}

export interface TemperaturaUltima {
  equipamento_id: UUID;
  equipamento_nome: string;
  tipo: TipoEquipamento;
  unidade_id: UUID;
  temp_min_c: number | null;
  temp_max_c: number | null;
  temperatura_c: number | null;
  conforme: boolean | null;
  registrado_em: ISODateTime | null;
  horas_desde_registro: number | null;
}

export interface Checklist {
  id: UUID;
  unidade_id: UUID | null;
  nome: string;
  descricao: string | null;
  frequencia: FrequenciaChecklist;
  ativo: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ChecklistItem {
  id: UUID;
  checklist_id: UUID;
  ordem: number;
  texto: string;
  obrigatorio: boolean;
  created_at: ISODateTime;
}

export interface ChecklistComItens extends Checklist {
  itens: ChecklistItem[];
}

export interface ChecklistExecucao {
  id: UUID;
  checklist_id: UUID;
  unidade_id: UUID;
  responsavel_id: UUID | null;
  executado_em: ISODateTime;
  observacoes: string | null;
  total_itens: number;
  itens_conformes: number;
  created_at: ISODateTime;
  checklist?: Pick<Checklist, 'id' | 'nome'> | null;
  responsavel?: Pick<Perfil, 'id' | 'nome'> | null;
}

export interface ChecklistResposta {
  id: UUID;
  execucao_id: UUID;
  item_id: UUID | null;
  item_texto: string;
  conforme: boolean;
  observacao: string | null;
}

export interface DashboardResumo {
  ativas: number;
  vencidas: number;
  vence_hoje: number;
  vence_24h: number;
  vence_72h: number;
  emitidas_hoje: number;
  descartes_7d_kg: number;
  descartes_7d_custo: number;
  temperaturas_nao_conformes_24h: number;
  equipamentos_sem_registro_12h: number;
  recebimentos_hoje: number;
}

export interface DesperdicioLinha {
  agrupador: 'motivo' | 'produto' | 'categoria' | 'dia';
  chave: string;
  total_peso_kg: number;
  total_custo: number;
  registros: number;
}

export interface RelatorioEtiquetaLinha {
  produto_nome: string;
  emitidas: number;
  consumidas: number;
  descartadas: number;
  vencidas: number;
  ativas: number;
}

/** Dados mínimos para renderizar uma etiqueta (preview usa antes de salvar). */
export interface LabelData {
  codigo: string; // pode ser 'PREVIEW0' no preview
  produto_nome: string;
  tipo: TipoEtiqueta;
  metodo: MetodoConservacao;
  data_manipulacao: ISODateTime;
  data_validade: ISODateTime;
  data_validade_fabricante?: ISODate | null;
  responsavel_nome?: string | null;
  lote?: string | null;
  fornecedor_nome?: string | null;
  sif?: string | null;
  quantidade?: number | null;
  unidade_medida?: UnidadeMedida | null;
  alergenicos?: string[];
  observacoes?: string | null;
  unidade_nome?: string | null;
}

// Inputs
export type Insert<T, Omit_ extends keyof T = never> = Omit<T, 'id' | 'created_at' | 'updated_at' | Omit_>;

export interface NovaEtiquetaInput {
  unidade_id: UUID;
  produto_id: UUID | null;
  produto_nome?: string;
  tipo: TipoEtiqueta;
  metodo: MetodoConservacao;
  data_manipulacao?: ISODateTime;
  validade_horas?: number | null;
  data_validade?: ISODateTime | null;
  data_validade_fabricante?: ISODate | null;
  lote?: string | null;
  fornecedor_id?: UUID | null;
  sif?: string | null;
  quantidade?: number | null;
  unidade_medida?: UnidadeMedida | null;
  alergenicos?: string[];
  observacoes?: string | null;
  modelo_id?: UUID | null;
  etiqueta_origem_id?: UUID | null;
  recebimento_item_id?: UUID | null;
}

export interface FiltroEtiquetas {
  unidadeId: UUID | null;
  status?: StatusEtiqueta | 'todas';
  situacao?: SituacaoEtiqueta;
  busca?: string;
  produtoId?: UUID;
  tipo?: TipoEtiqueta;
  metodo?: MetodoConservacao;
  de?: ISODate;
  ate?: ISODate;
  limit?: number;
  offset?: number;
  ordenarPor?: 'data_validade' | 'created_at';
}

export interface BaixaInput {
  status: 'consumida' | 'descartada';
  motivo?: MotivoDescarte;
  quantidade?: number;
  observacao?: string;
}

export interface NovoDescarteInput {
  unidade_id: UUID;
  etiqueta_id?: UUID | null;
  produto_id?: UUID | null;
  produto_nome?: string;
  motivo: MotivoDescarte;
  quantidade: number;
  unidade_medida: UnidadeMedida;
  peso_kg?: number | null;
  observacao?: string | null;
  descartado_em?: ISODateTime;
}

export interface NovoRecebimentoInput {
  unidade_id: UUID;
  fornecedor_id: UUID | null;
  nota_fiscal?: string | null;
  recebido_em?: ISODateTime;
  temperatura_veiculo_c?: number | null;
  veiculo_limpo?: boolean | null;
  entregador_uniformizado?: boolean | null;
  status: StatusRecebimento;
  observacoes?: string | null;
  itens: Omit<RecebimentoItem, 'id' | 'recebimento_id' | 'created_at'>[];
}

export interface NovoRegistroTemperaturaInput {
  equipamento_id: UUID;
  temperatura_c: number;
  acao_corretiva?: string | null;
  registrado_em?: ISODateTime;
}

export interface NovaExecucaoChecklistInput {
  checklist_id: UUID;
  unidade_id: UUID;
  observacoes?: string | null;
  respostas: { item_id: UUID; item_texto: string; conforme: boolean; observacao?: string | null }[];
}

export interface NovoUsuarioInput {
  email: string;
  /** Senha inicial; vazia/omitida → convite por e-mail. */
  senha?: string;
  nome: string;
  papel: PapelUsuario;
  unidade_id: UUID | null;
}

export interface Paginado<T> {
  data: T[];
  total: number;
}
