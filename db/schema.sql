-- =====================================================================
-- Comunicador entre Áreas — esquema SQL (PostgreSQL)
--
-- Agrega: áreas/usuários fictícios, atendimentos (tickets) entre áreas,
-- ficha do associado (dados cadastrais, risco/score, LGC/limite) e
-- anotações internas que bloqueiam o risco do associado até serem
-- baixadas pela área competente.
--
-- Toda a lógica de negócio sensível (atender, encaminhar, finalizar,
-- executar nova análise de risco, baixar anotação) fica em funções
-- PL/pgSQL (fn_*) para que QUALQUER cliente — o próprio app Node deste
-- repositório ou uma integração externa via OutSystems Developer Cloud
-- (ODC) conectada diretamente neste banco — acione exatamente a mesma
-- regra, sem duplicar lógica em dois lugares.
--
-- Como rodar: psql "$DATABASE_URL" -f db/schema.sql
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS atendimento_historico CASCADE;
DROP TABLE IF EXISTS atendimentos CASCADE;
DROP TABLE IF EXISTS anotacoes CASCADE;
DROP TABLE IF EXISTS anotacoes_tipo CASCADE;
DROP TABLE IF EXISTS lgc CASCADE;
DROP TABLE IF EXISTS risco_categoria CASCADE;
DROP TABLE IF EXISTS risco_associado CASCADE;
DROP TABLE IF EXISTS associados CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS areas CASCADE;

DROP TYPE IF EXISTS situacao_atendimento;
DROP TYPE IF EXISTS status_risco;
DROP TYPE IF EXISTS status_renda;

-- ------------------------------------------------------------------ --
-- Estruturas base: áreas e usuários (login fictícios)
-- ------------------------------------------------------------------ --

CREATE TABLE areas (
  id    text PRIMARY KEY,
  nome  text NOT NULL,
  sigla text NOT NULL
);

CREATE TABLE usuarios (
  username text PRIMARY KEY,
  senha    text NOT NULL,
  nome     text NOT NULL,
  area_id  text NOT NULL REFERENCES areas(id)
);

-- ------------------------------------------------------------------ --
-- Ficha do associado (cadastro + risco/score + LGC/limite)
-- ------------------------------------------------------------------ --

CREATE TYPE status_risco AS ENUM ('Vigente', 'Vencido', 'Bloqueado');
CREATE TYPE status_renda AS ENUM ('Vigente', 'Vencido');

CREATE TABLE associados (
  cpf_cnpj          text PRIMARY KEY,
  nome              text NOT NULL,
  data_nascimento   date,
  data_associacao   date,
  conta_digital     text,
  conta_status      text NOT NULL DEFAULT 'Ativa',
  segmento          text,
  telefone          text,
  email             text,
  situacao_cadastral text NOT NULL DEFAULT 'Associado',
  banco             text,
  agencia           text,
  conta             text,
  dia_vencimento    integer,
  renda_mensal      numeric(14,2),
  renda_tipo        text,
  renda_validade    date,
  renda_status      status_renda NOT NULL DEFAULT 'Vigente'
);

-- Snapshot atual de risco do associado, com o par Anterior/Atual exibido
-- na tela "Risco Associado/LGC".
CREATE TABLE risco_associado (
  cpf_cnpj       text PRIMARY KEY REFERENCES associados(cpf_cnpj) ON DELETE CASCADE,
  risco_anterior char(1),
  risco_atual    char(1) NOT NULL,
  status         status_risco NOT NULL DEFAULT 'Vigente',
  implantado_em  date NOT NULL DEFAULT CURRENT_DATE,
  validade       date NOT NULL,
  score_anterior integer,
  score_atual    integer NOT NULL,
  atualizado_em  timestamp NOT NULL DEFAULT now()
);

-- Detalhamento por categoria (Alpha Inicial, Renda Comprovada, Idade, ...)
CREATE TABLE risco_categoria (
  id             serial PRIMARY KEY,
  cpf_cnpj       text NOT NULL REFERENCES associados(cpf_cnpj) ON DELETE CASCADE,
  ordem          integer NOT NULL DEFAULT 0,
  categoria      text NOT NULL,
  score_anterior numeric(12,4),
  valor_anterior text,
  score_atual    numeric(12,4),
  valor_atual    text,
  alerta         boolean NOT NULL DEFAULT false
);

