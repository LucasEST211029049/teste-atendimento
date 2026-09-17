# Comunicador entre Áreas (protótipo fictício)

Sistema fictício, mas totalmente funcional, de comunicação entre áreas com
registro, atendimento e encaminhamento de ocorrências — inspirado no layout
de telas de "Consultar Ocorrência" (filtros, tabela de resultados, detalhe
expansível com histórico) e na "Ficha Cadastral" do associado (risco/score,
LGC/limite e anotações internas).

Toda a persistência é um banco **PostgreSQL real** (não é mais um arquivo
JSON) — veja `db/schema.sql` e `db/seed.sql` — pensado para o OutSystems
Developer Cloud (ODC) conseguir enxergar os dados e acionar as mesmas regras
de negócio, seja via API REST, seja conectando direto no banco.

## Como rodar

1. Tenha um PostgreSQL disponível (local ou remoto) e crie o banco:
   ```bash
   psql -c "CREATE ROLE comunicador LOGIN PASSWORD 'comunicador';"
   psql -c "CREATE DATABASE comunicador OWNER comunicador;"
   ```
2. Aplique o schema e os dados de exemplo:
   ```bash
   npm install
   npm run db:setup
   ```
   (equivalente a `npm run db:schema` + `npm run db:seed`; rode só
   `npm run db:seed` quando quiser resetar os dados sem recriar as tabelas —
   o `seed.sql` faz `TRUNCATE` antes de inserir).
3. Suba o servidor:
   ```bash
   npm start
   ```

Acesse `http://localhost:3000`. Por padrão o app conecta em
`postgres://comunicador:comunicador@localhost:5432/comunicador`; para outra
instância, defina `DATABASE_URL` antes de rodar (mesma variável usada pelos
scripts `db:*`).

## Logins fictícios (senha para todos: `123456`)

| Usuário            | Nome               | Área                     |
|--------------------|--------------------|--------------------------|
| `lucas.fic`        | Lucas Oliveira     | DIREL / GECRE / CREDI    |
| `rafael.fic`       | Rafael Santos      | DIREL / GECOR / COADM    |
| `funcionario.fic`  | Funcionário Padrão | DIREL / GECAN / ATEND    |

A tela de login já lista esses três logins como atalhos de clique.

## Regras de negócio implementadas

### Atendimentos (comunicador entre áreas)

- **Consultar**: filtros por período, protocolo, CPF/CNPJ, nome/razão
  social, área, assunto, situação, origem e responsável. Qualquer usuário
  logado pode **ver** ocorrências de **qualquer área**.
- **Atender**: o botão "Atender" só funciona quando a ocorrência está
  `Pendente` **e** pertence à área do usuário logado. Ao clicar, o
  responsável é preenchido com o nome do usuário e a situação vira
  `Em Atendimento`.
- **Sem sobreposição**: a validação de "pendente + sem responsável" é feita
  dentro de uma função do banco (`fn_atender_atendimento`, com
  `SELECT ... FOR UPDATE`). Se dois usuários tentarem atender ao mesmo
  tempo, só o primeiro consegue; o segundo recebe 409 informando quem já
  assumiu.
- **Encaminhar**: só quem está atendendo pode encaminhar, para qualquer uma
  das 3 áreas — inclusive de volta para quem enviou. A ocorrência volta para
  `Pendente`, sem responsável, na área de destino.
- **Finalizar**: só quem está atendendo pode finalizar; a situação vira
  `Finalizado` e o histórico registra o texto da resolução.
- **Aba "Atender"**: lista só as ocorrências que o usuário logado assumiu e
  ainda não finalizou/encaminhou (fila pessoal de trabalho).
- **Nova Ocorrência**: registra um atendimento novo (simulando, por
  exemplo, um contato via WhatsApp) já direcionado à área desejada; cria o
  associado automaticamente se o CPF/CNPJ ainda não existir na base.

### Ficha cadastral do associado (Risco / LGC / Anotações)

