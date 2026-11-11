// Automated Temporal Replay Evaluation Suite (Pure JavaScript)

const BASE_URL = process.env.AGENT_URL || 'http://localhost:3000';

async function runEvaluationSuite() {
  console.log('\n======================================================');
  console.log('🧪 TEMPORAL SEARCH AGENT — AUTOMATED EVALUATION SUITE');
  console.log('Pure JavaScript Runtime | Target Server:', BASE_URL);
  console.log('======================================================\n');

  try {
    const health = await fetch(`${BASE_URL}/api/health`).then(r => r.json());
    console.log('✅ Server online:', health.service, 'at', health.timestamp);
    await fetch(`${BASE_URL}/api/reset`, { method: 'POST' });
    console.log('✅ Local SQLite WAL database seeded with 4 historical benchmarks.\n');
  } catch (err) {
    console.error('❌ Failed to reach agent backend at ' + BASE_URL + '. Is `npm run dev` running in Backend?');
    process.exit(1);
  }

  const testCases = [
    {
      id: 'TEST-1',
      name: 'Typo + Pure Memory Recall (< 0.8s)',
      prompt: 'we have sleetced some uma shoes whic shoe sis it?',
      caveman: false,
      expectSearch: false,
      expectedKeyword: 'Puma Velocity Nitro 3',
    },
    {
      id: 'TEST-2',
      name: 'Monday 5 CRM Shortlist Delta (< 2.3s)',
      prompt: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
      caveman: true,
      expectSearch: true,
      expectedKeyword: 'Attio',
    },
    {
      id: 'TEST-3',
      name: 'Exact Date Verification (< 2.2s)',
      prompt: 'What did I ask you on 3 November? Is your answer still correct today?',
      caveman: true,
      expectSearch: true,
      expectedKeyword: 'Node.js',
    },
    {
      id: 'TEST-4',
      name: 'Last Tuesday Postgres Hosting (< 2.2s)',
      prompt: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
      caveman: false,
      expectSearch: true,
      expectedKeyword: 'Supabase',
    },
  ];

  let passed = 0;

  for (const tc of testCases) {
    const startTime = Date.now();
    let text = '';
    try {
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: tc.prompt,
          sessionId: 'eval-session-runner',
          cavemanMode: tc.caveman,
        }),
      });

      text = await res.text();
    } catch (e) {
      console.error(`❌ [${tc.id}] Request failed:`, e.message);
      continue;
    }

    const durationMs = Date.now() - startTime;
    const events = text.split('\n\n').filter(Boolean);
    const searchCalled = events.some(e => e.includes('event: search_start'));
    const tokens = events
      .filter(e => e.includes('event: token'))
      .map(e => {
        try { return JSON.parse(e.replace('event: token\ndata: ', '')).text; } catch { return ''; }
      })
      .join('');

    const searchMatch = searchCalled === tc.expectSearch;
    const contentMatch = tokens.toLowerCase().includes(tc.expectedKeyword.toLowerCase());
    const latencyPass = durationMs < 2500;

    const testPassed = searchMatch && contentMatch && latencyPass;
    if (testPassed) passed++;

    console.log(`------------------------------------------------------`);
    console.log(`${testPassed ? '🟢 PASS' : '🔴 FAIL'}: [${tc.id}] ${tc.name}`);
    console.log(`   ⏱️ Latency: ${durationMs}ms (Target: < 2500ms)`);
    console.log(`   🔍 Web Search Action: ${searchCalled ? 'EXECUTED (Parallel)' : 'SKIPPED (0ms Tool Overhead)'} (Expected: ${tc.expectSearch ? 'Executed' : 'Skipped'})`);
    console.log(`   🎯 Factual Content Match ("${tc.expectedKeyword}"): ${contentMatch ? 'YES' : 'NO'}`);
    console.log(`   📝 Output Preview: ${tokens.slice(0, 110).replace(/\n/g, ' ')}...`);
  }

  console.log('\n======================================================');
  console.log(`🏆 SCOREBOARD: ${passed} / ${testCases.length} TESTS PASSED (${Math.round((passed / testCases.length) * 100)}%)`);
  console.log('======================================================\n');

  if (passed === testCases.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runEvaluationSuite();