-- Limite Global de Crédito (LGC)
CREATE TABLE lgc (
  cpf_cnpj                    text PRIMARY KEY REFERENCES associados(cpf_cnpj) ON DELETE CASCADE,
  validade                    date NOT NULL,
  multiplicador_segmento      numeric(8,2) NOT NULL DEFAULT 0,
  fator_risco                 numeric(8,2) NOT NULL DEFAULT 0,
  fator_endividamento         numeric(8,2) NOT NULL DEFAULT 1,
  redutor_temporario          numeric(8,2) NOT NULL DEFAULT 1,
  limite_global               numeric(14,2) NOT NULL DEFAULT 0,
  responsabilidades           numeric(14,2) NOT NULL DEFAULT 0,
  liberacoes_mes              numeric(14,2) NOT NULL DEFAULT 0,
  amortizacoes_mes            numeric(14,2) NOT NULL DEFAULT 0,
  margem_desconto_percentual  numeric(6,2),
  margem_desconto_maxima      numeric(14,2) NOT NULL DEFAULT 0,
  margem_desconto_utilizada   numeric(14,2) NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------ --
-- Anotações internas (cadastrais). Enquanto houver ao menos uma
-- anotação ATIVA para o associado, o risco fica "Bloqueado" (trigger
-- abaixo). Cada tipo de anotação só pode ser baixado pela área
-- competente por aquele código.
-- ------------------------------------------------------------------ --

CREATE TABLE anotacoes_tipo (
  codigo             integer PRIMARY KEY,
  descricao          text NOT NULL,
  area_competente_id text NOT NULL REFERENCES areas(id)
);

CREATE TABLE anotacoes (
  id              serial PRIMARY KEY,
  cpf_cnpj        text NOT NULL REFERENCES associados(cpf_cnpj) ON DELETE CASCADE,
  tipo_codigo     integer NOT NULL REFERENCES anotacoes_tipo(codigo),
  data_inclusao   timestamp NOT NULL DEFAULT now(),
  usuario_inclusao text REFERENCES usuarios(username),
  ativa           boolean NOT NULL DEFAULT true,
  data_baixa      timestamp,
  usuario_baixa   text REFERENCES usuarios(username),
  motivo_baixa    text
);

CREATE INDEX idx_anotacoes_cpf ON anotacoes(cpf_cnpj);

-- ------------------------------------------------------------------ --
-- Atendimentos (comunicador entre áreas) — mesmo domínio da versão
-- anterior deste projeto, agora em tabelas SQL reais.
-- ------------------------------------------------------------------ --

CREATE TYPE situacao_atendimento AS ENUM ('Pendente', 'Em Atendimento', 'Finalizado');

CREATE TABLE atendimentos (
  protocolo            text PRIMARY KEY,
  cpf_cnpj             text NOT NULL REFERENCES associados(cpf_cnpj),
  nome                 text NOT NULL,
  origem               text NOT NULL,
  assunto              text NOT NULL,
  area_id              text NOT NULL REFERENCES areas(id),
  situacao             situacao_atendimento NOT NULL DEFAULT 'Pendente',
  responsavel_nome     text,
  responsavel_username text REFERENCES usuarios(username),
  ocorrencia           text NOT NULL,
  data_abertura        timestamp NOT NULL DEFAULT now()
);

CREATE TABLE atendimento_historico (
  id         serial PRIMARY KEY,
  protocolo  text NOT NULL REFERENCES atendimentos(protocolo) ON DELETE CASCADE,
  data_hora  timestamp NOT NULL DEFAULT now(),
  responsavel text NOT NULL,
  acao       text NOT NULL,
  texto      text,
  detalhe    text
);

CREATE INDEX idx_atendimentos_area ON atendimentos(area_id);
CREATE INDEX idx_historico_protocolo ON atendimento_historico(protocolo);

-- ------------------------------------------------------------------ --
-- View de leitura conveniente para BI/relatórios e para o OutSystems
-- consumir como External Entity somente-leitura (ex.: telas de
-- consulta), com todos os campos já "achatados".
-- ------------------------------------------------------------------ --

CREATE VIEW vw_associado_ficha AS
SELECT
  a.cpf_cnpj, a.nome, a.data_nascimento, a.data_associacao, a.conta_digital,
  a.conta_status, a.segmento, a.telefone, a.email, a.situacao_cadastral,
  a.banco, a.agencia, a.conta, a.dia_vencimento,
  a.renda_mensal, a.renda_tipo, a.renda_validade, a.renda_status,
  r.risco_anterior, r.risco_atual, r.status AS risco_status,
  r.implantado_em, r.validade AS risco_validade, r.score_anterior, r.score_atual,
  l.validade AS lgc_validade, l.multiplicador_segmento, l.fator_risco,
  l.fator_endividamento, l.redutor_temporario, l.limite_global,
  l.responsabilidades, l.liberacoes_mes, l.amortizacoes_mes,
  (l.limite_global - l.responsabilidades - l.liberacoes_mes + l.amortizacoes_mes) AS margem_operacional,
  l.margem_desconto_percentual, l.margem_desconto_maxima, l.margem_desconto_utilizada,
  (l.margem_desconto_maxima - l.margem_desconto_utilizada) AS margem_desconto_disponivel,
  EXISTS(SELECT 1 FROM anotacoes an WHERE an.cpf_cnpj = a.cpf_cnpj AND an.ativa) AS tem_anotacao_ativa
FROM associados a
LEFT JOIN risco_associado r ON r.cpf_cnpj = a.cpf_cnpj
LEFT JOIN lgc l ON l.cpf_cnpj = a.cpf_cnpj;

CREATE VIEW vw_atendimentos AS
SELECT
  t.protocolo, t.cpf_cnpj, t.nome, t.origem, t.assunto, t.area_id,
  ar.nome AS area_nome, t.situacao, t.responsavel_nome, t.responsavel_username,
  t.ocorrencia, t.data_abertura,
  GREATEST(0, EXTRACT(DAY FROM now() - t.data_abertura)::int) AS prazo_dias
FROM atendimentos t
JOIN areas ar ON ar.id = t.area_id;

-- ------------------------------------------------------------------ --
-- Trigger: enquanto existir anotação ativa, risco fica Bloqueado.
-- Quando a última anotação ativa é baixada, o risco volta a refletir
-- a validade atual (Vigente ou Vencido).
-- ------------------------------------------------------------------ --

CREATE OR REPLACE FUNCTION trg_fn_anotacao_atualiza_risco() RETURNS trigger AS $$
DECLARE
  v_cpf text := COALESCE(NEW.cpf_cnpj, OLD.cpf_cnpj);
  v_tem_ativa boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM anotacoes WHERE cpf_cnpj = v_cpf AND ativa) INTO v_tem_ativa;

  IF v_tem_ativa THEN
    UPDATE risco_associado SET status = 'Bloqueado' WHERE cpf_cnpj = v_cpf AND status <> 'Bloqueado';
  ELSE
    UPDATE risco_associado
       SET status = CASE WHEN validade >= CURRENT_DATE THEN 'Vigente'::status_risco ELSE 'Vencido'::status_risco END
     WHERE cpf_cnpj = v_cpf AND status = 'Bloqueado';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_anotacoes_atualiza_risco
