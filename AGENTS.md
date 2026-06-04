# AGENTS.md — DNL Worker

## 1. Contexto do Projeto

Este repositório é o **dnl-worker**, o serviço operacional do projeto **DNL — Direito Na Lente**.

O DNL é uma plataforma SaaS para monitoramento e identificação de possíveis usos indevidos de imagens na internet. Fotógrafos, criadores, agências ou titulares de direitos autorais cadastram imagens na plataforma principal, e o sistema executa buscas recorrentes para encontrar possíveis usos dessas imagens na web.

A plataforma principal fica em outro repositório:

```txt
dnl-platform
```

Este repositório não é o painel, não é o frontend e não é o backend público principal.

Este repositório é responsável por tarefas assíncronas, pesadas e operacionais.

Fluxo geral do produto:

```txt
Usuário sobe imagem na dnl-platform
   ↓
dnl-platform salva imagem e cria configuração de monitoramento
   ↓
dnl-worker processa busca reversa via Google Cloud Vision
   ↓
dnl-worker captura evidência visual com Playwright
   ↓
dnl-worker salva resultados no banco/storage
   ↓
dnl-platform exibe as detecções para validação humana
```

---

## 2. Responsabilidade deste Repositório

O `dnl-worker` deve ser responsável por:

* Processar jobs de varredura de imagens.
* Executar busca reversa usando Google Cloud Vision Web Detection.
* Capturar screenshots de páginas encontradas usando Playwright.
* Normalizar resultados retornados pela API do Google.
* Deduplicar ocorrências.
* Criar ou atualizar registros de detecção.
* Atualizar status de jobs.
* Registrar logs técnicos.
* Aplicar retry em falhas controladas.
* Expor endpoints internos protegidos para testes, scheduler e processamento.

O `dnl-worker` não deve ser responsável por:

* Renderizar telas.
* Fazer painel administrativo.
* Fazer painel do cliente.
* Fazer login de usuário final.
* Controlar permissões visuais.
* Servir como API pública do SaaS.
* Criar rotas públicas de CRUD.
* Gerenciar billing.
* Gerenciar planos comerciais.
* Fazer automação jurídica completa.
* Substituir o repositório `dnl-platform`.

Regra prática:

```txt
Se é interface, fica no dnl-platform.
Se é processamento pesado, recorrente ou assíncrono, fica no dnl-worker.
```

---

## 3. Stack Técnica

Usar obrigatoriamente:

* Node.js
* TypeScript
* Fastify
* Zod
* dotenv
* Pino / Pino Pretty
* Google Cloud Vision SDK
* Playwright

Neste primeiro momento, não implementar ainda:

* Supabase/Postgres
* Cloudflare R2
* Fila real
* BullMQ
* Redis
* Sistema de scheduler completo
* Geração de PDF
* Integração com e-mail
* Integração jurídica

A primeira etapa do worker é validar:

```txt
Servidor Fastify
   ↓
Health check
   ↓
Endpoint interno protegido
   ↓
Google Vision Web Detection
   ↓
Playwright screenshot
```

---

## 4. Decisão Arquitetural

Este worker deve ser implementado como um serviço Fastify com endpoints internos protegidos.

Ele pode ter uma API interna, mas não deve virar o backend principal do produto.

Endpoints internos são aceitáveis para:

* Health check.
* Teste de Google Vision.
* Teste de screenshot.
* Disparo manual de jobs.
* Disparo de scheduler.
* Processamento de jobs pendentes.

Endpoints que não devem existir neste repo:

```txt
POST /login
POST /register
GET /assets
POST /assets
GET /detections
GET /dashboard
GET /admin/users
POST /billing
```

Esses endpoints pertencem ao `dnl-platform`.

---

## 5. Comunicação com dnl-platform

A comunicação principal entre `dnl-platform` e `dnl-worker` deve acontecer via banco de dados.

Modelo ideal futuro:

