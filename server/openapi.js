// Especificação OpenAPI 3.0 da API deste sistema. Serve para importar a API
// como uma "REST API Integration" no OutSystems Developer Cloud (ODC): em
// Integration Studio (ou no separador Integrations do seu módulo),
// escolha "Add REST API integration" -> "From URL" e aponte para
// GET /api/openapi.json de uma instância publicamente acessível deste
// servidor (o ODC roda na nuvem e não alcança um `localhost`).

const ticketSchema = {
  type: 'object',
  properties: {
    protocolo: { type: 'string', example: '80409569108' },
    dataAberturaIso: { type: 'string', format: 'date-time' },
    dataSolicitacao: { type: 'string', example: '14/09/2026' },
    tipoRegistro: { type: 'string', example: 'Atendimento' },
    cpfCnpj: { type: 'string' },
    nome: { type: 'string' },
    origem: { type: 'string' },
    assunto: { type: 'string' },
    areaId: { type: 'string' },
    areaNome: { type: 'string' },
    situacao: { type: 'string', enum: ['Pendente', 'Em Atendimento', 'Finalizado'] },
    responsavelAtual: { type: 'string', nullable: true },
    responsavelUsername: { type: 'string', nullable: true },
    ocorrencia: { type: 'string' },
    prazoDias: { type: 'integer' },
    historico: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          data: { type: 'string' },
          hora: { type: 'string' },
          responsavel: { type: 'string' },
          acao: { type: 'string' },
          texto: { type: 'string' },
          detalhe: { type: 'string' },
        },
      },
    },
  },
};

const erroSchema = {
  type: 'object',
  properties: { mensagem: { type: 'string' } },
};

