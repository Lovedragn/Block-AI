# DESIGN.md — Block AI (Temporal Web-Search & Memory Agent)

## 1. Core Thesis & Vision
Most web-search chat agents treat conversations as stateless or rely on naive vector embeddings over past turns. This approach fundamentally fails on **temporal queries**:
- **Temporal Delta Verification:** *"What did I ask you on 3 November? Has pricing or product status changed since then?"*
- **Chronological Identity & Context Evolution:** *"My name was Sujith Sappani, now call me Sunitha — what was my previous name? What are all my names?"*
- **Stateless Tool Overhead:** Waking up large conversational LLMs just to run function calls and classify trivial intents adds 2–5 seconds of latency and burns API rate limits.

**Block AI** solves this by establishing a strict architectural separation:
1. **Semantic System 1 Intent & Identity Router (Groq LPU ~150ms):** Ultra-fast non-autoregressive decision classification with zero regex.
2. **Local Chronological Memory Engine (SQLite WAL + FTS5 Trigram + Entity Graph <5ms):** Deterministic temporal retrieval, identity timeline tracking, and typo-tolerant search.
3. **Direct Grounded Web Synthesis (Exa Answer API):** Direct neural web search + grounded LLM answer synthesis in a single shot with zero intermediate function-calling overhead.

---

## 2. System Architecture & Execution Flow

```text
                                  +---------------------------------------+
                                  |            CLIENT (Web UI)            |
                                  |   SSE Streaming & Source Dropdown     |
                                  +-------------------+-------------------+
                                                      |
                                                      | POST /api/chat { message, sessionId }
                                                      v
                        +-----------------------------------------------------------+
                        |            BLOCK AI ORCHESTRATION LAYER (Node.js)         |
                        +-----------------------------+-----------------------------+
                                                      |
                   +----------------------------------+----------------------------------+
                   |                                                                     |
                   v                                                                     v
+--------------------------------------+                             +---------------------------------------+
|  1. GROQ LPU SEMANTIC ROUTER (~150ms)|                             |  2. LOCAL TEMPORAL ENGINE (<5ms)      |
|  Model: qwen/qwen3.8-27b             |                             |  - chrono-node past date extraction   |
|  Outputs:                            |                             |  - SQLite WAL: messages               |
|  - needs_web_search: bool            |                             |  - entity_graph: identity timeline    |
|  - extracted_user_name: string|null  |                             |  - memory_fts: FTS5 trigram recall    |
|  - name_query_type: all|prev|current |                             |  (Injects <past_conversation_context>)|
+------------------+-------------------+                             +-------------------+-------------------+
                   |                                                                     |
                   +----------------------------------+----------------------------------+
                                                      |
                                                      v
                                      +-------------------------------+
                                      |     EXECUTION ROUTER          |
                                      +---------------+---------------+
                                                      |
                      +-------------------------------+-------------------------------+
                      |                                                               |
                      | [needs_web_search == true]                                    | [needs_web_search == false]
                      v                                                               v
+-----------------------------------------------+             +-----------------------------------------------+
|  3. EXA DIRECT ANSWER AGENT                   |             |  4. LOCAL DETERMINISTIC RECALL ENGINE         |
|  Endpoint: POST https://api.exa.ai/answer     |             |  - Current Name / Previous Name / All Names   |
|  - Neural web search + grounded synthesis     |             |  - Pure Past Decisions Recall (0ms Tool Skip) |
|  - Direct inline citations [1][2]             |             |  - Then vs. Now Delta comparisons             |
|  - Emits telemetry: search_start, search_done |             +-----------------------+-----------------------+
|  - Transmits unique sources to badge tray     |                                     |
+---------------------+-------------------------+                                     |
                      |                                                               |
                      +-------------------------------+-------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |       SSE TOKEN STREAMING TO UI       |
                                  |       [⚡ Memory] [🔍 Web Search]     |
                                  +-------------------+-------------------+
                                                      | (setImmediate async post-turn)
                                                      v
                                  +---------------------------------------+
                                  |    BACKGROUND FACT & GRAPH PERSIST    |
                                  |    - Appends user identity timeline   |
                                  |    - Persists messages & turn claims  |
                                  +---------------------------------------+
```

---

## 3. Core Subsystems

