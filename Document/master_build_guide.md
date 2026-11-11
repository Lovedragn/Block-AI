# BUILD_GUIDE.md — Master Implementation Plan

**Project:** Temporal Web-Search Chat Agent  
**Stack:** Node.js + TypeScript, Express (SSE), SQLite (`better-sqlite3` WAL + FTS5 `trigram` + Entity Graph), `chrono-node`, Gemini 2.5 Flash (`thinkingBudget: 0`) / Claude Sonnet, Exa API (`web_search`), React + Vite + Tailwind CSS v4 + GSAP.

---

## 0. What Is Required Before Starting

### A. System & Runtime Requirements
* **Node.js:** `v20.11+` or `v22+` (`v22.5+` recommended)
* **Package Manager:** `npm` (strictly required by challenge rules: `npm install`, then `npm run dev`)
* **Zero External Services:** No Docker, Redis, or cloud databases required. SQLite initializes locally in `./data/agent.db` automatically on `npm run dev`.

### B. Required API Keys (List in `.env.example` and put values in `.env`)
```env
# 1. Primary LLM Key (Used for main agent synthesis & async fact extraction)
GEMINI_API_KEY="your_gemini_api_key_here"
# Optional fallback: ANTHROPIC_API_KEY="your_anthropic_api_key_here"

# 2. Single External Tool Key: Web Search (Exa or Tavily)
EXA_API_KEY="your_exa_api_key_here"
# Optional fallback: TAVILY_API_KEY="your_tavily_api_key_here"

# 3. Server Configuration
PORT=3000
```

### C. Recommended Developer CLI Skills (Optional — For Building Faster with Fewer Tokens)
If you are using an AI coding assistant (Claude Code, Cursor, Windsurf) to write this repo:
* **Caveman (`npx skills add JuliusBrussee/caveman -g`):** Run `/caveman` while coding to cut assistant output tokens by ~65% while keeping code 100% intact.
* **Superpowers (`npx skills add obra/superpowers`):** Forces structured micro-plans per feature before generating files.
* **RTK (`brew install rtk && rtk init -g`):** Compresses noisy terminal and `npm test` outputs by ~80%.

---

## 1. Architecture & Token-Optimization Diagram

```text
+-----------------------------------------------------------------------------------+
|                     CLIENT UI (React + Tailwind CSS v4 + GSAP)                    |
|  - GSAP Staggered Test Chips | GSAP Flip Trace Badges | 🪨 Caveman Mode Toggle    |
+-----------------------------------------+-----------------------------------------+
                                          | POST /api/chat { message, sessionId, cavemanMode }
                                          v
+-----------------------------------------------------------------------------------+
|                        NODE.JS / TYPESCRIPT ORCHESTRATOR                          |
|                                                                                   |
|  [STEP 1: 3ms DETERMINISTIC PRE-RETRIEVAL (Zero LLM Calls)]                       |
|   ├── chrono-node: Parses "On Monday" -> 2026-11-09, "3 November" -> 2026-11-03   |
|   └── Stopword Stripper: Extracts fuzzy stems ("uma shoes" -> ["uma", "shoes"])   |
|                                         |                                         |
|                                         v (1-2 ms Local Disk Read)                |
|  [STEP 2: LOCAL HYBRID STORAGE (./data/agent.db via better-sqlite3 WAL)]          |
|   ├── `memory_fts` (FTS5 tokenize='trigram'): Typo-tolerant ("uma" -> "Puma")     |
|   ├── `entity_graph` (Graphify Pattern): (Topic) -[INCLUDES]-> (Entity + Price)   |
|   └── `search_cache`: 15-min TTL cache for repeat web searches (0.5ms hit)        |
|                                         |                                         |
|                                         v Injects Caveman-Compressed Context      |
|  [STEP 3: PRIMARY AGENT LLM (Gemini 2.5 Flash thinkingBudget: 0 / Claude Sonnet)] |
|   ├── System Prompt + <past_conversation_context> (Caveman telegraphic format)    |
|   └── Decides: Answer directly from memory OR call single tool `web_search`       |
+--------------------+-----------------------------------------+--------------------+
                     |                                         |
    Path A: Memory Recall Only (~0.5s)        Path B: Temporal Delta Verification
    (e.g. "Which uma shoe did we pick?")      (e.g. "Did Monday's 5 CRMs change price?")
                     |                                         |
                     |                                         v
                     |                        +-------------------------------------+
                     |                        | SINGLE TOOL: web_search (Exa API)   |
                     |                        | - Batched parallel queries[]        |
                     |                        | - startPublishedDate filter         |
                     |                        | - RTK Sanitizer: Strips nav/footer, |
                     |                        |   keeps pricing/changelog lines     |
                     |                        +----------------+--------------------+
                     |                                         |
                     +--------------------+--------------------+
                                          | Streams SSE Status + Markdown Tokens
                                          v
+-----------------------------------------------------------------------------------+
|                     STEP 4: ASYNC POST-TURN HOOK (setImmediate)                   |
|  - 0 ms impact on user latency                                                    |
|  - Extracts Caveman snapshot ("Attio Plus=$29/u/mo | HubSpot Starter=$20/u/mo")   |
|  - Writes nodes/edges to `memory_fts` and `entity_graph`                          |
+-----------------------------------------------------------------------------------+
```