AFTER INSERT OR UPDATE OF ativa ON anotacoes
FOR EACH ROW EXECUTE FUNCTION trg_fn_anotacao_atualiza_risco();

-- ------------------------------------------------------------------ --
-- Funções de negócio (fn_*) — ponto único de verdade para as ações que
-- o app e/ou o OutSystems ODC (conectado diretamente neste banco)
-- podem acionar.
-- ------------------------------------------------------------------ --

CREATE OR REPLACE FUNCTION fn_letra_risco_por_score(p_score integer) RETURNS char(1) AS $$
BEGIN
  IF p_score >= 750 THEN RETURN 'A';
  ELSIF p_score >= 650 THEN RETURN 'B';
  ELSIF p_score >= 550 THEN RETURN 'C';
  ELSIF p_score >= 450 THEN RETURN 'D';
  ELSE RETURN 'E';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Executa nova análise de risco: promove atual->anterior, gera novo
-- score/risco e revalida por 1 ano. Enquanto houver anotação ativa, o
-- resultado da análise é calculado mas o status permanece "Bloqueado"
-- (a anotação precisa ser baixada primeiro pela área competente).
CREATE OR REPLACE FUNCTION fn_executar_analise_risco(p_cpf text)
RETURNS risco_associado AS $$
DECLARE
  v_bloqueado boolean;
  v_novo_score integer;
  r risco_associado;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM risco_associado WHERE cpf_cnpj = p_cpf) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: associado % não possui ficha de risco', p_cpf;
  END IF;

  SELECT EXISTS(SELECT 1 FROM anotacoes WHERE cpf_cnpj = p_cpf AND ativa) INTO v_bloqueado;

  SELECT LEAST(950, score_atual + 10 + floor(random() * 20)::int) INTO v_novo_score
    FROM risco_associado WHERE cpf_cnpj = p_cpf;

  UPDATE risco_associado
     SET risco_anterior = risco_atual,
         score_anterior = score_atual,
         risco_atual    = fn_letra_risco_por_score(v_novo_score),
         score_atual    = v_novo_score,
         implantado_em  = CURRENT_DATE,
         validade       = CURRENT_DATE + INTERVAL '1 year',
         status         = CASE WHEN v_bloqueado THEN 'Bloqueado'::status_risco ELSE 'Vigente'::status_risco END,
         atualizado_em  = now()
   WHERE cpf_cnpj = p_cpf
   RETURNING * INTO r;

  RETURN r;
