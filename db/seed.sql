-- =====================================================================
-- Dados de exemplo (fictícios) para o esquema em schema.sql.
-- Rodar depois do schema: psql "$DATABASE_URL" -f db/seed.sql
-- =====================================================================

BEGIN;

TRUNCATE atendimento_historico, atendimentos, anotacoes, anotacoes_tipo,
         lgc, risco_categoria, risco_associado, associados, usuarios, areas
  RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------- --
-- Áreas e usuários fictícios
-- ---------------------------------------------------------------- --
INSERT INTO areas (id, nome, sigla) VALUES
  ('direl-gecre-credi', 'DIREL / GECRE / CREDI', 'CREDI'),
  ('direl-gecor-coadm', 'DIREL / GECOR / COADM', 'COADM'),
  ('direl-gecan-atend', 'DIREL / GECAN / ATEND', 'ATEND');

INSERT INTO usuarios (username, senha, nome, area_id) VALUES
  ('lucas.fic', '123456', 'Lucas Oliveira', 'direl-gecre-credi'),
  ('rafael.fic', '123456', 'Rafael Santos', 'direl-gecor-coadm'),
  ('funcionario.fic', '123456', 'Funcionário Padrão', 'direl-gecan-atend');

-- ---------------------------------------------------------------- --
-- Tipos de anotação interna: 234 é competência da CREDI, 233 da COADM.
-- (A descrição da 233 é fictícia; ajuste o texto livremente.)
-- ---------------------------------------------------------------- --
INSERT INTO anotacoes_tipo (codigo, descricao, area_competente_id) VALUES
  (234, 'Limite Suspenso', 'direl-gecre-credi'),
  (233, 'Pendência de Atualização Cadastral', 'direl-gecor-coadm');

-- ---------------------------------------------------------------- --
-- Associados (fichas cadastrais fictícias)
-- ---------------------------------------------------------------- --
INSERT INTO associados (cpf_cnpj, nome, data_nascimento, data_associacao, conta_digital, segmento, telefone, email, banco, agencia, conta, dia_vencimento, renda_mensal, renda_tipo, renda_validade, renda_status) VALUES
  ('170.519.317-09', 'Felipe Ferreira Felgueiras', '1990-05-10', '2022-03-01', '112.233-4', '2010.1 P-N', '(61) 99123-4567', 'felipe.felgueiras@example.com', '001', '1111-1', '222222-3', 10, 2500.00, 'Comprovada', CURRENT_DATE + INTERVAL '6 months', 'Vigente'),
  ('412.998.201-33', 'Marina Souza Andrade', '1985-11-22', '2021-07-15', '223.344-5', '2010.1 P-N', '(61) 99234-5678', 'marina.andrade@example.com', '001', '1111-1', '333333-4', 5, 4200.00, 'Comprovada', CURRENT_DATE + INTERVAL '1 year', 'Vigente'),
  ('098.765.432-11', 'João Pedro Lima', '1978-02-14', '2019-01-10', '334.455-6', '2010.2 P-N', '(61) 99345-6789', 'joao.lima@example.com', '001', '2727-8', '444444-5', 15, 3100.00, 'Comprovada', CURRENT_DATE - INTERVAL '20 days', 'Vencido'),
  ('12.345.678/0001-90', 'Construtora Horizonte Ltda', NULL, '2020-05-20', '556.677-8', '3010.1 PJ', '(61) 3212-9900', 'financeiro@horizonteconstrutora.example.com', '001', '2727-8', '555555-6', 25, 45000.00, 'Balanço/Faturamento', CURRENT_DATE + INTERVAL '1 year', 'Vigente'),
  ('556.112.400-77', 'Cláudia Ramos Vieira', '1995-09-03', '2023-02-01', '667.788-9', '2010.1 P-N', '(61) 99456-7890', 'claudia.vieira@example.com', '001', '1111-1', '666666-7', 8, 1800.00, 'Comprovada', CURRENT_DATE + INTERVAL '8 months', 'Vigente'),
  ('789.456.123-55', 'Roberto Carlos Nunes', '1982-06-30', '2018-09-12', '778.899-0', '2010.2 P-N', '(61) 99567-8901', 'roberto.nunes@example.com', '001', '2727-8', '777777-8', 20, 5200.00, 'Comprovada', CURRENT_DATE + INTERVAL '1 year', 'Vigente'),
  ('033.122.041-51', 'Lucas Matheus Oliveira De Brito', '2003-01-02', '2025-01-30', '216.986-0', '2010.1 P-N', '(61) 99954-1883', 'lucasmoliveirabrito2003@gmail.com', '001', '2727-8', '101652-0', 20, 3131.01, 'Comprovada', '2028-01-30', 'Vigente');

