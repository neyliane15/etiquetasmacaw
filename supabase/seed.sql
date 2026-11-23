-- =============================================================================
-- Etiquetas Macaw — seed.sql
-- Dados iniciais: unidades, categorias, fornecedores, produtos, modelos,
-- equipamentos e checklists. Idempotente (UUIDs fixos + on conflict do nothing).
--
-- ATENÇÃO: as validades abaixo são referências aproximadas baseadas na
-- Portaria CVS-5/2013 e na RDC 216/2004 e em práticas usuais de cozinha
-- profissional. DEVEM SER VALIDADAS pelo Responsável Técnico (RT) de cada
-- unidade e ajustadas conforme as instruções do fabricante.
-- Validades sempre em HORAS (24 = 1 dia; 72 = 3 dias; 720 = 30 dias).
--
-- Não cria usuários (auth). Veja supabase/README.md para o bootstrap do admin.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Unidades
-- -----------------------------------------------------------------------------
insert into public.unidades (id, nome, slug, cidade, uf) values
  ('11111111-1111-1111-1111-111111111111', 'Macaw Camboinhas', 'camboinhas', 'Niterói',           'RJ'),
  ('22222222-2222-2222-2222-222222222222', 'Macaw Búzios',     'buzios',     'Armação dos Búzios', 'RJ')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Categorias (tons terrosos harmonizados com o oliva #79731B)
-- -----------------------------------------------------------------------------
insert into public.categorias (id, nome, cor, ordem, temp_recebimento_max_c) values
  ('c0000000-0000-0000-0000-000000000001', 'Carnes bovinas',               '#A9502F',  1,   7.0),
  ('c0000000-0000-0000-0000-000000000002', 'Aves',                         '#B8862B',  2,   4.0),
  ('c0000000-0000-0000-0000-000000000003', 'Suínos',                       '#8A6A7E',  3,   7.0),
  ('c0000000-0000-0000-0000-000000000004', 'Pescados e frutos do mar',     '#5E7C86',  4,   3.0),
  ('c0000000-0000-0000-0000-000000000005', 'Laticínios e frios',           '#9A7B4F',  5,   7.0),
  ('c0000000-0000-0000-0000-000000000006', 'Hortifrúti',                   '#79731B',  6,  10.0),
  ('c0000000-0000-0000-0000-000000000007', 'Ovos',                         '#C2A15E',  7,   null),
  ('c0000000-0000-0000-0000-000000000008', 'Secos e grãos',                '#7A7262',  8,   null),
  ('c0000000-0000-0000-0000-000000000009', 'Molhos e caldos',              '#6E4B3A',  9,   null),
  ('c0000000-0000-0000-0000-000000000010', 'Massas',                       '#B59A6A', 10,   null),
  ('c0000000-0000-0000-0000-000000000011', 'Sobremesas e confeitaria',     '#A3807A', 11,   null),
  ('c0000000-0000-0000-0000-000000000012', 'Bebidas',                      '#5E6B6E', 12,   null),
  ('c0000000-0000-0000-0000-000000000013', 'Congelados industrializados',  '#3E5560', 13, -12.0),
  ('c0000000-0000-0000-0000-000000000014', 'Pré-preparos / mise en place', '#5C5714', 14,   null),
  ('c0000000-0000-0000-0000-000000000015', 'Pães',                         '#C4A27A', 15,   null)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Fornecedores (exemplos — substituir pelos fornecedores reais)
-- -----------------------------------------------------------------------------
insert into public.fornecedores (id, nome, observacoes) values
  ('f0000000-0000-0000-0000-000000000001', 'Frigorífico Serra Fluminense', 'Carnes bovinas e suínas. Exigir SIF e temperatura ≤ 7 °C.'),
  ('f0000000-0000-0000-0000-000000000002', 'Pescados Itaipu',              'Pescados frescos e frutos do mar. Recebimento ≤ 3 °C, gelo em escamas.'),
  ('f0000000-0000-0000-0000-000000000003', 'Hortifrúti Região dos Lagos',  'Entrega diária de folhas, legumes e frutas.'),
  ('f0000000-0000-0000-0000-000000000004', 'Laticínios Vale do Paraíba',   'Queijos, manteiga, creme de leite e iogurtes.'),
  ('f0000000-0000-0000-0000-000000000005', 'Distribuidora Niterói Secos',  'Secos, grãos, enlatados, azeite e farinhas.'),
  ('f0000000-0000-0000-0000-000000000006', 'Granja Boa Esperança',         'Aves e ovos. Ovos com carimbo de inspeção.')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Produtos (globais: unidade_id null)
-- Colunas de validade: resfriado / congelado / ambiente / descongelando (horas)
-- -----------------------------------------------------------------------------
insert into public.produtos (
  id, nome, categoria_id, fornecedor_padrao_id, unidade_medida, metodo_padrao,
  validade_resfriado_horas, validade_congelado_horas, validade_ambiente_horas, validade_descongelando_horas,
  alergenicos, custo_unitario, observacoes
) values
  -- Carnes bovinas
  ('a0000000-0000-0000-0000-000000000001', 'Filé mignon porcionado', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 89.90, 'Manter de 0 a 5 °C. Descongelar sob refrigeração.'),
  ('a0000000-0000-0000-0000-000000000002', 'Picanha', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 79.90, 'Manter de 0 a 5 °C.'),
  ('a0000000-0000-0000-0000-000000000003', 'Carne moída', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    24, 720, null, 24, '{}', 42.00, 'Moer no dia. Alta perecibilidade: validade de 24 h resfriada.'),
  ('a0000000-0000-0000-0000-000000000004', 'Contrafilé (ancho)', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 69.90, null),
  ('a0000000-0000-0000-0000-000000000005', 'Ragu de costela (cozido)', 'c0000000-0000-0000-0000-000000000001', null, 'kg', 'resfriado',
    72, 720, null, 72, '{aipo}', 48.00, 'Resfriar de 60 °C a 10 °C em até 2 h antes de armazenar.'),
  -- Aves
  ('a0000000-0000-0000-0000-000000000006', 'Peito de frango', 'c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000006', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 22.90, 'Manter de 0 a 4 °C. Nunca descongelar em temperatura ambiente.'),
  ('a0000000-0000-0000-0000-000000000007', 'Coxa e sobrecoxa de frango', 'c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000006', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 16.90, null),
  -- Suínos
  ('a0000000-0000-0000-0000-000000000008', 'Linguiça toscana', 'c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 24.90, 'Verificar alergênicos no rótulo do fabricante.'),
  ('a0000000-0000-0000-0000-000000000009', 'Bacon (embalagem aberta)', 'c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    120, 720, null, 72, '{}', 39.90, 'Após aberto: 5 dias resfriado, respeitando a validade do fabricante.'),
  ('a0000000-0000-0000-0000-000000000010', 'Costelinha suína', 'c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 29.90, null),
  -- Pescados e frutos do mar
  ('a0000000-0000-0000-0000-000000000011', 'Salmão (filé)', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{peixes}', 99.90, 'Pescado: manter ≤ 2 °C, sobre gelo. Para consumo cru, congelar previamente.'),
  ('a0000000-0000-0000-0000-000000000012', 'Camarão limpo', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{crustaceos}', 119.90, 'Manter ≤ 2 °C.'),
  ('a0000000-0000-0000-0000-000000000013', 'Polvo cozido', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    72, 720, null, 72, '{moluscos}', 149.90, null),
  ('a0000000-0000-0000-0000-000000000014', 'Lula limpa', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{moluscos}', 59.90, null),
  ('a0000000-0000-0000-0000-000000000015', 'Peixe branco (filé de pescada)', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{peixes}', 54.90, null),
  ('a0000000-0000-0000-0000-000000000016', 'Mexilhão limpo', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{moluscos}', 49.90, null),
  -- Laticínios e frios
  ('a0000000-0000-0000-0000-000000000017', 'Queijo muçarela (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    120, null, null, null, '{leite,lactose}', 44.90, 'Após aberto: 5 dias, respeitando a validade do fabricante.'),
  ('a0000000-0000-0000-0000-000000000018', 'Parmesão ralado', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    120, null, null, null, '{leite,lactose}', 89.90, null),
  ('a0000000-0000-0000-0000-000000000019', 'Presunto fatiado', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    72, null, null, null, '{}', 39.90, 'Frios fatiados: 3 dias resfriados.'),
  ('a0000000-0000-0000-0000-000000000020', 'Creme de leite fresco (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'l', 'resfriado',
    72, null, null, null, '{leite,lactose}', 24.00, null),
  ('a0000000-0000-0000-0000-000000000021', 'Leite integral (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'l', 'resfriado',
    72, null, null, null, '{leite,lactose}', 6.50, null),
  ('a0000000-0000-0000-0000-000000000022', 'Manteiga sem sal', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    720, 2160, null, null, '{leite,lactose}', 59.90, 'Não manter em temperatura ambiente após aberta.'),
  ('a0000000-0000-0000-0000-000000000023', 'Iogurte natural (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    72, null, null, null, '{leite,lactose}', 18.00, null),
  ('a0000000-0000-0000-0000-000000000024', 'Requeijão cremoso (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    120, null, null, null, '{leite,lactose}', 32.00, null),
  -- Ovos
  ('a0000000-0000-0000-0000-000000000025', 'Ovos (in natura)', 'c0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000006', 'un', 'resfriado',
    504, null, 336, null, '{ovos}', 0.85, 'Não lavar antes de armazenar. Usar ovos com casca íntegra.'),
  ('a0000000-0000-0000-0000-000000000026', 'Ovo cozido', 'c0000000-0000-0000-0000-000000000007', null, 'un', 'resfriado',
    72, null, null, null, '{ovos}', 1.10, null),
  -- Hortifrúti
  ('a0000000-0000-0000-0000-000000000027', 'Alface higienizada', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    48, null, null, null, '{}', 12.00, 'Higienizar com solução clorada (100–200 ppm por 15 min) e enxaguar.'),
  ('a0000000-0000-0000-0000-000000000028', 'Tomate picado', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    48, null, null, null, '{}', 9.90, null),
  ('a0000000-0000-0000-0000-000000000029', 'Cebola picada', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    72, null, null, null, '{}', 6.90, null),
  ('a0000000-0000-0000-0000-000000000030', 'Ervas frescas higienizadas', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    72, null, null, null, '{}', 60.00, 'Salsa, cebolinha, coentro, manjericão.'),
  ('a0000000-0000-0000-0000-000000000031', 'Mix de folhas', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    48, null, null, null, '{}', 35.00, null),
  ('a0000000-0000-0000-0000-000000000032', 'Vinagrete', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    48, null, null, null, '{}', 14.00, null),
  -- Pré-preparos / cozidos
  ('a0000000-0000-0000-0000-000000000033', 'Arroz cozido', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    72, 720, null, 24, '{}', 4.50, 'Resfriar rapidamente após o cozimento.'),
  ('a0000000-0000-0000-0000-000000000034', 'Feijão cozido', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    72, 720, null, 72, '{}', 6.00, null),
  ('a0000000-0000-0000-0000-000000000035', 'Farofa de manteiga', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    120, null, null, null, '{leite,lactose}', 16.00, null),
  ('a0000000-0000-0000-0000-000000000036', 'Base de moqueca', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    72, 720, null, 72, '{}', 22.00, 'Leite de coco, azeite de dendê, pimentões, tomate e coentro.'),
  -- Molhos e caldos
  ('a0000000-0000-0000-0000-000000000037', 'Molho de tomate da casa', 'c0000000-0000-0000-0000-000000000009', null, 'kg', 'resfriado',
    72, 720, null, 72, '{}', 12.00, null),
  ('a0000000-0000-0000-0000-000000000038', 'Caldo de peixe', 'c0000000-0000-0000-0000-000000000009', null, 'l', 'resfriado',
    72, 720, null, 72, '{peixes,aipo}', 8.00, null),
  ('a0000000-0000-0000-0000-000000000039', 'Fundo escuro', 'c0000000-0000-0000-0000-000000000009', null, 'l', 'resfriado',
    72, 720, null, 72, '{aipo}', 15.00, null),
  ('a0000000-0000-0000-0000-000000000040', 'Molho bechamel', 'c0000000-0000-0000-0000-000000000009', null, 'kg', 'resfriado',
    48, null, null, null, '{gluten,leite,lactose}', 18.00, null),
  ('a0000000-0000-0000-0000-000000000041', 'Maionese da casa', 'c0000000-0000-0000-0000-000000000009', null, 'kg', 'resfriado',
    24, null, null, null, '{ovos,mostarda}', 20.00, 'Preparar com ovos pasteurizados. Manter ≤ 5 °C.'),
  ('a0000000-0000-0000-0000-000000000042', 'Molho pesto', 'c0000000-0000-0000-0000-000000000009', null, 'kg', 'resfriado',
    72, 720, null, 72, '{leite,lactose,castanhas}', 65.00, null),
  -- Massas
  ('a0000000-0000-0000-0000-000000000043', 'Massa fresca', 'c0000000-0000-0000-0000-000000000010', null, 'kg', 'resfriado',
    72, 720, null, 24, '{gluten,ovos}', 28.00, null),
  ('a0000000-0000-0000-0000-000000000044', 'Nhoque de batata', 'c0000000-0000-0000-0000-000000000010', null, 'kg', 'resfriado',
    48, 720, null, 24, '{gluten,ovos}', 26.00, null),
  -- Pães
  ('a0000000-0000-0000-0000-000000000045', 'Pão de fermentação natural', 'c0000000-0000-0000-0000-000000000015', null, 'un', 'ambiente',
    null, 720, 48, null, '{gluten}', 18.00, 'Manter em local seco e arejado, protegido.'),
  ('a0000000-0000-0000-0000-000000000046', 'Pão de queijo (congelado)', 'c0000000-0000-0000-0000-000000000013', null, 'kg', 'congelado',
    null, 2160, null, null, '{leite,lactose,ovos}', 32.00, 'Assar direto do freezer.'),
  -- Secos e grãos
  ('a0000000-0000-0000-0000-000000000047', 'Farinha de trigo (aberta)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'kg', 'ambiente',
    null, null, 2160, null, '{gluten}', 5.50, 'Após aberta, transferir para recipiente fechado e identificado.'),
  ('a0000000-0000-0000-0000-000000000048', 'Arroz cru (aberto)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'kg', 'ambiente',
    null, null, 2160, null, '{}', 6.00, null),
  ('a0000000-0000-0000-0000-000000000049', 'Azeite extravirgem (aberto)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'l', 'ambiente',
    null, null, 2160, null, '{}', 59.90, 'Proteger da luz e do calor.'),
  ('a0000000-0000-0000-0000-000000000050', 'Leite de coco (aberto)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'l', 'resfriado',
    72, null, null, null, '{}', 18.00, 'Após aberto, transferir para recipiente e refrigerar.'),
  ('a0000000-0000-0000-0000-000000000051', 'Farinha de mandioca (aberta)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'kg', 'ambiente',
    null, null, 2160, null, '{}', 8.00, null),
  -- Sobremesas e confeitaria
  ('a0000000-0000-0000-0000-000000000052', 'Chantilly', 'c0000000-0000-0000-0000-000000000011', null, 'kg', 'resfriado',
    72, null, null, null, '{leite,lactose}', 30.00, null),
  ('a0000000-0000-0000-0000-000000000053', 'Mousse de maracujá', 'c0000000-0000-0000-0000-000000000011', null, 'kg', 'resfriado',
    72, 720, null, 24, '{leite,lactose}', 35.00, null),
  ('a0000000-0000-0000-0000-000000000054', 'Sorvete artesanal', 'c0000000-0000-0000-0000-000000000011', null, 'l', 'congelado',
    null, 720, null, null, '{leite,lactose}', 45.00, 'Manter ≤ -18 °C. Não recongelar.'),
  ('a0000000-0000-0000-0000-000000000055', 'Calda de chocolate', 'c0000000-0000-0000-0000-000000000011', null, 'kg', 'resfriado',
    168, null, null, null, '{leite,lactose,soja}', 40.00, null),
  ('a0000000-0000-0000-0000-000000000056', 'Pudim de leite', 'c0000000-0000-0000-0000-000000000011', null, 'porcao', 'resfriado',
    72, null, null, null, '{leite,lactose,ovos}', 6.00, null),
  -- Bebidas
  ('a0000000-0000-0000-0000-000000000057', 'Suco de laranja natural', 'c0000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-000000000003', 'l', 'resfriado',
    24, 720, null, 24, '{}', 12.00, null),
  ('a0000000-0000-0000-0000-000000000058', 'Xarope de açúcar (bar)', 'c0000000-0000-0000-0000-000000000012', null, 'l', 'resfriado',
    720, null, null, null, '{}', 8.00, null),
  -- Congelados industrializados
  ('a0000000-0000-0000-0000-000000000059', 'Batata pré-frita congelada', 'c0000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000005', 'kg', 'congelado',
    null, 2160, null, null, '{}', 19.90, 'Após aberta: fechar bem e respeitar a validade do fabricante.'),
  ('a0000000-0000-0000-0000-000000000060', 'Polpa de fruta congelada', 'c0000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000003', 'kg', 'congelado',
    24, 2160, null, 24, '{}', 22.00, null)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Modelos de etiqueta (globais)
-- -----------------------------------------------------------------------------
insert into public.modelos_etiqueta (id, nome, largura_mm, altura_mm, campos, fonte_base_pt, mostrar_logo, padrao) values
  ('b0000000-0000-0000-0000-000000000001', 'Padrão 60×40', 60, 40,
    '{produto,tipo,metodo,data_manipulacao,validade,responsavel,codigo,qr}', 7, false, true),
  ('b0000000-0000-0000-0000-000000000002', 'Completa 60×60', 60, 60,
    '{produto,tipo,metodo,data_manipulacao,validade,responsavel,lote,fornecedor,sif,quantidade,alergenicos,codigo,qr}', 6.5, false, false),
  ('b0000000-0000-0000-0000-000000000003', 'Compacta 50×30', 50, 30,
    '{produto,metodo,validade,codigo,qr}', 6, false, false),
  ('b0000000-0000-0000-0000-000000000004', 'Recebimento 100×50', 100, 50,
    '{logo,unidade,produto,tipo,metodo,data_manipulacao,validade,validade_fabricante,responsavel,lote,fornecedor,sif,quantidade,alergenicos,observacoes,codigo,qr}', 8, true, false),
  ('b0000000-0000-0000-0000-000000000005', 'Mínima 40×40', 40, 40,
    '{produto,validade,qr}', 6, false, false)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Equipamentos por unidade (faixas de temperatura RDC 216 / CVS-5)
-- -----------------------------------------------------------------------------
insert into public.equipamentos (id, unidade_id, nome, tipo, temp_min_c, temp_max_c, localizacao) values
  -- Macaw Camboinhas
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Geladeira cozinha',     'geladeira',      0,    5,   'Cozinha quente'),
  ('e1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Freezer 1',             'freezer',        null, -18, 'Estoque'),
  ('e1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Câmara fria',           'camara_fria',    0,    4,   'Estoque'),
  ('e1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Balcão térmico',        'balcao_termico', 60,   null, 'Passe'),
  ('e1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Geladeira bar',         'geladeira',      0,    7,   'Bar'),
  -- Macaw Búzios
  ('e2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Geladeira cozinha',     'geladeira',      0,    5,   'Cozinha quente'),
  ('e2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Freezer 1',             'freezer',        null, -18, 'Estoque'),
  ('e2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Câmara fria',           'camara_fria',    0,    4,   'Estoque'),
  ('e2000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Balcão térmico',        'balcao_termico', 60,   null, 'Passe'),
  ('e2000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Geladeira bar',         'geladeira',      0,    7,   'Bar')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Checklists globais
-- -----------------------------------------------------------------------------
insert into public.checklists (id, unidade_id, nome, descricao, frequencia) values
  ('d0000000-0000-0000-0000-000000000001', null, 'Abertura da cozinha',
    'Rotina de abertura conforme Boas Práticas (RDC 216/2004).', 'abertura'),
  ('d0000000-0000-0000-0000-000000000002', null, 'Fechamento da cozinha',
    'Rotina de fechamento: higienização, armazenamento e descarte.', 'fechamento')
on conflict do nothing;

insert into public.checklist_itens (id, checklist_id, ordem, texto, obrigatorio) values
  -- Abertura
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 'Colaboradores uniformizados, sem adornos, cabelos presos e protegidos', true),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 2, 'Mãos higienizadas; pias com sabonete, papel toalha e álcool 70%', true),
  ('d1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 3, 'Temperaturas de geladeiras, freezers e câmaras registradas', true),
  ('d1000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 4, 'Etiquetas vencidas retiradas e descartes registrados', true),
  ('d1000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 5, 'Bancadas e utensílios higienizados antes do uso', true),
  ('d1000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000001', 6, 'Produtos em descongelamento sob refrigeração (nunca em temperatura ambiente)', true),
  ('d1000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000001', 7, 'Lixeiras limpas, com tampa e acionamento por pedal', true),
  ('d1000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000001', 8, 'EPIs disponíveis (luvas térmicas, luvas descartáveis, avental)', false),
  -- Fechamento
  ('d1000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000002', 1, 'Alimentos armazenados cobertos e etiquetados', true),
  ('d1000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000002', 2, 'Sobras de produção avaliadas, etiquetadas ou descartadas e registradas', true),
  ('d1000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000002', 3, 'Temperaturas finais dos equipamentos registradas', true),
  ('d1000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000002', 4, 'Bancadas, pisos, ralos e equipamentos higienizados', true),
  ('d1000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000002', 5, 'Lixo retirado e lixeiras higienizadas', true),
  ('d1000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000002', 6, 'Amostras do dia guardadas sob refrigeração por 72 h', true),
  ('d1000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000002', 7, 'Panos e esponjas trocados ou higienizados', true),
  ('d1000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000002', 8, 'Gás, fornos e equipamentos elétricos desligados', true)
on conflict do nothing;
