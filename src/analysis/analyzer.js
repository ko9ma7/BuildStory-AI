import { daysBetween, truncate } from '../utils.js';

const categories = [
  ['release', /\b(release|version|bump|v\d+(?:\.\d+)+)\b/i],
  ['revert', /\b(revert|rollback|backout|undo)\b/i],
  ['fix', /\b(fix|fixed|bug|hotfix|patch|crash|error|regression)\b/i],
  ['security', /\b(security|auth|oauth|permission|csrf|xss|cve)\b/i],
  ['performance', /\b(perf|performance|optimi[sz]e|faster|speed|cache)\b/i],
  ['ui', /\b(ui|ux|style|css|layout|responsive|mobile|design|theme|dark)\b/i],
  ['test', /\b(test|spec|coverage|e2e|unit)\b/i],
  ['docs', /\b(docs?|readme|documentation|changelog)\b/i],
  ['refactor', /\b(refactor|migrate|migration|architecture|rewrite|cleanup|deps?|dependenc|upgrade)\b/i],
  ['feature', /\b(feat|feature|add|implement|support|create|introduce|enable)\b/i],
  ['setup', /\b(init|initial|bootstrap|scaffold|setup|start project)\b/i],
];

const CATEGORY_LABELS = {
  setup: '프로젝트 기반', feature: '기능', fix: '버그 해결', revert: '되돌림', ui: 'UI/UX', refactor: '구조 개선',
  performance: '성능', security: '보안', test: '테스트', docs: '문서', release: '릴리스', change: '변경',
};

export function categorizeCommit(message = '') {
  for (const [category, regex] of categories) if (regex.test(message)) return category;
  return 'change';
}

function commitInfo(item) {
  const message = item?.commit?.message?.split('\n')[0] || 'Untitled change';
  return {
    sha: item?.sha || '',
    message,
    date: item?.commit?.author?.date || item?.commit?.committer?.date || null,
    author: item?.author?.login || item?.commit?.author?.name || 'unknown',
    url: item?.html_url || '',
    category: categorizeCommit(message),
  };
}

function getFeatureToken(message) {
  const scope = message.match(/(?:feat|feature)\(([^)]+)\)/i)?.[1];
  if (scope) return scope.toLowerCase();
  const stop = new Set(['feat', 'feature', 'add', 'adds', 'added', 'implement', 'support', 'create', 'new', 'the', 'for', 'with', 'from', 'into', 'and', '기능', '추가', '구현']);
  const tokens = message.toLowerCase().replace(/[^a-z0-9가-힣_-]+/g, ' ').split(/\s+/).filter((t) => t.length >= 3 && !stop.has(t));
  return tokens[0] || 'core';
}

function languageStats(languages = {}) {
  const entries = Object.entries(languages);
  const total = entries.reduce((sum, [, bytes]) => sum + Number(bytes || 0), 0) || 1;
  return entries
    .map(([name, bytes]) => ({ name, percent: Math.round((bytes / total) * 1000) / 10 }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 6);
}

function uniqueBySha(items) {
  const seen = new Set();
  return items.filter((item) => item.sha && !seen.has(item.sha) && seen.add(item.sha));
}

function selectMilestones(commits, releases, startDate) {
  if (!commits.length) return [];
  const sorted = [...commits].filter((c) => c.date).sort((a, b) => new Date(a.date) - new Date(b.date));
  const priority = { revert: 9, release: 8, security: 8, feature: 7, fix: 6, refactor: 6, ui: 5, performance: 5, test: 4, setup: 4, docs: 2, change: 1 };

  const candidates = sorted.map((commit, index) => ({
    ...commit,
    score: (priority[commit.category] || 1) + (index === 0 || index === sorted.length - 1 ? 6 : 0),
  }));

  const releaseItems = (releases || []).map((release) => ({
    sha: `release-${release.id}`,
    message: release.name || release.tag_name || 'Release',
    date: release.published_at || release.created_at,
    author: release.author?.login || 'maintainer',
    url: release.html_url || '',
    category: 'release',
    score: 12,
    releaseTag: release.tag_name,
  })).filter((item) => item.date);

  const picked = uniqueBySha([...candidates, ...releaseItems].sort((a, b) => b.score - a.score).slice(0, 8));
  if (sorted[0]) picked.push(sorted[0]);
  if (sorted.at(-1)) picked.push(sorted.at(-1));

  return uniqueBySha(picked)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 9)
    .map((item, index) => ({
      id: item.sha || `milestone-${index}`,
      day: daysBetween(startDate, item.date) + 1,
      date: item.date,
      title: truncate(item.message, 70),
      description: milestoneDescription(item),
      category: item.category,
      categoryLabel: CATEGORY_LABELS[item.category] || '변경',
      author: item.author,
      url: item.url,
    }));
}

