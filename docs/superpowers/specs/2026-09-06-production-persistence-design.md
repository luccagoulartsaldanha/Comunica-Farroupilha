# Persistência de produção do Comunica Farroupilha

Data: 2026-09-06

## Objetivo

Eliminar o desaparecimento intermitente de propostas e a reversão imediata dos botões de apoio e acompanhamento. A plataforma deve usar uma única fonte de verdade durável, funcionar corretamente em múltiplas instâncias serverless da Vercel e preservar, por meio de uma migração administrativa explícita, dados legados ainda existentes no navegador.

## Diagnóstico confirmado

A aplicação mantém duas cópias concorrentes do mesmo domínio:

1. o cliente hidrata e grava todo o `DemoState` no `localStorage`;
2. os Route Handlers leem e gravam um objeto global, espelhado em arquivo local ou em `/tmp` na Vercel.

Na Vercel, `/tmp` pertence à instância serverless e não é armazenamento compartilhado. Requisições sucessivas podem alcançar instâncias diferentes, cada uma com uma cópia vazia ou divergente. O cliente também faz hidratações assíncronas independentes da sessão e do snapshot da plataforma. Uma resposta vazia ou atrasada pode sobrescrever o estado visível. As ações otimistas de apoio e acompanhamento são então reconciliadas com outra cópia, fazendo o controle aparentar ser desmarcado logo após o clique.

O endpoint de produção `/api/platform` foi consultado repetidamente e retornou zero propostas em vinte requisições consecutivas, enquanto propostas ainda podem aparecer a partir do `localStorage` do navegador. O projeto Vercel `lgs10/comunica-farroupilha` não possui atualmente integração de armazenamento.

## Arquitetura escolhida

### Banco e integração Vercel

Será provisionado Neon Postgres pelo Marketplace da Vercel e conectado ao projeto `comunica-farroupilha` nos ambientes `production`, `preview` e `development`. A integração fornecerá `DATABASE_URL` sem expor credenciais no repositório.

O acesso ficará em uma camada `server-only`. Route Handlers não acessarão variáveis de ambiente nem SQL fora dessa camada. Leituras dinâmicas não serão armazenadas no cache HTTP.

### Modelo relacional

O banco terá as seguintes entidades e invariantes:

- `users`: identidade, nome único normalizado, turma, papel e hash de senha;
- `sessions`: token armazenado como hash, usuário, criação e expiração;
- `proposals`: autoria, anonimato, tema, situação, resposta do GEF e datas;
- `proposal_supports`: chave única `(proposal_id, user_id)`;
- `proposal_saves`: chave única `(proposal_id, user_id)`;
- `comments`: proposta, autor, resposta pai opcional, anonimato e data;
- `comment_likes`: chave única `(comment_id, user_id)`;
- `activities`: proposta associada, agenda e situação;
- `activity_feedbacks`: chave única `(activity_id, user_id)`;
- `notifications`: conteúdo, leitura e atividade opcional;
- `chapa_questions`: chapa, área, proposta, pergunta, autoria e resposta.

As chapas e suas propostas informativas permanecem como catálogo versionado no código, pois hoje são conteúdo editorial estático. IDs serão UUIDs. Exclusões relacionadas usarão integridade referencial. Contagens de apoios, comentários e avaliações serão derivadas por consulta, evitando campos acumulados que possam divergir das relações.

### Concorrência e idempotência

O cliente continuará enviando a intenção final explícita (`supported: boolean` e `saved: boolean`). O servidor implementará essas intenções com `INSERT ... ON CONFLICT DO NOTHING` e `DELETE`, dentro de transações quando houver mais de uma alteração relacionada.

Uma repetição da mesma requisição produzirá o mesmo estado. Cliques rápidos não inverterão decisões já processadas. A resposta sempre devolverá o estado canônico e a contagem recalculada pelo banco.

### Autenticação e sessões

Senhas novas serão derivadas com `scrypt`, salt aleatório e comparação de tempo constante. O cookie continuará `HttpOnly`, `SameSite=Lax`, `Secure` em produção e terá expiração explícita. O banco guardará apenas o hash do token de sessão.

A conta administrativa inicial será criada por migração/seed usando variáveis de ambiente para credenciais, sem senha fixa no código. Em desenvolvimento e testes, um seed controlado poderá criar a conta de demonstração. Toda rota continuará verificando autenticação e papel no servidor.

### Cliente como consumidor do servidor

O `localStorage` deixará de armazenar usuários, senhas, propostas, comentários, apoios, acompanhamentos, notificações, atividades ou perguntas. Poderá conservar somente preferências não sensíveis de interface.

A inicialização terá estados distintos:

- `loading`: mostra carregamento, nunca “nenhuma proposta”;
- `ready`: renderiza o snapshot canônico do servidor, inclusive uma lista realmente vazia;
- `error`: informa que os dados não puderam ser carregados e oferece nova tentativa.

