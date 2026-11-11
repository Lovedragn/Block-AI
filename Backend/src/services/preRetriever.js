import * as chrono from 'chrono-node';
import { db } from '../db/index.js';
import { evaluateIntentWithGroq } from './groqClient.js';

const STOPWORDS = new Set([
  'what', 'did', 'ask', 'you', 'on', 'last', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday', 'since', 'then', 'has', 'any',
  'have', 'selected', 'some', 'which', 'shoe', 'shoes', 'is', 'it', 'the',
  'about', 'for', 'with', 'and', 'from', 'our', 'were', 'tell', 'show', 'me'
]);

/**
 * 3ms Zero-LLM Deterministic Pre-Retrieval (Chrono-node + FTS5 Trigram + Entity Graph)
 */
export async function preRetrieve(userPrompt, referenceDate = new Date()) {
  const start = performance.now();
  let matchedDate;

  // 1. Past-Biased Date Parsing via chrono-node
  const parsedDates = chrono.parse(userPrompt, referenceDate, { forwardDate: false });
  if (parsedDates.length > 0) {
    const d = parsedDates[0].start.date();
    matchedDate = d.toISOString().slice(0, 10);
  }

  // Fallback weekday detection
  const lowerPrompt = userPrompt.toLowerCase();
  if (!matchedDate) {
    if (lowerPrompt.includes('monday')) {
      const d = new Date(referenceDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      matchedDate = d.toISOString().slice(0, 10);
    } else if (lowerPrompt.includes('tuesday')) {
      const d = new Date(referenceDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day >= 2 ? 2 : -5);
      d.setDate(diff);
      matchedDate = d.toISOString().slice(0, 10);
    }
  }

  // 2. Stopword Stripping & Candidate Typo Stems
  const rawWords = lowerPrompt.replace(/[^\w\s-]/g, ' ').split(/\s+/);
  const candidateStems = rawWords.filter(w => w.length >= 3 && !STOPWORDS.has(w));

  let matchedMessages = [];
  let graphNodes = [];
  let ftsRows = [];

  // 3A. Exact Date Match
  if (matchedDate) {
    matchedMessages = db.prepare('SELECT * FROM messages WHERE recorded_date = ? LIMIT 4').all(matchedDate);
    graphNodes = db.prepare('SELECT * FROM entity_graph WHERE recorded_date = ?').all(matchedDate);
    ftsRows = db.prepare('SELECT recorded_date, topic, entities_json, claims_caveman FROM memory_fts WHERE recorded_date = ? LIMIT 2').all(matchedDate);
  }

  // 3B. Typo-Tolerant Trigram Match (e.g. "uma" matches "Puma Velocity Nitro 3")
  if (candidateStems.length > 0) {
    for (const stem of candidateStems) {
      try {
        const trigramMatches = db.prepare(`
          SELECT recorded_date, topic, entities_json, claims_caveman
          FROM memory_fts
          WHERE memory_fts MATCH ?
          LIMIT 3
        `).all(`"${stem}"`);

        for (const tm of trigramMatches) {
          if (!ftsRows.some(r => r.topic === tm.topic && r.recorded_date === tm.recorded_date)) {
            ftsRows.push(tm);
          }
        }
      } catch {
        const likeMatches = db.prepare(`
          SELECT recorded_date, topic, entities_json, claims_caveman
          FROM memory_fts
          WHERE topic LIKE ? OR claims_caveman LIKE ? OR entities_json LIKE ?
          LIMIT 3
        `).all(`%${stem}%`, `%${stem}%`, `%${stem}%`);

        for (const lm of likeMatches) {
          if (!ftsRows.some(r => r.topic === lm.topic && r.recorded_date === lm.recorded_date)) {
            ftsRows.push(lm);
          }
        }
      }

      // Check entity_graph for partial match
      const entityMatches = db.prepare(`
        SELECT * FROM entity_graph
        WHERE entity_name LIKE ? OR parent_topic LIKE ? OR attribute_caveman LIKE ?
        LIMIT 6
      `).all(`%${stem}%`, `%${stem}%`, `%${stem}%`);

      for (const em of entityMatches) {
        if (!graphNodes.some(g => g.id === em.id)) {
          graphNodes.push(em);
        }
      }
    }
  }

  // 3C. Entity Subgraph Expansion
  if (ftsRows.length > 0 && graphNodes.length === 0) {
    const parentTopic = ftsRows[0].topic;
    graphNodes = db.prepare('SELECT * FROM entity_graph WHERE parent_topic LIKE ?').all(`%${parentTopic}%`);
  }

  // Collect unique entities
  const entitySet = new Set();
  for (const g of graphNodes) {
    entitySet.add(g.entity_name);
  }
  for (const f of ftsRows) {
    try {
      const parsed = JSON.parse(f.entities_json);
      if (Array.isArray(parsed)) {
        parsed.forEach(e => entitySet.add(e));
      }
    } catch {}
  }
  const entities = Array.from(entitySet);

  // 4. Construct Caveman-Compressed XML Context
  let contextXml = '';
  const firstFts = ftsRows[0];
  const dateLabel = matchedDate || firstFts?.recorded_date || 'Past Conversation';
  const topicLabel = firstFts?.topic || graphNodes[0]?.parent_topic || 'Discussion History';

  if (ftsRows.length > 0 || graphNodes.length > 0 || matchedMessages.length > 0) {
    contextXml += `<past_conversation_context>\n`;
    contextXml += `[Date: ${dateLabel} | Topic: ${topicLabel}]\n`;
    if (entities.length > 0) {
      contextXml += `Entities: ${entities.join(', ')}\n`;
    }

    if (graphNodes.length > 0) {
      const graphFacts = graphNodes.map(g => `${g.entity_name} ${g.attribute_caveman}`).join(' | ');
      contextXml += `Baseline Facts: ${graphFacts}\n`;
    } else if (firstFts) {
      contextXml += `Baseline Facts: ${firstFts.claims_caveman}\n`;
    }

    if (matchedMessages.length > 0) {
      const userTurn = matchedMessages.find(m => m.role === 'user');
      const asstTurn = matchedMessages.find(m => m.role === 'assistant');
      if (userTurn) contextXml += `Exact Question Asked on ${dateLabel}: "${userTurn.content}"\n`;
      if (asstTurn) contextXml += `Exact Answer Given on ${dateLabel}: "${asstTurn.content.slice(0, 350)}"\n`;
    }
    contextXml += `</past_conversation_context>`;
  }

  // 5. Decision: Ultra-Fast Decision Router (Groq LPU ~100ms)
  let needsWebSearch = false;
  let routerSource = 'none';
  let extractedUserName = null;
  let nameQueryType = null;

  if (process.env.GROQ_API_KEY) {
    try {
      const groqDecision = await evaluateIntentWithGroq(userPrompt, matchedDate);
      if (groqDecision) {
        needsWebSearch = groqDecision.needsWebSearch;
        routerSource = 'groq_lpu';
        extractedUserName = groqDecision.extractedUserName || null;
        nameQueryType = groqDecision.nameQueryType || null;
        console.log(
          `[PRE-RETRIEVAL] Groq LPU Decision in ${groqDecision.latencyMs}ms: needsWebSearch = ${needsWebSearch} (user: ${extractedUserName || 'none'}, queryType: ${nameQueryType || 'none'})`
        );
      }
    } catch (err) {
      console.warn('[PRE-RETRIEVAL] Groq decision error:', err.message);
    }
  }

  const latencyMs = Math.round((performance.now() - start) * 10) / 10;
  const preview = entities.length > 0
    ? `Matched ${entities.length} entities (${entities.slice(0, 3).join(', ')}) on ${dateLabel}`
    : `Retrieved context for ${dateLabel}`;

  return {
    latencyMs,
    matchedDate,
    matchedTopic: topicLabel,
    entitiesCount: entities.length,
    entities,
    contextXml,
    needsWebSearch,
    routerSource,
    extractedUserName,
    nameQueryType,
    preview,
  };
}

