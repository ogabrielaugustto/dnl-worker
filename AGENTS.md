# AGENTS.md — DNL Worker

## 1. Contexto do Projeto

Este repositório é o **dnl-worker**, o motor operacional do projeto **DNL — Direito Na Lente**.

O DNL é uma plataforma SaaS para monitoramento de uso indevido de imagens na internet. O `dnl-platform` é o painel do cliente e do admin. O `dnl-worker` é responsável por execução pesada, recorrente e assíncrona.

Repositório relacionado:

```txt
dnl-platform
```

Fluxo macro do produto:

```txt
Usuário sobe imagem no dnl-platform
   ↓
dnl-platform cria asset, asset_file e monitoring_rule
   ↓
dnl-worker cria/enfileira scan_jobs
   ↓
dnl-worker chama Google Vision
   ↓
dnl-worker deduplica e atualiza detections
   ↓
dnl-worker captura screenshots com Playwright
   ↓
dnl-worker salva evidências no R2 e metadados no Supabase
   ↓
dnl-platform exibe resultados para validação humana
```

Este repositório:

* não é frontend;
* não é backend público principal;
* não deve concentrar autenticação de usuário final;
* não deve virar painel administrativo.

---

## 2. Responsabilidade Deste Repositório

O `dnl-worker` deve ser responsável por:

* Criar jobs recorrentes a partir de `monitoring_rules`.
* Reenfileirar jobs pendentes.
* Processar `scan_jobs` com BullMQ.
* Executar Google Cloud Vision Web Detection.
* Normalizar resultados do Vision.
* Deduplicar ocorrências.
* Criar e atualizar `detections`.
* Criar e atualizar `scan_runs`.
* Capturar evidências com Playwright.
* Subir screenshots para Cloudflare R2.
* Atualizar `detection_evidences`.
* Aplicar retry controlado.
* Expor endpoints internos protegidos para health, scheduler, fila, métricas e testes.
* Manter migrations do schema compartilhado com o `dnl-platform`.

O `dnl-worker` não deve ser responsável por:

* Renderizar telas.
* Servir páginas públicas.
* Implementar login, registro ou fluxo de sessão de usuário final.
* Expor CRUD público de assets, detections ou billing.
* Concentrar a lógica de painel do cliente ou admin.
* Substituir o `dnl-platform`.

Regra prática:

```txt
Se é interface, fica no dnl-platform.
Se é execução pesada, recorrente ou assíncrona, fica no dnl-worker.
```

---

## 3. Stack Técnica Atual

Usar neste repositório:

* Node.js
* TypeScript
* Fastify
* Zod
* dotenv
* Pino / Pino Pretty
* Supabase
* PostgreSQL via Supabase
* BullMQ
* Redis
* Google Cloud Vision SDK
* Playwright
* Cloudflare R2

Fora do escopo por enquanto:

* Backend público do produto.
* Frontend.
* Billing completo.
* Automação jurídica completa.
* IA própria.
* Geração de PDF final.
* E-mail e WhatsApp.

---

## 4. Arquitetura Atual

O worker já não está mais em fase de prova de conceito. A arquitetura esperada agora é operacional:

```txt
Fastify
  ├─ health + endpoints internos protegidos
  ├─ scheduler trigger
  ├─ queue trigger
  └─ metrics

Supabase
  ├─ source of truth
  ├─ assets / asset_files
  ├─ monitoring_rules
  ├─ scan_jobs / scan_runs
  ├─ detections / detection_evidences
  └─ shared schema owner

BullMQ + Redis
  ├─ scan-jobs
  └─ capture-evidence

Workers
  ├─ Google Vision
  ├─ detection upsert
  ├─ evidence capture
  └─ retry / concurrency / queue processing

Cloudflare R2
  └─ private screenshot evidence storage
```

O Fastify é a camada HTTP interna. O core do processamento deve ficar desacoplado de rota HTTP.

---

## 5. Comunicação com o dnl-platform

A integração principal entre `dnl-platform` e `dnl-worker` deve acontecer pelo banco compartilhado.

Contrato atual:

