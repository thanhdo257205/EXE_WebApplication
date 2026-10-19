import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function eligible(run, repo, sha) {
  return run?.conclusion === 'success' && run.status === 'completed'
    && run.event === 'push' && run.head_branch === 'main'
    && run.head_sha === sha && run.head_repository?.full_name === repo
    && run.path === '.github/workflows/ci.yml';
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const api = async path => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub release selection failed (${response.status})`);
    return response.json();
  };
  const sha = (await api('git/ref/heads/main')).object.sha;
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let run = event.workflow_run;
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    const result = await api(`actions/workflows/ci.yml/runs?branch=main&event=push&status=success&head_sha=${sha}&per_page=10`);
    run = result.workflow_runs.find(candidate => eligible(candidate, repo, sha));
  } else if (process.env.GITHUB_EVENT_NAME !== 'workflow_run') {
    throw new Error('Unsupported release event');
  }
  if (!eligible(run, repo, sha)) {
    console.log('Skipped: no successful push CI for the current main commit.');
    appendFileSync(process.env.GITHUB_OUTPUT, 'deploy=false\n');
    return;
  }
  // Re-read the selected run from GitHub rather than trusting artifact contents.
  if (!eligible(await api(`actions/runs/${run.id}`), repo, sha)) throw new Error('CI run no longer eligible');
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy=true\nsha=${sha}\nrun_id=${run.id}\n`);
  console.log(`Selected tested main commit ${sha}, CI run ${run.id}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