### A. Semantic System 1 Classifier & Router (Groq LPU)
- **Role:** Eliminates fragile regular expressions and slow multi-turn function calling.
- **Latency:** ~100ms – 250ms on Groq custom LPU hardware (`qwen/qwen3.8-27b`).
- **Semantic Capabilities:**
  - **Zero-Regex Identity Extraction:** Understands name introductions, changes, and natural typos (e.g., *"my name i ssunitha"* -> `"Sunitha"`).
  - **Temporal Name Query Classification:** Accurately distinguishes between current name queries (*"what is my name"*), previous name queries (*"previou sname"*), and full chronological histories (*"what is my all name"*).
  - **External World Routing:** Dispatches general knowledge, product pricing, and live updates to Exa.

### B. Local Deterministic Memory Engine (SQLite)
- **Engine:** `better-sqlite3` operating with `WAL` journal mode and in-memory statement caching (protecting Node runtime isolates from GC destruction).
- **Three Data Structures:**
  1. `messages`: Raw conversation turns indexed by `session_id` and `recorded_date`.
  2. `entity_graph`: Chronological entity attribute graph tracking timelines (e.g., `User Name = Sujith Sappani` -> `User Name = Sunitha`).
  3. `memory_fts`: Full-text search with `trigram` tokenization, enabling instant fuzzy recall (e.g., `"uma"` retrieves `"Puma Velocity Nitro 3"` in 1.8ms).
- **Temporal Identity Timeline:** Preserves past identity claims so queries for previous names or full naming history resolve instantly from local storage without external API overhead.

### C. Exa Direct Answer & Grounding Engine
- **Endpoint:** `POST https://api.exa.ai/answer`
- **Single-Shot Grounding:** Bypasses legacy LLM two-step tool calling (LLM -> tool call request -> search -> LLM synthesis -> response). Instead, Exa performs real-time neural search and grounded answer synthesis in one shot.
- **Benefits:**
  - Eliminates LLM token quota exhaustion (Google Gemini 429 rate limit traps).
  - Guarantees factual answers grounded directly in live web sources.
  - Automatically supplies verified citation objects (`title`, `url`, `publishedDate`).

### D. Minimalist UI & Source Tray (Frontend)
- **Stack:** React 19, Vite, Tailwind CSS v4, Lucide Icons.
- **Clean Message Prose:** Message text displays readable prose and inline citation markers (`[1][2]`) without repetitive link lists cluttering the bottom.
- **Integrated Source Tray:** The top metadata header displays:
  - `[⚡ Xms Memory]` latency badge
  - `[🔍 Yms Web Search]` latency badge
  - `N sources >` interactive toggle that expands into a dropdown displaying all cited URLs, titles, and direct external links.

---

## 4. Key Design Decisions & Trade-Offs

| Decision | Selected Approach | Alternative Considered | Why Chosen |
| :--- | :--- | :--- | :--- |
| **Intent & Identity Router** | Groq LPU Semantic Classifier (~150ms) | Regex parsing / Heuristics | Regex breaks on common typos, varied phrasings, and multi-word names. Semantic LLM handles all natural language variations with zero maintenance. |
| **Tool Calling vs. Direct Answer** | Exa `/answer` API directly | Gemini 3 / Claude function-calling loop | Function calling requires 2 round-trips to the LLM plus intermediate tool execution (~3–5s) and frequently hits free-tier rate limits (429). Exa answers directly in ~1s. |
| **Memory Lookup Architecture** | Pre-retrieval injection into context | LLM-driven `memory_search` tool | Exposing memory as a second tool violates the single-tool constraint and introduces unnecessary LLM latency. Injected pre-retrieval executes in <5ms. |
| **Fuzzy Search** | SQLite FTS5 `trigram` | Vector Embeddings (Chroma/Pinecone) | Vector search requires external services, embedding model API calls, and higher memory overhead. FTS5 trigram runs embedded locally in 2ms. |
| **Citation Presentation** | Header Source Tray Dropdown | Markdown link list inside message | Appending long source link lists directly into message text creates visual clutter. Moving sources into the header tray preserves clean readability while keeping citations accessible. |

---

## 5. Security & Persistence Guarantees
- **Data Isolation:** All database tables (`messages`, `entity_graph`, `memory_fts`) reside locally in `./data/agent.db`. No conversation history or personal identity data is stored in third-party clouds.
- **Repository Shielding:** Comprehensive root and backend `.gitignore` policies strictly shield all `.env` secrets, database binaries (`*.db`, `*.db-wal`), and build directories from source control.
- **Graceful Fallbacks:** If network or API outages occur, the system falls back to deterministic local memory recall and clear error boundaries without crashing the Node runtime.