```txt
dnl-platform cria:
- assets
- asset_files
- monitoring_rules
- scan_jobs manuais quando necessário

dnl-worker faz:
- scheduler recorrente
- criação de scan_jobs automáticos
- execução e retry
- detections
- evidences
- atualização de estado
```

O `dnl-platform` pode acordar o worker por endpoint interno:

```txt
POST /internal/scheduler/run
POST /internal/jobs/run
POST /internal/jobs/:id/run
```

Mas o `dnl-platform` não deve enviar imagem e ficar esperando todo o processamento dentro da mesma request.

Errado:

```txt
platform envia imagem → worker processa tudo → platform espera resposta longa
```

Certo:

```txt
platform grava intenção no banco → worker executa assíncrono → platform lê resultado depois
```

---

## 6. Segurança

Em produção, o worker deve ser acessado via HTTPS.

Local:

```txt
http://localhost:3333
```

Produção esperada:

```txt
https://dnl-worker-production.up.railway.app
```

Todos os endpoints internos devem exigir:

```txt
x-internal-secret
```

Comparado com:

```txt
INTERNAL_API_SECRET
```

Regras obrigatórias:

* Nunca expor `/internal/*` sem proteção.
* Nunca logar `INTERNAL_API_SECRET`.
* Nunca retornar secrets em resposta.
* Nunca commitar `.env`.
* Nunca commitar credenciais Google.
* Nunca commitar service account JSON.
* Nunca logar `SUPABASE_SERVICE_ROLE_KEY`.
* Nunca logar credenciais R2.
* Nunca gerar URL pública permanente para evidência privada por conveniência.

---

## 7. Estrutura de Pastas Esperada

Estrutura atual esperada:

```txt
dnl-worker/
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   ├── logger.ts
│   │   ├── redis.ts
│   │   ├── r2.ts
│   │   └── supabase.ts
│   │
│   ├── http/
│   │   ├── server.ts
│   │   ├── plugins/
│   │   │   └── internal-auth.ts
│   │   └── routes/
│   │       ├── health.routes.ts
│   │       ├── jobs.routes.ts
│   │       ├── metrics.routes.ts
│   │       ├── scheduler.routes.ts
│   │       ├── screenshots.routes.ts
│   │       └── vision.routes.ts
│   │
│   ├── modules/
│   │   ├── detections/
│   │   ├── evidence/
│   │   ├── jobs/
│   │   ├── scans/
│   │   ├── scheduler/
│   │   ├── shared/
│   │   ├── storage/
│   │   └── vision/
│   │
│   ├── services/
│   │   ├── screenshot.service.ts
│   │   └── vision.service.ts
│   │
│   └── index.ts
│
├── supabase/
│   └── migrations/
├── .env.example
├── AGENTS.md
├── README.md
├── package.json
└── tsconfig.json
```

Regras:

* Rotas não devem conter regra de negócio pesada.
* Integrações externas ficam em módulos e serviços.
* Operação de banco deve ser explícita e organizada.
* Migrations SQL são parte central deste repo.

---

## 8. Endpoints Atuais

Público:

```txt
GET /health
```

Internos protegidos:

```txt
GET  /internal/metrics
POST /internal/jobs/run
POST /internal/jobs/:id/run
POST /internal/scheduler/run
POST /internal/vision/test
POST /internal/screenshots/test
```

Endpoints que não devem existir aqui:

```txt
POST /login
POST /register
GET /dashboard
GET /assets
POST /assets
GET /detections
POST /billing
```

Esses pertencem ao `dnl-platform`.

---

## 9. Banco de Dados e Fonte de Verdade

Este repositório já usa banco de verdade.

O schema compartilhado entre `dnl-worker` e `dnl-platform` fica neste repositório, via migrations em:

```txt
supabase/migrations/
```

Entidades centrais atuais:

```txt
organizations
organization_members
subscription_plans
organization_subscriptions
assets
asset_files
monitoring_rules
scan_jobs
scan_runs
detections
detection_evidences
detection_actions
audit_logs
```

Conceitos importantes:

```txt
Asset monitorado ≠ job eterno
Monitoring rule ≠ scan job
Scan job = execução específica
Scan run = tentativa específica de execução
Detection = ocorrência deduplicada
Detection evidence = evidência capturada da ocorrência
```