-- ---------------------------------------------------------------- --
-- Risco do associado (Anterior/Atual) — variando propositalmente:
--   Felipe:      risco Vencido   (precisa rodar nova análise)
--   Marina:      risco Vigente
--   João Pedro:  risco Vigente, mas renda Vencida (ver acima)
--   Construtora: será Bloqueado pela anotação 233 (inserida abaixo)
--   Cláudia:     risco Vigente
--   Roberto:     será Bloqueado pela anotação 234 (inserida abaixo)
--   Lucas M.:    exatamente os valores do print de referência
-- ---------------------------------------------------------------- --
INSERT INTO risco_associado (cpf_cnpj, risco_anterior, risco_atual, status, implantado_em, validade, score_anterior, score_atual) VALUES
  ('170.519.317-09', 'D', 'C', 'Vencido', CURRENT_DATE - INTERVAL '380 days', CURRENT_DATE - INTERVAL '15 days', 560, 590),
  ('412.998.201-33', 'B', 'B', 'Vigente', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '300 days', 690, 705),
  ('098.765.432-11', 'C', 'C', 'Vigente', CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE + INTERVAL '270 days', 600, 610),
  ('12.345.678/0001-90', 'C', 'C', 'Vigente', CURRENT_DATE - INTERVAL '100 days', CURRENT_DATE + INTERVAL '265 days', 615, 620),
  ('556.112.400-77', 'D', 'C', 'Vigente', CURRENT_DATE - INTERVAL '40 days', CURRENT_DATE + INTERVAL '325 days', 560, 605),
  ('789.456.123-55', 'B', 'B', 'Vigente', CURRENT_DATE - INTERVAL '70 days', CURRENT_DATE + INTERVAL '295 days', 680, 690),
  ('033.122.041-51', 'C', 'C', 'Vigente', '2025-06-18', '2027-07-23', 651, 670);

-- ---------------------------------------------------------------- --
-- LGC / limite de cada associado
-- ---------------------------------------------------------------- --
INSERT INTO lgc (cpf_cnpj, validade, multiplicador_segmento, fator_risco, fator_endividamento, redutor_temporario, limite_global, responsabilidades, liberacoes_mes, amortizacoes_mes, margem_desconto_percentual, margem_desconto_maxima, margem_desconto_utilizada) VALUES
  ('170.519.317-09', CURRENT_DATE - INTERVAL '15 days', 5, 0.7, 1, 1, 8750.00, 1200.00, 0, 0, 6, 525.00, 0),
  ('412.998.201-33', CURRENT_DATE + INTERVAL '300 days', 6, 0.85, 1, 1, 17640.00, 3000.00, 0, 500.00, 6, 1058.40, 200.00),
  ('098.765.432-11', CURRENT_DATE + INTERVAL '270 days', 5, 0.75, 1, 1, 11625.00, 0, 0, 0, 6, 697.50, 0),
  ('12.345.678/0001-90', CURRENT_DATE + INTERVAL '265 days', 8, 0.75, 1, 1, 270000.00, 50000.00, 0, 0, 4, 10800.00, 0),
  ('556.112.400-77', CURRENT_DATE + INTERVAL '325 days', 4, 0.8, 1, 1, 5760.00, 0, 0, 0, 6, 345.60, 0),
  ('789.456.123-55', CURRENT_DATE + INTERVAL '295 days', 6, 0.85, 1, 1, 26520.00, 4000.00, 0, 0, 6, 1591.20, 0),
  ('033.122.041-51', '2027-07-23', 6, 0.8, 1, 1, 15028.85, 0, 0, 0, NULL, 939.30, 0);

