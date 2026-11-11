# DESIGN.md — Temporal Search Agent

## 1. Core Thesis
Most web-search chat agents treat every turn as stateless or rely on naive vector RAG over past messages. That approach fails on **temporal delta queries** (e.g., *"What did I ask you on 3 November? Is your answer still correct today?"* or *"Last Tuesday we shortlisted 5 CRMs—has pricing changed since?"*). 

To answer fast and accurately while strictly adhering to the **single-tool constraint (`web_search`)**, this system separates **deterministic temporal memory retrieval** (handled by an orchestration pre-pass over local SQLite + FTS5) from **live external verification** (handled by the reasoning LLM using parallel `web_search` tool calls).

---

## 2. System Architecture

```text
+-----------------------------------------------------------------------------------+
|                                  CLIENT (Web / CLI)                               |
|                         Streams SSE Tokens & Tool Status                          |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v  POST /api/chat (message, sessionId)
+-----------------------------------------------------------------------------------+
|                            ORCHESTRATION LAYER (Node.js / TS)                     |
|                                                                                   |
|  1. Temporal Intent & Entity Router (Fast LLM: Gemini 3 Flash / Haiku)            |
|     - Input: User Prompt + Current ISO Date/Day                                   |
|     - Output: { needsHistory: bool, startDate, endDate, keywords[] }              |
|                                         |                                         |
|                                         v                                         |
|  2. Local Memory Engine (better-sqlite3 + SQLite FTS5)                            |
|     +--------------------------------------------------------------------------+  |
|     | Tables:                                                                  |  |
|     | - messages (id, session_id, role, content, created_at)                   |  |
|     | - memory_facts (id, recorded_date, topic, entities_json, claims_summary) |  |
|     +--------------------------------------------------------------------------+  |
|                                         |                                         |
|                                         v  Injects <past_conversation_context>    |
|  3. Primary Reasoning Agent (Claude 4.5 Sonnet / GPT-5.2)                         |
|     - Compares injected historical claims/entities against current date           |
|     - Calls ONLY ONE tool: web_search(queries[], start_published_date?)           |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v  Parallel Search Execution
+-----------------------------------------------------------------------------------+
|                         SINGLE TOOL: WEB SEARCH (Exa / Tavily)                    |
|     - Executes batched parallel queries (e.g. 5 CRM pricing + changelog pages)    |
|     - Returns clean Markdown snippets & live pricing tables                       |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v  Async Post-Turn Hook (Non-blocking)
+-----------------------------------------------------------------------------------+
|                         BACKGROUND FACT EXTRACTOR (Async)                         |
|     - Extracts entities, pricing claims, & decisions from completed turn          |
|     - Writes structured row to `memory_facts` indexed by YYYY-MM-DD               |
+-----------------------------------------------------------------------------------+