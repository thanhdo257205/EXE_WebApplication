import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligible } from './select-release.mjs';

test('release gate rejects PR, fork, failed, stale and unrelated workflow runs', () => {
  const good = { conclusion: 'success', status: 'completed', event: 'push', head_branch: 'main',
    head_sha: 'tested', head_repository: { full_name: 'owner/repo' }, path: '.github/workflows/ci.yml' };
  assert.equal(eligible(good, 'owner/repo', 'tested'), true);
  for (const change of [
    { event: 'pull_request' }, { conclusion: 'failure' }, { status: 'in_progress' },
    { head_sha: 'stale' }, { head_branch: 'feature' },
    { head_repository: { full_name: 'fork/repo' } }, { path: '.github/workflows/other.yml' },
  ]) assert.equal(eligible({ ...good, ...change }, 'owner/repo', 'tested'), false);
});