Cada CPF/CNPJ tem, além dos dados cadastrais (renda, conta, telefone,
e-mail, segmento...), uma ficha de risco acessível pelo botão **"Ficha
Cadastral do Associado"** dentro do detalhe de qualquer atendimento:

- **Risco do Associado**: comparação Anterior/Atual (risco, status, data de
  implantação, score) e o detalhamento por categoria (Alpha Inicial, Renda
  Comprovada, Idade, Segmento, etc.), igual ao layout de referência.
- **Executar Nova Análise de Risco**: recalcula o score/risco do associado e
  revalida por 1 ano. Base seedada com situações variadas para testar:
  - **Felipe Ferreira Felgueiras** — risco `Vencido` (bom candidato para
    rodar uma nova análise e ver virar `Vigente`).
  - **Marina Souza Andrade**, **Cláudia Ramos Vieira** — risco `Vigente`.
  - **João Pedro Lima** — risco `Vigente`, mas **renda `Vencida`**.
  - **Roberto Carlos Nunes** e **Construtora Horizonte Ltda** — risco
    `Bloqueado` por anotação interna ativa (veja abaixo).
- **LGC (Limite Global de Crédito)**: multiplicador de segmento, fator de
  risco, fator de endividamento, redutor temporário, limite global,
  responsabilidades, liberações/amortizações do mês, margem operacional e
  margem de descontos (máxima/utilizada/disponível).
- **Anotações Cadastrais**: enquanto existir **qualquer anotação ativa**
  para o associado, o risco fica automaticamente `Bloqueado` (é um
  **trigger no banco**, não uma regra do app — dispara mesmo se o dado for
  alterado direto no Postgres). Duas anotações internas fixas:
  - **234 - Limite Suspenso** → competência exclusiva da **DIREL/GECRE/CREDI**.
  - **233 - Pendência de Atualização Cadastral** (nome de exemplo, ajuste
    livremente) → competência exclusiva da **DIREL/GECOR/COADM**.

  Só um usuário da área competente consegue **baixar** a anotação
  correspondente (botão "Baixar Anotação"; outra área só visualiza, com um
  aviso de quem tem competência). Ao baixar a última anotação ativa, o
  trigger libera o risco de volta para `Vigente`/`Vencido` conforme a
  validade atual.

## Banco de dados (PostgreSQL)

```
db/
  schema.sql  -> tabelas, tipos, views, trigger de bloqueio e funções fn_*
  seed.sql    -> áreas, usuários, associados, risco/LGC, anotações e
                 atendimentos de exemplo (TRUNCATE + INSERT, idempotente)
```

Tabelas principais: `areas`, `usuarios`, `associados`, `risco_associado`,
`risco_categoria`, `lgc`, `anotacoes_tipo`, `anotacoes`, `atendimentos`,
`atendimento_historico`; views `vw_associado_ficha` e `vw_atendimentos` para
leitura "achatada".

Toda a lógica sensível vive em **funções PL/pgSQL** (`fn_atender_atendimento`,
`fn_encaminhar_atendimento`, `fn_finalizar_atendimento`,
`fn_abrir_atendimento`, `fn_executar_analise_risco`, `fn_baixar_anotacao`) —
o app Node só chama essas funções (`SELECT * FROM fn_xxx(...)`), nunca
duplica a regra em JavaScript. Isso é proposital: **qualquer outro cliente
que se conecte nesse mesmo banco — inclusive o OutSystems ODC diretamente —
aciona exatamente a mesma regra**, sem risco de divergência entre "o que o
app faz" e "o que o ODC faz".

## Arquitetura

```
server/
  db.js       -> pool de conexão PostgreSQL (pg)
  data.js     -> listas fixas de UI (assuntos, origens, situações)
  store.js    -> chama as funções/consultas do Postgres e formata a resposta da API
  openapi.js  -> gera a especificação OpenAPI 3.0 (para importar no ODC)
  index.js    -> API REST (Express) + servidor de arquivos estáticos
public/
  index.html, styles.css, app.js  -> frontend (HTML/CSS/JS puro, sem framework)
db/
  schema.sql, seed.sql -> banco de dados (veja acima)
```

