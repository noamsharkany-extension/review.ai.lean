/*
 Run an end-to-end analysis against a provided Google URL.
 Usage:
   tsx scripts/e2e-analyze.ts "<google-maps-url>" [--host http://localhost:3001]
*/

import { setTimeout as wait } from 'timers/promises';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: tsx scripts/e2e-analyze.ts "<google-maps-url>" [--host http://localhost:3001]');
  process.exit(1);
}

const urlArg = args[0];
const hostFlagIndex = args.findIndex(a => a === '--host');
const host = hostFlagIndex !== -1 && args[hostFlagIndex + 1] ? args[hostFlagIndex + 1] : 'http://localhost:3001';

async function main() {
  const analyzeRes = await fetch(`${host}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ googleUrl: urlArg })
  });

  if (!analyzeRes.ok) {
    const text = await analyzeRes.text().catch(() => '');
    throw new Error(`Analyze request failed: HTTP ${analyzeRes.status} ${analyzeRes.statusText} ${text}`);
  }

  const { sessionId } = await analyzeRes.json() as { sessionId: string };
  console.log(`Session started: ${sessionId}`);

  // Poll until complete or error
  const startedAt = Date.now();
  const timeoutMs = 10 * 60 * 1000; // 10 minutes
  while (true) {
    const statusRes = await fetch(`${host}/api/analysis/${sessionId}`);
    if (!statusRes.ok) {
      const text = await statusRes.text().catch(() => '');
      throw new Error(`Status request failed: HTTP ${statusRes.status} ${statusRes.statusText} ${text}`);
    }
    const body = await statusRes.json();
    const status = body?.session?.status as string | undefined;
    const progress = body?.session?.progress;
    const hasResults = !!body?.session?.results;

    console.log(JSON.stringify({ status, progress, hasResults }));

    if (status === 'complete') {
      console.log('Final summary:');
      const results = body.session.results;
      console.log(JSON.stringify({
        id: body.session.id,
        verdict: results?.verdict,
        samples: Array.isArray(results?.reviewSamples) ? results.reviewSamples.length : 0
      }, null, 2));
      break;
    }

    if (status === 'error') {
      throw new Error(`Analysis error: ${body?.session?.error || 'unknown'}`);
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for analysis to complete');
    }

    await wait(5000);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});


