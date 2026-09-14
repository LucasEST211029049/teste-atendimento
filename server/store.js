const fs = require('fs');
const path = require('path');
const { AREAS, areaById } = require('./data');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

function pad(n) {
  return String(n).padStart(2, '0');
}

function nowParts(date = new Date()) {
  return {
    data: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
    hora: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    iso: date.toISOString(),
  };
}

function gerarProtocolo() {
  // Protocolo numérico de 11 dígitos, no estilo do sistema original.
  let numero = '';
  for (let i = 0; i < 11; i++) numero += Math.floor(Math.random() * 10);
  return numero;
}

function seedTickets() {
  const t0 = new Date();
  const diasAtras = (d) => new Date(t0.getTime() - d * 24 * 60 * 60 * 1000);

  const tickets = [];

  // 1) Réplica do exemplo mostrado nas telas de referência: pendente, ainda não atendido.
  tickets.push(criarRegistro({
    dataAbertura: diasAtras(0),
    cpfCnpj: '170.519.317-09',
    nome: 'Felipe Ferreira Felgueiras',
    origem: 'WhatsApp',
    assunto: 'Crédito / Limite de Crédito',
    areaId: 'direl-gecre-credi',
    aberturaResponsavel: 'Camilla Alexandre da Silva (ATEND)',
    ocorrencia:
      'Cooperado com interesse em crédito. Informou que todas as pendências existentes em seu CPF foram liquidadas, novas consultas realizadas confirmando.\nPoderiam, por gentileza, realizar uma nova consulta MACRI?',
  }));

  // 2) Outro pendente na mesma área, para testar a fila de atendimento.
  tickets.push(criarRegistro({
    dataAbertura: diasAtras(1),
    cpfCnpj: '412.998.201-33',
    nome: 'Marina Souza Andrade',
    origem: 'Telefone',
    assunto: 'Empréstimo / Simulação',
    areaId: 'direl-gecre-credi',
    aberturaResponsavel: 'Camilla Alexandre da Silva (ATEND)',
    ocorrencia: 'Cooperada solicitou simulação de empréstimo consignado para quitação de dívidas em outra instituição.',
  }));

  // 3) Já em atendimento por alguém (para demonstrar bloqueio de sobreposição).
  const t3 = criarRegistro({
    dataAbertura: diasAtras(2),
    cpfCnpj: '098.765.432-11',
    nome: 'João Pedro Lima',
    origem: 'E-mail',
    assunto: 'Cartão / Bloqueio e Desbloqueio',
    areaId: 'direl-gecre-credi',
    aberturaResponsavel: 'Camilla Alexandre da Silva (ATEND)',
    ocorrencia: 'Cliente solicita desbloqueio do cartão de crédito após viagem internacional.',
  });
  atenderRegistro(t3, 'Lucas Oliveira', 'lucas.fic', diasAtras(2));
  tickets.push(t3);

  // 4) Área DIREL / GECOR / COADM, pendente.
  tickets.push(criarRegistro({
    dataAbertura: diasAtras(0),
    cpfCnpj: '321.654.987-20',
    nome: 'Construtora Horizonte Ltda',
    origem: 'Presencial',
    assunto: 'Cadastro / Atualização Cadastral',
    areaId: 'direl-gecor-coadm',
    aberturaResponsavel: 'Bruna Nascimento (ATEND)',
    ocorrencia: 'Empresa solicita atualização de contrato social e quadro societário no cadastro.',
  }));

  // 5) Área DIREL / GECAN / ATEND, já finalizado (histórico completo).
  const t5 = criarRegistro({
    dataAbertura: diasAtras(4),
    cpfCnpj: '556.112.400-77',
    nome: 'Cláudia Ramos Vieira',
    origem: 'Chat Site',
    assunto: 'Cobrança / Renegociação de Dívida',
    areaId: 'direl-gecan-atend',
    aberturaResponsavel: 'Bruna Nascimento (ATEND)',
    ocorrencia: 'Cliente deseja renegociar parcelas em atraso do cartão de crédito.',
  });
  atenderRegistro(t5, 'Funcionário Padrão', 'funcionario.fic', diasAtras(3));
  finalizarRegistro(t5, 'Funcionário Padrão', 'Renegociação concluída, novo boleto enviado por e-mail.', diasAtras(3));
  tickets.push(t5);

  // 6) Encaminhado entre áreas (para demonstrar o fluxo de encaminhamento).
  const t6 = criarRegistro({
    dataAbertura: diasAtras(3),
    cpfCnpj: '789.456.123-55',
    nome: 'Roberto Carlos Nunes',
    origem: 'WhatsApp',
    assunto: 'Crédito / Limite de Crédito',
    areaId: 'direl-gecan-atend',
    aberturaResponsavel: 'Bruna Nascimento (ATEND)',
    ocorrencia: 'Cliente solicitou aumento de limite de crédito rotativo.',
  });
  atenderRegistro(t6, 'Funcionário Padrão', 'funcionario.fic', diasAtras(3));
  encaminharRegistro(t6, 'Funcionário Padrão', 'Análise inicial concluída, encaminhando para a área de crédito avaliar o limite.', 'direl-gecre-credi', diasAtras(2));
  tickets.push(t6);

  return tickets;
}

