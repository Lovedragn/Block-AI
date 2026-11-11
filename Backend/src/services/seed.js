import { db, saveMessage, insertMemoryFts, insertEntityGraph, getOrCreateSession, initDatabase } from '../db/index.js';

export function seedBenchmarkData(referenceDate = new Date()) {
  const session = getOrCreateSession('demo-session-temporal-01', 'Master Evaluation Benchmark');

  // Clear existing messages and memory graphs for clean idempotent state
  db.exec('DELETE FROM messages;');
  db.exec('DELETE FROM entity_graph;');
  db.exec('DELETE FROM memory_fts;');

  const now = new Date(referenceDate);

  // 1. Calculate dynamic relative dates
  const day = now.getDay();
  const mondayOffset = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(mondayOffset);
  const mondayDate = monday.toISOString().slice(0, 10);

  const tuesday = new Date(monday);
  tuesday.setDate(monday.getDate() - 6);
  const tuesdayDate = tuesday.toISOString().slice(0, 10);

  const nov3Year = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  const nov3Date = `${nov3Year}-11-03`;

  // --------------------------------------------------------------------------
  // BENCHMARK 1: Most Recent Monday (5 CRM Tools for 20-person team)
  // --------------------------------------------------------------------------
  const crmTopic = '5 CRM tools for 20-person sales team';
  saveMessage({
    sessionId: session.id,
    role: 'user',
    content: 'Can you shortlist 5 CRM tools for our 20-person sales team with exact seat pricing and key features?',
    recordedDate: mondayDate,
    createdAt: `${mondayDate}T10:00:00Z`,
  });

  saveMessage({
    sessionId: session.id,
    role: 'assistant',
    content: `Here is the shortlist of 5 CRM tools for your 20-person sales team as of Monday:
1. **HubSpot Sales Hub Starter**: $20/user/month ($400/mo for 20 seats) billed annually. Includes simple deals and email tracking.
2. **Pipedrive Essential**: $14/user/month ($280/mo for 20 seats) billed annually. Visual pipeline specialist.
3. **Attio Plus**: $29/user/month ($580/mo for 20 seats). Next-gen relational CRM with real-time enrichment.
4. **Close CRM Startup**: $49/user/month ($980/mo for 20 seats). Built-in calling, SMS, and email automation.
5. **Zoho CRM Standard**: $14/user/month ($280/mo for 20 seats). Traditional feature-dense CRM.`,
    recordedDate: mondayDate,
    createdAt: `${mondayDate}T10:02:00Z`,
  });

  insertMemoryFts({
    recordedDate: mondayDate,
    topic: crmTopic,
    entities: ['HubSpot', 'Pipedrive', 'Attio', 'Close', 'Zoho CRM'],
    claimsCaveman: 'HubSpot Starter=$20/u/mo | Pipedrive Essential=$14/u/mo | Attio Plus=$29/u/mo | Close Startup=$49/u/mo | Zoho Standard=$14/u/mo',
  });

  insertEntityGraph({ recordedDate: mondayDate, parentTopic: crmTopic, entityName: 'HubSpot', attributeCaveman: 'Sales Starter=$20/u/mo (20 seats=$400/mo)' });
  insertEntityGraph({ recordedDate: mondayDate, parentTopic: crmTopic, entityName: 'Pipedrive', attributeCaveman: 'Essential=$14/u/mo (20 seats=$280/mo)' });
  insertEntityGraph({ recordedDate: mondayDate, parentTopic: crmTopic, entityName: 'Attio', attributeCaveman: 'Plus=$29/u/mo (20 seats=$580/mo)' });
  insertEntityGraph({ recordedDate: mondayDate, parentTopic: crmTopic, entityName: 'Close', attributeCaveman: 'Startup=$49/u/mo (20 seats=$980/mo)' });
  insertEntityGraph({ recordedDate: mondayDate, parentTopic: crmTopic, entityName: 'Zoho CRM', attributeCaveman: 'Standard=$14/u/mo (20 seats=$280/mo)' });

  // --------------------------------------------------------------------------
  // BENCHMARK 2: Exact Date (3 November) — Node.js LTS & Supabase Pro
  // --------------------------------------------------------------------------
  const nov3Topic = 'Node.js LTS release and Supabase Pro tier base price';
  saveMessage({
    sessionId: session.id,
    role: 'user',
    content: 'What is the current Node.js LTS release and Supabase Pro tier base price?',
    recordedDate: nov3Date,
    createdAt: `${nov3Date}T14:15:00Z`,
  });

  saveMessage({
    sessionId: session.id,
    role: 'assistant',
    content: `As of 3 November:
- **Node.js LTS**: The active LTS line is Node.js v22.
- **Supabase Pro**: The base plan is $25/month per project, which includes 8GB database space and 100,000 monthly active users.`,
    recordedDate: nov3Date,
    createdAt: `${nov3Date}T14:16:30Z`,
  });

  insertMemoryFts({
    recordedDate: nov3Date,
    topic: nov3Topic,
    entities: ['Node.js', 'Supabase Pro'],
    claimsCaveman: 'Node.js=Active LTS v22 | Supabase Pro=$25/mo project base',
  });

  insertEntityGraph({ recordedDate: nov3Date, parentTopic: nov3Topic, entityName: 'Node.js', attributeCaveman: 'Active LTS line=v22' });
  insertEntityGraph({ recordedDate: nov3Date, parentTopic: nov3Topic, entityName: 'Supabase Pro', attributeCaveman: 'Base Plan=$25/mo per project' });

  // --------------------------------------------------------------------------
  // BENCHMARK 3: Last Tuesday — Postgres Hosting Providers Comparison
  // --------------------------------------------------------------------------
  const pgTopic = 'Postgres hosting providers comparison';
  saveMessage({
    sessionId: session.id,
    role: 'user',
    content: 'Can you compare Postgres hosting options between Supabase, Neon, AWS RDS, Render, and Railway?',
    recordedDate: tuesdayDate,
    createdAt: `${tuesdayDate}T11:20:00Z`,
  });

  saveMessage({
    sessionId: session.id,
    role: 'assistant',
    content: `Postgres hosting breakdown as of last Tuesday:
1. **Supabase**: Free tier available; Pro plan is $25/month.
2. **Neon**: Serverless Postgres, Launch plan starts at $19/month.
3. **AWS RDS**: db.t4g.micro PostgreSQL costs approximately $15/month plus EBS storage ($0.115/GB-mo).
4. **Render**: Managed PostgreSQL starter instance at $7/month (1GB RAM, 0.5 CPU).
5. **Railway**: Usage-based pricing starting at $5/month base developer plan.`,
    recordedDate: tuesdayDate,
    createdAt: `${tuesdayDate}T11:22:00Z`,
  });

  insertMemoryFts({
    recordedDate: tuesdayDate,
    topic: pgTopic,
    entities: ['Supabase', 'Neon', 'AWS RDS', 'Render', 'Railway'],
    claimsCaveman: 'Supabase Pro=$25/mo | Neon Launch=$19/mo | AWS RDS db.t4g.micro=$15/mo | Render Starter=$7/mo | Railway Developer=$5/mo',
  });

  insertEntityGraph({ recordedDate: tuesdayDate, parentTopic: pgTopic, entityName: 'Supabase', attributeCaveman: 'Pro=$25/mo' });
  insertEntityGraph({ recordedDate: tuesdayDate, parentTopic: pgTopic, entityName: 'Neon', attributeCaveman: 'Launch=$19/mo serverless' });
  insertEntityGraph({ recordedDate: tuesdayDate, parentTopic: pgTopic, entityName: 'AWS RDS', attributeCaveman: 'db.t4g.micro=$15/mo' });
  insertEntityGraph({ recordedDate: tuesdayDate, parentTopic: pgTopic, entityName: 'Render', attributeCaveman: 'Postgres Starter=$7/mo' });
  insertEntityGraph({ recordedDate: tuesdayDate, parentTopic: pgTopic, entityName: 'Railway', attributeCaveman: 'Developer=$5/mo base' });

  // --------------------------------------------------------------------------
  // BENCHMARK 4: Typo / Fuzzy Recall (Puma Running Shoe)
  // --------------------------------------------------------------------------
  const shoeTopic = 'Running shoe selection';
  saveMessage({
    sessionId: session.id,
    role: 'user',
    content: 'Which running shoe did we select for daily marathon training?',
    recordedDate: mondayDate,
    createdAt: `${mondayDate}T16:00:00Z`,
  });

  saveMessage({
    sessionId: session.id,
    role: 'assistant',
    content: `We selected the **Puma Velocity Nitro 3** ($130) as our top pick for daily marathon training because of its dual-density Nitro foam and durable PumaGrip outsole.`,
    recordedDate: mondayDate,
    createdAt: `${mondayDate}T16:01:00Z`,
  });

  insertMemoryFts({
    recordedDate: mondayDate,
    topic: shoeTopic,
    entities: ['Puma Velocity Nitro 3', 'Puma'],
    claimsCaveman: 'Selected shoe=Puma Velocity Nitro 3 | Price=$130 | Outsole=PumaGrip',
  });

  insertEntityGraph({ recordedDate: mondayDate, parentTopic: shoeTopic, entityName: 'Puma Velocity Nitro 3', attributeCaveman: 'Selected=$130 PumaGrip daily trainer' });

  console.log(`[Seed] Seeded 4 historical benchmark conversations: Monday CRMs (${mondayDate}), Nov 3 (${nov3Date}), Last Tuesday Postgres (${tuesdayDate}), Puma Shoes.`);

  return {
    mondayDate,
    tuesdayDate,
    nov3Date,
    totalNodes: 13,
  };
}

// Auto-run if executed directly via `node src/services/seed.js`
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  initDatabase();
  seedBenchmarkData();
}