```txt
dnl-platform cria asset
dnl-platform cria monitoring_rule
dnl-platform cria scan_job inicial/manual
   ↓
dnl-worker consulta scan_jobs pendentes
dnl-worker processa
dnl-worker atualiza detections/evidences
   ↓
dnl-platform exibe resultados
```

A `dnl-platform` pode chamar o worker por endpoint interno para “acordar” o processamento:

```txt
POST /internal/jobs/run
```

Mas a `dnl-platform` não deve enviar imagem e esperar todo o processamento na mesma request.

Errado:

```txt
platform envia imagem → worker processa tudo → platform espera resposta longa
```

Certo:

```txt
platform cria job no banco → worker processa assíncrono → platform lê resultado depois
```

---

## 6. HTTPS e Segurança

Em produção, o worker deve ser acessado via HTTPS.

Em desenvolvimento local, pode usar HTTP:

```txt
http://localhost:3333
```

Em produção, usar HTTPS fornecido pelo provedor:

```txt
https://dnl-worker-production.up.railway.app
```

Ou domínio próprio:

```txt
https://worker.direitonalente.com.br
```

Todos os endpoints internos devem exigir o header:

```txt
x-internal-secret
```

Esse valor deve ser comparado com a variável:

```txt
INTERNAL_API_SECRET
```

Regras obrigatórias:

* Nunca expor endpoint `/internal/*` sem proteção.
* Nunca logar `INTERNAL_API_SECRET`.
* Nunca retornar secrets em resposta.
* Nunca commitar `.env`.
* Nunca commitar credenciais Google.
* Nunca commitar service account JSON.
* Nunca expor `SUPABASE_SERVICE_ROLE_KEY` quando ela for adicionada futuramente.

---

## 7. Estrutura de Pastas Esperada

Estrutura inicial:

```txt
dnl-worker/
├── src/
│   ├── config/
│   │   └── env.ts
│   │
│   ├── http/
│   │   ├── server.ts
│   │   ├── plugins/
│   │   │   └── internal-auth.ts
│   │   └── routes/
│   │       ├── health.routes.ts
│   │       ├── vision.routes.ts
│   │       └── screenshots.routes.ts
│   │
│   ├── services/
│   │   ├── vision.service.ts
│   │   └── screenshot.service.ts
│   │
│   └── index.ts
│
├── .env.example
├── .gitignore
├── AGENTS.md
├── README.md
├── package.json
└── tsconfig.json
```

Estrutura futura esperada:

```txt
dnl-worker/
├── src/
│   ├── config/
│   ├── db/
│   │   ├── client.ts
│   │   └── queries/
│   │
│   ├── http/
│   │   ├── server.ts
│   │   ├── plugins/
│   │   └── routes/
│   │
│   ├── jobs/
│   │   ├── scan-asset.job.ts
│   │   ├── capture-screenshot.job.ts
│   │   ├── generate-report.job.ts
│   │   └── process-pending-jobs.ts
│   │
│   ├── services/
│   │   ├── vision.service.ts
│   │   ├── screenshot.service.ts
│   │   ├── storage.service.ts
│   │   ├── jobs.service.ts
│   │   └── detections.service.ts
│   │
│   ├── scheduler/
│   │   └── run-monitoring-rules.ts
│   │
│   └── index.ts
```

---

## 8. Endpoints Iniciais

Implementar nesta primeira etapa:

```txt
GET  /health
POST /internal/vision/test
POST /internal/screenshots/test
```

### `GET /health`

Endpoint público simples para verificar se o serviço está online.

Resposta esperada:

```json
{
  "ok": true,
  "service": "dnl-worker",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

### `POST /internal/vision/test`

Endpoint protegido para testar Google Cloud Vision Web Detection.

Header obrigatório:

```txt
x-internal-secret
```

Body esperado:

```json
{
  "imageUrl": "https://example.com/image.jpg"
}
```

Resposta esperada:

```json
{
  "ok": true,
  "imageUrl": "https://example.com/image.jpg",
  "result": {}
}
```

### `POST /internal/screenshots/test`

Endpoint protegido para testar captura de screenshot.

Header obrigatório:

```txt
x-internal-secret
```

Body esperado:

```json
{
  "url": "https://example.com"
}
```

Resposta esperada:

```txt
image/png
```

O endpoint deve retornar o PNG diretamente.

---

## 9. Google Cloud Vision

O Google Cloud Vision deve ficar neste worker.

Usar:

```txt
Google Cloud Vision Web Detection
```

Objetivo:

* Encontrar páginas com imagens correspondentes.
* Encontrar imagens visualmente similares.
* Retornar URLs públicas relacionadas à imagem.
* Retornar entidades e metadados úteis para análise.

A função principal deve receber uma URL pública de imagem:

```ts
detectImageOnWeb(imageUrl: string)
```

Retorno normalizado esperado:

```ts
type WebDetectionResult = {
  webEntities: Array<{
    entityId?: string;
    description?: string;
    score?: number;
  }>;
  pagesWithMatchingImages: Array<{
    url?: string;
    pageTitle?: string;
  }>;
  fullMatchingImages: Array<{
    url?: string;
  }>;
  partialMatchingImages: Array<{
    url?: string;
  }>;
  visuallySimilarImages: Array<{
    url?: string;
  }>;
  raw: unknown;
};
```

Regras:

* Não assumir que todo resultado é infração.
* Apenas registrar como possível ocorrência no futuro.
* A validação humana é obrigatória.
* Tratar falhas da API com mensagens seguras.
* Não vazar credenciais em logs.
* Não fazer retry infinito.

---

## 10. Playwright e Screenshots

O Playwright deve ficar neste worker.

A função principal deve receber uma URL pública:

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
* Viewport inicial: 1440x1200.
* Capturar screenshot full-page em PNG.
* Usar timeout.
* Fechar browser em `finally`.
* Falha de screenshot deve ser tratada.
* Futuramente, falha de screenshot não deve apagar uma detecção.
* Não deixar processos Chromium pendurados.

---

## 11. Variáveis de Ambiente

Criar `.env.example` com:

```env
NODE_ENV=development
PORT=3333

INTERNAL_API_SECRET=change-me

GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=
```

Regras:

* `PORT` deve ser convertido para number.
* `NODE_ENV` deve aceitar `development`, `test`, `production`.
* `INTERNAL_API_SECRET` é obrigatório.
* `GOOGLE_APPLICATION_CREDENTIALS` pode ficar vazio no `.env.example`.
* As credenciais reais do Google nunca devem ser commitadas.

---

## 12. TypeScript

Configuração esperada:

* `strict: true`
* `rootDir: "src"`
* `outDir: "dist"`
* Target moderno.
* ES Modules.
* Sem `any` desnecessário.
* Preferir tipos explícitos em services.
* Funções pequenas e testáveis.

---

## 13. Scripts Esperados

No `package.json`, manter:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  }
}
```

Pode adicionar scripts auxiliares se necessário, mas não remover os principais.

---

## 14. Padrões de Código

Usar inglês no código.

Exemplos:

```txt
vision.service.ts
screenshot.service.ts
internal-auth.ts
health.routes.ts
captureScreenshot
detectImageOnWeb
verifyInternalSecret
```

Evitar:

* Arquivos gigantes.
* Lógica de negócio dentro das rotas.
* Duplicação de validação.
* `catch` vazio.
* `console.log` espalhado.
* Secrets em logs.
* Código morto.
* Dependências sem necessidade.

Preferir:

* Zod para validação de entrada.
* Services para integrações externas.
* Routes apenas orquestrando request/response.
* Logs estruturados com contexto.
* Erros seguros para resposta HTTP.
* Erros detalhados apenas em logs internos, sem secrets.

---

## 15. Logging

Usar logger do Fastify/Pino.

Logs úteis:

```txt
server_started
vision_test_started
vision_test_failed
screenshot_test_started
screenshot_test_failed
internal_auth_failed
```

Quando houver jobs no futuro, logs devem incluir:

```txt
job_id
asset_id
organization_id
detection_id
status
duration_ms
error_message
```