Sessão e snapshot serão carregados por uma função coordenada. Respostas antigas serão ignoradas por revisão/`AbortController`. Mutations otimistas conservarão a resposta rápida da interface, mas farão rollback e apresentarão erro quando a API falhar. Após sucesso, aplicarão apenas a resposta canônica correspondente à revisão mais recente.

### Migração do legado do navegador

O sistema detectará uma única vez a chave legada `comunica-farroupilha-demo` (e a chave anterior `gremio-comunica-demo`) depois que um usuário GEF estiver autenticado.

A interface exibirá uma ação administrativa explícita com prévia das quantidades. Nada será importado automaticamente. O payload aceito será validado e limitado no servidor. A importação usará uma chave de migração única e fingerprints determinísticos para não duplicar registros se for reenviada. Senhas e sessões presentes no legado nunca serão importadas.

Após importação confirmada, o navegador marcará localmente a migração como concluída e permitirá apagar a cópia legada. Usuários estudantes não poderão executar essa rota.

## API e compatibilidade

As URLs atuais serão preservadas para minimizar mudanças no cliente. Os corpos de resposta continuarão usando `{ data }` e erros usarão `{ error }` com status HTTP apropriado.

`GET /api/platform` passará a montar um snapshot público e específico da sessão, sem contas, hashes ou dados privados. Apoios, acompanhamentos e curtidas do usuário autenticado poderão ser devolvidos no snapshot, mas dados privados de outras pessoas não serão expostos.

Será adicionada uma rota administrativa de migração do legado. Rotas de mutação validarão formato, tamanho, autenticação e autorização antes de tocar no banco.

## Inicialização e migrações

Migrações SQL versionadas ficarão no repositório e serão executadas por um script explícito, nunca implicitamente durante uma requisição de produção. O script será idempotente quanto à criação do esquema e falhará de forma visível em caso de configuração ausente.

O desenvolvimento local usará a mesma instância Neon de desenvolvimento fornecida pela integração ou uma URL de teste separada. Testes unitários que não precisam de rede continuarão isolados; testes de integração usarão um schema/banco de teste e limparão somente dados criados pela própria suíte.

## Observabilidade e segurança operacional

- respostas de dados dinâmicos usarão `Cache-Control: no-store`;
- falhas de banco serão registradas no servidor com contexto da operação, sem credenciais ou payloads sensíveis;
- mensagens ao cliente serão estáveis e não revelarão detalhes SQL;
- entradas terão limites de comprimento e enums serão validados;
- o endpoint de saúde diferenciará processo ativo de banco acessível;
- o projeto documentará variáveis obrigatórias e procedimento de migração;
- não haverá deploy manual: o push da branch permitirá que a integração Git existente gere o preview.

Rate limiting distribuído não será adicionado nesta entrega porque exigiria uma segunda integração. A estrutura das rotas deixará claro o ponto de extensão; antes de abertura ampla da plataforma, essa proteção deverá ser habilitada.

## Estratégia de testes

1. Testes de contrato do snapshot garantem que uma falha não vira lista vazia e que dados privados não vazam.
2. Testes de repositório cobrem criação, leitura persistente e isolamento por usuário.
3. Testes de concorrência enviam intenções repetidas de apoio/acompanhamento e confirmam uma única relação.
4. Testes de autenticação verificam hash de senha, expiração e revogação de sessão.
5. Testes de migração verificam autorização, validação, idempotência e ausência de senhas importadas.
6. Testes do cliente cobrem carregamento, erro, retry, respostas fora de ordem e rollback otimista.
7. A verificação final executará todos os arquivos de teste, lint, TypeScript, build e um fluxo real no navegador contra o servidor local com banco configurado.

## Rollout e reversibilidade

1. Provisionar e conectar Neon pelo Marketplace da Vercel.
2. Puxar variáveis apenas para o worktree local ignorado pelo Git.
3. Implementar e testar esquema, camada de dados e autenticação.
4. Migrar os Route Handlers e o cliente.
5. Executar migrações no banco de desenvolvimento/preview.
6. Fazer push da branch `codex/codebase-review` para o remoto `pessoal`.
7. Validar o preview gerado automaticamente pela integração Git.

Enquanto o preview estiver em avaliação, a produção atual permanece inalterada. O rollback de código é feito pela Vercel/Git. O banco usa migrações aditivas nesta entrega; não haverá remoção destrutiva de tabelas no rollout inicial.

## Critérios de aceite

- propostas persistem após recarregar e entre instâncias diferentes;
- uma falha de carregamento não é exibida como feed vazio;
- apoiar e acompanhar mantêm o estado após resposta e recarga;
- requisições repetidas ou fora de ordem não duplicam nem revertem a intenção final;
- usuários diferentes possuem apoios, acompanhamentos e curtidas independentes;
- senhas e tokens não são armazenados em texto puro nem enviados em snapshots;
- o legado pode ser importado uma única vez por um usuário GEF, sem duplicação;
- Neon está conectado aos ambientes necessários do projeto Vercel;
- toda a verificação automatizada e o fluxo de navegador passam;
- a branch isolada é enviada ao repositório solicitado sem deploy manual.
