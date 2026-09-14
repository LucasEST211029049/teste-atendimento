const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { AREAS, ASSUNTOS, ORIGENS, SITUACOES, USERS, areaById, userByUsername } = require('./data');
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

function publicUser(user) {
  const area = areaById(user.areaId);
  return { username: user.username, nome: user.nome, areaId: user.areaId, area: area ? area.nome : null };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const username = token && sessions.get(token);
  if (!username) return res.status(401).json({ mensagem: 'Não autenticado.' });
  const user = userByUsername(username);
  if (!user) return res.status(401).json({ mensagem: 'Não autenticado.' });
  req.user = user;
  next();
}

// Autenticação alternativa para o endpoint de abertura de ocorrência: aceita
// tanto um usuário humano logado (Bearer token) quanto a chave do agente de
// IA (header X-Agent-Api-Key), usada por um fluxo automatizado no ODC que
// recebe mensagens (ex.: WhatsApp) e registra a ocorrência sem ser um dos
// 3 atendentes fictícios.
function requireAuthOuAgente(req, res, next) {
  const apiKey = req.headers['x-agent-api-key'];
  if (apiKey && apiKey === AGENT_API_KEY) {
    req.agente = true;
    return next();
  }
  return requireAuth(req, res, next);
}

function ticketParaCliente(ticket) {
  const area = areaById(ticket.areaId);
  const abertura = new Date(ticket.dataAberturaIso);
  const dias = Math.max(0, Math.floor((Date.now() - abertura.getTime()) / (24 * 60 * 60 * 1000)));
  return { ...ticket, areaNome: area ? area.nome : ticket.areaId, prazoDias: dias };
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = userByUsername((username || '').trim());
  if (!user || user.password !== password) {
    return res.status(401).json({ mensagem: 'Usuário ou senha inválidos.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user.username);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/config', requireAuth, (_req, res) => {
  res.json({ areas: AREAS, assuntos: ASSUNTOS, origens: ORIGENS, situacoes: SITUACOES });
});

app.get('/api/usuarios-demo', (_req, res) => {
  // Exposto propositalmente (sem senha) para preencher a tela de login com os 3 logins fictícios.
  res.json({ usuarios: USERS.map((u) => ({ username: u.username, nome: u.nome, area: areaById(u.areaId).nome })) });
});

app.get('/api/tickets', requireAuth, (req, res) => {
  const lista = store.listar(req.query);
  res.json({ tickets: lista.map(ticketParaCliente) });
});

app.get('/api/tickets/minha-fila', requireAuth, (req, res) => {
  const lista = store.minhaFila(req.user.username);
  res.json({ tickets: lista.map(ticketParaCliente) });
});

app.get('/api/tickets/:protocolo', requireAuth, (req, res) => {
  const ticket = store.buscarPorProtocolo(req.params.protocolo);
  if (!ticket) return res.status(404).json({ mensagem: 'Atendimento não encontrado.' });
  res.json({ ticket: ticketParaCliente(ticket) });
});

app.post('/api/tickets', requireAuthOuAgente, (req, res) => {
  const { cpfCnpj, nome, origem, assunto, areaId, ocorrencia, aberturaResponsavel } = req.body || {};
  if (!cpfCnpj || !nome || !origem || !assunto || !areaId || !ocorrencia) {
    return res.status(400).json({ mensagem: 'Preencha todos os campos da ocorrência.' });
  }
  const responsavelAbertura = req.agente
    ? aberturaResponsavel || 'Agente de IA (WhatsApp)'
    : `${req.user.nome} (${areaById(req.user.areaId).sigla})`;
  const resultado = store.criarOcorrencia({
    cpfCnpj,
    nome,
    origem,
    assunto,
    areaId,
    ocorrencia,
    aberturaResponsavel: responsavelAbertura,
  });
  if (resultado.erro) return res.status(resultado.erro).json({ mensagem: resultado.mensagem });
  res.status(201).json({ ticket: ticketParaCliente(resultado.ticket) });
});

app.post('/api/tickets/:protocolo/atender', requireAuth, (req, res) => {
  const resultado = store.atender(req.params.protocolo, req.user);
  if (resultado.erro) return res.status(resultado.erro).json({ mensagem: resultado.mensagem });
  res.json({ ticket: ticketParaCliente(resultado.ticket) });
});

app.post('/api/tickets/:protocolo/encaminhar', requireAuth, (req, res) => {
  const { texto, areaDestinoId } = req.body || {};
  const resultado = store.encaminhar(req.params.protocolo, req.user, texto, areaDestinoId);
  if (resultado.erro) return res.status(resultado.erro).json({ mensagem: resultado.mensagem });
  res.json({ ticket: ticketParaCliente(resultado.ticket) });
});

app.post('/api/tickets/:protocolo/finalizar', requireAuth, (req, res) => {
  const { texto } = req.body || {};
  const resultado = store.finalizar(req.params.protocolo, req.user, texto);
  if (resultado.erro) return res.status(resultado.erro).json({ mensagem: resultado.mensagem });
  res.json({ ticket: ticketParaCliente(resultado.ticket) });
});

// Especificação OpenAPI, usada para importar esta API como uma "REST API
// Integration" no OutSystems Developer Cloud (ODC) — veja o README.
app.get('/api/openapi.json', (req, res) => {
  res.json(openapi.build(`${req.protocol}://${req.get('host')}`));
});

app.listen(PORT, () => {
  console.log(`Comunicador entre áreas rodando em http://localhost:${PORT}`);
});
