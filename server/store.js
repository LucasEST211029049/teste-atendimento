const pool = require('./db');

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatarData(d) {
  const dt = new Date(d);
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function formatarHora(d) {
  const dt = new Date(d);
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

// Erros de negócio das funções PL/pgSQL vêm com um prefixo (ver db/schema.sql)
// que mapeamos para o mesmo formato { erro, mensagem } usado pela API.
function mapPgErro(err) {
  const match = /^(NAO_ENCONTRADO|SEM_PERMISSAO|CONFLITO|DADOS_INVALIDOS):\s*(.*)$/.exec(err.message || '');
  if (!match) throw err;
  const codigos = { NAO_ENCONTRADO: 404, SEM_PERMISSAO: 403, CONFLITO: 409, DADOS_INVALIDOS: 400 };
  return { erro: codigos[match[1]], mensagem: match[2] };
}

function mapTicketRow(row) {
  return {
    protocolo: row.protocolo,
    dataAberturaIso: new Date(row.data_abertura).toISOString(),
    dataSolicitacao: formatarData(row.data_abertura),
    tipoRegistro: 'Atendimento',
    cpfCnpj: row.cpf_cnpj,
    nome: row.nome,
    origem: row.origem,
    assunto: row.assunto,
    areaId: row.area_id,
    areaNome: row.area_nome,
    situacao: row.situacao,
    responsavelAtual: row.responsavel_nome,
    responsavelUsername: row.responsavel_username,
    ocorrencia: row.ocorrencia,
    prazoDias: Number(row.prazo_dias),
  };
}

function mapHistoricoRow(row) {
  return {
    data: formatarData(row.data_hora),
    hora: formatarHora(row.data_hora),
    responsavel: row.responsavel,
    acao: row.acao,
    texto: row.texto || undefined,
    detalhe: row.detalhe || undefined,
  };
}

// ------------------------------------------------------------- áreas/usuários
async function listarAreas() {
  const { rows } = await pool.query('SELECT id, nome, sigla FROM areas ORDER BY nome');
  return rows;
}

async function areaById(id) {
  const { rows } = await pool.query('SELECT id, nome, sigla FROM areas WHERE id = $1', [id]);
  return rows[0] || null;
}

async function usuarioPublico(username) {
  const { rows } = await pool.query(
    `SELECT u.username, u.nome, u.area_id, a.nome AS area_nome
       FROM usuarios u JOIN areas a ON a.id = u.area_id
      WHERE u.username = $1`,
    [username]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return { username: r.username, nome: r.nome, areaId: r.area_id, area: r.area_nome };
}

async function autenticar(username, password) {
  const { rows } = await pool.query('SELECT username, senha, nome, area_id FROM usuarios WHERE username = $1', [
    (username || '').trim(),
  ]);
  const user = rows[0];
  if (!user || user.senha !== password) return null;
  return { username: user.username, nome: user.nome, areaId: user.area_id };
}

async function usuariosDemo() {
  const { rows } = await pool.query(
    `SELECT u.username, u.nome, a.nome AS area FROM usuarios u JOIN areas a ON a.id = u.area_id ORDER BY u.username`
  );
  return rows;
}

// ------------------------------------------------------------------ tickets
async function listar(filtros = {}) {
  const where = [];
  const params = [];
  const add = (clausula, valor) => {
    params.push(valor);
    where.push(clausula.replace('?', `$${params.length}`));
  };

  if (filtros.protocolo) add('protocolo ILIKE ?', `%${filtros.protocolo.trim()}%`);
  if (filtros.cpfCnpj) add("regexp_replace(cpf_cnpj, '\\D', '', 'g') ILIKE ?", `%${filtros.cpfCnpj.replace(/\D/g, '')}%`);
  if (filtros.nome) add('nome ILIKE ?', `%${filtros.nome.trim()}%`);
  if (filtros.areaId) add('area_id = ?', filtros.areaId);
  if (filtros.assunto) add('assunto = ?', filtros.assunto);
  if (filtros.situacao) add('situacao = ?', filtros.situacao);
  if (filtros.origem) add('origem = ?', filtros.origem);
  if (filtros.responsavel) add('responsavel_nome ILIKE ?', `%${filtros.responsavel.trim()}%`);
  if (filtros.de) add('data_abertura >= ?', new Date(filtros.de));
  if (filtros.ate) {
    const ate = new Date(filtros.ate);
    ate.setHours(23, 59, 59, 999);
    add('data_abertura <= ?', ate);
  }

  const sql = `SELECT * FROM vw_atendimentos ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY data_abertura DESC`;
  const { rows } = await pool.query(sql, params);
  return rows.map(mapTicketRow);
}

async function anexarHistorico(ticket) {
  const { rows } = await pool.query(
    'SELECT * FROM atendimento_historico WHERE protocolo = $1 ORDER BY data_hora ASC',
    [ticket.protocolo]
  );
  return { ...ticket, historico: rows.map(mapHistoricoRow) };
}

async function buscarPorProtocolo(protocolo) {
  const { rows } = await pool.query('SELECT * FROM vw_atendimentos WHERE protocolo = $1', [protocolo]);
  if (!rows[0]) return null;
  return anexarHistorico(mapTicketRow(rows[0]));
}

async function minhaFila(username) {
  const { rows } = await pool.query(
    `SELECT * FROM vw_atendimentos WHERE responsavel_username = $1 AND situacao = 'Em Atendimento' ORDER BY data_abertura ASC`,
    [username]
  );
  return Promise.all(rows.map((r) => anexarHistorico(mapTicketRow(r))));
}

async function chamarFuncaoTicket(sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    // As funções fn_* retornam a linha da tabela base `atendimentos`, que não
    // tem area_nome/prazo_dias (só existem na view) — busca a view para
    // devolver o ticket completo com os mesmos campos de GET /api/tickets.
    const { rows: viewRows } = await pool.query('SELECT * FROM vw_atendimentos WHERE protocolo = $1', [
      rows[0].protocolo,
    ]);
    return { ticket: mapTicketRow(viewRows[0]) };
  } catch (err) {
    return mapPgErro(err);
  }
}

function atender(protocolo, user) {
  return chamarFuncaoTicket('SELECT * FROM fn_atender_atendimento($1, $2)', [protocolo, user.username]);
}

function encaminhar(protocolo, user, texto, areaDestinoId) {
  return chamarFuncaoTicket('SELECT * FROM fn_encaminhar_atendimento($1, $2, $3, $4)', [
    protocolo,
    user.username,
    texto,
    areaDestinoId,
  ]);
}

function finalizar(protocolo, user, texto) {
  return chamarFuncaoTicket('SELECT * FROM fn_finalizar_atendimento($1, $2, $3)', [protocolo, user.username, texto]);
}

// Registra no histórico do atendimento que o agente de IA (ODC) foi
// consultado e qual foi a decisão recebida — não muda situação/área do
// atendimento, é só um registro informativo para quem for revisar depois.
async function registrarConsultaIA(protocolo, nomeUsuario, payload, decisao) {
  const resumo = typeof decisao === 'object' ? JSON.stringify(decisao) : String(decisao);
  await pool.query(
    `INSERT INTO atendimento_historico (protocolo, responsavel, acao, texto, detalhe)
     VALUES ($1, $2, 'Consultou Agente de IA (ODC)', $3, $4)`,
    [protocolo, nomeUsuario, resumo, `SessionId: ${payload.SessionId}`]
  );
}

async function criarOcorrencia({ cpfCnpj, nome, origem, assunto, areaId, ocorrencia, aberturaResponsavel }) {
  return chamarFuncaoTicket('SELECT * FROM fn_abrir_atendimento($1, $2, $3, $4, $5, $6, $7)', [
    cpfCnpj,
    nome,
    origem,
    assunto,
    areaId,
    ocorrencia,
    aberturaResponsavel,
  ]);
}

// ------------------------------------------------------- ficha do associado
async function buscarAssociado(cpfCnpjBusca) {
  // Aceita o CPF/CNPJ tanto formatado quanto só com dígitos (busca manual
  // na aba "Risco / Restrições" não deve exigir pontuação exata).
  const { rows } = await pool.query(
    `SELECT * FROM vw_associado_ficha
      WHERE cpf_cnpj = $1
         OR regexp_replace(cpf_cnpj, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
      LIMIT 1`,
    [cpfCnpjBusca]
  );
  const a = rows[0];
  if (!a) return null;
  const cpfCnpj = a.cpf_cnpj;

  const { rows: categorias } = await pool.query(
    'SELECT * FROM risco_categoria WHERE cpf_cnpj = $1 ORDER BY ordem ASC',
    [cpfCnpj]
  );

  return {
    associado: {
      cpfCnpj: a.cpf_cnpj,
      nome: a.nome,
      dataNascimento: a.data_nascimento,
      dataAssociacao: a.data_associacao,
      contaDigital: a.conta_digital,
      contaStatus: a.conta_status,
      segmento: a.segmento,
      telefone: a.telefone,
      email: a.email,
      situacaoCadastral: a.situacao_cadastral,
      banco: a.banco,
      agencia: a.agencia,
      conta: a.conta,
      diaVencimento: a.dia_vencimento,
      rendaMensal: a.renda_mensal,
      rendaTipo: a.renda_tipo,
      rendaValidade: a.renda_validade,
      rendaStatus: a.renda_status,
    },
    risco: {
      riscoAnterior: a.risco_anterior,
      riscoAtual: a.risco_atual,
      status: a.risco_status,
      implantadoEm: a.implantado_em,
      validade: a.risco_validade,
      scoreAnterior: a.score_anterior,
      scoreAtual: a.score_atual,
    },
    categorias: categorias.map((c) => ({
      categoria: c.categoria,
      scoreAnterior: c.score_anterior,
      valorAnterior: c.valor_anterior,
      scoreAtual: c.score_atual,
      valorAtual: c.valor_atual,
      alerta: c.alerta,
    })),
    lgc: {
      validade: a.lgc_validade,
      multiplicadorSegmento: a.multiplicador_segmento,
      fatorRisco: a.fator_risco,
      fatorEndividamento: a.fator_endividamento,
      redutorTemporario: a.redutor_temporario,
      limiteGlobal: a.limite_global,
      responsabilidades: a.responsabilidades,
      liberacoesMes: a.liberacoes_mes,
      amortizacoesMes: a.amortizacoes_mes,
      margemOperacional: a.margem_operacional,
      margemDescontoPercentual: a.margem_desconto_percentual,
      margemDescontoMaxima: a.margem_desconto_maxima,
      margemDescontoUtilizada: a.margem_desconto_utilizada,
      margemDescontoDisponivel: a.margem_desconto_disponivel,
    },
    temAnotacaoAtiva: a.tem_anotacao_ativa,
  };
}

async function executarAnaliseRisco(cpfCnpj) {
  try {
    const { rows } = await pool.query('SELECT * FROM fn_executar_analise_risco($1)', [cpfCnpj]);
    const r = rows[0];
    return {
      risco: {
        riscoAnterior: r.risco_anterior,
        riscoAtual: r.risco_atual,
        status: r.status,
        implantadoEm: r.implantado_em,
        validade: r.validade,
        scoreAnterior: r.score_anterior,
        scoreAtual: r.score_atual,
      },
    };
  } catch (err) {
    return mapPgErro(err);
  }
}

// -------------------------------------------------------------- anotações
async function listarAnotacoes(cpfCnpj) {
  const { rows } = await pool.query(
    `SELECT an.*, t.descricao, t.area_competente_id, ar.nome AS area_competente_nome
       FROM anotacoes an
       JOIN anotacoes_tipo t ON t.codigo = an.tipo_codigo
       JOIN areas ar ON ar.id = t.area_competente_id
      WHERE an.cpf_cnpj = $1
      ORDER BY an.data_inclusao DESC`,
    [cpfCnpj]
  );

  const mapear = (r) => ({
    id: r.id,
    tipoCodigo: r.tipo_codigo,
    descricao: r.descricao,
    areaCompetenteId: r.area_competente_id,
    areaCompetenteNome: r.area_competente_nome,
    dataInclusao: r.data_inclusao,
    usuarioInclusao: r.usuario_inclusao,
    ativa: r.ativa,
    dataBaixa: r.data_baixa,
    usuarioBaixa: r.usuario_baixa,
    motivoBaixa: r.motivo_baixa,
  });

  return {
    ativas: rows.filter((r) => r.ativa).map(mapear),
    baixadas: rows.filter((r) => !r.ativa).map(mapear),
  };
}

async function baixarAnotacao(id, user, motivo) {
  try {
    const { rows } = await pool.query('SELECT * FROM fn_baixar_anotacao($1, $2, $3)', [id, user.username, motivo]);
    const a = rows[0];
    return {
      anotacao: {
        id: a.id,
        cpfCnpj: a.cpf_cnpj,
        tipoCodigo: a.tipo_codigo,
        ativa: a.ativa,
        dataBaixa: a.data_baixa,
        usuarioBaixa: a.usuario_baixa,
        motivoBaixa: a.motivo_baixa,
      },
    };
  } catch (err) {
    return mapPgErro(err);
  }
}

module.exports = {
  listarAreas,
  areaById,
  usuarioPublico,
  autenticar,
  usuariosDemo,
  listar,
  buscarPorProtocolo,
  minhaFila,
  atender,
  encaminhar,
  finalizar,
  registrarConsultaIA,
  criarOcorrencia,
  buscarAssociado,
  executarAnaliseRisco,
  listarAnotacoes,
  baixarAnotacao,
};