## Integração com o OutSystems Developer Cloud (ODC)

Como o banco agora é um PostgreSQL de verdade, existem **dois caminhos**
para o ODC acionar essa lógica — use o que fizer mais sentido para o seu
módulo:

### Caminho A — REST API Integration (recomendado para começar)

A API expõe as mesmas ações das funções do banco, então o ODC nunca
duplica regra de negócio.

- **Bearer token** (`Authorization: Bearer <token>`, obtido em
  `POST /api/login` com um dos 3 usuários fictícios) — para ações que
  representam um atendente humano: atender, encaminhar, finalizar,
  executar análise de risco, baixar anotação.
- **Chave de API do agente** (`X-Agent-Api-Key: agente-demo-key-123`,
  configurável via `AGENT_API_KEY`) — para o agente de IA abrir uma nova
  ocorrência (`POST /api/tickets`) sem precisar ser um dos atendentes.

Passo a passo:

1. **Publique este servidor com uma URL pública HTTPS** (o ODC roda na
   nuvem e não alcança `localhost`; para testar rápido dá para usar
   `ngrok http 3000`, e para algo estável, qualquer serviço que rode Node +
   Postgres — Render, Railway, Fly.io, uma VM, etc.). Me avise se quiser
   ajuda para publicar em algum desses.
2. Acesse `https://SEU-DOMINIO/api/openapi.json` — especificação OpenAPI
   gerada automaticamente com todos os endpoints (atendimentos, ficha do
   associado, risco, anotações).
3. No **ODC Studio**/Portal ODC → **Integrations** do módulo → **Add REST
   API integration** → importar a partir da URL do passo 2 (ou baixando o
   JSON e subindo o arquivo).
4. O ODC gera as *Server Actions* automaticamente (`Login`, `GetTickets`,
   `PostTicketsAtender`, `PostAssociadosAnaliseRisco`,
   `PostAnotacoesBaixar`, etc.), prontas para Screens, Processes, Timers ou
   a **AI Agent Builder**.
5. Configure a autenticação: header estático `X-Agent-Api-Key` para o fluxo
   do agente de IA; ou `Login` + `Authorization: Bearer <token>` para ações
   que simulam um atendente humano.

### Caminho B — External Database (conexão direta no Postgres)

Se preferir que o ODC leia/escreva direto no banco (útil para telas de
consulta/relatório, ou se você já usa **External Entities** no seu módulo):

1. Rode `db/schema.sql` no Postgres que vai hospedar os dados de verdade, e
   deixe essa instância acessível pela rede (o ODC precisa alcançá-la —
   IP/porta liberados, ou um gateway de dados on-premises se você usa
   ODC com infraestrutura própria).
2. No ODC, crie uma **External Database Configuration** apontando para esse
   Postgres, e mapeie as tabelas/views como **External Entities**
   (`vw_associado_ficha` e `vw_atendimentos` são as views "achatadas",
   prontas para leitura).
3. Para as ações (atender, encaminhar, finalizar, executar análise de
   risco, baixar anotação), use uma **Advanced SQL / Integration Action**
   no ODC chamando a função correspondente, por exemplo:
   ```sql
   SELECT * FROM fn_baixar_anotacao(@AnotacaoId, @Username, @Motivo);
   ```
   Isso aciona exatamente a mesma regra (competência da área, bloqueio de
   sobreposição, etc.) que o app Node usa — sem duplicar lógica no ODC.

### Caminho C — nosso app chamando o agente de IA hospedado no ODC

