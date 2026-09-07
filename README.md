# Comunica Farroupilha

Plataforma do GEF para ouvir estudantes e melhorar o lazer nos intervalos do Colégio Farroupilha.

## Stack

- Next.js 16, React 19 e TypeScript;
- Neon Postgres provisionado pelo Marketplace da Vercel;
- sessões persistentes em cookie `HttpOnly` com token opaco;
- senhas derivadas com `scrypt` e salt aleatório.

## Executar localmente

Requer Node.js 22 ou superior, pnpm 11 e acesso ao projeto Vercel `lgs10/comunica-farroupilha`.

```sh
pnpm install --frozen-lockfile
vercel link --yes --project comunica-farroupilha --scope lgs10
vercel env pull .env.local --environment=development --yes --project comunica-farroupilha --scope lgs10
pnpm db:migrate
pnpm dev
```

Abra `http://localhost:3000`. O arquivo `.env.local` e a pasta `.vercel` são ignorados pelo Git.

## Banco e conta GEF

Migrações SQL versionadas ficam em `db/migrations` e nunca são executadas implicitamente por uma requisição:

```sh
pnpm db:migrate
```

Para preparar a conta administrativa, configure `ADMIN_USERNAME`, `ADMIN_PASSWORD` e, opcionalmente, `ADMIN_CLASS`, depois execute:

```sh
pnpm db:seed-admin
```

As variáveis de conexão são fornecidas pela integração Neon. O aplicativo usa `DATABASE_URL`; o migrador prefere `DATABASE_URL_UNPOOLED`.

## Verificação

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm test` executa todos os arquivos `tests/*.test.ts`, inclusive testes de integração concorrente contra o banco configurado.

## Produto

A landing pública fica em `/` e a plataforma autenticada em `/app`. Ela inclui propostas, comentários e respostas, apoio, acompanhamento, agenda, avaliações pós-atividade, notificações e visão administrativa do GEF. A área de Chapas permanece desabilitada até existir uma eleição configurada.

O servidor é a única fonte de verdade. O navegador guarda apenas preferências de interface. Navegadores com dados da versão antiga exibem, somente para o GEF, uma ação explícita e idempotente de importação; contas, senhas e sessões antigas nunca são importadas. Timestamps de criação são exibidos de forma consistente e notificações equivalentes são agrupadas pelo gerenciador de notificações.

## Estrutura

- `src/app`: páginas e Route Handlers;
- `src/components`: interface da landing e da plataforma;
- `src/lib/platform-repository.ts`: acesso relacional ao domínio;
- `src/lib/auth-repository.ts`: contas e sessões persistentes;
- `src/lib/client-platform-state.ts`: hidratação e interações otimistas;
- `src/lib/notification-manager.ts`: deduplicação e agrupamento de notificações;
- `src/lib/feature-flags.ts`: flags operacionais, incluindo eleições desabilitadas;
- `db/migrations`: esquema versionado;
- `scripts`: migração e seed administrativo;
- `docs/backend.md`: contratos, segurança e operação do backend.

O deploy é controlado pela integração Git já existente na Vercel. Não é necessário executar `vercel deploy` manualmente.