-- ---------------------------------------------------------------- --
-- Detalhamento por categoria — completo para Lucas M. (igual ao print
-- de referência) e resumido para os demais associados PF; para a PJ
-- (Construtora) usamos categorias compatíveis com pessoa jurídica.
-- ---------------------------------------------------------------- --
INSERT INTO risco_categoria (cpf_cnpj, ordem, categoria, score_anterior, valor_anterior, score_atual, valor_atual, alerta) VALUES
  ('033.122.041-51', 1, 'Alpha Inicial', 3.1869, '3.186944', 3.1869, '3.186944', false),
  ('033.122.041-51', 2, 'Renda Comprovada', 0.0847, '2.96850', 0.0894, '3.13101', true),
  ('033.122.041-51', 3, 'Idade', 0.3891, '22', 0.4068, '23', true),
  ('033.122.041-51', 4, 'Segmento', -0.9708, '2', -0.9708, '2', false),
  ('033.122.041-51', 5, 'Situacao Funcional', -0.1315, 'Ativa', -0.1315, 'Ativa', false),
  ('033.122.041-51', 6, 'Cep', 0, '70854110', 0, '70854110', false),
  ('033.122.041-51', 7, 'Cep Calculado', 0.1913, '7.08000', 0.1913, '7.08000', false),
  ('033.122.041-51', 8, 'Sexo', -0.3384, 'Masculino', -0.3384, 'Masculino', false),
  ('033.122.041-51', 9, 'Escolaridade', 0, 'Médio', 0.2958, 'Superior', true),
  ('033.122.041-51', 10, 'Estado Civil', 0, 'Solteiro(a)', 0, 'Solteiro(a)', false),
  ('033.122.041-51', 11, 'Cheque Sem Fundo Serasa', 0, '0', 0, '0', false),
  ('033.122.041-51', 12, 'Refin Serasa', 0, '0.00', 0, '0.00', false),
  ('033.122.041-51', 13, 'Refin Calculado Serasa', 0, '0.00000', 0, '0.00000', false),

  ('170.519.317-09', 1, 'Alpha Inicial', 2.9010, '2.901000', 2.9010, '2.901000', false),
  ('170.519.317-09', 2, 'Renda Comprovada', 0.0512, '2.50000', 0.0512, '2.50000', false),
  ('170.519.317-09', 3, 'Idade', 0.3012, '35', 0.3012, '36', false),
  ('170.519.317-09', 4, 'Situacao Funcional', -0.1315, 'Ativa', -0.1315, 'Ativa', false),
  ('170.519.317-09', 5, 'Cheque Sem Fundo Serasa', 0, '0', 0, '0', false),

  ('412.998.201-33', 1, 'Alpha Inicial', 3.0500, '3.050000', 3.0700, '3.070000', false),
  ('412.998.201-33', 2, 'Renda Comprovada', 0.0910, '4.20000', 0.0910, '4.20000', false),
  ('412.998.201-33', 3, 'Idade', 0.4210, '40', 0.4210, '41', false),
  ('412.998.201-33', 4, 'Escolaridade', 0.2958, 'Superior', 0.2958, 'Superior', false),

  ('098.765.432-11', 1, 'Alpha Inicial', 2.9800, '2.980000', 2.9800, '2.980000', false),
  ('098.765.432-11', 2, 'Renda Comprovada', 0.0700, '3.10000', 0.0512, '3.10000', true),
  ('098.765.432-11', 3, 'Idade', 0.4500, '47', 0.4600, '48', false),

  ('12.345.678/0001-90', 1, 'Faturamento Anual', 3.2000, '540000.00', 3.2100, '545000.00', false),
  ('12.345.678/0001-90', 2, 'Tempo de Atividade', 0.5200, '6 anos', 0.5200, '6 anos', false),
  ('12.345.678/0001-90', 3, 'Segmento', -0.4000, 'PJ Construção', -0.4000, 'PJ Construção', false),

  ('556.112.400-77', 1, 'Alpha Inicial', 2.8500, '2.850000', 2.9700, '2.970000', false),
  ('556.112.400-77', 2, 'Renda Comprovada', 0.0450, '1.80000', 0.0450, '1.80000', false),
  ('556.112.400-77', 3, 'Idade', 0.2700, '30', 0.2700, '31', false),

  ('789.456.123-55', 1, 'Alpha Inicial', 3.1000, '3.100000', 3.1200, '3.120000', false),
  ('789.456.123-55', 2, 'Renda Comprovada', 0.0980, '5.20000', 0.0980, '5.20000', false),
  ('789.456.123-55', 3, 'Idade', 0.4700, '43', 0.4700, '44', false);

