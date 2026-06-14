# Skill Builder End-to-End Architecture Design

## Current State Analysis

| Component | Status | Gap |
|-----------|--------|-----|
| **Worker** | Basic KV skill CRUD (GET/POST /api/skills, GET /api/skills/:id) | No Workers AI binding, no agent/chat endpoints, no skill execution |
| **Web App** | Skill list/create UI, simulated agent chat, "Publish" + "Registry" buttons non-functional | Silent fallback on API failure, no real LLM, no skill sandbox |
| **CLI** | Mock registry (static array), simulated install/publish | Points to external registry, not Worker API |
| **Terraform** | KV namespace, Worker script, Pages, custom domain | No Workers AI binding, Worker script outdated |

---

## Design Principles

1. **Speed + Quality Balance**: Good patterns, minimal layering, practical error handling
2. **Single Source of Truth**: Worker API is the registry for both Web and CLI
3. **TypeScript First**: Shared types between Web/CLI/Worker via `packages/shared`
4. **Graceful Degradation**: UI shows errors but remains functional; no silent fallbacks
5. **Deploy via Terraform**: All infrastructure changes in TF, single `terraform apply`

---

## New API Endpoints

### Worker (skill-persistence-worker.js)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agent/chat` | Agent routing + LLM inference via Workers AI |
| `POST` | `/api/skills/:id/execute` | Skill sandbox: run skill prompt via Workers AI |
| `GET` | `/api/skills` | List skills (existing) |
| `POST` | `/api/skills` | Create skill (existing) |
| `GET` | `/api/skills/:id` | Get skill (existing) |

### Request/Response Types

```typescript
// packages/shared/src/types.ts
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  persona: string;
  promptTemplate?: string;      // NEW: for skill execution
  instructions?: string;         // NEW: agent instructions
  createdAt: string;
  updatedAt: string;
}

export interface AgentChatRequest {
  messages: AgentMessage[];
  skillId?: string;              // optional skill context
  taskOutline?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentChatResponse {
  message: AgentMessage;
  routedSkillId?: string;
}

export interface SkillExecuteRequest {
  input: string;                 // user input to the skill
  variables?: Record<string, string>; // template variables
}

export interface SkillExecuteResponse {
  output: string;
  tokensUsed?: number;
}

export interface ApiError {
  error: string;
  code?: string;
}
```

---

## Data Flow

### 1. Agent Chat Flow (Web App → Worker → Workers AI)

```
User types in Agent Console
       │
       ▼
Web App: POST /api/agent/chat { messages, skillId, taskOutline }
       │
       ▼
Worker: Builds system prompt from skill + task + persona
       │
       ▼
Workers AI (Llama 3.1 8B): Inference
       │
       ▼
Worker: Returns { message, routedSkillId }
       │
       ▼
Web App: Updates chat UI
```

### 2. Skill Execution Sandbox (Web App → Worker → Workers AI)

```
User clicks "Run Skill" or Agent routes to skill
       │
       ▼
Web App: POST /api/skills/:id/execute { input, variables }
       │
       ▼
Worker: Loads skill from KV, builds prompt from template + variables
       │
       ▼
Workers AI (Llama 3.1 8B): Inference
       │
       ▼
Worker: Returns { output, tokensUsed }
       │
       ▼
Web App: Shows result in chat/preview
```

### 3. Publish Skill (Web App → Worker KV)

```
User fills Skill Editor, clicks "Publish agent skill"
       │
       ▼
Web App: POST /api/skills { id, name, description, category, persona, promptTemplate, instructions }
       │
       ▼
Worker: PUT to KV (skills/:id)
       │
       ▼
Web App: Skill appears in library, available for agent/chat/execute
```

### 4. Skill Registry (CLI ↔ Worker API)

```
CLI: skill-builder install <skill-id>
       │
       ▼
CLI: GET /api/skills/:id
       │
       ▼
Worker: Returns skill from KV
       │
       ▼
CLI: Saves to local frontier.config.json

CLI: skill-builder publish <path>
       │
       ▼
CLI: Reads local skill manifest
       │
       ▼
CLI: POST /api/skills { skill }
       │
       ▼
Worker: PUT to KV
```

---

## Concrete File Changes

### 1. NEW: `packages/shared/src/types.ts`
Shared TypeScript types for Web, CLI, Worker.

### 2. NEW: `packages/shared/src/api.ts`
Shared API client with typed endpoints, error handling.

### 3. MODIFY: `worker/skill-persistence-worker.js` → `worker/index.ts`
- Rewrite in TypeScript for type safety
- Add Workers AI binding (`env.AI`)
- Implement `/api/agent/chat` and `/api/skills/:id/execute`
- Keep KV persistence
- Proper error responses (no silent failures)

### 4. MODIFY: `worker/wrangler.toml`
- Add `ai` binding
- Update `main` to compiled `dist/index.js`
- Add `compatibility_flags = ["nodejs_compat"]`

### 5. MODIFY: `packages/web/src/services/skillApi.ts`
- Import shared types + API client
- Replace silent fallback with proper error UI
- Add `chatWithAgent()`, `executeSkill()` functions
- Wire "Publish skill" button → `saveSkill()` + `executeSkill()` preview
- Wire "Skill registry" button → fetch + display registry modal

