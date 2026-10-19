import { setTimeout } from 'node:timers/promises';

const sha = process.env.RELEASE_SHA;
if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Invalid release SHA');
const hook = new URL(process.env.RENDER_DEPLOY_HOOK_URL);
if (hook.origin !== 'https://api.render.com' || !hook.pathname.startsWith('/deploy/')) throw new Error('Invalid Render hook');
hook.searchParams.set('ref', sha);
// Never print the URL, response body, or raw fetch errors: the URL contains a secret.
let response;
try { response = await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(30_000) }); }
catch { throw new Error('Render deploy request failed; inspect the service dashboard before retrying.'); }
if (!response.ok) throw new Error(`Render deploy refused (${response.status})`);
console.log(`Render accepted deployment of ${sha}. Waiting for that exact commit...`);
const origin = process.env.PUBLIC_ORIGIN;
for (let attempt = 1; attempt <= 60; attempt++) {
  try {
    const check = await fetch(`${origin}/api/v1/info`, {
      headers: { Origin: origin, 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15_000),
    });
    if (check.ok && (await check.json()).commit === sha) {
      console.log('Backend is serving the tested commit through the gateway.');
      process.exit(0);
    }
  } catch { /* Cold starts and the deployment transition can temporarily fail. */ }
  console.log(`Backend readiness check ${attempt}/60: waiting`);
  await setTimeout(15_000);
}
throw new Error('Timed out waiting for the tested backend commit. See Render deploy logs.');
