import 'chrono-node';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  initDatabase,
  clearDatabase,
  getOrCreateSession,
  listSessions,
  getSessionMessages,
  getAllEntityGraphNodes,
  getAllMemoryFtsRows,
} from './db/index.js';
import { seedBenchmarkData } from './services/seed.js';
import { runTemporalAgent } from './services/agent.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize SQLite database schema
initDatabase();

// Health Check
app.get('/api/health', (_req, res) => {
  console.log('[API TRIGGER] GET /api/health');
  const responseData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Temporal Web-Search Agent Backend (Pure JavaScript)',
  };
  console.log('[API RESPONSE] GET /api/health ->', responseData);
  res.json(responseData);
});

// List Sessions
app.get('/api/sessions', (_req, res) => {
  console.log('[API TRIGGER] GET /api/sessions');
  const sessions = listSessions();
  console.log(`[API RESPONSE] GET /api/sessions -> returned ${sessions.length} sessions`);
  res.json({ sessions });
});

// Get Messages for a Session
app.get('/api/sessions/:id/messages', (req, res) => {
  console.log(`[API TRIGGER] GET /api/sessions/${req.params.id}/messages`);
  const messages = getSessionMessages(req.params.id);
  console.log(`[API RESPONSE] GET /api/sessions/${req.params.id}/messages -> returned ${messages.length} messages`);
  res.json({ messages });
});

// List All Entity Graph Nodes & FTS Memory
app.get('/api/facts', (_req, res) => {
  console.log('[API TRIGGER] GET /api/facts');
  const graphNodes = getAllEntityGraphNodes(100);
  const ftsRows = getAllMemoryFtsRows(100);
  console.log(`[API RESPONSE] GET /api/facts -> ${graphNodes.length} nodes, ${ftsRows.length} fts rows`);
  res.json({ graphNodes, ftsRows });
});

// Manual Seed
app.post('/api/seed', (_req, res) => {
  console.log('[API TRIGGER] POST /api/seed');
  const result = seedBenchmarkData();
  console.log('[API RESPONSE] POST /api/seed -> seeded successfully');
  res.json({ success: true, result });
});

// Reset / Clear database
app.post('/api/reset', (_req, res) => {
  console.log('[API TRIGGER] POST /api/reset (Wiping all data)');
  clearDatabase();
  console.log('[API RESPONSE] POST /api/reset -> Database cleared');
  res.json({ success: true, message: 'Database cleared completely.' });
});

// SSE Chat Endpoint
app.post('/api/chat', async (req, res) => {
  const { message, sessionId, cavemanMode, referenceDate } = req.body;
  console.log('\n========================================');
  console.log('[API TRIGGER] POST /api/chat');
  console.log('[REQUEST PAYLOAD]:', { sessionId, message, cavemanMode });

  if (!message || typeof message !== 'string') {
    console.warn('[API RESPONSE] 400 Bad Request: Message required');
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  const session = getOrCreateSession(sessionId);

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    if (event !== 'token') {
      console.log(`[API SSE SEND] Event: [${event}] ->`, data);
    }
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const refDate = referenceDate ? new Date(referenceDate) : new Date();
    await runTemporalAgent({
      sessionId: session.id,
      userMessage: message,
      cavemanMode: Boolean(cavemanMode),
      onEvent: sendEvent,
      referenceDate: isNaN(refDate.getTime()) ? new Date() : refDate,
    });
    console.log(`[API RESPONSE] POST /api/chat successfully completed for session [${session.id}]`);
  } catch (err) {
    console.error('[API RESPONSE ERROR] Chat pipeline error:', err);
    sendEvent('error', { error: err?.message || 'Internal Agent Pipeline Error' });
  } finally {
    res.end();
    console.log('========================================\n');
  }
});

// Server startup - updated with multi-turn memory
app.listen(PORT, () => {
  console.log(`[Backend] 🚀 Temporal Search Agent (Pure JavaScript) running on http://localhost:${PORT}`);
});

