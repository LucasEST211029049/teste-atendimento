const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { ASSUNTOS, ORIGENS, SITUACOES } = require('./data');
const store = require('./store');
const openapi = require('./openapi');

const app = express();
const PORT = process.env.PORT || 3000;

// Chave fixa de demonstração para o agente de IA (ex.: fluxo no OutSystems ODC)
// autenticar chamadas de máquina-a-máquina sem precisar de login de um usuário
// humano. Em um ambiente real, troque por uma chave secreta gerada e guardada
// em variável de ambiente/segredo do ODC.
const AGENT_API_KEY = process.env.AGENT_API_KEY || 'agente-demo-key-123';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Sessões simples em memória: token -> username. Suficiente para este ambiente
// fictício de demonstração (não usar este esquema de auth em produção).
const sessions = new Map();

function asyncRoute(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const username = token && sessions.get(token);
  if (!username) return res.status(401).json({ mensagem: 'Não autenticado.' });
  const user = await store.usuarioPublico(username);
  if (!user) return res.status(401).json({ mensagem: 'Não autenticado.' });
  req.user = user;
  next();
}

// Autenticação alternativa para o endpoint de abertura de ocorrência: aceita
// tanto um usuário humano logado (Bearer token) quanto a chave do agente de
// IA (header X-Agent-Api-Key), usada por um fluxo automatizado no ODC que
// recebe mensagens (ex.: WhatsApp) e registra a ocorrência sem ser um dos
// 3 atendentes fictícios.
async function requireAuthOuAgente(req, res, next) {
  const apiKey = req.headers['x-agent-api-key'];
  if (apiKey && apiKey === AGENT_API_KEY) {
    req.agente = true;
    return next();
  }
  return requireAuth(req, res, next);
}

function envia(res, resultado, statusOk = 200) {
  if (resultado.erro) return res.status(resultado.erro).json({ mensagem: resultado.mensagem });
  res.status(statusOk).json(resultado);
}

app.post(
  '/api/login',
  asyncRoute(async (req, res) => {
    const { username, password } = req.body || {};
    const user = await store.autenticar(username, password);
    if (!user) return res.status(401).json({ mensagem: 'Usuário ou senha inválidos.' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, user.username);
    const publico = await store.usuarioPublico(user.username);
    res.json({ token, user: publico });
  })
);

app.post('/api/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  sessions.delete(header.slice(7));
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get(
  '/api/config',
  requireAuth,
  asyncRoute(async (_req, res) => {
    const areas = await store.listarAreas();
    res.json({ areas, assuntos: ASSUNTOS, origens: ORIGENS, situacoes: SITUACOES });
  })
);

app.get(
  '/api/usuarios-demo',
  asyncRoute(async (_req, res) => {
    // Exposto propositalmente (sem senha) para preencher a tela de login com os 3 logins fictícios.
    const usuarios = await store.usuariosDemo();
    res.json({ usuarios });
  })
);

app.get(
  '/api/tickets',
  requireAuth,
  asyncRoute(async (req, res) => {
    const tickets = await store.listar(req.query);
    res.json({ tickets });
  })
);

app.get(
  '/api/tickets/minha-fila',
  requireAuth,
  asyncRoute(async (req, res) => {
    const tickets = await store.minhaFila(req.user.username);
    res.json({ tickets });
  })
);

app.get(
  '/api/tickets/:protocolo',
  requireAuth,
  asyncRoute(async (req, res) => {
    const ticket = await store.buscarPorProtocolo(req.params.protocolo);
    if (!ticket) return res.status(404).json({ mensagem: 'Atendimento não encontrado.' });
    res.json({ ticket });
  })
);

app.post(
  '/api/tickets',
  requireAuthOuAgente,
  asyncRoute(async (req, res) => {
    const { cpfCnpj, nome, origem, assunto, areaId, ocorrencia, aberturaResponsavel } = req.body || {};
    if (!cpfCnpj || !nome || !origem || !assunto || !areaId || !ocorrencia) {
      return res.status(400).json({ mensagem: 'Preencha todos os campos da ocorrência.' });
    }
    const responsavelAbertura = req.agente
      ? aberturaResponsavel || 'Agente de IA (WhatsApp)'
      : `${req.user.nome} (${(await store.areaById(req.user.areaId)).sigla})`;
    const resultado = await store.criarOcorrencia({ cpfCnpj, nome, origem, assunto, areaId, ocorrencia, aberturaResponsavel: responsavelAbertura });
    envia(res, resultado, 201);
  })
);

app.post(
  '/api/tickets/:protocolo/atender',
  requireAuth,
  asyncRoute(async (req, res) => {
    envia(res, await store.atender(req.params.protocolo, req.user));
  })
);

app.post(
  '/api/tickets/:protocolo/encaminhar',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { texto, areaDestinoId } = req.body || {};
    envia(res, await store.encaminhar(req.params.protocolo, req.user, texto, areaDestinoId));
  })
);

app.post(
  '/api/tickets/:protocolo/finalizar',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { texto } = req.body || {};
    envia(res, await store.finalizar(req.params.protocolo, req.user, texto));
  })
);

// ------------------------------------------------------ ficha do associado
app.get(
  '/api/associados/:cpfCnpj',
  requireAuth,
  asyncRoute(async (req, res) => {
    const ficha = await store.buscarAssociado(req.params.cpfCnpj);
    if (!ficha) return res.status(404).json({ mensagem: 'Associado não encontrado.' });
    res.json(ficha);
  })
);

app.post(
  '/api/associados/:cpfCnpj/analise-risco',
  requireAuth,
  asyncRoute(async (req, res) => {
    envia(res, await store.executarAnaliseRisco(req.params.cpfCnpj));
  })
);

app.get(
  '/api/associados/:cpfCnpj/anotacoes',
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json(await store.listarAnotacoes(req.params.cpfCnpj));
  })
);

app.post(
  '/api/anotacoes/:id/baixar',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { motivo } = req.body || {};
    envia(res, await store.baixarAnotacao(Number(req.params.id), req.user, motivo));
  })
);

// Especificação OpenAPI, usada para importar esta API como uma "REST API
// Integration" no OutSystems Developer Cloud (ODC) — veja o README.
app.get('/api/openapi.json', (req, res) => {
  res.json(openapi.build(`${req.protocol}://${req.get('host')}`));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ mensagem: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`Comunicador entre áreas rodando em http://localhost:${PORT}`);
});