Os caminhos A e B são o **ODC chamando este app** (ou o banco dele). Este
caminho é o **inverso**: o agente de triagem/decisão fica publicado no ODC
(endpoint `TriagemAPI/Analisar`), e é este app que o aciona a partir de um
atendimento — o botão **"🤖 Consultar Agente de IA"**. Ele aparece em dois
momentos: com o atendimento ainda `Pendente` (qualquer usuário da área dona
do atendimento pode consultar, antes mesmo de assumir — útil para decidir
se vale a pena atender) e com o atendimento `Em Atendimento` (só quem
assumiu, dentro do formulário de resposta).

1. No ODC Portal → asset `atendimentos` → aba de ambientes, pegue a URL
   pública do módulo publicado.
2. Configure a variável de ambiente do servidor Node:
   ```
   ODC_TRIAGEM_URL=https://SEU-DOMINIO-ODC/atendimentos/rest/TriagemAPI/Analisar
   ```
   Sem essa variável definida, o botão fica oculto (endpoint responde 501).
3. Ao clicar no botão, o app monta o payload no contrato combinado e faz o
   POST:
   ```json
   {
     "SessionId": "ticket-<protocolo>-<timestamp>",
     "UserInput": "<ocorrência original do atendimento>",
     "Protocolo": "<protocolo>",
     "Assunto": "<assunto>",
     "Ocorrencia": "<ocorrência>",
     "NomeAssociado": "<nome>",
     "CpfCnpj": "<cpf/cnpj só dígitos>"
   }
   ```
4. A resposta (`{ "Response": "<json serializado>" }`) é decodificada; os
   campos `Decisao`/`Justificativa` aparecem na tela, a `Justificativa`
   já pré-preenche o campo "Resposta / O que foi feito" (o atendente
   revisa antes de encaminhar/finalizar), e a consulta inteira fica
   registrada no histórico do atendimento como "Consultou Agente de IA
   (ODC)".
5. Endpoint correspondente nesta API: `POST /api/tickets/{protocolo}/analisar-ia`
   (documentado também em `/api/openapi.json`). Permissão: se o atendimento
   está `Pendente`, qualquer usuário da área dona dele pode chamar; se está
   `Em Atendimento`, só quem assumiu; `Finalizado` não permite mais.
   `userInput`/`sessionId` no corpo são opcionais.

## Resetando os dados de demonstração

Para voltar a base ao estado inicial (todos os 6 atendimentos `Pendente`,
sem responsável, anotações 233/234 ativas de novo) sem precisar de acesso
direto ao Postgres — útil ao testar repetidamente o fluxo do agente do ODC
num ambiente publicado (ex.: Render), onde você não tem um psql à mão:

```bash
curl -X POST https://SEU-DOMINIO/api/admin/reset-seed \
  -H "X-Admin-Key: reset-demo-key-123"
```

A chave é a variável de ambiente `ADMIN_RESET_KEY` (mesmo padrão do
`AGENT_API_KEY`: valor fixo de demonstração se não for definida). Isso
reaplica só `db/seed.sql` (schema e funções continuam como estão) —
mesmo efeito de rodar `npm run db:seed` local, mas acionável remotamente.

## Observações

- Autenticação da API é um esquema simplificado por token em memória —
  adequado para demonstração, não para produção.
- A chave `agente-demo-key-123` é só um valor padrão de demonstração; em
  qualquer ambiente real, defina `AGENT_API_KEY` com um segredo próprio.
- `ODC_TRIAGEM_URL` é opcional; sem ela, o app funciona normalmente e só o
  botão "Consultar Agente de IA" fica indisponível.
- A chave `reset-demo-key-123` (endpoint de reset) é só um valor padrão de
  demonstração; em qualquer ambiente real, defina `ADMIN_RESET_KEY` com um
  segredo próprio.
- A descrição da anotação "233" é fictícia/placeholder — troque o texto em
  `anotacoes_tipo` (tabela ou `db/seed.sql`) pelo que fizer sentido para
  você; o código (233) e a competência (COADM) já ficam corretos.
- Todos os dados (nomes, CPFs, ocorrências, valores de risco/limite) são
  fictícios.
