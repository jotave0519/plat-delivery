# Balcão — plataforma de gestão para delivery

SaaS de gestão para restaurantes e negócios de delivery: pedidos, cardápio,
clientes, estoque, financeiro e atendimento via IA no WhatsApp — tudo
multi-tenant desde a base.

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
- **EasyPanel** (Docker) para deploy; **Evolution API** para WhatsApp (conexão + agente de atendimento por IA — ver seção própria); **API da Claude (Anthropic)** para o agente de atendimento e a importação de cardápio

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
| `ANTHROPIC_API_KEY` | não** | Chave da API da Claude — compartilhada pela importação de cardápio (`/cardapio/importar`) **e** pelo agente de atendimento por WhatsApp; uma única variável, sem configuração duplicada |

Sem as três primeiras a app não inicia (`src/lib/env.ts` falha rápido e explica o que falta). \*As quatro variáveis de WhatsApp são opcionais para a app subir, mas **obrigatórias** para o botão "Conectar WhatsApp" em `/atendimento-ia` funcionar — sem `APP_URL` configurada, ele mostra um erro amigável em vez de cadastrar um webhook que a Evolution API não conseguiria alcançar. \*\*Sem `ANTHROPIC_API_KEY`, o app sobe normalmente — só a importação de cardápio e as respostas automáticas do agente de WhatsApp mostram um erro amigável (ou simplesmente ficam em silêncio, no caso do agente) em vez de funcionar. **Nenhuma variável de ambiente nova foi criada para o agente de atendimento** — tudo reaproveita `ANTHROPIC_API_KEY`/`EVOLUTION_*`/`APP_URL` já existentes.

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

## Atendimento IA via WhatsApp (Evolution API + Claude)

`/atendimento-ia` (restrito a OWNER/ADMIN) reúne conexão do WhatsApp,
configuração do agente e acompanhamento das conversas.

### Conexão com o WhatsApp

- `prisma/schema.prisma`: `WhatsappConnection` (uma por restaurante, mapeia
  `instanceName` ↔ `restaurantId`, guarda status/QR/telefone) e
  `WhatsappWebhookEvent` (log bruto de todo evento recebido — auditoria,
  inclusive dos tipos já processados).
- `src/server/integrations/evolution/client.ts`: wrapper HTTP tipado
  (criar/remover instância, QR code, status, enviar texto, enviar
  documento). Todos os shapes, incluindo `sendTextMessage`, já confirmados
  contra a Evolution API real (ver "Confirmado contra um WhatsApp real"
  abaixo) — só `sendDocument` (envio de PDF) segue não testado.
- Fluxo de conexão (`src/server/actions/atendimento.ts` +
  `src/components/atendimento/whatsapp-connection-card.tsx`): clicar em
  "Conectar WhatsApp" cria a instância na Evolution API, exibe o QR code e
  faz polling do status a cada 3s; "Desconectar"/"Cancelar" remove a
  instância na Evolution API e limpa o estado local.

**Verificado contra a Evolution API real**: criação de instância, exibição
do QR code e remoção testados de ponta a ponta, confirmando via
`GET /instance/fetchInstances` que a instância aparece e depois some. O
recebimento do webhook (`CONNECTION_UPDATE` gravando `CONNECTED` de
verdade) só pode ser validado com `APP_URL` apontando para uma URL
publicamente alcançável — em produção no EasyPanel, não em dev local.

### O agente de atendimento

Cada mensagem recebida (`MESSAGES_UPSERT`, tratado em
`src/app/api/webhooks/evolution/[token]/route.ts`) é passada para
`processConversationMessage` (`src/server/actions/atendimento-ia-conversa.ts`),
que:

1. Resolve/cria a `Conversation` (uma por restaurante+telefone) e checa
   idempotência por `Message.whatsappMessageId` (`@unique`) — uma
   reentrega do mesmo evento pela Evolution API nunca gera uma segunda
   resposta ou um segundo pedido.
2. Monta o contexto para a Claude (`claude-opus-5`, loop manual de
   tool-calling em `src/server/integrations/anthropic/whatsapp-agent.ts`):
   cardápio real (`getCatalogForOrderForm`, com `productId`/`optionItemId`
   explícitos no texto para a IA nunca inventar um id), horário de
   funcionamento (`isOpenNow`/`formatOpeningHoursSummary`), FAQ, áreas de
   entrega, taxa padrão, formas de pagamento aceitas, chave Pix e o
   carrinho em construção (`Conversation.draftCart`).