-- ---------------------------------------------------------------- --
-- Anotações internas ativas — ao inserir, o trigger bloqueia
-- automaticamente o risco do associado correspondente.
--   234 - Limite Suspenso            -> competência CREDI  -> Roberto Carlos Nunes
--   233 - Pendência de Atualização   -> competência COADM  -> Construtora Horizonte
-- ---------------------------------------------------------------- --
INSERT INTO anotacoes (cpf_cnpj, tipo_codigo, usuario_inclusao, ativa) VALUES
  ('789.456.123-55', 234, 'lucas.fic', true),
  ('12.345.678/0001-90', 233, 'rafael.fic', true);

-- ---------------------------------------------------------------- --
-- Atendimentos (comunicador entre áreas) + histórico
-- ---------------------------------------------------------------- --

-- 1) Pendente, ainda não atendido (área CREDI)
INSERT INTO atendimentos (protocolo, cpf_cnpj, nome, origem, assunto, area_id, situacao, ocorrencia, data_abertura) VALUES
  ('80409569108', '170.519.317-09', 'Felipe Ferreira Felgueiras', 'WhatsApp', 'Crédito / Limite de Crédito', 'direl-gecre-credi', 'Pendente',
   E'Cooperado com interesse em crédito. Informou que todas as pendências existentes em seu CPF foram liquidadas, novas consultas realizadas confirmando.\nPoderiam, por gentileza, realizar uma nova consulta MACRI?',
   now());
INSERT INTO atendimento_historico (protocolo, data_hora, responsavel, acao, detalhe) VALUES
  ('80409569108', now(), 'Camilla Alexandre da Silva (ATEND)', 'Abertura', 'Encaminhou para Área: DIREL / GECRE / CREDI');

-- 2) Pendente, mesma área
INSERT INTO atendimentos (protocolo, cpf_cnpj, nome, origem, assunto, area_id, situacao, ocorrencia, data_abertura) VALUES
  ('06485541059', '412.998.201-33', 'Marina Souza Andrade', 'Telefone', 'Empréstimo / Simulação', 'direl-gecre-credi', 'Pendente',
   'Cooperada solicitou simulação de empréstimo consignado para quitação de dívidas em outra instituição.',
   now() - INTERVAL '1 day');
INSERT INTO atendimento_historico (protocolo, data_hora, responsavel, acao, detalhe) VALUES
  ('06485541059', now() - INTERVAL '1 day', 'Camilla Alexandre da Silva (ATEND)', 'Abertura', 'Encaminhou para Área: DIREL / GECRE / CREDI');

-- 3) Pendente, ainda não atendido (antes vinha pré-atendido; agora fica em
--    branco como os demais, para todo teste começar do mesmo estado "zero")
INSERT INTO atendimentos (protocolo, cpf_cnpj, nome, origem, assunto, area_id, situacao, ocorrencia, data_abertura) VALUES
  ('61106396258', '098.765.432-11', 'João Pedro Lima', 'E-mail', 'Cartão / Bloqueio e Desbloqueio', 'direl-gecre-credi', 'Pendente',
   'Cliente solicita desbloqueio do cartão de crédito após viagem internacional.',
   now() - INTERVAL '2 days');