Não logar:

```txt
tokens
secrets
cookies
service role key
google credentials
internal api secret
```

---

## 16. Futuras Tabelas do Banco

Ainda não implementar banco nesta primeira fase, mas considerar que futuramente o worker irá operar sobre estas entidades:

```txt
assets
asset_files
monitoring_rules
scan_jobs
scan_runs
detections
detection_evidences
detection_actions
```

Conceito importante:

```txt
Imagem cadastrada não é job eterno.
Imagem cadastrada é asset monitorado.
Job é uma execução específica de busca.
```

Fluxo futuro:

```txt
asset
   ↓
monitoring_rule
   ↓
scan_job
   ↓
detection
   ↓
detection_evidence
```

---

## 17. Jobs Recorrentes

Ainda não implementar scheduler nesta fase.

Mas a decisão futura é:

```txt
dnl-platform cria monitoring_rules.
dnl-worker cria scan_jobs recorrentes a partir das monitoring_rules vencidas.
```

Exemplo:

```txt
monitoring_rules where next_run_at <= now() and is_active = true
```

O job não deve se repetir sozinho.

A regra de monitoramento se repete.

Correto:

```txt
monitoring_rule diária → cria um scan_job por dia
```

Errado:

```txt
scan_job eterno que fica rodando para sempre
```

---

## 18. Fora do Escopo Agora

Não implementar nesta fase:

* Supabase.
* PostgreSQL.
* Cloudflare R2.
* Upload de imagens.
* Persistência de resultados.
* Filas.
* Redis.
* BullMQ.
* Scheduler.
* PDF.
* Login.
* Dashboard.
* Admin.
* Billing.
* Crawler próprio.
* IA própria.
* Sistema jurídico automatizado.
* Integração com e-mail.
* Integração com WhatsApp.

A prioridade atual é validar o motor técnico:

```txt
Fastify + Google Vision + Playwright
```

---

## 19. Critérios de Aceite da Primeira Base

A primeira implementação deve ser considerada pronta quando:

```txt
[ ] npm install funciona.
[ ] npm run dev sobe o servidor.
[ ] npm run typecheck passa.
[ ] GET /health responde corretamente.
[ ] POST /internal/screenshots/test retorna PNG.
[ ] POST /internal/vision/test chama Google Vision quando credenciais estiverem configuradas.
[ ] Endpoints internos exigem x-internal-secret.
[ ] Payloads são validados com Zod.
[ ] Não há secrets no código.
[ ] Estrutura de pastas está organizada.
[ ] README explica como rodar e testar.
```

---

## 20. Como o Agente Deve Trabalhar

Antes de alterar código:

1. Ler este arquivo.
2. Entender que este repo é apenas o worker.
3. Não criar frontend.
4. Não criar rotas públicas de produto.
5. Não introduzir banco antes da etapa definida.
6. Não introduzir fila antes da etapa definida.
7. Manter o worker simples e modular.

Ao implementar:

1. Criar mudanças pequenas.
2. Preservar TypeScript estrito.
3. Validar entradas com Zod.
4. Separar rotas de services.
5. Tratar erros.
6. Proteger endpoints internos.
7. Atualizar README se mudar comando ou comportamento.

Antes de finalizar:

```txt
npm run typecheck
```

Também verificar:

```txt
[ ] Não há .env commitado.
[ ] Não há credencial Google commitada.
[ ] Não há secrets em logs.
[ ] Não há endpoint interno sem proteção.
[ ] Não há código de frontend.
```

---

## 21. Princípio Técnico Central

A regra principal deste repositório é:

```txt
O dnl-worker executa processamento pesado.
O dnl-platform cria intenção e mostra resultado.
O banco coordena estado.
O storage guarda arquivos.
Google Vision encontra possíveis ocorrências.
Playwright gera evidência visual.
Humano valida a infração.
```

Não sofisticar antes de validar.

A primeira vitória deste repositório é simples:

```txt
Subir o worker
testar Google Vision
testar screenshot
provar que o motor liga
```
