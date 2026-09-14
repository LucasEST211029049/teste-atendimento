// Dados fixos do sistema fictício: áreas, usuários e listas auxiliares.

const AREAS = [
  { id: 'direl-gecre-credi', nome: 'DIREL / GECRE / CREDI', sigla: 'CREDI' },
  { id: 'direl-gecor-coadm', nome: 'DIREL / GECOR / COADM', sigla: 'COADM' },
  { id: 'direl-gecan-atend', nome: 'DIREL / GECAN / ATEND', sigla: 'ATEND' },
];

// Senha única de demonstração para os 3 logins fictícios: "123456"
const USERS = [
  { username: 'lucas.fic', password: '123456', nome: 'Lucas Oliveira', areaId: 'direl-gecre-credi' },
  { username: 'rafael.fic', password: '123456', nome: 'Rafael Santos', areaId: 'direl-gecor-coadm' },
  { username: 'funcionario.fic', password: '123456', nome: 'Funcionário Padrão', areaId: 'direl-gecan-atend' },
];

const ASSUNTOS = [
  'Crédito / Limite de Crédito',
  'Conta Corrente / Abertura de Conta',
  'Cartão / Bloqueio e Desbloqueio',
  'Cadastro / Atualização Cadastral',
  'Cobrança / Renegociação de Dívida',
  'Empréstimo / Simulação',
];

const ORIGENS = ['WhatsApp', 'Telefone', 'E-mail', 'Presencial', 'Chat Site'];

const SITUACOES = ['Pendente', 'Em Atendimento', 'Finalizado'];

function areaById(areaId) {
  return AREAS.find((a) => a.id === areaId) || null;
}

function userByUsername(username) {
  return USERS.find((u) => u.username === username) || null;
}

module.exports = { AREAS, USERS, ASSUNTOS, ORIGENS, SITUACOES, areaById, userByUsername };
