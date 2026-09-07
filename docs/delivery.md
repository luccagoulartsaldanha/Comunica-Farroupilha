# Entrega — persistência de produção — 6 de setembro de 2026

## Vercel

Projeto: `lgs10/comunica-farroupilha`
Project ID: `prj_H3vlIMV7KuTyyp3m0vpVgAtU1QIr`
Site atual: https://comunica-farroupilha.vercel.app/

Foi provisionado pelo Marketplace da Vercel o recurso Neon `comunica-farroupilha-db` e conectado aos ambientes `production`, `preview` e `development`. As variáveis de banco e as credenciais administrativas de seed são gerenciadas pela Vercel e não ficam no Git.

Não houve deploy manual. O push da branch permite que a integração Git existente crie o preview automaticamente.

## Mudança de arquitetura

O armazenamento efêmero em memória/`/tmp` e a sessão baseada em arquivo foram removidos. Dados, contas e sessões agora usam Postgres compartilhado. Apoio, acompanhamento e curtida são idempotentes e protegidos contra respostas fora de ordem.

O navegador não persiste mais o estado do domínio. Uma falha de banco é exibida como indisponibilidade com retry, nunca como feed vazio. A visão GEF pode importar de forma explícita a cópia legada presente no navegador.

Timestamps são derivados do mesmo instante de criação e notificações repetidas são agrupadas pelo gerenciador com contagem de ocorrências. A área de Chapas e suas APIs retornam 410 enquanto não houver eleição.

## Banco

- migrations: `db/migrations/0001_initial.sql` a `0004_notification_conflict_target.sql`;
- execução: `pnpm db:migrate`;
- seed GEF: `pnpm db:seed-admin`;
- conta GEF criada: `administrador`;
- a senha forte gerada está disponível somente no `.env.local` ignorado deste worktree e nas variáveis do projeto Vercel.

## Verificação concluída antes do push

- testes Node, incluindo concorrência real no Neon e migração idempotente;
- lint, TypeScript e build de produção;
- fluxo local no navegador: dois cadastros, proposta, apoio, acompanhamento e cinco recargas consecutivas;
- isolamento confirmado: a segunda conta vê a proposta, mas não herda apoio nem acompanhamento;
- health check local retornou banco conectado; logs do servidor registraram respostas 200/201 sem exceções;
- auditoria Vercel confirmou Neon disponível e variáveis de banco nos ambientes production, preview e development;
- dados descartáveis criados pela verificação foram removidos; dados de uso posteriores, encontrados no banco compartilhado, foram preservados.

## Continuidade operacional

Antes de abertura ampla, definir verificação de vínculo escolar, política de privacidade, moderação, auditoria de ações administrativas e rate limiting distribuído. Esses itens não alteram a correção desta entrega, mas são necessários para operação institucional em escala.