END;
$$ LANGUAGE plpgsql;

-- Baixa uma anotação — somente um usuário da área competente para
-- aquele código de anotação pode fazer isso.
CREATE OR REPLACE FUNCTION fn_baixar_anotacao(p_anotacao_id integer, p_username text, p_motivo text)
RETURNS anotacoes AS $$
DECLARE
  v_area_usuario text;
  v_area_competente text;
  v_ja_baixada boolean;
  a anotacoes;
BEGIN
  SELECT area_id INTO v_area_usuario FROM usuarios WHERE username = p_username;
  IF v_area_usuario IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: usuário % não encontrado', p_username;
  END IF;

  SELECT t.area_competente_id, an.ativa = false INTO v_area_competente, v_ja_baixada
    FROM anotacoes an JOIN anotacoes_tipo t ON t.codigo = an.tipo_codigo
   WHERE an.id = p_anotacao_id;

  IF v_area_competente IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: anotação % não encontrada', p_anotacao_id;
  END IF;
  IF v_ja_baixada THEN
    RAISE EXCEPTION 'CONFLITO: anotação % já está baixada', p_anotacao_id;
  END IF;
  IF v_area_usuario IS DISTINCT FROM v_area_competente THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: usuário % não tem competência para baixar esta anotação', p_username;
  END IF;

  UPDATE anotacoes
     SET ativa = false, data_baixa = now(), usuario_baixa = p_username, motivo_baixa = p_motivo
   WHERE id = p_anotacao_id
   RETURNING * INTO a;

  RETURN a;
END;
$$ LANGUAGE plpgsql;

-- Abre uma nova ocorrência/atendimento (cria o associado automaticamente
-- se o CPF/CNPJ ainda não existir na base — útil para um agente de IA
-- registrando um contato novo vindo do WhatsApp).
CREATE OR REPLACE FUNCTION fn_abrir_atendimento(
  p_cpf text, p_nome text, p_origem text, p_assunto text,
  p_area_id text, p_ocorrencia text, p_responsavel_abertura text
) RETURNS atendimentos AS $$
DECLARE
  v_protocolo text;
  v_area_nome text;
  t atendimentos;
BEGIN
  SELECT nome INTO v_area_nome FROM areas WHERE id = p_area_id;
  IF v_area_nome IS NULL THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS: área de destino inválida';
  END IF;

  INSERT INTO associados(cpf_cnpj, nome) VALUES (p_cpf, p_nome)
  ON CONFLICT (cpf_cnpj) DO NOTHING;

  v_protocolo := lpad(floor(random() * 100000000000)::bigint::text, 11, '0');

  INSERT INTO atendimentos(protocolo, cpf_cnpj, nome, origem, assunto, area_id, ocorrencia)
  VALUES (v_protocolo, p_cpf, p_nome, p_origem, p_assunto, p_area_id, p_ocorrencia)
  RETURNING * INTO t;

  INSERT INTO atendimento_historico(protocolo, responsavel, acao, detalhe)
  VALUES (v_protocolo, p_responsavel_abertura, 'Abertura', 'Encaminhou para Área: ' || v_area_nome);

  RETURN t;
END;
$$ LANGUAGE plpgsql;

