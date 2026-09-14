# Comunicador entre Áreas (protótipo fictício)

Sistema fictício, mas totalmente funcional, de comunicação entre áreas com
registro, atendimento e encaminhamento de ocorrências — inspirado no layout
de telas de "Consultar Ocorrência" com filtros, tabela de resultados e
detalhe expansível com histórico e ação de atendimento.

## Como rodar

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Na primeira execução o arquivo `data.json`
é criado automaticamente na raiz do projeto com ocorrências de exemplo
(ele funciona como um "banco de dados" simples em arquivo; apague-o para
resetar os dados de demonstração). Esse arquivo não é versionado (está no
`.gitignore`).

## Logins fictícios (senha para todos: `123456`)

| Usuário            | Nome               | Área                     |
|--------------------|--------------------|--------------------------|
| `lucas.fic`        | Lucas Oliveira     | DIREL / GECRE / CREDI    |
| `rafael.fic`       | Rafael Santos      | DIREL / GECOR / COADM    |
| `funcionario.fic`  | Funcionário Padrão | DIREL / GECAN / ATEND    |

A tela de login já lista esses três logins como atalhos de clique.

## Regras de negócio implementadas

- **Consultar**: filtros por período, protocolo, CPF/CNPJ, nome/razão
  social, área, assunto, situação, origem e responsável — igual à tela de
  referência. Qualquer usuário logado pode **ver** ocorrências de
  **qualquer área**.
- **Atender**: o botão "Atender" só aparece/funciona quando a ocorrência
  está `Pendente` **e** pertence à área do usuário logado. Ao clicar, o
  responsável é preenchido com o nome do usuário e a situação vira
  `Em Atendimento`.
- **Sem sobreposição**: a validação de "pendente + sem responsável" é
  feita no servidor antes de gravar. Se dois usuários tentarem atender ao
  mesmo tempo, apenas o primeiro consegue; o segundo recebe erro 409
  informando quem já assumiu.
- **Encaminhar**: só quem está atendendo pode encaminhar. É possível
  escolher qualquer uma das 3 áreas como destino — inclusive a mesma área
  que enviou originalmente. Ao encaminhar, a ocorrência volta para
  `Pendente`, sem responsável, na nova área (fica disponível para quem
  atua lá assumir).
- **Finalizar**: só quem está atendendo pode finalizar; a situação vira
  `Finalizado` e o histórico registra o texto da resolução.
- **Histórico**: toda abertura, atendimento, encaminhamento e finalização
  fica registrada com data, hora, responsável e texto.
- **Aba "Atender"**: lista só as ocorrências que o usuário logado assumiu
  e ainda não finalizou/encaminhou (sua fila pessoal de trabalho).
- **Nova Ocorrência**: botão para simular a abertura de um atendimento
  (por exemplo, o que normalmente viria de um bot de WhatsApp), já
  encaminhando para a área desejada.

## Arquitetura (pensada para você plugar sua lógica de agente de IA)

```
server/
  data.js     -> áreas, usuários e listas fixas (assuntos, origens, situações)
  store.js    -> regras de negócio (atender/encaminhar/finalizar) + persistência em data.json
  index.js    -> API REST (Express) + servidor de arquivos estáticos
public/
  index.html, styles.css, app.js  -> frontend (HTML/CSS/JS puro, sem framework)
```

Já que ODC = **OutSystems Developer Cloud**, a API foi pensada para ser
consumida de dentro do ODC como uma **REST API Integration**, sem
precisar duplicar nenhuma regra de negócio lá — a lógica de
atender/encaminhar/finalizar/bloqueio de sobreposição continua toda no
servidor Node.

### Duas formas de autenticação na API

- **Bearer token** (`Authorization: Bearer <token>`, obtido em
  `POST /api/login` com um dos 3 usuários fictícios) — para ações que
  representam um atendente humano: atender, encaminhar, finalizar,
  consultar minha fila.
- **Chave de API do agente** (`X-Agent-Api-Key: agente-demo-key-123`,
  configurável pela variável de ambiente `AGENT_API_KEY`) — pensada para
  o seu agente de IA no ODC chamar `POST /api/tickets` e abrir uma nova
  ocorrência automaticamente (por exemplo, ao receber uma mensagem no
  WhatsApp), sem precisar ser um dos atendentes.

### Passo a passo para importar no ODC

1. **Publique este servidor com uma URL pública HTTPS.** O ODC roda na
   nuvem da OutSystems e não alcança `localhost`; para desenvolvimento
   rápido dá para usar um túnel (ex.: `ngrok http 3000`), e para algo mais
   estável, qualquer serviço que rode Node (Render, Railway, Fly.io, uma
   VM, etc.). Me avise se quiser ajuda para publicar em algum desses.
2. Com o servidor publicado, acesse `https://SEU-DOMINIO/api/openapi.json`
   — é a especificação OpenAPI gerada automaticamente com todos os
   endpoints, parâmetros e schemas.
3. No **ODC Studio** (ou no Portal ODC), vá em **Integrations** do seu
   módulo → **Add REST API integration** → importar **a partir de
   URL/arquivo OpenAPI**, colando a URL do passo 2 (ou baixando o JSON e
   subindo o arquivo).
4. O ODC vai gerar automaticamente as *Server Actions* para cada endpoint
   (`Login`, `GetTickets`, `PostTickets`, `PostTicketsAtender`, etc.),
   prontas para usar em qualquer lógica visual (Screens, Processes,
   Timers ou a **AI Agent Builder**).
5. Configure a autenticação da integração no ODC:
   - Para o fluxo do **agente de IA** (abrir ocorrências vindas do
     WhatsApp): adicione o header estático `X-Agent-Api-Key` com o valor
     de `AGENT_API_KEY` nas configurações da integração (ou passe-o
     manualmente em cada chamada à Server Action `PostTickets`).
   - Para ações que simulam um atendente (atender/encaminhar/finalizar):
     chame primeiro a Server Action de `Login` com um dos logins
     fictícios, guarde o `token` retornado (ex.: em uma Site
     Property/Entity, ou por chamada) e use-o no header
     `Authorization: Bearer <token>` das chamadas seguintes.
6. A partir daí, sua lógica de agente de IA no ODC decide o que fazer —
   por exemplo: receber a mensagem do WhatsApp, extrair CPF/assunto com
   um modelo de linguagem, e chamar `PostTickets` para registrar a
   ocorrência já direcionada à área correta; ou monitorar
   `GET /api/tickets?situacao=Pendente&areaId=...` e sugerir respostas
   para os atendentes.

### Observações

- Autenticação é um esquema simplificado por token em memória — adequado
  para demonstração, não para produção.
- A chave `agente-demo-key-123` é só um valor padrão de demonstração;
  em qualquer ambiente real, defina `AGENT_API_KEY` com um segredo
  próprio antes de publicar o servidor.
- Todos os dados (nomes, CPFs, ocorrências) são fictícios.
