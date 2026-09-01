# Balcão — plataforma de gestão para delivery

SaaS de gestão para restaurantes e negócios de delivery: pedidos, cardápio,
clientes, estoque, financeiro e (futuramente) atendimento via IA no
WhatsApp — tudo multi-tenant desde a base.

A identidade visual segue o protótipo do Claude Design (paleta, tipografia
Instrument Sans, componentes e comportamento responsivo). Veja o plano de
fundação em `C:\Users\PC\.claude\plans\playful-tickling-sparkle.md` para o
racional de arquitetura completo (fundação do produto + adequação de
infraestrutura).

## Stack

- **Next.js 16** (App Router, Server Components + Server Actions) + TypeScript
- **Supabase PostgreSQL + Prisma 7** (driver adapter `@prisma/adapter-pg` — Prisma 7 não aceita mais `url` direto no schema)
- **Auth.js (next-auth v5)** com credenciais (e-mail/senha), sessão JWT
- **Tailwind CSS v4**, tokens de design em `src/app/globals.css`, ícones `lucide-react`
- **EasyPanel** (Docker) para deploy; **Evolution API** para WhatsApp (conexão do número já funcional — ver seção própria; o agente de IA em si ainda não)

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha. Detalhes de cada uma (incluindo
por que existem duas URLs de banco) estão comentados no próprio arquivo.

| Variável | Obrigatória | Uso |
|---|---|---|
| `DATABASE_URL` | sim | Runtime da app (Prisma Client) — conexão direta ao Postgres do Supabase |
| `DIRECT_URL` | sim | Prisma CLI (migrations/introspection) — mesma conexão direta |
| `AUTH_SECRET` | sim | Sessão do Auth.js |
| `EVOLUTION_API_URL` | não* | Base da Evolution API |
| `EVOLUTION_API_KEY` | não* | API key admin da Evolution API |
| `EVOLUTION_WEBHOOK_SECRET` | não* | Segredo próprio para validar o webhook em `/api/webhooks/evolution/[token]` |
| `APP_URL` | não* | URL pública deste app (sem barra final) — usada para montar a webhook URL passada à Evolution API ao conectar um WhatsApp |
| `ANTHROPIC_API_KEY` | não** | Chave da API da Claude — usada só pela importação de cardápio (`/cardapio/importar`) |

Sem as três primeiras a app não inicia (`src/lib/env.ts` falha rápido e explica o que falta). \*As quatro variáveis de WhatsApp são opcionais para a app subir, mas **obrigatórias** para o botão "Conectar WhatsApp" em `/atendimento-ia` funcionar — sem `APP_URL` configurada, ele mostra um erro amigável em vez de cadastrar um webhook que a Evolution API não conseguiria alcançar. \*\*Sem `ANTHROPIC_API_KEY`, o app sobe normalmente — só o botão "Importar cardápio" mostra um erro amigável em vez de funcionar.

## Banco de dados — Supabase (padrão) ou Postgres local (opcional)

**Padrão (recomendado, inclusive em desenvolvimento):** crie um projeto no
Supabase, pegue a connection string **direta** em *Project Settings →
Database → Connection string → "Direct connection"* e cole no `.env` — a
mesma string serve para `DATABASE_URL` e `DIRECT_URL`. Testado e em uso
neste projeto.

Essa conexão exige IPv6 (ou o add-on de IPv4 dedicado da Supabase) na rede
de quem conecta — confirme isso no host do EasyPanel antes do deploy final.
Sem IPv6, troque as duas pela connection string do **"Session pooler"**
(mesma tela, porta 5432) — formato alternativo comentado em `.env.example`,
não muda nada no código.

**Alternativa só para dev local**, sem depender do Supabase: `docker compose up -d`
sobe um Postgres local; aponte `DATABASE_URL`/`DIRECT_URL` para
`postgresql://plat_delivery:plat_delivery@localhost:5432/plat_delivery`. Não é
usado em produção e não é referenciado pelo `Dockerfile`.

```bash
npm install                            # instala dependências (gera o Prisma Client via postinstall)
npx prisma migrate dev                 # aplica as migrations (dev — usa DIRECT_URL)
ALLOW_SEED=true npm run db:seed        # popula dados de demonstração (trava proposital, ver abaixo)
npm run dev                            # http://localhost:3000
```

