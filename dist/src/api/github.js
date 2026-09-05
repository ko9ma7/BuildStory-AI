const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';

export class GitHubApiError extends Error {
  constructor(message, status, meta = {}) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.meta = meta;
  }
}

export function parseGitHubRepo(input) {
  const raw = String(input || '').trim().replace(/\/$/, '');
  if (!raw) throw new Error('GitHub 저장소 주소를 입력해주세요.');

  let owner = '';
  let repo = '';

  if (/^https?:\/\//i.test(raw)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('올바른 GitHub URL이 아닙니다.');
    }
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
      throw new Error('github.com 저장소 URL만 지원합니다.');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    [owner, repo] = parts;
  } else {
    [owner, repo] = raw.split('/').filter(Boolean);
  }

  repo = repo?.replace(/\.git$/i, '');
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new Error('예: https://github.com/vercel/next.js 또는 vercel/next.js 형식으로 입력해주세요.');
  }

  return { owner, repo, slug: `${owner}/${repo}` };
}

function rateMeta(response) {
  const remaining = Number(response.headers.get('x-ratelimit-remaining'));
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt: Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : null,
  };
}

async function request(pathOrUrl, { optional = false } = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_ROOT}${pathOrUrl}`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
      },
    });
  } catch {
    if (optional) return { data: null, meta: {} };
    throw new GitHubApiError('GitHub에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.', 0);
  }

  const meta = rateMeta(response);
  if (!response.ok) {
    if (optional && [404, 409, 451].includes(response.status)) return { data: null, meta };
    let body = {};
    try { body = await response.json(); } catch { /* no-op */ }
    const rateLimited = response.status === 403 && meta.remaining === 0;
    const message = rateLimited
      ? 'GitHub API 호출 한도를 모두 사용했습니다. 잠시 뒤 다시 시도해주세요.'
      : response.status === 404
        ? '공개 저장소를 찾을 수 없습니다. 주소와 공개 여부를 확인해주세요.'
        : response.status === 403
          ? 'GitHub가 요청을 제한했습니다. 잠시 뒤 다시 시도해주세요.'
          : `GitHub API 오류 (${response.status}): ${body.message || '요청을 완료하지 못했습니다.'}`;
    throw new GitHubApiError(message, response.status, meta);
  }

  return { data: await response.json(), meta, headers: response.headers };
}

function decodeBase64Utf8(base64) {
  try {
    const binary = atob(base64.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function findLastPageUrl(linkHeader) {
  if (!linkHeader) return null;
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="last"/);
    if (match) return match[1];
  }
  return null;
}

export async function fetchRepositoryBundle(input, onProgress = () => {}) {
  const { owner, repo, slug } = parseGitHubRepo(input);
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  onProgress({ step: 1, label: '저장소 정보 확인 중' });
  const repoResponse = await request(base);
  const repository = repoResponse.data;

  onProgress({ step: 2, label: '커밋과 개발 기록 수집 중' });
  const commitsPromise = request(`${base}/commits?per_page=100`);
  const issuesPromise = request(`${base}/issues?state=all&per_page=50&sort=updated&direction=desc`, { optional: true });
  const releasesPromise = request(`${base}/releases?per_page=20`, { optional: true });
  const contributorsPromise = request(`${base}/contributors?per_page=30&anon=1`, { optional: true });
  const languagesPromise = request(`${base}/languages`, { optional: true });
  const packagePromise = request(`${base}/contents/package.json`, { optional: true });

  const [commitsResponse, issuesResponse, releasesResponse, contributorsResponse, languagesResponse, packageResponse] = await Promise.all([
    commitsPromise,
    issuesPromise,
    releasesPromise,
    contributorsPromise,
    languagesPromise,
    packagePromise,
  ]);

  let oldestCommit = null;
  const lastPageUrl = findLastPageUrl(commitsResponse.headers?.get('link'));
  if (lastPageUrl) {
    const last = await request(lastPageUrl, { optional: true });
    oldestCommit = Array.isArray(last.data) ? last.data.at(-1) : null;
  }
  if (!oldestCommit && Array.isArray(commitsResponse.data)) oldestCommit = commitsResponse.data.at(-1) || null;

  onProgress({ step: 3, label: '스토리와 인사이트 구성 중' });

  const rawIssues = Array.isArray(issuesResponse.data) ? issuesResponse.data : [];
  const issues = rawIssues.filter((item) => !item.pull_request);
  const pulls = rawIssues.filter((item) => item.pull_request);

  let packageJson = null;
  if (packageResponse.data?.content) {
    try { packageJson = JSON.parse(decodeBase64Utf8(packageResponse.data.content)); } catch { packageJson = null; }
  }

  const remainingValues = [repoResponse, commitsResponse, issuesResponse, releasesResponse, contributorsResponse, languagesResponse, packageResponse]
    .map((response) => response.meta?.remaining)
    .filter((value) => Number.isFinite(value));

  return {
    slug,
    repository,
    commits: Array.isArray(commitsResponse.data) ? commitsResponse.data : [],
    oldestCommit,
    issues,
    pulls,
    releases: Array.isArray(releasesResponse.data) ? releasesResponse.data : [],
    contributors: Array.isArray(contributorsResponse.data) ? contributorsResponse.data : [],
    languages: languagesResponse.data || {},
    packageJson,
    api: {
      remaining: remainingValues.length ? Math.min(...remainingValues) : null,
      sampledCommits: Array.isArray(commitsResponse.data) && commitsResponse.data.length >= 100,
    },
  };
}