Fluxo de estado:

```txt
asset
   ↓
monitoring_rule
   ↓
scan_job
   ↓
scan_run
   ↓
detection
   ↓
detection_evidence
```

Se houver divergência entre código e documentação, as migrations são a fonte oficial.

---

## 10. Scheduler e Fila

O scheduler já faz parte da arquitetura deste worker.

Decisão atual:

```txt
dnl-platform cria monitoring_rules
dnl-worker cria scan_jobs recorrentes
BullMQ executa
Supabase audita
```

Regras:

* Não fazer `while (true)` consultando banco sem controle.
* Usar scheduler em intervalo configurável.
* Criar jobs recorrentes com idempotência por `dedupe_key`.
* Reenfileirar jobs pendentes quando necessário.
* Controlar concorrência e retry via BullMQ.
* Não misturar screenshot e scan na mesma fila sem necessidade.

Filas atuais:

```txt
scan-jobs
capture-evidence
```

Idempotência esperada:

```txt
scheduled:{monitoring_rule_id}:{YYYY-MM-DD}
manual:{asset_id}:{request_id}
```

---

## 11. Google Vision

O Google Cloud Vision fica neste worker.

Usar:

```txt
Google Cloud Vision Web Detection
```

Função principal:

```ts
detectImageOnWeb(imageUrl: string)
```

Objetivos:

* Encontrar páginas relacionadas à imagem.
* Encontrar imagens visualmente similares.
* Encontrar URLs candidatas de uso.
* Alimentar o pipeline de deduplicação e detecção.

Regras:

* Não tratar resultado como infração automática.
* A saída do Vision é sinal de possível ocorrência.
* A validação humana continua obrigatória.
* Tratar falhas com erros seguros.
* Nunca vazar credenciais.
* Retry só em falhas transitórias.

---

## 12. Screenshots e Evidências

O Playwright fica neste worker.

Função principal:

```ts
captureScreenshot(url: string)
```

Retorno esperado:

```ts
type ScreenshotResult = {
  buffer: Buffer;
  finalUrl: string;
  capturedAt: string;
};
```

Regras:

* Usar Chromium headless.
* Viewport inicial `1440x1200`.
* Capturar PNG full-page.
* Aplicar timeout.
* Fechar browser em `finally`.
* Falha de screenshot não apaga detecção.
* Evidência deve ser marcada como `failed` quando necessário.
* Evidências devem ser privadas no R2 por padrão.

Chave de storage esperada:

```txt
organizations/{orgId}/detections/{detectionId}/runs/{scanRunId}/screenshot.png
```

---

## 13. Variáveis de Ambiente

O `.env.example` deve refletir o estado real do worker.

Variáveis atuais esperadas:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

REDIS_URL=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_ASSETS=
R2_BUCKET_EVIDENCE=
R2_PUBLIC_BASE_URL=

NODE_ENV=development
PORT=3333
WORKER_ID=dnl-worker-local
SCHEDULER_INTERVAL_SECONDS=300
VISION_RATE_LIMIT_PER_MINUTE=60
SCREENSHOT_CONCURRENCY=2

INTERNAL_API_SECRET=change-me

GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=
```

Regras:

* `PORT` deve virar `number`.
* `NODE_ENV` deve aceitar `development`, `test`, `production`.
* `INTERNAL_API_SECRET` é obrigatório.
* `SUPABASE_SERVICE_ROLE_KEY` é obrigatório.
* `REDIS_URL` é obrigatório.
* Credenciais reais nunca devem ser commitadas.
* Compatibilidade temporária com nomes legados é aceitável, mas o padrão novo é o oficial.

---

## 14. TypeScript e Padrões de Código

Configuração esperada:

* `strict: true`
* `rootDir: "src"`
* `outDir: "dist"`
* Target moderno
* ES Modules
* Sem `any` desnecessário
* Tipos explícitos em integrações e repositórios

Padrões:

* Código em inglês.
* Separar HTTP, domínio, integrações e infra.
* Zod para validação de entrada.
* Funções pequenas e previsíveis.
* Services e repositories para lógica operacional.
* Erros seguros para resposta HTTP.
* Logs estruturados com contexto.

Evitar:

* Lógica pesada em rotas.
* `catch` vazio.
* `console.log` espalhado.
* Secrets em logs.
* Código morto.
* Acoplamento do core com Fastify.

---

## 15. Logging

Usar Pino/Fastify com logs estruturados.

Logs úteis:

```txt
server_started
shutdown_started
internal_auth_failed
vision_test_started
vision_test_failed
screenshot_test_started
screenshot_test_failed
scheduler_cycle_completed
scheduler_cycle_failed
scan_job_completed
scan_job_failed
evidence_capture_failed
scan_worker_failed
evidence_worker_failed
```

Contexto esperado quando aplicável:

```txt
job_id
scan_job_id
scan_run_id
asset_id
organization_id
detection_id
status
duration_ms
error_code
error_message
retryable
```

Nunca logar:

```txt
tokens
cookies
internal secret
service role key
google credentials
r2 secret
```

---

## 16. Cloudflare R2

O worker já deve considerar o R2 parte da arquitetura oficial.

Regras:

* O `dnl-platform` pode usar R2 para assets originais.
* O `dnl-worker` usa R2 para evidências.
* Evidências devem ser privadas.
* O banco guarda metadados e chaves, não o binário.
* URLs públicas permanentes não devem ser pressupostas.

---

## 17. Fora do Escopo

Continua fora do escopo deste repositório:

* Frontend.
* Dashboard.
* Auth de usuário final.
* Billing completo.
* Painel administrativo público.
* Sistema jurídico automatizado.
* Crawler próprio geral.
* IA própria.
* WhatsApp e e-mail.
* Categoria de asset no worker, por enquanto.

---

## 18. Critérios de Aceite Atuais

Uma entrega relevante neste worker deve preservar ou melhorar:

```txt
[ ] npm install funciona
[ ] npm run dev sobe o worker
[ ] npm run typecheck passa
[ ] npm run build passa
[ ] GET /health responde com estado do serviço
[ ] Endpoints internos exigem x-internal-secret
[ ] Scheduler consegue criar/enfileirar jobs vencidos
[ ] Scan job processa Google Vision
[ ] Deduplicação evita duplicar detections
[ ] Evidence job grava screenshot no R2
[ ] Falhas geram status corretos em scan_jobs / scan_runs / detection_evidences
[ ] Não há secrets no código ou nos logs
[ ] README continua coerente com a implementação
```

---

## 19. Como o Agente Deve Trabalhar

Antes de alterar código:

1. Ler este arquivo.
2. Confirmar que este repo é o motor operacional.
3. Inspecionar as migrations se a tarefa tocar banco ou fluxo de dados.
4. Não criar frontend.
5. Não mover responsabilidade do painel para o worker sem necessidade real.
6. Respeitar a separação entre `dnl-platform` e `dnl-worker`.

Ao implementar:

1. Fazer mudanças pequenas e modulares.
2. Preservar TypeScript estrito.
3. Separar rotas, módulos e infra.
4. Validar entradas com Zod.
5. Tratar erros com segurança.
6. Proteger endpoints internos.
7. Atualizar README e `.env.example` quando comportamento ou configuração mudar.
8. Atualizar migrations quando o schema precisar mudar.

Antes de finalizar:

```txt
npm run typecheck
npm run build
```

Também verificar:

```txt
[ ] Não há .env commitado
[ ] Não há credencial Google commitada
[ ] Não há secret de Supabase commitado
[ ] Não há secret de R2 commitado
[ ] Não há endpoint interno sem proteção
[ ] Não há código de frontend
```

---

## 20. Princípio Técnico Central

A regra principal deste repositório é:

```txt
O dnl-worker é o motor.
O dnl-platform cria intenção e mostra resultado.
O Supabase coordena estado.
O Redis coordena execução de fila.
O R2 guarda evidência.
O Google Vision encontra possíveis ocorrências.
O Playwright gera prova visual.
O humano valida a infração.
```

Objetivo atual:

```txt
Operar de verdade
agendar
enfileirar
processar
deduplicar
capturar evidência
persistir estado corretamente
```