### 6. MODIFY: `packages/web/src/App.tsx`
- Replace simulated `runAgent()` with real API call
- Add skill execution sandbox UI (sidebar or modal)
- Connect "Publish agent skill" button
- Connect "Skill registry" / "Open agent registry" buttons
- Loading/error states for all async operations

### 7. MODIFY: `packages/cli/src/skill-registry.ts` → `api-client.ts`
- Remove mock registry
- Add typed API client pointing to Worker API
- `getSkill(id)`, `publishSkill(skill)`

### 8. MODIFY: `packages/cli/src/index.ts`
- Use new API client
- `--registry` flag defaults to Worker API URL
- `install`: GET `/api/skills/:id`
- `publish`: POST `/api/skills`

### 9. MODIFY: `terraform/main.tf`
- Add `cloudflare_workers_ai` binding to Worker script
- Update Worker script path to `dist/index.js`
- Add `nodejs_compat` compatibility flag

### 10. NEW: `worker/tsconfig.json` + `worker/package.json`
- TypeScript config for Worker
- Build script: `tsc && wrangler deploy`

### 11. MODIFY: `.github/workflows/deploy.yml`
- Build Worker TypeScript before deploy
- Use `wrangler deploy` with compiled output

---

## Worker Implementation Details

### Workers AI Integration

```javascript
// In handleRequest, for POST /api/agent/chat:
const { messages, skillId, taskOutline } = await request.json();
const skill = skillId ? await SKILL_STORE.get(`skills/${skillId}`, 'json') : null;

const systemPrompt = buildSystemPrompt(skill, taskOutline);
const aiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
  messages: aiMessages,
  max_tokens: 1024,
  temperature: 0.7,
});

return Response.json({ message: { role: 'assistant', content: response.response } });
```

### Skill Execution

```javascript
// POST /api/skills/:id/execute
const skill = await SKILL_STORE.get(`skills/${id}`, 'json');
if (!skill) return 404;

const prompt = renderTemplate(skill.promptTemplate || skill.instructions, {
  input: requestBody.input,
  ...requestBody.variables,
});

const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
  messages: [{ role: 'user', content: prompt }],
  max_tokens: 2048,
});

return Response.json({ output: response.response, tokensUsed: response.usage?.total_tokens });
```

---

## Trade-offs & Decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| **TypeScript for Worker** | Type safety across stack, catches KV schema drift | Extra build step, but `tsc` is fast |
| **Shared `packages/shared`** | Single source of truth for types/API | New package, but minimal (2 files) |
| **Workers AI (Llama 3.1 8B)** | Native, no external API keys, low latency | Less capable than GPT-4, but sufficient for skill routing/execution |
| **No separate registry service** | Worker KV is the registry; CLI + Web use same API | Simpler, but no versioning/search yet (v2) |
| **Inline prompt templates in Skill** | Keeps skill self-contained, no separate prompt store | Larger KV values, but skills are small |
| **Terraform manages AI binding** | Infrastructure as code, reproducible | Requires Cloudflare provider v4+ |
| **Error boundaries in Web UI** | No silent fallbacks, user sees failures | More UI code, but better UX |

---

## Deployment Steps

```bash
# 1. Install Worker deps
cd worker && npm install

# 2. Build Worker
npm run build  # compiles TS → dist/index.js

# 3. Terraform apply (adds AI binding, updates script)
cd ../terraform && terraform apply

# 4. Deploy Worker script (wrangler uses compiled dist)
wrangler deploy worker/dist/index.js --name skill-builder-landing-api --env production

# 5. Build & deploy Web
cd ../packages/web && npm run build
wrangler pages deploy dist --project-name skill-builder-landing --branch main
```

Or push to `main` → GitHub Actions does all of the above.

---

## File Tree After Changes

```
skill-builder-landing/
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   └── api.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   ├── skillApi.ts      (updated)
│   │   │   │   └── agentApi.ts      (NEW: chat/execute)
│   │   │   ├── components/          (NEW: RegistryModal, SkillSandbox)
│   │   │   └── App.tsx              (updated)
│   │   └── ...
│   └── cli/
│       ├── src/
│       │   ├── api-client.ts        (NEW: replaces skill-registry.ts)
│       │   └── index.ts             (updated)
│       └── ...
├── worker/
│   ├── src/
│   │   └── index.ts                 (NEW: TS worker with AI)
│   ├── dist/                        (compiled output)
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml                (updated)
├── terraform/
│   └── main.tf                      (updated: AI binding)
└── .github/workflows/deploy.yml     (updated: build worker TS)
```

---

## Next Steps (Priority Order)

1. **Create `packages/shared`** - Types + API client
2. **Rewrite Worker in TypeScript** - Add AI endpoints, keep KV
3. **Update Terraform** - Add AI binding, point to compiled Worker
4. **Update Web App** - Real agent chat, skill sandbox, wire buttons
5. **Update CLI** - Point to Worker API
6. **Deploy via Terraform** - Verify end-to-end

This design delivers all requirements with ~10 focused file changes, shared types for safety, and deploys via existing Terraform pipeline.
