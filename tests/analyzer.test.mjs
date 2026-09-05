import test from 'node:test';
import assert from 'node:assert/strict';
import { categorizeCommit, analyzeRepository } from '../src/analysis/analyzer.js';
import { parseGitHubRepo } from '../src/api/github.js';

test('parses GitHub repository URLs and slugs', () => {
  assert.equal(parseGitHubRepo('https://github.com/vercel/next.js').slug, 'vercel/next.js');
  assert.equal(parseGitHubRepo('openai/openai-node').slug, 'openai/openai-node');
  assert.throws(() => parseGitHubRepo('https://example.com/x/y'));
});

test('categorizes key development events', () => {
  assert.equal(categorizeCommit('revert: custom auth flow'), 'revert');
  assert.equal(categorizeCommit('feat(search): add fuzzy search'), 'feature');
  assert.equal(categorizeCommit('fix mobile layout'), 'fix');
  assert.equal(categorizeCommit('refactor api client'), 'refactor');
});

test('builds a useful analysis from a minimal bundle', () => {
  const bundle = {
    slug: 'a/b',
    repository: { created_at: '2026-01-01T00:00:00Z', pushed_at: '2026-01-03T00:00:00Z' },
    commits: [
      { sha:'3', commit:{ message:'release v1.0.0', author:{ date:'2026-01-03T00:00:00Z', name:'A' } } },
      { sha:'2', commit:{ message:'fix login bug', author:{ date:'2026-01-02T00:00:00Z', name:'A' } } },
      { sha:'1', commit:{ message:'init project', author:{ date:'2026-01-01T00:00:00Z', name:'A' } } },
    ],
    oldestCommit: { sha:'1', commit:{ message:'init project', author:{ date:'2026-01-01T00:00:00Z', name:'A' } } },
    issues: [], pulls: [], releases: [], contributors: [], languages: { JavaScript: 100 }, packageJson: null,
    api: { sampledCommits:false, remaining:45 },
  };
  const analysis = analyzeRepository(bundle);
  assert.equal(analysis.stats.commitsObserved, 3);
  assert.ok(analysis.milestones.length >= 2);
  assert.equal(analysis.insights.biggestMistake.category, 'fix');
  assert.equal(analysis.languages[0].name, 'JavaScript');
});