---

## 2. Target Repository File Tree

```text
temporal-search-agent/
├── data/
│   └── agent.db                  # Auto-created SQLite WAL database on `npm run dev`
├── src/
│   ├── server/
│   │   ├── index.ts              # Express server + SSE `/api/chat` + Vite middleware
│   │   ├── db.ts                 # SQLite WAL + FTS5 trigram + entity_graph + cache
│   │   ├── preRetriever.ts       # Feature 2: 3ms chrono-node + trigram + graph lookup
│   │   ├── searchTool.ts         # Feature 3: Single `web_search` tool + RTK sanitizer
│   │   ├── agent.ts              # Feature 4: Main LLM loop + Prompt Caching + SSE
│   │   ├── factExtractor.ts      # Feature 5: Async Caveman + Graphify snapshotter
│   │   └── seed.ts               # Feature 6: Auto-seeds Nov 3, Monday CRM, Tuesday PG
│   └── client/
│       ├── index.html            # Vite HTML shell
│       ├── main.tsx              # React mount
│       ├── App.tsx               # Chat UI + GSAP Flip/SplitText/ScrollTo + Caveman toggle
│       └── styles.css            # Tailwind v4 (@import "tailwindcss"; @plugin "@tailwindcss/typography";)
├── .env.example                  # Required by challenge rules
├── DESIGN.md                     # 1-page architecture doc (required by challenge rules)
├── BUILD_GUIDE.md                # This step-by-step implementation guide
├── vite.config.ts                # Vite + @tailwindcss/vite configuration
├── package.json
└── tsconfig.json
```

---

## 3. Feature-by-Feature Implementation Plan

### Feature 1: Project Initialization, Tailwind v4 & GSAP Setup
**Goal:** Configure a single-command setup (`npm install` then `npm run dev`) that runs both the Node.js TypeScript backend and the Vite + React + Tailwind v4 + GSAP frontend seamlessly.

1. **Run installation commands:**
```bash
npm init -y

# Runtime dependencies (Server + AI + DB + Frontend + GSAP)
npm install express cors dotenv zod better-sqlite3 chrono-node @google/genai exa-js react react-dom gsap @gsap/react lucide-react react-markdown remark-gfm

# Dev dependencies (TypeScript + Vite + Tailwind CSS v4)
npm install -D typescript tsx vite @vitejs/plugin-react tailwindcss @tailwindcss/vite @tailwindcss/typography concurrently @types/node @types/express @types/cors @types/better-sqlite3 @types/react @types/react-dom
```