function build(baseUrl) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Comunicador entre Áreas — API',
      description:
        'API fictícia de registro, atendimento e encaminhamento de ocorrências entre áreas. ' +
        'Use o header Authorization (Bearer token, obtido em /api/login) para chamadas feitas em nome ' +
        'de um dos 3 usuários fictícios, ou o header X-Agent-Api-Key para chamadas automatizadas de um ' +
        'agente de IA (ex.: um fluxo no OutSystems ODC que abre ocorrências a partir do WhatsApp).',
      version: '1.0.0',
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        agentApiKey: { type: 'apiKey', in: 'header', name: 'X-Agent-Api-Key' },
      },
      schemas: { Ticket: ticketSchema, Erro: erroSchema },
    },
    paths: {
      '/api/login': {
        post: {
          summary: 'Autentica um dos 3 usuários fictícios e retorna um token',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: { username: { type: 'string', example: 'lucas.fic' }, password: { type: 'string', example: '123456' } },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Login efetuado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: {
                        type: 'object',
                        properties: {
                          username: { type: 'string' },
                          nome: { type: 'string' },
                          areaId: { type: 'string' },
                          area: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { description: 'Credenciais inválidas', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
      '/api/tickets': {
        get: {
          summary: 'Lista ocorrências, com filtros opcionais',
          parameters: [
            'de', 'ate', 'protocolo', 'cpfCnpj', 'nome', 'areaId', 'assunto', 'situacao', 'origem', 'responsavel',
          ].map((nome) => ({ name: nome, in: 'query', schema: { type: 'string' }, required: false })),
          responses: {
            200: {
              description: 'Lista de ocorrências',
              content: { 'application/json': { schema: { type: 'object', properties: { tickets: { type: 'array', items: ticketSchema } } } } },
            },
          },
        },
        post: {
          summary: 'Abre uma nova ocorrência (ex.: registrada por um agente de IA a partir do WhatsApp)',
          security: [{ bearerAuth: [] }, { agentApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['cpfCnpj', 'nome', 'origem', 'assunto', 'areaId', 'ocorrencia'],
                  properties: {
                    cpfCnpj: { type: 'string' },
                    nome: { type: 'string' },
                    origem: { type: 'string', example: 'WhatsApp' },
                    assunto: { type: 'string' },
                    areaId: { type: 'string', example: 'direl-gecre-credi' },
                    ocorrencia: { type: 'string' },
                    aberturaResponsavel: { type: 'string', description: 'Opcional; usado apenas nas chamadas autenticadas via X-Agent-Api-Key.' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Ocorrência criada', content: { 'application/json': { schema: { type: 'object', properties: { ticket: ticketSchema } } } } },
            400: { description: 'Dados inválidos', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
      '/api/tickets/minha-fila': {
        get: {
          summary: 'Lista as ocorrências em atendimento pelo usuário autenticado',
          responses: { 200: { description: 'Fila do usuário', content: { 'application/json': { schema: { type: 'object', properties: { tickets: { type: 'array', items: ticketSchema } } } } } } },
        },
      },
      '/api/tickets/{protocolo}': {
        get: {
          summary: 'Consulta uma ocorrência pelo protocolo',
          parameters: [{ name: 'protocolo', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Ocorrência encontrada', content: { 'application/json': { schema: { type: 'object', properties: { ticket: ticketSchema } } } } },
            404: { description: 'Não encontrada', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
      '/api/tickets/{protocolo}/atender': {
        post: {
          summary: 'Assume o atendimento (somente se a ocorrência for da área do usuário e estiver sem responsável)',
          parameters: [{ name: 'protocolo', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Ocorrência assumida', content: { 'application/json': { schema: { type: 'object', properties: { ticket: ticketSchema } } } } },
            403: { description: 'Ocorrência de outra área', content: { 'application/json': { schema: erroSchema } } },
            409: { description: 'Já atendida por outro usuário', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
      '/api/tickets/{protocolo}/encaminhar': {
        post: {
          summary: 'Encaminha a ocorrência para outra área (ou de volta para a mesma)',
          parameters: [{ name: 'protocolo', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['texto', 'areaDestinoId'], properties: { texto: { type: 'string' }, areaDestinoId: { type: 'string' } } } } },
          },
          responses: {
            200: { description: 'Ocorrência encaminhada', content: { 'application/json': { schema: { type: 'object', properties: { ticket: ticketSchema } } } } },
            403: { description: 'Usuário não é o responsável atual', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
      '/api/tickets/{protocolo}/finalizar': {
        post: {
          summary: 'Finaliza o atendimento da ocorrência',
          parameters: [{ name: 'protocolo', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['texto'], properties: { texto: { type: 'string' } } } } },
          },
          responses: {
            200: { description: 'Ocorrência finalizada', content: { 'application/json': { schema: { type: 'object', properties: { ticket: ticketSchema } } } } },
            403: { description: 'Usuário não é o responsável atual', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
      '/api/tickets/{protocolo}/analisar-ia': {
        post: {
          summary:
            'Consulta o agente de IA de triagem publicado no OutSystems ODC (endpoint TriagemAPI/Analisar) ' +
            'com os dados deste atendimento, e registra a decisão recebida no histórico. Requer a variável ' +
            'de ambiente ODC_TRIAGEM_URL configurada no servidor; só quem está atendendo o protocolo pode chamar.',
          parameters: [{ name: 'protocolo', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    userInput: { type: 'string', description: 'Texto livre a enviar como UserInput; usa a ocorrência original se omitido.' },
                    sessionId: { type: 'string', description: 'SessionId a reutilizar; gera um novo se omitido.' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Decisão do agente de IA',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { payload: { type: 'object' }, decisao: { type: 'object' } } },
                },
              },
            },
            403: { description: 'Usuário não é o responsável atual', content: { 'application/json': { schema: erroSchema } } },
            501: { description: 'ODC_TRIAGEM_URL não configurada', content: { 'application/json': { schema: erroSchema } } },
            502: { description: 'Falha ao consultar o agente de IA no ODC', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
      '/api/associados/{cpfCnpj}': {
        get: {
          summary: 'Ficha cadastral do associado: dados cadastrais, risco/score e LGC/limite',
          parameters: [{ name: 'cpfCnpj', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'Ficha do associado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      associado: { type: 'object' },
                      risco: { type: 'object' },
                      categorias: { type: 'array', items: { type: 'object' } },
                      lgc: { type: 'object' },
                      temAnotacaoAtiva: { type: 'boolean' },
                    },
                  },
                },
              },
            },
            404: { description: 'Associado não encontrado', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
      '/api/associados/{cpfCnpj}/analise-risco': {
        post: {
          summary:
            'Executa uma nova análise de risco do associado (recalcula score/risco e revalida por 1 ano). ' +
            'Se houver anotação interna ativa, o risco é recalculado mas o status permanece Bloqueado.',
          parameters: [{ name: 'cpfCnpj', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Risco atualizado', content: { 'application/json': { schema: { type: 'object', properties: { risco: { type: 'object' } } } } } },
            404: { description: 'Associado não encontrado', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
      '/api/associados/{cpfCnpj}/anotacoes': {
        get: {
          summary: 'Lista as anotações internas (ativas e baixadas) do associado',
          parameters: [{ name: 'cpfCnpj', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'Anotações do associado',
              content: { 'application/json': { schema: { type: 'object', properties: { ativas: { type: 'array', items: { type: 'object' } }, baixadas: { type: 'array', items: { type: 'object' } } } } } },
            },
          },
        },
      },
      '/api/anotacoes/{id}/baixar': {
        post: {
          summary:
            'Baixa (resolve) uma anotação interna. Só é permitido para um usuário da área competente pelo ' +
            'código da anotação (ex.: 234 - Limite Suspenso só pode ser baixada pela DIREL/GECRE/CREDI).',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['motivo'], properties: { motivo: { type: 'string' } } } } },
          },
          responses: {
            200: { description: 'Anotação baixada', content: { 'application/json': { schema: { type: 'object', properties: { anotacao: { type: 'object' } } } } } },
            403: { description: 'Usuário sem competência para baixar esta anotação', content: { 'application/json': { schema: erroSchema } } },
            409: { description: 'Anotação já estava baixada', content: { 'application/json': { schema: erroSchema } } },
          },
        },
      },
    },
  };
}

module.exports = { build };