3. Ferramentas disponíveis: `atualizar_pedido` (reescreve o carrinho
   inteiro, sempre repreçando pelo banco via `priceOrderItems` — a IA
   nunca informa preço), `confirmar_pedido` (só ela grava de verdade:
   acha/cria o `Customer` por telefone e cria o `Order` com
   `channel: "WHATSAPP_IA"`), `transferir_para_humano` (desliga
   `Conversation.aiEnabled`) e `enviar_cardapio_pdf` (envia o PDF
   cadastrado, se houver).
4. A resposta final é enviada via `sendTextMessage` e tanto a mensagem
   recebida quanto a enviada ficam em `Message` (transcript completo).

O pedido criado aparece imediatamente em `/pedidos`, com canal "WhatsApp ·
IA" e seguindo o mesmo fluxo simplificado (Confirmar → Em preparo →
Pronto → Em entrega → Concluído) de qualquer outro pedido.
`advanceOrderStatus`/`cancelOrder` (`src/server/actions/orders.ts`)
notificam automaticamente o cliente por WhatsApp a cada mudança —
**somente para pedidos com canal `WHATSAPP_IA`**, nunca para pedidos
manuais/balcão — via `src/server/actions/whatsapp-order-notifications.ts`.

### Configuração (tudo em `/atendimento-ia`, nada por variável de ambiente)

- **Conexão do WhatsApp**: ver seção acima.
- **Chave Pix**: já configurável em `/configuracoes` (usada tanto por
  pedidos manuais quanto pela IA quando o cliente escolhe Pix).
- **Configurações da IA**: liga/desliga geral (`Restaurant.aiEnabled`,
  **desligado por padrão** — nenhum restaurante é surpreendido), formas
  de pagamento aceitas, taxa de entrega padrão, áreas de entrega (texto
  livre, só informativo — não bloqueia pedido nenhum) e FAQ/informações
  do negócio.
- **Cardápio em PDF**: upload guardado como base64 no Postgres (mesmo
  padrão já usado para o QR code — sem storage/infra nova); a IA envia
  quando o cliente pede.
- **Conversas recentes**: lista simples (não é um CRM) com link para o
  histórico completo de mensagens de cada conversa, e um botão para um
  atendente assumir manualmente (ou devolver à IA) uma conversa
  específica — independente do liga/desliga geral do restaurante.

### Incidente: primeira mensagem real não teve resposta (2026-09-01, resolvido)

No primeiro uso real, uma mensagem enviada ao número conectado não gerou
nenhuma resposta. Investigação (sem alterar nada às cegas — cada hipótese
foi confirmada por evidência antes de qualquer mudança) encontrou **dois
problemas reais, em camadas diferentes**:

1. **Configuração**: a instância na Evolution API tinha o webhook
   registrado como `http://localhost:3000/api/webhooks/evolution/...`
   (`GET /webhook/find/{instance}` confirmou isso) — provavelmente de uma
   reconexão feita com o servidor de desenvolvimento local, cujo
   `APP_URL` no `.env` é `http://localhost:3000`. A Evolution API (rodando
   no EasyPanel) não tem como alcançar `localhost` da máquina local, então
   **nenhum evento — nem de conexão, nem de mensagem — jamais chegou** à
   aplicação (`WhatsappWebhookEvent` estava com zero linhas, sempre).
   Corrigido chamando `POST /webhook/set/{instance}` diretamente contra a
   Evolution API, apontando para o domínio público real
   (`https://appdelivery-appdelivery.uule1c.easypanel.host/...`) — sem
   precisar recriar a instância nem escanear o QR code de novo, já que o
   WhatsApp já estava de fato conectado (`connectionState: "open"`) do
   lado da Evolution API, só a nossa aplicação não sabia disso.
2. **Código**: depois de corrigir o webhook, os eventos passaram a chegar
   de verdade — e revelaram um segundo bug, esse sim no código. A Evolution
   API envia o campo `event` em minúsculo com ponto
   (`"messages.upsert"`, `"connection.update"`), mas
   `src/app/api/webhooks/evolution/[token]/route.ts` só fazia
   `.toUpperCase()` nesse valor e comparava com `"MESSAGES_UPSERT"`/
   `"CONNECTION_UPDATE"` (com underscore) — `"MESSAGES.UPSERT" !==
   "MESSAGES_UPSERT"`, então a condição nunca batia e a mensagem ficava só
   logada em `WhatsappWebhookEvent`, sem nunca chegar em
   `processConversationMessage`. Corrigido normalizando pontos para
   underscore logo após o `toUpperCase()`.