function criarRegistro({ dataAbertura, cpfCnpj, nome, origem, assunto, areaId, aberturaResponsavel, ocorrencia }) {
  const { data, hora, iso } = nowParts(dataAbertura);
  return {
    protocolo: gerarProtocolo(),
    dataAberturaIso: iso,
    dataSolicitacao: data,
    tipoRegistro: 'Atendimento',
    cpfCnpj,
    nome,
    origem,
    assunto,
    areaId,
    situacao: 'Pendente',
    responsavelAtual: null,
    responsavelUsername: null,
    ocorrencia,
    historico: [
      {
        data,
        hora,
        responsavel: aberturaResponsavel,
        acao: 'Abertura',
        detalhe: `Encaminhou para Área: ${areaById(areaId).nome}`,
      },
    ],
  };
}

function atenderRegistro(ticket, nomeUsuario, username, quando = new Date()) {
  const { data, hora } = nowParts(quando);
  ticket.situacao = 'Em Atendimento';
  ticket.responsavelAtual = nomeUsuario;
  ticket.responsavelUsername = username;
  ticket.historico.push({ data, hora, responsavel: nomeUsuario, acao: 'Assumiu o atendimento' });
}

function encaminharRegistro(ticket, nomeUsuario, texto, areaDestinoId, quando = new Date()) {
  const { data, hora } = nowParts(quando);
  const destino = areaById(areaDestinoId);
  ticket.historico.push({
    data,
    hora,
    responsavel: nomeUsuario,
    acao: 'Resposta / Encaminhamento',
    texto,
    detalhe: `Encaminhou para Área: ${destino.nome}`,
  });
  ticket.areaId = areaDestinoId;
  ticket.situacao = 'Pendente';
  ticket.responsavelAtual = null;
  ticket.responsavelUsername = null;
}

function finalizarRegistro(ticket, nomeUsuario, texto, quando = new Date()) {
  const { data, hora } = nowParts(quando);
  ticket.situacao = 'Finalizado';
  ticket.historico.push({ data, hora, responsavel: nomeUsuario, acao: 'Finalizou o atendimento', texto });
}

class Store {
  constructor() {
    this.tickets = this._load();
  }

