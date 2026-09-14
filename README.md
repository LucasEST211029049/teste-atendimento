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

Não encontrei um formato de arquivo padrão chamado "ODC" aplicável a este
tipo de sistema — se você tinha em mente uma ferramenta/plataforma
específica com esse nome, me diga qual e eu adapto a exportação/integração
para o formato exato dela. Enquanto isso, deixei o sistema desacoplado em
uma **API REST simples**, pensada justamente para você plugar sua lógica
de agente de IA sem precisar mexer no frontend:

- `POST /api/tickets` — abre uma nova ocorrência (é exatamente o endpoint
  que um agente de IA conectado ao WhatsApp chamaria para registrar um
  atendimento automaticamente).
- `GET /api/tickets?areaId=...&situacao=Pendente` — o agente pode consultar
  a fila de uma área.
- `POST /api/tickets/:protocolo/encaminhar` e `.../finalizar` — o agente
  pode agir como um "usuário" (basta gerar um token de login para ele) e
  responder/encaminhar/finalizar atendimentos automaticamente.

Ou seja: seu agente de IA pode ser outro cliente dessa mesma API (rodando
como um processo separado que faz `fetch`/`curl` para
`http://localhost:3000/api/...`), sem precisar duplicar a lógica de
regras de negócio que já está no servidor.

## Observações

- Autenticação é um esquema simplificado por token em memória — adequado
  para demonstração, não para produção.
- Todos os dados (nomes, CPFs, ocorrências) são fictícios.