Login de demonstração (só existe se você rodou o seed): `carla@casabonfim.com.br` / `senha123` — não é mais exibido na tela de login do app (era um risco expor uma senha válida publicamente assim que a plataforma passasse a ser usada de verdade).

> `npm run db:seed` gera ~1200 pedidos e clientes fictícios, relativos ao
> momento em que é executado — **por isso exige `ALLOW_SEED=true`
> explicitamente**: sem essa variável, o script recusa rodar (ver comentário
> no início de `prisma/seed.ts`). Isso existe para não recriar dados
> fictícios por engano num banco já em uso real — sempre confirme qual
> `DATABASE_URL`/`DIRECT_URL` está ativo antes de setar `ALLOW_SEED=true`.
> Ele não é idempotente sozinho: para recomeçar do zero, use
> `npx prisma migrate reset` antes (⚠️ apaga todos os dados — só em
> ambiente de desenvolvimento).
>
> Os dados de demonstração (Casa Bonfim, Carla Bonfim, pedidos de exemplo)
> são só uma ferramenta de dev/teste — nunca obrigatórios. Para conectar a
> um restaurante real, crie a `Restaurant`/`User` correspondente (via
> `prisma studio` ou um script próprio) e não rode o seed nesse banco.
>
> **Zerar dados de negócio sem tocar em schema/usuários**: `npx tsx
> prisma/reset-business-data.ts` (dry run, só mostra contagens) e `npx tsx
> prisma/reset-business-data.ts --confirm` (apaga de verdade) — apaga
> Customer/Category/Product/Order/StockItem/FinancialEntry etc. de todo
> restaurante, mas nunca `Restaurant`, `User` ou `WhatsappConnection`. Foi
> assim que o banco de produção foi zerado para uso real (ver seção "O que
> já existe").

## Deploy em produção (EasyPanel)

A app roda como um único container Docker persistente — não serverless — o
que também é por isso que o banco usa o pooler do Supabase em **modo
session**, não o modo transaction (ver comentários em `.env.example`).

1. No EasyPanel, aponte o serviço para este repositório — ele detecta o
   `Dockerfile` automaticamente, não precisa de configuração extra.
2. Configure as variáveis de ambiente da tabela acima na interface do
   EasyPanel (nunca no código/imagem).
3. Deploy. O `docker-entrypoint.sh` roda `prisma migrate deploy` (aplica só
   migrations pendentes, não destrutivo) e então sobe `next start`.
4. Health check: `GET /api/health` → `{"status":"ok"}`. O `Dockerfile` já
   declara um `HEALTHCHECK` nativo do Docker; se o EasyPanel pedir para
   configurar um manualmente, aponte para esse caminho.
5. **Porta do domínio: `3000`.** O container escuta em `3000`
   (`EXPOSE 3000`/`ENV PORT=3000` no `Dockerfile`) — ao criar/editar o
   domínio do app no EasyPanel, confirme que a porta de destino configurada
   é `3000`, não `80` (o padrão do EasyPanel). Configurar isso errado é
   exatamente o que já causou um "Service is not reachable" numa tentativa
   de deploy anterior, mesmo com o container rodando normalmente.

Para pular a migration automática em um boot específico (ex.: quiser rodar
manualmente antes), defina `SKIP_MIGRATIONS=true` naquele deploy.

**Testar a imagem localmente antes de enviar:**
```bash
docker build -t plat_delivery .
docker run -p 3000:3000 \
  -e DATABASE_URL=... -e DIRECT_URL=... -e AUTH_SECRET=... \
  plat_delivery
```

## Evolution API (WhatsApp) — conexão pronta, agente de IA ainda não

`/atendimento-ia` (restrito a OWNER/ADMIN) conecta o WhatsApp do restaurante
de verdade — ainda sem nenhuma lógica de conversa/IA:

- `prisma/schema.prisma`: `WhatsappConnection` (uma por restaurante, mapeia
  `instanceName` ↔ `restaurantId`, guarda status/QR/telefone) e
  `WhatsappWebhookEvent` (log bruto de todo evento recebido, útil pra
  depuração mesmo dos tipos ainda não processados).
- `src/server/integrations/evolution/client.ts`: wrapper HTTP tipado
  (criar/remover instância, QR code, status). Shapes confirmados contra a
  documentação pública da Evolution API v2; `sendTextMessage` ainda não é
  usado em lugar nenhum — fica pra quando a Fase 2 (persistência de
  conversas) precisar dele, e deve ser verificado contra a API real antes.
- `src/app/api/webhooks/evolution/[token]/route.ts`: endpoint único de
  webhook. Configure o webhook da sua instância Evolution API para
  `https://<seu-dominio>/api/webhooks/evolution/<EVOLUTION_WEBHOOK_SECRET>`
  — o segredo no path é a autenticação (Evolution API não assina requests
  por padrão). Resolve o restaurante pelo `instanceName`, grava todo evento
  em `WhatsappWebhookEvent` e, para `QRCODE_UPDATED`/`CONNECTION_UPDATE`,
  atualiza `WhatsappConnection` em tempo real. Outros tipos de evento
  (`MESSAGES_UPSERT` etc.) continuam só logados — processá-los é a Fase 2.
- Fluxo de conexão (`src/server/actions/atendimento.ts` +
  `src/components/atendimento/whatsapp-connection-card.tsx`): clicar em
  "Conectar WhatsApp" cria a instância na Evolution API, exibe o QR code e
  faz polling do status a cada 3s enquanto aguarda a leitura (cobre o caso
  do webhook não alcançar o app, ex.: dev local sem URL pública);
  "Desconectar"/"Cancelar" remove a instância na Evolution API e limpa o
  estado local.

**Verificado contra a Evolution API real** (não só localmente): criação de
instância, exibição do QR code e remoção testados de ponta a ponta contra
`appdelivery-evolution-api.uule1c.easypanel.host`, confirmando via
`GET /instance/fetchInstances` que a instância aparece e depois some. O
recebimento do webhook (`CONNECTION_UPDATE` gravando `CONNECTED` de
verdade) só pode ser validado com `APP_URL` apontando para uma URL
publicamente alcançável — em produção no EasyPanel, não em dev local.

## Estrutura

```
Dockerfile, docker-entrypoint.sh   imagem de produção (ver seção EasyPanel)
docker-compose.yml                 Postgres local opcional (não usado em produção)
prisma/schema.prisma                modelo de dados completo (todos os módulos)
prisma/seed.ts                      dados de demonstração (exige ALLOW_SEED=true, ver seção de setup)
prisma/reset-business-data.ts       zera dados de negócio sem tocar em schema/Restaurant/User (dry-run por padrão)
prisma.config.ts                    config do Prisma 7 (datasource via DIRECT_URL, seed)
src/proxy.ts                        guarda de autenticação (era middleware.ts até o Next 15 — precisa
                                     ficar dentro de src/, não na raiz, já que o app usa src/app)
src/lib/env.ts                      validação de env vars (zod, fail-fast)
src/app/(auth)/login                tela de login
src/app/(app)/...                   shell autenticado: sidebar, pedidos, cardápio, clientes,
                                     estoque, financeiro, atendimento-ia, configurações
src/app/api/health                  health check (EasyPanel)
src/app/api/webhooks/evolution      webhook da Evolution API
src/server/integrations/evolution   cliente HTTP da Evolution API
src/server/integrations/anthropic   chamada à API da Claude p/ importação de cardápio (extração estruturada)
src/components/atendimento          componentes do módulo Atendimento IA (cartão de conexão do WhatsApp)
src/components/dashboard            componentes do Dashboard
src/components/pedidos              componentes do módulo de Pedidos (lista, detalhe, criação manual)
src/components/cardapio             componentes do módulo de Cardápio (categorias, produtos, adicionais)
src/components/clientes             componentes do módulo de Clientes (lista, detalhe, formulário)
src/components/estoque              componentes do módulo de Estoque (card, movimentação, formulário)
src/components/financeiro            componentes do módulo Financeiro (período, lançamentos)
src/components/configuracoes         componentes do módulo Configurações (restaurante, horário, usuários)
src/components/ui/confirm-button     botão genérico "confirmar + rodar Server Action" (usado em vários módulos)
src/components/ui/skeleton           primitivo de skeleton usado pelos loading.tsx de cada rota
src/components/ui/toast              ToastProvider/useToast() — feedback de sucesso/erro, monta em (app)/layout.tsx
src/components/layout                Sidebar, MobileNav, NavLink (feedback de navegação), stub "Em construção"
src/app/(app)/*/loading.tsx           skeleton por rota (dashboard, pedidos, cardápio, clientes, estoque, financeiro)
src/lib                              tokens de domínio (fluxo de status, formatação, tenant, horário de funcionamento)
src/server/actions                   Server Actions (mutações)
src/server/queries                   consultas de leitura (dashboard, pedidos, cardápio, clientes, estoque, financeiro, configurações)
```

## O que já existe

- Fundação multi-tenant (schema com `restaurantId` em toda tabela de domínio)
- Autenticação por credenciais + papéis (`OWNER`/`ADMIN`/`ATTENDANT`/`KITCHEN`)
- Shell do app fiel ao Claude Design nos três breakpoints (desktop/tablet/mobile)
- **Dashboard completo e funcional**, com dados reais do Postgres: KPIs por
  período, alertas (pedidos atrasados, pagamento pendente, estoque baixo,
  produtos pausados), quadro de operação com pedidos reais e ação de avançar
  status, e análises por abas (Volume/Canais/Tempos/Recebimentos/Resumo)
- **Pedidos completo e funcional**: lista com filtros (status/período/busca)
  e paginação, detalhe do pedido com linha do tempo real (`OrderEvent`),
  avançar/cancelar status, e criação manual (cliente novo ou existente,
  itens do cardápio com adicionais, entrega/retirada, pagamento). Fluxo
  operacional simplificado: confirmar um pedido novo já leva direto pra
  "Em preparo" (sem um clique extra de "Iniciar preparo") — `CONFIRMADO`
  continua existindo no enum/schema só como rede de segurança para um
  pedido que eventualmente já esteja parado nesse status.
- **Cardápio completo e funcional**: categorias (criar, renomear, reordenar,
  excluir se vazia), produtos (criar/editar/pausar/excluir) e adicionais
  (grupos e itens) — protegido contra excluir algo já usado em um pedido
  real (a UI trava a remoção, a Server Action reforça a mesma regra)
- **Importação de cardápio por IA** (`/cardapio/importar`): envia um PDF ou
  foto do cardápio, a API da Claude (visão/documento, saída estruturada)
  identifica categorias e produtos sem inventar dado que não esteja no
  arquivo, o usuário revisa/edita/desmarca tudo numa tela própria antes de
  qualquer gravação, com aviso de possível duplicata (comparação por nome,
  sem biblioteca externa) e reaproveitamento de categoria já existente por
  nome — só cria o que for confirmado, nunca altera/apaga o que já existia.
  Exige `ANTHROPIC_API_KEY` configurada; sem ela, mostra erro amigável.
- **Clientes completo e funcional**: lista com estatísticas reais (pedidos,
  valor gasto, último pedido — cancelados não contam), busca, cadastro e
  edição inline, histórico de pedidos no detalhe, exclusão bloqueada para
  quem já tem pedidos. Telefone é opcional (nome é o único campo
  obrigatório) — cobre o cliente de balcão cadastrado só com o nome, tanto
  na tela de Clientes quanto no fluxo de "Novo pedido".
- **Estoque completo e funcional**: itens ordenados por severidade
  (esgotado/baixo primeiro), registro de entrada/saída com histórico
  auditável (a quantidade só muda por movimentação, nunca por edição
  direta), trava contra saída maior que o disponível, badges de status
  reaproveitados no Dashboard e na sidebar
- **Financeiro completo e funcional**: KPIs por período (incl.
  personalizado) — faturamento, despesas, resultado, ticket médio, a
  receber —, recebimentos por forma de pagamento, lançamentos manuais de
  receita/despesa com edição inline
- Infraestrutura de produção: Docker para EasyPanel, Supabase Postgres
- **Configurações completo e funcional**: dados do restaurante e chave
  Pix, horário de funcionamento (editor semanal, com migração automática
  do formato antigo do seed), usuários e papéis — página restrita a
  OWNER/ADMIN, e gestão de usuários (criar/trocar papel/remover) restrita
  a OWNER, com travas contra remover a si mesmo ou o último proprietário
- **Proteção de rotas corrigida**: até a verificação do módulo Financeiro,
  `proxy.ts` estava no lugar errado (raiz em vez de `src/`) e nunca
  executava — nenhuma rota autenticada era de fato protegida (sem
  vazamento de dado, mas sem redirecionamento correto). Corrigido; ver
  `src/proxy.ts`.
- **Revisão de código completa** (`/code-review high`, 8 agentes) antes do
  último módulo — encontrou e corrigiu um IDOR real entre tenants em
  `saveProduct` (Cardápio), além de achados de eficiência e uma
  inconsistência de formatação. Ver seção própria no plano.
- **Atendimento IA — Fase 1 (conexão com o WhatsApp) completa e
  funcional**: `/atendimento-ia` conecta o WhatsApp do restaurante via
  Evolution API de verdade (QR code, status ao vivo, desconectar) — ver
  seção "Evolution API" acima. A conversa/agente de IA em si ainda não
  existe (ver roadmap).
- **Preparação para uso real**: banco de produção zerado de dados fictícios
  (~1200 pedidos de demo e afins removidos via `prisma/reset-business-data.ts`,
  mantendo `Restaurant`/`User`/`WhatsappConnection` intactos), seed travado
  contra reexecução acidental (`ALLOW_SEED=true` obrigatório), credencial de
  demonstração removida da tela de login pública. Além disso, uma rodada de
  performance/fluidez: `loading.tsx`/skeleton em cada rota principal (não
  havia nenhum — toda navegação congelava a tela até os dados chegarem),
  feedback de "carregando" no botão de avançar status do pedido (o mais
  clicado do app, antes sem nenhum indicador), busca de Pedidos/Clientes
  convertida para navegação client-side (antes recarregava a página
  inteira), troca de aba do quadro de pedidos do Dashboard agora é
  instantânea (filtro no cliente, sem round-trip — antes navegava ao
  servidor para filtrar dados que já estavam na página), índice novo em
  `Order(restaurantId, createdAt)` para as duas telas mais consultadas
  (Dashboard, Financeiro), e um sistema de toasts (`useToast()`) substituindo
  o `alert()` nativo e o silêncio total que havia após salvar formulários.
- **Refinamento de fluidez (parte 2)**: atualização otimista (`useOptimistic`,
  React 19) ao avançar status de pedido e ao pausar/ativar produto — a UI
  muda no clique, sem esperar a Server Action responder (confirmado via
  throttling de rede real, não só "parece rápido"); filtro de período
  personalizado do Financeiro e o CTA do alerta crítico do Dashboard, que
  tinham ficado de fora da rodada anterior (formulário GET nativo e `<a>`
  puro), convertidos pro mesmo padrão de navegação client-side; exclusão de
  produto unificada com `ConfirmButton`/toast (antes usava `confirm()`/
  `alert()` nativos). Auditoria completa de deploy/EasyPanel confirmou que
  Dockerfile, entrypoint, variáveis de ambiente e separação dev/produção já
  estavam corretos — só 2 ajustes de documentação (porta 3000 explícita na
  seção EasyPanel, comentário sobre pooler vs. conexão direta em `db.ts`).

## Próximas etapas (roadmap)

- **Fase 2**: persistir conversas/mensagens do WhatsApp (novos modelos
  `Conversation`/`Message` no schema) e uma UI de inbox para ver o
  histórico — hoje o webhook só loga esses eventos em
  `WhatsappWebhookEvent`, sem estruturá-los.
- **Fase 3**: o agente de IA de atendimento de fato (tool-calling via API
  da Anthropic, respostas automáticas, criação de pedido pelo WhatsApp) —
  deliberadamente deixado por último, por ser a peça com mais decisões de
  produto em aberto.
