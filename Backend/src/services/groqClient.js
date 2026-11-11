/**
 * Groq Ultra-Fast Decision Client (LPU Inference ~80-150ms)
 * Acts as high-speed System 1 Decision Router for instant intent classification.
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export async function evaluateIntentWithGroq(userPrompt, referenceDateStr, timeoutMs = 2500) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
  const today = referenceDateStr || new Date().toISOString().slice(0, 10);

  const systemPrompt = `You are an ultra-fast System 1 Classifier and Router.
Current Reference Date: ${today}.
Respond strictly with valid JSON format:
{
  "needs_web_search": boolean,
  "extracted_user_name": string or null,
  "name_query_type": "current" or "previous" or "all" or null,
  "confidence": number,
  "reason": string
}
Rules:
1. If the user introduces, updates, or states their name (e.g. "my name is sujith sappani", "my name i ssunitha", "call me Alex", "i am Bob"), set extracted_user_name to the cleaned proper name, name_query_type to null, and needs_web_search to false.
2. If the user asks for:
   - All past names / name history (e.g. "my all name?", "what is my all name", "all names", "name history"): set name_query_type to "all", extracted_user_name to null, and needs_web_search to false.
   - Previous / old name (e.g. "previous name", "previou sname", "what was my earlier name?"): set name_query_type to "previous", extracted_user_name to null, and needs_web_search to false.
   - Current name (e.g. "what is my name?", "who am I?"): set name_query_type to "current", extracted_user_name to null, and needs_web_search to false.
3. For world knowledge, science, animals, news, or pricing questions (e.g. "can sea water fill in 1lte bottle?", "is tiger faster than cheetah?"), set needs_web_search to true, extracted_user_name to null, and name_query_type to null.
Keep reason terse under 12 words.`;

  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 250,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[GROQ ROUTER] HTTP ${response.status}: ${errText}`);
      return null;
    }

    const data = await response.json();
    const latencyMs = Math.round((performance.now() - start) * 10) / 10;
    const content = data?.choices?.[0]?.message?.content;

    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      needsWebSearch: Boolean(parsed.needs_web_search),
      extractedUserName: parsed.extracted_user_name || null,
      nameQueryType: parsed.name_query_type || null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
      reason: parsed.reason || '',
      latencyMs,
    };
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[GROQ ROUTER] Call failed or timed out: ${err.message}`);
    return null;
  }
}

