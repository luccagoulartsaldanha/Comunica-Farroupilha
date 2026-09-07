# Backend do Comunica Farroupilha

## Persistência

O backend usa Neon Postgres como fonte única e compartilhada entre as instâncias serverless da Vercel. Não há store global, arquivos em `/tmp` ou fallback de dados de domínio no `localStorage`.

As tabelas e restrições ficam em `db/migrations/0001_initial.sql`. Contagens de apoios, comentários e avaliações são derivadas das relações. As chaves únicas de apoio, acompanhamento, curtida e avaliação tornam requisições repetidas idempotentes.

Variáveis obrigatórias, sempre fora do Git:

- `DATABASE_URL`: conexão usada pela aplicação;
- `DATABASE_URL_UNPOOLED`: conexão preferida pelo migrador;
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_CLASS`: seed controlado da conta GEF.

## Autenticação

Contas são persistidas no banco. A senha é armazenada somente como hash `scrypt` versionado, com salt aleatório. A sessão usa um token aleatório de 32 bytes no cookie `HttpOnly`; o banco recebe somente o SHA-256 desse token e sua expiração.

O cookie usa `SameSite=Lax`, caminho `/`, duração de sete dias e `Secure` em produção. Logout revoga a sessão no banco. Nenhum endpoint público devolve hashes, tokens ou a lista de contas.

## Endpoints

- `GET /api/health`: confirma processo e conexão com o banco; falha com 503 quando o Neon está indisponível.
- `POST /api/auth/login`, `POST /api/auth/signup`, `GET /api/auth/me`, `POST /api/auth/logout`.
- `GET/POST /api/proposals`.
- `GET/PATCH /api/proposals/:id`.
- `GET/POST /api/proposals/:id/comments`.
- `POST /api/proposals/:id/support`: exige `{ "supported": boolean }`.
- `POST /api/proposals/:id/save`: exige `{ "saved": boolean }`.
- `POST /api/comments/:id/like`: exige `{ "liked": boolean }`.
- `GET/POST /api/activities` e `GET/PATCH /api/activities/:id`.
- `GET/POST /api/activities/:id/feedback`.
- `GET/PATCH /api/notifications`.
- `GET /api/chapas` e `GET/POST/PATCH /api/chapas/questions`.
- `GET /api/platform`: snapshot público e específico da sessão.
- `POST /api/admin/legacy-import`: importação GEF idempotente de dados antigos do navegador.

Respostas de domínio usam `{ data }`; falhas usam `{ error }` com status 400, 401, 403, 404, 409 ou 503. Dados dinâmicos usam `Cache-Control: no-store, max-age=0` e respostas específicas da sessão variam por cookie.

## Concorrência e cliente

Apoio, acompanhamento e curtida recebem a intenção final, não um comando de alternância. O cliente aplica feedback otimista imediatamente, numera cada interação e ignora respostas antigas. A resposta canônica do banco consolida o estado; a falha da revisão atual faz rollback e exibe uma mensagem.

Na inicialização, sessão e snapshot são carregados em conjunto. Uma resposta 503 gera uma tela de erro com nova tentativa; somente um snapshot bem-sucedido e realmente vazio exibe “nenhuma proposta”.

## Migração do legado

Quando um navegador ainda contém `comunica-farroupilha-demo` ou `gremio-comunica-demo`, a visão do GEF mostra uma prévia. A importação só ocorre após clique explícito.

O cliente e o servidor aplicam limites e descartam contas, senhas, sessões e mapas por usuário. O servidor usa uma chave SHA-256 e IDs determinísticos dentro de uma transação, de modo que o mesmo payload não cria duplicatas. A cópia antiga só é apagada após sucesso e confirmação do operador.

## Operação

```sh
pnpm db:migrate
pnpm db:seed-admin
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

As migrações desta entrega são aditivas. Antes de mudanças destrutivas futuras, criar backup no Neon e uma migration reversível. Rate limiting distribuído e verificação de vínculo escolar continuam sendo requisitos antes de abertura ampla para toda a comunidade.