function milestoneDescription(item) {
  const messages = {
    setup: '프로젝트의 초기 기반과 실행 구조를 잡은 시점입니다.',
    feature: '사용자가 직접 체감하는 기능이 추가된 시점입니다.',
    fix: '오류나 회귀 문제를 해결하며 안정성을 높인 변경입니다.',
    revert: '기존 접근을 되돌린 기록입니다. 시행착오를 가장 직접적으로 보여줍니다.',
    ui: '레이아웃·스타일·모바일 경험 등 제품 외형을 다듬은 변경입니다.',
    refactor: '기능보다 구조와 유지보수성을 개선한 변화입니다.',
    performance: '속도나 자원 사용을 줄이기 위한 최적화 변경입니다.',
    security: '인증·권한·보안과 관련된 중요한 변경입니다.',
    test: '테스트와 검증 체계를 보강한 시점입니다.',
    docs: '문서와 사용 방법을 정리한 변경입니다.',
    release: item.releaseTag ? `${item.releaseTag} 릴리스가 공개된 시점입니다.` : '사용자에게 배포 가능한 버전이 공개된 시점입니다.',
    change: '프로젝트가 다음 단계로 진행된 주요 변경입니다.',
  };
  return messages[item.category] || messages.change;
}

function inferLearnings(categoryCounts) {
  const lessons = [];
  if ((categoryCounts.fix || 0) + (categoryCounts.revert || 0) >= 3) lessons.push('기능 추가보다 되돌림과 수정 기록이 많아, 빠른 실험 후 안정화하는 개발 패턴이 보입니다.');
  if ((categoryCounts.ui || 0) >= 3) lessons.push('UI 관련 반복 수정이 많아 실제 화면을 보며 사용성을 계속 다듬은 프로젝트로 보입니다.');
  if ((categoryCounts.test || 0) >= 2) lessons.push('테스트 관련 변경이 꾸준해 기능 확장과 함께 회귀 방지를 강화했습니다.');
  if ((categoryCounts.refactor || 0) >= 3) lessons.push('초기 구현을 고정하지 않고 구조를 반복적으로 정리하며 유지보수성을 높였습니다.');
  if ((categoryCounts.security || 0) >= 1) lessons.push('인증·권한·보안 요구사항이 개발 과정에서 별도 축으로 다뤄졌습니다.');
  if (!lessons.length) lessons.push('작은 변경을 반복적으로 쌓아 기능을 확장하는 점진적 개발 패턴이 보입니다.');
  return lessons.slice(0, 3);
}

export function analyzeRepository(bundle) {
  const commits = (bundle.commits || []).map(commitInfo).filter((c) => c.date);
  const oldest = bundle.oldestCommit ? commitInfo(bundle.oldestCommit) : commits.at(-1);
  const allCommits = uniqueBySha([...commits, ...(oldest ? [oldest] : [])]);
  const chronological = [...allCommits].sort((a, b) => new Date(a.date) - new Date(b.date));
  const startDate = oldest?.date || chronological[0]?.date || bundle.repository.created_at;
  const endDate = chronological.at(-1)?.date || bundle.repository.pushed_at || startDate;

  const categoryCounts = allCommits.reduce((acc, commit) => {
    acc[commit.category] = (acc[commit.category] || 0) + 1;
    return acc;
  }, {});

  const fixes = allCommits.filter((commit) => ['fix', 'revert'].includes(commit.category));
  const biggestMistake = fixes.sort((a, b) => (b.category === 'revert') - (a.category === 'revert'))[0] || null;

  const featureCounts = new Map();
  allCommits.filter((commit) => commit.category === 'feature').forEach((commit) => {
    const token = getFeatureToken(commit.message);
    featureCounts.set(token, (featureCounts.get(token) || 0) + 1);
  });
  const topFeature = [...featureCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const refactors = allCommits.filter((commit) => commit.category === 'refactor').slice(0, 5);
  const dependencies = bundle.packageJson ? {
    runtime: Object.keys(bundle.packageJson.dependencies || {}),
    dev: Object.keys(bundle.packageJson.devDependencies || {}),
  } : { runtime: [], dev: [] };

  const activeDays = new Set(allCommits.map((commit) => commit.date.slice(0, 10))).size;
  const estimatedHours = Math.max(1, Math.round((activeDays * 1.4 + allCommits.length * 0.18) * 2) / 2);
  const languages = languageStats(bundle.languages);

  return {
    slug: bundle.slug,
    repository: bundle.repository,
    stats: {
      commitsObserved: allCommits.length,
      issues: bundle.issues.length,
      pulls: bundle.pulls.length,
      releases: bundle.releases.length,
      contributors: bundle.contributors.length,
      activeDays,
      spanDays: daysBetween(startDate, endDate) + 1,
      estimatedHours,
      sampledCommits: bundle.api.sampledCommits,
      apiRemaining: bundle.api.remaining,
    },
    startDate,
    endDate,
    categories: Object.entries(categoryCounts).map(([name, count]) => ({ name, label: CATEGORY_LABELS[name] || name, count })).sort((a, b) => b.count - a.count),
    languages,
    milestones: selectMilestones(allCommits, bundle.releases, startDate),
    insights: {
      biggestMistake,
      expensiveFeature: topFeature ? { name: topFeature[0], commits: topFeature[1] } : null,
      bugGraveyard: fixes.slice(0, 6),
      architectureEvolution: refactors,
      dependencies,
      learnings: inferLearnings(categoryCounts),
      beforeAfter: chronological.length ? { before: chronological[0], after: chronological.at(-1) } : null,
    },
    raw: bundle,
  };
}