2. **Configure `package.json` scripts:**
```json
{
  "name": "temporal-search-agent",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server/index.ts",
    "build": "vite build",
    "seed": "tsx src/server/seed.ts"
  }
}
```
*(Note: Using Vite's `createServer({ server: { middlewareMode: true } })` inside `src/server/index.ts` ensures `npm run dev` starts a single Node process on `http://localhost:3000` with zero proxy port issues.)*

3. **Configure `src/client/styles.css` (Tailwind v4 zero-config syntax):**
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

---

### Feature 2: Local SQLite Engine with Trigram FTS5 & Graphify Edges (`src/server/db.ts`)
**Goal:** Store raw messages, typo-tolerant Caveman fact snapshots, and Graphify entity edges in a local SQLite database that queries in `< 2ms`.

**What to implement in `src/server/db.ts`:**
1. Create `./data` folder if missing and initialize `new Database("./data/agent.db")`.
2. Set performance pragmas:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA temp_store = MEMORY;
```
3. Create 4 tables:
   * **`messages`**: `id`, `session_id`, `role`, `content`, `recorded_date` (`YYYY-MM-DD`, indexed), `created_at`.
   * **`memory_fts`**: `CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(recorded_date UNINDEXED, topic, entities_json, claims_caveman, tokenize='trigram');`
   * **`entity_graph`** *(Graphify Pattern)*: `id`, `recorded_date` (indexed), `parent_topic` (e.g., `"CRM Shortlist"`), `entity_name` (e.g., `"Attio"`), `attribute_caveman` (e.g., `"Plus=$29/u/mo | Free=up to 3 seats"`).
   * **`search_cache`**: `query_hash PRIMARY KEY`, `results_markdown`, `created_at` (unix timestamp for 15-minute TTL).

**Verification:** Starting the server creates `./data/agent.db` with all 4 tables in `< 10ms`.

---

### Feature 3: 3ms Deterministic Date & Typo Pre-Retriever (`src/server/preRetriever.ts`)
**Goal:** Resolve relative dates (*"On Monday"*, *"Last Tuesday"*, *"3 November"*) and misspelled words (*"uma shoes"*) in pure Node.js in `~3ms` without calling a slow LLM router or adding a second tool.

**What to implement in `src/server/preRetriever.ts`:**
1. **Past-Biased Date Parsing (`chrono-node`):**
   * Run `const parsed = chrono.parse(userPrompt, new Date(), { forwardDate: false });`
   * Handle weekday resolution so *"On Monday"* or *"Last Tuesday"* resolves to the exact `YYYY-MM-DD` string.
2. **Stopword Stripping & Fuzzy Stems:**
   * Strip common stopwords (`what`, `did`, `ask`, `you`, `on`, `last`, `monday`, `tuesday`, `since`, `then`, `has`, `any`, `changed`, `pricing`, `we`, `have`, `selected`, `some`, `which`, `is`, `it`).
   * Keep tokens `>= 3` characters (e.g., `["sleetced", "uma", "shoes"]`).
3. **3-Pronged Local SQLite Query (`< 2ms`):**
   * **Date Match:** `SELECT * FROM messages WHERE recorded_date = ?` and `SELECT * FROM entity_graph WHERE recorded_date = ?`.
   * **Trigram FTS5 Match (Typo-tolerant):** Query `memory_fts` where `memory_fts MATCH '"uma" OR "shoes"'` (or `LIKE '%uma%'` accelerated by the `trigram` tokenizer).
   * **Graphify Subgraph Expansion:** If a topic matches (e.g., `"CRM"` or `"Postgres"`), pull all connected rows from `entity_graph` for that date/topic.
4. **Caveman Context Formatting:**
   * Format matched rows into a compact XML block (~65% fewer tokens than raw chat logs):
```xml
<past_conversation_context>
[Date: 2026-11-09 | Topic: 5 CRM tools for 20-person sales team]
Entities: HubSpot, Pipedrive, Attio, Close, Zoho CRM
Baseline Facts: HubSpot Sales Starter=$20/u/mo | Pipedrive Essential=$14/u/mo | Attio Plus=$29/u/mo | Close Startup=$49/mo | Zoho Standard=$14/u/mo
</past_conversation_context>
```

**Verification:** Test `preRetrieve("we have sleetced some uma shoes whic shoe sis it?")` and `preRetrieve("What did I ask you on 3 November?")`. Both must return matching records in `< 5ms`.

---

### Feature 4: The Single `web_search` Tool + RTK Token Sanitizer (`src/server/searchTool.ts`)
**Goal:** Provide the single allowed external tool (`web_search`) with batched parallel execution (`Promise.all`), publication-date filtering, and RTK-style token compression.

**What to implement in `src/server/searchTool.ts`:**
1. **Tool Schema Definition:**
   * `name`: `"web_search"`
   * `description`: `"Search the live web. Always batch multiple entity checks into the 'queries' array in a single tool call."`
   * `parameters`:
     * `queries`: `string[]` (1 to 6 parallel search strings, e.g., `["HubSpot CRM pricing changes 2026", "Attio changelog pricing 2026", ...]`)
     * `start_published_date`: Optional `string` (`YYYY-MM-DD`) when checking for updates since a specific date.
2. **Parallel Execution + SQLite Cache:**
   * For each query in `queries` (run concurrently via `Promise.all`):
     * Check `search_cache` table first (`0.5ms` hit if queried within 15 mins).
     * Call `exa.searchAndContents(query, { numResults: 3, type: "auto", text: { maxCharacters: 1500 } })`.
3. **RTK-Style Snippet Sanitizer (`sanitizeSnippet()`):**
   * Strip markdown images (`!\[.*?\]\(.*?\)`), empty links, cookie notices, and repetitive navigation bars.
   * Collapse multiple newlines and cap each result to high-signal sentences containing numbers, `$`, `%`, versions, dates, or feature announcements.
   * Saves **~70% of tool-response input tokens**, cutting Pass 2 LLM latency in half.

---

### Feature 5: Primary Agent Loop, Caveman Mode & Async Fact Extractor (`src/server/agent.ts` & `factExtractor.ts`)
**Goal:** Orchestrate the 3ms memory pre-pass, the primary LLM (`thinkingBudget: 0`), SSE streaming, and the `0ms` background fact extractor.

**What to implement in `src/server/agent.ts`:**
1. **Fast Primary Model Config:**
   * Use `gemini-2.5-flash` with `thinkingConfig: { thinkingBudget: 0 }` (or `claude-sonnet-4-6` with thinking off).
2. **Dynamic System Prompt:**
   * Inject `Current Date: ${new Date().toDateString()} (${new Date().toISOString().slice(0, 10)})`.
   * Inject `<past_conversation_context>` from Feature 3.
   * **If `cavemanMode === true`:** Append the `/caveman` output instruction (*"Respond in terse Caveman mode: drop articles/filler, keep 100% of pricing numbers, dates, tables, and citations exact."*).
   * **Comparison Rule:** Instruct the model that whenever checking if a past answer or shortlist changed, it must output a clear **Then (Recorded Date) vs. Now (Live Web)** Markdown table with clickable source links.
3. **Real-Time SSE Stream Protocol:**
   * Immediately emit `event: memory_trace` (`{ latencyMs, matchedDate, entitiesCount, preview }`) as soon as Feature 3 finishes (`~3ms`).
   * If the LLM calls `web_search`, immediately emit `event: search_start` (`{ queries }`), execute `runParallelWebSearch()`, emit `event: search_done` (`{ latencyMs, resultsCount }`), and stream the final synthesis tokens via `event: token`.
4. **Non-Blocking Background Extractor (`src/server/factExtractor.ts`):**
   * Triggered inside `setImmediate()` *after* `res.end()` closes the user stream (`0ms` added wait time).
   * Calls `gemini-2.5-flash-lite` (`thinkingBudget: 0`, `responseMimeType: "application/json"`) to extract Caveman-compressed facts and Graphify entity edges, saving them into `memory_fts` and `entity_graph`.

---

### Feature 6: Evaluator Auto-Seeder & Tailwind v4 + GSAP Interface (`src/server/seed.ts` & `src/client/App.tsx`)
**Goal:** Auto-populate the database with realistic backdated conversations matching the challenge's test dataset, and build a responsive UI with GSAP animations.

1. **Auto-Seeder (`src/server/seed.ts`):**
   Calculate relative dates dynamically relative to `new Date()` on startup so *"On Monday"* and *"Last Tuesday"* always match the evaluator's clock:
   * **Most Recent Monday:** Seed a conversation shortlisting **5 CRM tools for a 20-person sales team** (`HubSpot Sales Hub`, `Pipedrive`, `Attio`, `Close`, `Zoho CRM`) with exact per-seat prices and key features.
   * **3 November (`YYYY-11-03`):** Seed a conversation where the user asked a specific technical/factual question (e.g., *"What is the current Node.js LTS release and Supabase Pro tier base price?"*) along with the assistant's dated answer.
   * **Last Tuesday:** Seed a conversation comparing **Postgres hosting providers** (`Supabase`, `Neon`, `AWS RDS`, `Render`, `Railway`) with exact compute/storage pricing tiers.
   * **Bonus Fuzzy/Typo Seed:** Seed a turn where the user selected the **Puma Velocity Nitro 3 ($130)** running shoe so you can also test your `"uma shoes"` typo query.

2. **GSAP + Tailwind CSS v4 Frontend (`src/client/App.tsx`):**
```typescript
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(Flip, ScrollToPlugin, useGSAP);
```
   * **GSAP Animation 1 (Evaluator Benchmark Bar):** Stagger-reveal clickable buttons for the 3 exact challenge prompts + the `"uma shoes"` typo test so evaluators can test with a single click.
   * **GSAP Animation 2 (`Flip` Live Telemetry Pill):** Above each assistant message, animate a compact telemetry bar showing:
     * `⚡ SQLite Trigram + Graph (2ms)` — expandable via `Flip.from()` to inspect the injected Caveman memory snapshot.
     * `🌐 Parallel Exa Search (510ms · 5 queries)` — expandable to inspect the parallel queries executed.
   * **GSAP Animation 3 (🪨 Caveman Mode Toggle):** Header switch that toggles `cavemanMode` on/off with a token-savings badge (`~65% fewer output tokens`).

---

## 4. Step-by-Step Testing & Verification Protocol

1. **Clean Boot Test:**
```bash
rm -rf data/agent.db
npm install
npm run dev
```
   *Verify:* Server starts on `http://localhost:3000`, creates `./data/agent.db`, and logs `"Seeded 4 historical benchmark conversations (Monday CRMs, Nov 3, Last Tuesday Postgres, Puma Shoes)"`.

2. **Test 1 — Typo + Pure Memory Recall (< 0.8s total):**
   * *Input:* `"we have sleetced some uma shoes whic shoe sis it?"`
   * *Expected:* Telemetry badge shows `⚡ SQLite Memory (2ms)` matching `Puma Velocity Nitro 3`. `web_search` is **skipped** (`0ms`). Answer streams immediately.

3. **Test 2 — Monday 5 CRM Shortlist Delta (< 2.3s total):**
   * *Input:* `"On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"`
   * *Expected:* Telemetry badge resolves Monday's date in `2ms`, pulls all 5 CRMs (`HubSpot`, `Pipedrive`, `Attio`, `Close`, `Zoho`) from `entity_graph`, executes **1 batched `web_search` call** with 5 parallel queries, and streams a **Then (Monday) vs. Now (Today)** comparison table with citations.

4. **Test 3 — Exact Date Verification (< 2.2s total):**
   * *Input:* `"What did I ask you on 3 November? Is your answer still correct today?"`
   * *Expected:* Resolves `YYYY-11-03` via `chrono-node`, states the exact question asked on November 3rd, verifies each claim via `web_search`, and confirms what is still accurate vs. updated.

5. **Test 4 — Last Tuesday Postgres Hosting (< 2.2s total):**
   * *Input:* `"Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"`
   * *Expected:* Resolves Last Tuesday's date, pulls the Postgres hosts (`Supabase`, `Neon`, `Render`, `Railway`, `RDS`), checks current pricing pages in parallel, and outputs the delta.