// Listas fixas que não vêm do banco (não são entidades de negócio, só
// preenchem os selects de filtro/formulário). Áreas, usuários, associados,
// risco, LGC, anotações e atendimentos agora vivem no Postgres — veja
// db/schema.sql e server/store.js.

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

module.exports = { ASSUNTOS, ORIGENS, SITUACOES };
