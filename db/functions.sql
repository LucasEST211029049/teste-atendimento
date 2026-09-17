-- =====================================================================
-- Correções/atualizações de funções pontuais, aplicadas em TODA subida do
-- app (server/index.js chama scripts/migrate.js -> ensureMigrado), mesmo
-- quando o schema já existe — diferente de schema.sql (que só roda numa
-- base vazia). CREATE OR REPLACE FUNCTION nunca apaga dados, é seguro
-- rodar repetidamente.
--
-- Mantenha isto em sincronia com os mesmos blocos em schema.sql sempre
-- que corrigir o corpo de uma função aqui listada.
-- =====================================================================

BEGIN;

-- Resolve um CPF/CNPJ informado (com ou sem pontuação) para o valor
-- exatamente como está gravado em `associados` — usado por qualquer
-- função/consulta que receba o CPF de fora (ex.: o agente de IA do ODC,
-- que envia só dígitos) para não depender de o chamador mandar a
-- formatação exata. Retorna NULL se não encontrar nenhum associado.
CREATE OR REPLACE FUNCTION fn_resolver_cpf(p_cpf text) RETURNS text AS $$
  SELECT cpf_cnpj FROM associados
   WHERE cpf_cnpj = p_cpf
      OR regexp_replace(cpf_cnpj, '\D', '', 'g') = regexp_replace(p_cpf, '\D', '', 'g')
   LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Executa nova análise de risco: promove atual->anterior, gera novo
-- score/risco e revalida por 1 ano. Enquanto houver anotação ativa, o
-- resultado da análise é calculado mas o status permanece "Bloqueado"
-- (a anotação precisa ser baixada primeiro pela área competente).
-- Aceita o CPF/CNPJ com ou sem pontuação (via fn_resolver_cpf).
CREATE OR REPLACE FUNCTION fn_executar_analise_risco(p_cpf text)
RETURNS risco_associado AS $$
DECLARE
  v_cpf text;
  v_bloqueado boolean;
  v_novo_score integer;
  r risco_associado;
BEGIN
  v_cpf := fn_resolver_cpf(p_cpf);
  IF v_cpf IS NULL OR NOT EXISTS (SELECT 1 FROM risco_associado WHERE cpf_cnpj = v_cpf) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: associado % não possui ficha de risco', p_cpf;
  END IF;

  SELECT EXISTS(SELECT 1 FROM anotacoes WHERE cpf_cnpj = v_cpf AND ativa) INTO v_bloqueado;

  SELECT LEAST(950, score_atual + 10 + floor(random() * 20)::int) INTO v_novo_score
    FROM risco_associado WHERE cpf_cnpj = v_cpf;

  UPDATE risco_associado
     SET risco_anterior = risco_atual,
         score_anterior = score_atual,
         risco_atual    = fn_letra_risco_por_score(v_novo_score),
         score_atual    = v_novo_score,
         implantado_em  = CURRENT_DATE,
         validade       = CURRENT_DATE + INTERVAL '1 year',
         status         = CASE WHEN v_bloqueado THEN 'Bloqueado'::status_risco ELSE 'Vigente'::status_risco END,
         atualizado_em  = now()
   WHERE cpf_cnpj = v_cpf
   RETURNING * INTO r;

  RETURN r;
END;
$$ LANGUAGE plpgsql;

-- Abre uma nova ocorrência/atendimento (cria o associado automaticamente
-- se o CPF/CNPJ ainda não existir na base — útil para um agente de IA
-- registrando um contato novo vindo do WhatsApp). Reaproveita um associado
-- já cadastrado com outra formatação de CPF via fn_resolver_cpf, em vez de
-- criar um segundo registro duplicado.
CREATE OR REPLACE FUNCTION fn_abrir_atendimento(
  p_cpf text, p_nome text, p_origem text, p_assunto text,
  p_area_id text, p_ocorrencia text, p_responsavel_abertura text
) RETURNS atendimentos AS $$
DECLARE
  v_cpf text;
  v_protocolo text;
  v_area_nome text;
  t atendimentos;
BEGIN
  SELECT nome INTO v_area_nome FROM areas WHERE id = p_area_id;
  IF v_area_nome IS NULL THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS: área de destino inválida';
  END IF;

  v_cpf := COALESCE(fn_resolver_cpf(p_cpf), p_cpf);

  INSERT INTO associados(cpf_cnpj, nome) VALUES (v_cpf, p_nome)
  ON CONFLICT (cpf_cnpj) DO NOTHING;

  v_protocolo := lpad(floor(random() * 100000000000)::bigint::text, 11, '0');

  INSERT INTO atendimentos(protocolo, cpf_cnpj, nome, origem, assunto, area_id, ocorrencia)
  VALUES (v_protocolo, v_cpf, p_nome, p_origem, p_assunto, p_area_id, p_ocorrencia)
  RETURNING * INTO t;

  INSERT INTO atendimento_historico(protocolo, responsavel, acao, detalhe)
  VALUES (v_protocolo, p_responsavel_abertura, 'Abertura', 'Encaminhou para Área: ' || v_area_nome);

  RETURN t;
END;
$$ LANGUAGE plpgsql;

COMMIT;