  _load() {
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (err) {
        console.error('Falha ao ler data.json, recriando dados de exemplo.', err);
      }
    }
    const seeded = seedTickets();
    this._persist(seeded);
    return seeded;
  }

  _persist(tickets = this.tickets) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2), 'utf-8');
  }

  listar(filtros = {}) {
    let lista = this.tickets.slice();

    if (filtros.protocolo) {
      lista = lista.filter((t) => t.protocolo.includes(filtros.protocolo.trim()));
    }
    if (filtros.cpfCnpj) {
      const alvo = filtros.cpfCnpj.replace(/\D/g, '');
      lista = lista.filter((t) => t.cpfCnpj.replace(/\D/g, '').includes(alvo));
    }
    if (filtros.nome) {
      const alvo = filtros.nome.trim().toLowerCase();
      lista = lista.filter((t) => t.nome.toLowerCase().includes(alvo));
    }
    if (filtros.areaId) {
      lista = lista.filter((t) => t.areaId === filtros.areaId);
    }
    if (filtros.assunto) {
      lista = lista.filter((t) => t.assunto === filtros.assunto);
    }
    if (filtros.situacao) {
      lista = lista.filter((t) => t.situacao === filtros.situacao);
    }
    if (filtros.origem) {
      lista = lista.filter((t) => t.origem === filtros.origem);
    }
    if (filtros.responsavel) {
      const alvo = filtros.responsavel.trim().toLowerCase();
      lista = lista.filter((t) => (t.responsavelAtual || '').toLowerCase().includes(alvo));
    }
    if (filtros.de) {
      const de = new Date(filtros.de);
      lista = lista.filter((t) => new Date(t.dataAberturaIso) >= de);
    }
    if (filtros.ate) {
      const ate = new Date(filtros.ate);
      ate.setHours(23, 59, 59, 999);
      lista = lista.filter((t) => new Date(t.dataAberturaIso) <= ate);
    }

    lista.sort((a, b) => new Date(b.dataAberturaIso) - new Date(a.dataAberturaIso));
    return lista;
  }

  buscarPorProtocolo(protocolo) {
    return this.tickets.find((t) => t.protocolo === protocolo) || null;
  }

  minhaFila(username) {
    return this.tickets
      .filter((t) => t.responsavelUsername === username && t.situacao === 'Em Atendimento')
      .sort((a, b) => new Date(a.dataAberturaIso) - new Date(b.dataAberturaIso));
  }

  atender(protocolo, user) {
    const ticket = this.buscarPorProtocolo(protocolo);
    if (!ticket) return { erro: 404, mensagem: 'Atendimento não encontrado.' };
    if (ticket.areaId !== user.areaId) {
      return { erro: 403, mensagem: 'Este atendimento pertence a outra área e não pode ser atendido por você.' };
    }
    if (ticket.situacao !== 'Pendente' || ticket.responsavelAtual) {
      return {
        erro: 409,
        mensagem: `Este atendimento já está sendo tratado por ${ticket.responsavelAtual || 'outro usuário'}.`,
      };
    }
    atenderRegistro(ticket, user.nome, user.username);
    this._persist();
    return { ticket };
  }

  encaminhar(protocolo, user, texto, areaDestinoId) {
    const ticket = this.buscarPorProtocolo(protocolo);
    if (!ticket) return { erro: 404, mensagem: 'Atendimento não encontrado.' };
    if (ticket.responsavelUsername !== user.username) {
      return { erro: 403, mensagem: 'Somente quem está atendendo pode encaminhar este atendimento.' };
    }
    if (!areaById(areaDestinoId)) {
      return { erro: 400, mensagem: 'Área de destino inválida.' };
    }
    if (!texto || !texto.trim()) {
      return { erro: 400, mensagem: 'Descreva o que foi feito antes de encaminhar.' };
    }
    encaminharRegistro(ticket, user.nome, texto.trim(), areaDestinoId);
    this._persist();
    return { ticket };
  }

  finalizar(protocolo, user, texto) {
    const ticket = this.buscarPorProtocolo(protocolo);
    if (!ticket) return { erro: 404, mensagem: 'Atendimento não encontrado.' };
    if (ticket.responsavelUsername !== user.username) {
      return { erro: 403, mensagem: 'Somente quem está atendendo pode finalizar este atendimento.' };
    }
    if (!texto || !texto.trim()) {
      return { erro: 400, mensagem: 'Descreva o que foi feito antes de finalizar.' };
    }
    finalizarRegistro(ticket, user.nome, texto.trim());
    this._persist();
    return { ticket };
  }

  criarOcorrencia({ cpfCnpj, nome, origem, assunto, areaId, ocorrencia, aberturaResponsavel }) {
    if (!areaById(areaId)) return { erro: 400, mensagem: 'Área de destino inválida.' };
    const ticket = criarRegistro({
      dataAbertura: new Date(),
      cpfCnpj,
      nome,
      origem,
      assunto,
      areaId,
      aberturaResponsavel,
      ocorrencia,
    });
    this.tickets.unshift(ticket);
    this._persist();
    return { ticket };
  }
}

module.exports = new Store();