-- Assume o atendimento (bloqueio de sobreposição: só a área correta e
-- só se ainda estiver sem responsável).
CREATE OR REPLACE FUNCTION fn_atender_atendimento(p_protocolo text, p_username text)
RETURNS atendimentos AS $$
DECLARE
  u usuarios;
  t atendimentos;
BEGIN
  SELECT * INTO u FROM usuarios WHERE username = p_username;
  IF u IS NULL THEN RAISE EXCEPTION 'NAO_ENCONTRADO: usuário não encontrado'; END IF;

  SELECT * INTO t FROM atendimentos WHERE protocolo = p_protocolo FOR UPDATE;
  IF t IS NULL THEN RAISE EXCEPTION 'NAO_ENCONTRADO: atendimento % não encontrado', p_protocolo; END IF;

  IF t.area_id <> u.area_id THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: este atendimento pertence a outra área';
  END IF;
  IF t.situacao <> 'Pendente' OR t.responsavel_username IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLITO: já está sendo tratado por %', COALESCE(t.responsavel_nome, 'outro usuário');
  END IF;

  UPDATE atendimentos
     SET situacao = 'Em Atendimento', responsavel_nome = u.nome, responsavel_username = u.username
   WHERE protocolo = p_protocolo
   RETURNING * INTO t;

  INSERT INTO atendimento_historico(protocolo, responsavel, acao)
  VALUES (p_protocolo, u.nome, 'Assumiu o atendimento');

  RETURN t;
END;
$$ LANGUAGE plpgsql;

-- Encaminha o atendimento (mesma área de quem enviou ou qualquer outra).
CREATE OR REPLACE FUNCTION fn_encaminhar_atendimento(
  p_protocolo text, p_username text, p_texto text, p_area_destino_id text
) RETURNS atendimentos AS $$
DECLARE
  u usuarios;
  t atendimentos;
  v_area_nome text;
BEGIN
  SELECT * INTO u FROM usuarios WHERE username = p_username;
  SELECT * INTO t FROM atendimentos WHERE protocolo = p_protocolo FOR UPDATE;
  IF t IS NULL THEN RAISE EXCEPTION 'NAO_ENCONTRADO: atendimento % não encontrado', p_protocolo; END IF;

  IF t.responsavel_username IS DISTINCT FROM p_username THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: somente quem está atendendo pode encaminhar';
  END IF;
  IF p_texto IS NULL OR btrim(p_texto) = '' THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS: descreva o que foi feito antes de encaminhar';
  END IF;

  SELECT nome INTO v_area_nome FROM areas WHERE id = p_area_destino_id;
  IF v_area_nome IS NULL THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS: área de destino inválida';
  END IF;

  INSERT INTO atendimento_historico(protocolo, responsavel, acao, texto, detalhe)
  VALUES (p_protocolo, u.nome, 'Resposta / Encaminhamento', p_texto, 'Encaminhou para Área: ' || v_area_nome);

  UPDATE atendimentos
     SET area_id = p_area_destino_id, situacao = 'Pendente',
         responsavel_nome = NULL, responsavel_username = NULL
   WHERE protocolo = p_protocolo
   RETURNING * INTO t;

  RETURN t;
END;
$$ LANGUAGE plpgsql;

-- Finaliza o atendimento.
CREATE OR REPLACE FUNCTION fn_finalizar_atendimento(p_protocolo text, p_username text, p_texto text)
RETURNS atendimentos AS $$
DECLARE
  u usuarios;
  t atendimentos;
BEGIN
  SELECT * INTO u FROM usuarios WHERE username = p_username;
  SELECT * INTO t FROM atendimentos WHERE protocolo = p_protocolo FOR UPDATE;
  IF t IS NULL THEN RAISE EXCEPTION 'NAO_ENCONTRADO: atendimento % não encontrado', p_protocolo; END IF;

  IF t.responsavel_username IS DISTINCT FROM p_username THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: somente quem está atendendo pode finalizar';
  END IF;
  IF p_texto IS NULL OR btrim(p_texto) = '' THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS: descreva o que foi feito antes de finalizar';
  END IF;

  INSERT INTO atendimento_historico(protocolo, responsavel, acao, texto)
  VALUES (p_protocolo, u.nome, 'Finalizou o atendimento', p_texto);

  UPDATE atendimentos SET situacao = 'Finalizado' WHERE protocolo = p_protocolo RETURNING * INTO t;

  RETURN t;
END;
$$ LANGUAGE plpgsql;

COMMIT;