INSERT INTO atendimento_historico (protocolo, data_hora, responsavel, acao, detalhe) VALUES
  ('61106396258', now() - INTERVAL '2 days', 'Camilla Alexandre da Silva (ATEND)', 'Abertura', 'Encaminhou para Área: DIREL / GECRE / CREDI');

-- 4) Área COADM, pendente (ligado à pendência cadastral 233)
INSERT INTO atendimentos (protocolo, cpf_cnpj, nome, origem, assunto, area_id, situacao, ocorrencia, data_abertura) VALUES
  ('32165498720', '12.345.678/0001-90', 'Construtora Horizonte Ltda', 'Presencial', 'Cadastro / Atualização Cadastral', 'direl-gecor-coadm', 'Pendente',
   'Empresa solicita atualização de contrato social e quadro societário no cadastro.',
   now());
INSERT INTO atendimento_historico (protocolo, data_hora, responsavel, acao, detalhe) VALUES
  ('32165498720', now(), 'Bruna Nascimento (ATEND)', 'Abertura', 'Encaminhou para Área: DIREL / GECOR / COADM');

-- 5) Pendente, ainda não atendido (antes vinha finalizado; agora fica em
--    branco como os demais, para todo teste começar do mesmo estado "zero")
INSERT INTO atendimentos (protocolo, cpf_cnpj, nome, origem, assunto, area_id, situacao, ocorrencia, data_abertura) VALUES
  ('55611240077', '556.112.400-77', 'Cláudia Ramos Vieira', 'Chat Site', 'Cobrança / Renegociação de Dívida', 'direl-gecan-atend', 'Pendente',
   'Cliente deseja renegociar parcelas em atraso do cartão de crédito.',
   now() - INTERVAL '4 days');
INSERT INTO atendimento_historico (protocolo, data_hora, responsavel, acao, detalhe) VALUES
  ('55611240077', now() - INTERVAL '4 days', 'Bruna Nascimento (ATEND)', 'Abertura', 'Encaminhou para Área: DIREL / GECAN / ATEND');

-- 6) Encaminhado entre áreas: aberto na ATEND, atendido, e encaminhado
--    para a CREDI (onde fica pendente novamente) — o associado está
--    com risco Bloqueado pela anotação 234, então a CREDI só consegue
--    liberar o aumento de limite depois de baixar essa anotação.
INSERT INTO atendimentos (protocolo, cpf_cnpj, nome, origem, assunto, area_id, situacao, ocorrencia, data_abertura) VALUES
  ('78945612355', '789.456.123-55', 'Roberto Carlos Nunes', 'WhatsApp', 'Crédito / Limite de Crédito', 'direl-gecre-credi', 'Pendente',
   'Cliente solicitou aumento de limite de crédito rotativo.',
   now() - INTERVAL '3 days');
INSERT INTO atendimento_historico (protocolo, data_hora, responsavel, acao, detalhe) VALUES
  ('78945612355', now() - INTERVAL '3 days', 'Bruna Nascimento (ATEND)', 'Abertura', 'Encaminhou para Área: DIREL / GECAN / ATEND');
INSERT INTO atendimento_historico (protocolo, data_hora, responsavel, acao) VALUES
  ('78945612355', now() - INTERVAL '3 days' + INTERVAL '5 minutes', 'Funcionário Padrão', 'Assumiu o atendimento');
INSERT INTO atendimento_historico (protocolo, data_hora, responsavel, acao, texto, detalhe) VALUES
  ('78945612355', now() - INTERVAL '2 days', 'Funcionário Padrão', 'Resposta / Encaminhamento', 'Análise inicial concluída, encaminhando para a área de crédito avaliar o limite.', 'Encaminhou para Área: DIREL / GECRE / CREDI');

COMMIT;