Depois das duas correções, a mensagem real que já estava pendente
(`"oi"`, de um número de teste) foi processada diretamente contra o banco
de produção e a API da Claude real, e a resposta foi enviada de volta e
recebida de verdade no WhatsApp — ver "Confirmado contra um WhatsApp real"
abaixo.

### Confirmado contra um WhatsApp real conectado (2026-09-01)

Depois do primeiro uso real revelar dois bugs de configuração/código (ver
"Incidente" abaixo), uma mensagem real ("oi") foi processada de ponta a
ponta: webhook recebido → `processConversationMessage` → Claude respondeu
corretamente que o restaurante estava fechado no horário → resposta
enviada de volta via `sendTextMessage` e recebida no WhatsApp real. Isso
confirma, contra a API real (não mais só suposição):
- O payload de `MESSAGES_UPSERT` bate exatamente com o formato assumido em
  `extractInboundMessage` (`data.key.remoteJid`/`fromMe`/`id`,
  `data.pushName`, `data.message.conversation`) — nenhum ajuste necessário.
- O corpo `{ number, text }` de `sendTextMessage` está correto — a
  Evolution API aceitou e entregou a mensagem.

### Pendência restante (só verificável com um WhatsApp real conectado)

- Formato do corpo de `sendDocument` (envio de PDF) — ainda não testado.

### Testado sem WhatsApp real (contra o Supabase e a API da Claude reais)

`processConversationMessage` chamado diretamente, simulando mensagens
recebidas: cliente novo, pedido em linguagem natural, alteração do
carrinho no meio da conversa (1 item → 2, forma de pagamento, retirada,
nome), resumo e confirmação — pedido real criado com canal `WHATSAPP_IA` e
preço recalculado a partir do produto no banco; reenvio do mesmo
`whatsappMessageId` confirmado como no-op (nem mensagem nem pedido
duplicado); pedido de transferência para humano confirmado desligando
`aiEnabled` e silenciando o agente na conversa; dois restaurantes
diferentes com o mesmo número de telefone confirmados como conversas
completamente isoladas. Todos os dados de teste foram removidos ao final
e o restaurante real (`Casa Bonfim`) foi conferido restaurado ao estado
exato de antes do teste (`aiEnabled: false`, `WhatsappConnection`
`DISCONNECTED`, zero linhas remanescentes).

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
src/app/api/webhooks/evolution      webhook da Evolution API (conexão + mensagens recebidas)
src/server/integrations/evolution   cliente HTTP da Evolution API
src/server/integrations/anthropic   chamadas à API da Claude — importação de cardápio (extração
                                     estruturada) e o loop de tool-calling do agente de WhatsApp
src/server/actions/atendimento-ia-conversa.ts   orquestração do agente de atendimento (uma
                                     mensagem recebida → resposta), ferramentas do agente
src/server/orders/pricing.ts        precificação de itens/adicionais a partir do banco —
                                     compartilhada entre o pedido manual e o agente de WhatsApp
src/components/atendimento          componentes do módulo Atendimento IA (conexão, configurações
                                     da IA, lista/detalhe de conversas)
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
- **Atendimento IA via WhatsApp completo e funcional**: conexão real com a
  Evolution API (QR code, status ao vivo, desconectar) e um agente de
  atendimento de verdade (Claude + tool-calling) que conversa em linguagem
  natural, consulta o cardápio real, monta e ajusta o carrinho, pede
  confirmação com resumo completo, cria o pedido de verdade (canal
  `WHATSAPP_IA`, mesmo fluxo simplificado de status), envia atualizações
  automáticas de status/cancelamento, envia o cardápio em PDF quando
  pedido, e transfere para um atendente humano quando solicitado ou
  quando não consegue ajudar — ver seção "Atendimento IA via WhatsApp"
  acima para o detalhamento completo.
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

Nenhum módulo do roadmap original ficou pendente. O que resta é
verificação empírica contra um WhatsApp real (ver "Pendências" na seção
"Atendimento IA via WhatsApp") e evoluções possíveis, não bloqueantes:
uma tela de conversas mais completa (a arquitetura atual — `Message`
guardando o transcript completo — já permite isso sem mudança de schema),
e uma revisão de código dedicada ao módulo de atendimento (o `/code-review`
completo mais recente foi antes desta funcionalidade existir).
