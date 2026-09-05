import { fetchRepositoryBundle, GitHubApiError, parseGitHubRepo } from './api/github.js';
import { analyzeRepository } from './analysis/analyzer.js';
import { demoAnalysis } from './data/demo.js';
import { createStoryVideo } from './video.js';
import { downloadBlob, escapeHtml, formatDate, formatNumber, storageGet, storageSet, truncate } from './utils.js';

const state = {
  analysis: demoAnalysis,
  source: 'demo',
  activeTab: 'story',
  loading: false,
  aiMarks: {},
  videoProgress: 0,
};

const STORAGE = {
  theme: 'buildstory:theme',
  recent: 'buildstory:recent',
  aiMarks: 'buildstory:ai-marks',
};

const ICONS = {
  github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path style="fill:currentColor;stroke:none" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.5 9.5 0 0 1 12 6.84a9.5 9.5 0 0 1 2.5.34c1.9-1.3 2.74-1.02 2.74-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51 8.59 10.49"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  film: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 9h5M17 9h5M2 15h5M17 15h5"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2L12 3ZM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  branch: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M8 6c6 0 3 6 8 6"/></svg>',
  bug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8v8a4 4 0 0 1-8 0V8Z"/><path d="M9 4h6M10 4v4M14 4v4M4 11h4M16 11h4M4 16h4M16 16h4"/></svg>',
};

const app = document.querySelector('#app');

function icon(name, className = '') {
  return `<span class="icon ${className}">${ICONS[name] || ''}</span>`;
}

function applyTheme(theme) {
  const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = theme;
  storageSet(STORAGE.theme, theme);
  const button = document.querySelector('[data-theme-toggle]');
  if (button) button.innerHTML = icon(resolved === 'dark' ? 'sun' : 'moon') + `<span class="sr-only">${resolved === 'dark' ? '라이트 모드' : '다크 모드'}로 전환</span>`;
}

function toggleTheme() {
  const pref = document.documentElement.dataset.themePreference || 'system';
  const resolved = document.documentElement.dataset.theme;
  applyTheme(pref === 'system' ? (resolved === 'dark' ? 'light' : 'dark') : (pref === 'dark' ? 'light' : 'dark'));
}

function toast(message, type = 'info') {
  const region = document.querySelector('#toast-region');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.setAttribute('role', 'status');
  item.textContent = message;
  region.appendChild(item);
  requestAnimationFrame(() => item.classList.add('is-visible'));
  setTimeout(() => {
    item.classList.remove('is-visible');
    setTimeout(() => item.remove(), 200);
  }, 3200);
}

function getRecent() {
  return storageGet(STORAGE.recent, []);
}

function saveRecent(slug) {
  const next = [slug, ...getRecent().filter((item) => item !== slug)].slice(0, 5);
  storageSet(STORAGE.recent, next);
}

function getAiMarks(slug) {
  return storageGet(STORAGE.aiMarks, {})[slug] || [];
}

function toggleAiMark(id) {
  const all = storageGet(STORAGE.aiMarks, {});
  const current = new Set(all[state.analysis.slug] || []);
  current.has(id) ? current.delete(id) : current.add(id);
  all[state.analysis.slug] = [...current];
  storageSet(STORAGE.aiMarks, all);
  renderResult();
}

function renderShell() {
  app.innerHTML = `
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="#top" aria-label="BuildStory AI 홈">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>BuildStory <b>AI</b></span>
        </a>
        <nav class="header-nav" aria-label="주요 메뉴">
          <a href="#story">개발 스토리</a>
          <a href="#insights">인사이트</a>
          <a href="#video">30초 영상</a>
        </nav>
        <div class="header-actions">
          <button class="icon-button" data-theme-toggle type="button" title="테마 변경"></button>
          <a class="button button-ghost button-small" href="https://github.com/" target="_blank" rel="noreferrer">${icon('github')} GitHub</a>
        </div>
      </div>
    </header>

    <main id="top">
      <section class="hero">
        <div class="container hero-grid">
          <div class="hero-copy">
            <h1>GitHub 링크를<br><span>개발 스토리</span>로 바꿉니다.</h1>
            <p>결과물만 보여주는 README를 넘어, 커밋·이슈·PR·릴리스에서 “처음 → 시행착오 → 주요 기능 → 현재”의 흐름을 찾아냅니다.</p>
            <form class="repo-form" id="repo-form" novalidate>
              <label for="repo-input" class="sr-only">GitHub Repository URL</label>
              <div class="input-shell">
                ${icon('github')}
                <input id="repo-input" name="repo" autocomplete="url" spellcheck="false" placeholder="https://github.com/owner/repository" aria-describedby="repo-help">
                <button class="button button-primary" type="submit">분석하기 ${icon('arrow')}</button>
              </div>
              <div class="form-meta">
                <span id="repo-help">공개 저장소만 지원 · 토큰 저장 없음</span>
                <button type="button" class="text-button" data-demo>샘플 다시 보기</button>
              </div>
            </form>
            <div class="recent-row" id="recent-row"></div>
          </div>
          <div class="hero-visual" aria-label="BuildStory 분석 예시">
            <div class="terminal-card">
              <div class="terminal-head"><span></span><span></span><span></span><b>story.engine</b></div>
              <div class="terminal-body">
                <p><em>01</em><strong>Repository</strong><span>commit · issue · PR · release</span></p>
                <div class="flow-line"><i></i><i></i><i></i></div>
                <p><em>02</em><strong>Pattern scan</strong><span>feature · fix · revert · refactor</span></p>
                <div class="flow-line"><i></i><i></i><i></i></div>
                <p><em>03</em><strong>Build story</strong><span>timeline · insights · share card</span></p>
              </div>
              <div class="terminal-foot"><span>${icon('spark')} No secret key in browser</span><span>Static · GitHub Pages</span></div>
            </div>
          </div>
        </div>
      </section>

      <section class="workspace" aria-live="polite">
        <div class="container">
          <div id="loading-panel" class="loading-panel" hidden></div>
          <div id="error-panel" class="error-panel" hidden></div>
          <div id="result"></div>
        </div>
      </section>

      <section class="method-section">
        <div class="container method-grid">
          <div>
            <h2>단순 요약이 아니라<br>개발 흔적의 패턴을 봅니다.</h2>
          </div>
          <div class="method-list">
            <article><span>01</span><div><h3>Commit Narrative</h3><p>커밋 메시지를 기능, 버그, 되돌림, 리팩터링, UI, 릴리스 같은 개발 사건으로 분류합니다.</p></div></article>
            <article><span>02</span><div><h3>Evidence-first Insight</h3><p>“가장 비싼 기능”, “Biggest Mistake” 같은 지표는 근거가 되는 커밋을 함께 보여주고 추정치는 명확히 표시합니다.</p></div></article>
            <article><span>03</span><div><h3>Shareable Artifact</h3><p>스토리 카드 PNG, JSON, 링크 상태, 30초 WebM으로 분석 결과를 바로 공유할 수 있습니다.</p></div></article>
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <div><span class="brand-mini">BuildStory AI</span><p>Public GitHub repositories → development stories.</p></div>
        <p>브라우저에서 분석 · 저장소 토큰/비밀키 미사용</p>
      </div>
    </footer>
    <div id="toast-region" class="toast-region" aria-live="polite" aria-atomic="true"></div>
    <dialog id="share-dialog" class="share-dialog"></dialog>
  `;

  document.querySelector('#repo-form').addEventListener('submit', handleAnalyze);
  document.querySelector('[data-demo]').addEventListener('click', () => {
    state.analysis = demoAnalysis; state.source = 'demo'; state.activeTab = 'story';
    history.replaceState({}, '', location.pathname);
    renderResult();
    toast('샘플 스토리로 돌아왔습니다.');
  });
  document.querySelector('[data-theme-toggle]').addEventListener('click', toggleTheme);
  renderRecent();
  renderResult();
  applyTheme(storageGet(STORAGE.theme, 'system'));
}

function renderRecent() {
  const holder = document.querySelector('#recent-row');
  const recent = getRecent();
  if (!recent.length) { holder.innerHTML = ''; return; }
  holder.innerHTML = `<span>최근 분석</span>${recent.map((slug) => `<button type="button" data-recent="${escapeHtml(slug)}">${escapeHtml(slug)}</button>`).join('')}`;
  holder.querySelectorAll('[data-recent]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('#repo-input').value = button.dataset.recent;
    document.querySelector('#repo-form').requestSubmit();
  }));
}

function showLoading(progress) {
  const panel = document.querySelector('#loading-panel');
  const result = document.querySelector('#result');
  result.hidden = true;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="loading-orbit"><i></i><i></i><i></i></div>
    <div>
      <strong>${escapeHtml(progress.label || '저장소 분석 중')}</strong>
      <p>GitHub 데이터를 읽고 개발 사건을 재구성하고 있습니다.</p>
      <div class="stepper">${[1,2,3].map((step) => `<span class="${step <= (progress.step || 1) ? 'active' : ''}">${step}</span>`).join('')}</div>
    </div>`;
}

function hideLoading() {
  document.querySelector('#loading-panel').hidden = true;
  document.querySelector('#result').hidden = false;
}

function showError(error) {
  hideLoading();
  const panel = document.querySelector('#error-panel');
  panel.hidden = false;
  const reset = error instanceof GitHubApiError && error.meta?.resetAt ? formatDate(error.meta.resetAt) : '';
  panel.innerHTML = `<div class="error-icon">!</div><div><strong>${escapeHtml(error.message)}</strong><p>${reset ? `API 한도 초기화 예상: ${escapeHtml(reset)}` : '주소가 정확한지 확인한 뒤 다시 시도해주세요.'}</p></div><button class="button button-ghost" type="button" data-close-error>닫기</button>`;
  panel.querySelector('[data-close-error]').addEventListener('click', () => { panel.hidden = true; });
}

async function handleAnalyze(event) {
  event.preventDefault();
  if (state.loading) return;
  const input = document.querySelector('#repo-input');
  const errorPanel = document.querySelector('#error-panel');
  errorPanel.hidden = true;
  try {
    const parsed = parseGitHubRepo(input.value);
    input.value = `https://github.com/${parsed.slug}`;
    state.loading = true;
    const bundle = await fetchRepositoryBundle(input.value, showLoading);
    const analysis = analyzeRepository(bundle);
    state.analysis = analysis;
    state.source = 'github';
    state.activeTab = 'story';
    saveRecent(analysis.slug);
    const url = new URL(location.href);
    url.searchParams.set('repo', analysis.slug);
    history.replaceState({}, '', url);
    renderRecent();
    hideLoading();
    renderResult();
    document.querySelector('#story')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    toast(`${analysis.slug} 분석을 완료했습니다.`, 'success');
  } catch (error) {
    showError(error);
  } finally {
    state.loading = false;
  }
}

function statItem(value, label, note = '') {
  return `<div class="stat-item"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`;
}

function renderResult() {
  const result = document.querySelector('#result');
  const a = state.analysis;
  if (!result || !a) return;
  const repo = a.repository;
  const demoBadge = state.source === 'demo' ? '<span class="source-badge">샘플 데이터</span>' : '<span class="source-badge source-live">GitHub Live</span>';
  result.innerHTML = `
    <section class="result-shell" id="story">
      <div class="result-head">
        <div>
          <div class="repo-kicker">${demoBadge}<span>${escapeHtml(repo.default_branch || 'main')}</span></div>
          <h2>${escapeHtml(a.slug)}</h2>
          <p>${escapeHtml(repo.description || '설명이 없는 저장소입니다.')}</p>
        </div>
        <div class="result-actions">
          <button class="button button-ghost" type="button" data-share>${icon('share')} 공유</button>
          <button class="button button-ghost" type="button" data-export>${icon('download')} JSON</button>
          ${state.source === 'github' ? `<a class="button button-dark" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer">${icon('github')} Repository</a>` : ''}
        </div>
      </div>

      <div class="stats-strip">
        ${statItem(formatNumber(a.stats.commitsObserved), '관찰한 커밋', a.stats.sampledCommits ? '최근 100개 + 최초 커밋' : '')}
        ${statItem(formatNumber(a.stats.pulls), 'PR')}
        ${statItem(formatNumber(a.stats.releases), '릴리스')}
        ${statItem(formatNumber(a.stats.activeDays), '활성 개발일')}
        ${statItem(`${formatNumber(a.stats.estimatedHours)}h`, '개발 시간 추정', '커밋 활동 기반')}
      </div>

      <div class="tabbar" role="tablist" aria-label="BuildStory 결과 보기">
        ${tabButton('story', '개발 스토리')}
        ${tabButton('insights', '인사이트')}
        ${tabButton('architecture', '구조 변화')}
        ${tabButton('video', '30초 영상')}
      </div>
      <div id="tab-content"></div>
    </section>`;

  result.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    renderTabContent();
  }));
  result.querySelector('[data-share]').addEventListener('click', openShareDialog);
  result.querySelector('[data-export]').addEventListener('click', exportJson);
  renderTabContent();
}

function tabButton(id, label) {
  const active = state.activeTab === id;
  return `<button role="tab" aria-selected="${active}" class="${active ? 'active' : ''}" data-tab="${id}">${label}</button>`;
}

function renderTabContent() {
  const content = document.querySelector('#tab-content');
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === state.activeTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (state.activeTab === 'story') content.innerHTML = storyView();
  if (state.activeTab === 'insights') content.innerHTML = insightsView();
  if (state.activeTab === 'architecture') content.innerHTML = architectureView();
  if (state.activeTab === 'video') content.innerHTML = videoView();
  bindTabEvents();
}

function storyView() {
  const a = state.analysis;
  const marks = new Set(getAiMarks(a.slug));
  if (!a.milestones.length) return emptyState('스토리로 만들 커밋 기록이 없습니다.', '커밋이 있는 공개 저장소에서 다시 시도해주세요.');
  return `
    <div class="story-layout">
      <div class="timeline">
        ${a.milestones.map((item, index) => `
          <article class="timeline-item category-${escapeHtml(item.category)}">
            <div class="timeline-rail"><span>${String(index + 1).padStart(2, '0')}</span></div>
            <div class="timeline-card">
              <div class="timeline-meta"><span>DAY ${item.day}</span><time datetime="${escapeHtml(item.date)}">${escapeHtml(formatDate(item.date))}</time><b>${escapeHtml(item.categoryLabel)}</b></div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.description)}</p>
              <div class="timeline-foot">
                <span>@${escapeHtml(item.author)}</span>
                <div>
                  ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">커밋 보기</a>` : ''}
                  <button class="ai-mark ${marks.has(item.id) ? 'active' : ''}" data-ai-mark="${escapeHtml(item.id)}" type="button" aria-pressed="${marks.has(item.id)}">${icon('spark')}${marks.has(item.id) ? 'AI 기여 표시됨' : 'AI 기여 표시'}</button>
                </div>
              </div>
            </div>
          </article>`).join('')}
      </div>
      <aside class="story-aside">
        <div class="aside-card">
          <span class="aside-label">PROJECT ARC</span>
          <strong>${a.stats.spanDays}일의 변화</strong>
          <p>${escapeHtml(formatDate(a.startDate))} → ${escapeHtml(formatDate(a.endDate))}</p>
          <div class="arc-bars">${a.categories.slice(0, 6).map((item) => `<div><span>${escapeHtml(item.label)}</span><i style="--w:${Math.max(8, item.count / Math.max(...a.categories.map(c => c.count)) * 100)}%"></i><b>${item.count}</b></div>`).join('')}</div>
        </div>
        <div class="aside-card muted-card">
          <span class="aside-label">AI CONTRIBUTION</span>
          <strong>${marks.size}개 마일스톤</strong>
          <p>AI가 도운 작업은 저장소에서 자동 판별하지 않습니다. 본인이 직접 표시한 내용만 브라우저에 저장합니다.</p>
        </div>
      </aside>
    </div>`;
}

function insightsView() {
  const { insights, stats } = state.analysis;
  const mistake = insights.biggestMistake;
  const expensive = insights.expensiveFeature;
  return `
    <div class="insights-grid" id="insights">
      <article class="insight-card emphasis">
        <div class="insight-icon">${icon('bug')}</div><span>BIGGEST MISTAKE <button class="info-dot" title="Revert/rollback 커밋을 우선하고 fix 커밋을 보조 신호로 사용하는 휴리스틱입니다.">?</button></span>
        <h3>${mistake ? escapeHtml(truncate(mistake.message, 86)) : '뚜렷한 되돌림 기록 없음'}</h3>
        <p>${mistake ? `${escapeHtml(formatDate(mistake.date))} · ${escapeHtml(mistake.category === 'revert' ? '되돌림 기록' : '수정 기록')}` : '관찰된 커밋 메시지에서 큰 시행착오 신호를 찾지 못했습니다.'}</p>
      </article>
      <article class="insight-card">
        <div class="insight-icon">${icon('branch')}</div><span>MOST EXPENSIVE FEATURE <button class="info-dot" title="feat 커밋 메시지의 scope/핵심 키워드를 묶어 commit 수를 비교합니다.">?</button></span>
        <h3>${expensive ? `${escapeHtml(expensive.name)} · ${expensive.commits} commits` : '기능 클러스터 부족'}</h3>
        <p>코드 라인 수가 아니라 기능 관련 커밋의 반복 횟수로 계산한 근사치입니다.</p>
      </article>
      <article class="insight-card">
        <div class="insight-icon">${icon('clock')}</div><span>DEV TIME ESTIMATE <button class="info-dot" title="활성 개발일과 관찰된 커밋 수를 조합한 휴리스틱이며 실제 작업 시간과 다를 수 있습니다.">?</button></span>
        <h3>약 ${formatNumber(stats.estimatedHours)}시간</h3>
        <p>${stats.activeDays}개 활성일 · ${stats.commitsObserved}개 관찰 커밋 기준. 실제 근무시간이 아닙니다.</p>
      </article>
      <article class="insight-card learnings-card">
        <span>WHAT I LEARNED</span>
        <ul>${insights.learnings.map((lesson) => `<li>${escapeHtml(lesson)}</li>`).join('')}</ul>
      </article>
      <article class="insight-card bug-card">
        <span>BUG GRAVEYARD</span>
        ${insights.bugGraveyard.length ? `<ol>${insights.bugGraveyard.map((bug) => `<li><strong>${escapeHtml(truncate(bug.message, 70))}</strong><small>${escapeHtml(formatDate(bug.date))}</small></li>`).join('')}</ol>` : '<p>관찰된 커밋에서 fix/revert 패턴을 찾지 못했습니다.</p>'}
      </article>
      <article class="insight-card before-card">
        <span>BEFORE / AFTER</span>
        ${insights.beforeAfter ? `<div class="before-after"><div><small>처음</small><strong>${escapeHtml(truncate(insights.beforeAfter.before.message, 66))}</strong></div><i>${icon('arrow')}</i><div><small>현재</small><strong>${escapeHtml(truncate(insights.beforeAfter.after.message, 66))}</strong></div></div>` : '<p>비교 가능한 커밋이 부족합니다.</p>'}
      </article>
    </div>`;
}

function architectureView() {
  const a = state.analysis;
  const deps = a.insights.dependencies;
  return `
    <div class="architecture-grid">
      <article class="architecture-main">
        <span class="section-label">ARCHITECTURE EVOLUTION</span>
        <h3>구조를 바꾼 커밋</h3>
        ${a.insights.architectureEvolution.length ? `<div class="architecture-list">${a.insights.architectureEvolution.map((item) => `<div><span>${escapeHtml(formatDate(item.date))}</span><strong>${escapeHtml(truncate(item.message, 90))}</strong></div>`).join('')}</div>` : emptyState('구조 변경 신호가 적습니다.', 'refactor, migrate, dependency 같은 커밋 메시지가 있으면 여기에 표시됩니다.', true)}
      </article>
      <aside>
        <div class="aside-card">
          <span class="aside-label">LANGUAGES</span>
          ${a.languages.length ? `<div class="language-list">${a.languages.map((item) => `<div><span>${escapeHtml(item.name)}</span><i><b style="width:${item.percent}%"></b></i><strong>${item.percent}%</strong></div>`).join('')}</div>` : '<p>언어 통계를 가져오지 못했습니다.</p>'}
        </div>
        <div class="aside-card">
          <span class="aside-label">CURRENT DEPENDENCIES</span>
          <strong>${deps.runtime.length + deps.dev.length} packages observed</strong>
          <div class="dependency-cloud">${[...deps.runtime.slice(0, 8), ...deps.dev.slice(0, 5)].map((dep) => `<span>${escapeHtml(dep)}</span>`).join('') || '<p>루트 package.json이 없거나 읽을 수 없습니다.</p>'}</div>
        </div>
      </aside>
    </div>`;
}

function videoView() {
  const a = state.analysis;
  const slides = a.milestones.slice(0, 6);
  return `
    <div class="video-panel" id="video">
      <div class="video-copy">
        <span class="section-label">GITHUB → 30 SECOND STORY</span>
        <h3>개발 과정을 짧은 영상으로</h3>
        <p>마일스톤을 16:9 카드로 자동 재생합니다. 최신 Chrome/Edge에서는 30초 WebM 파일도 브라우저에서 직접 렌더링합니다.</p>
        <div class="video-actions">
          <button class="button button-primary" type="button" data-video>${icon('film')} 30초 WebM 만들기</button>
          <button class="button button-ghost" type="button" data-story-card>${icon('download')} 스토리 카드 PNG</button>
        </div>
        <div class="video-progress" ${state.videoProgress ? '' : 'hidden'}><i style="width:${state.videoProgress}%"></i><span>${state.videoProgress}%</span></div>
        <small>MP4 인코딩은 정적 GitHub Pages만으로 안정적으로 제공하기 어려워 MVP에서는 WebM으로 내보냅니다.</small>
      </div>
      <div class="video-preview" data-video-preview>
        ${slides.map((slide, index) => `<article class="video-slide ${index === 0 ? 'active' : ''}" data-slide="${index}"><span>DAY ${slide.day}</span><h4>${escapeHtml(slide.title)}</h4><p>${escapeHtml(slide.description)}</p><small>${escapeHtml(a.slug)}</small></article>`).join('')}
        <div class="video-dots">${slides.map((_, index) => `<button type="button" aria-label="${index + 1}번째 장면" data-slide-dot="${index}" class="${index === 0 ? 'active' : ''}"></button>`).join('')}</div>
      </div>
    </div>`;
}

function emptyState(title, body, compact = false) {
  return `<div class="empty-state ${compact ? 'compact' : ''}"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div>`;
}

function bindTabEvents() {
  document.querySelectorAll('[data-ai-mark]').forEach((button) => button.addEventListener('click', () => toggleAiMark(button.dataset.aiMark)));
  document.querySelector('[data-video]')?.addEventListener('click', handleVideoExport);
  document.querySelector('[data-story-card]')?.addEventListener('click', downloadStoryCard);
  const preview = document.querySelector('[data-video-preview]');
  if (preview) {
    let active = 0;
    const activate = (index) => {
      active = index;
      preview.querySelectorAll('[data-slide]').forEach((el) => el.classList.toggle('active', Number(el.dataset.slide) === active));
      preview.querySelectorAll('[data-slide-dot]').forEach((el) => el.classList.toggle('active', Number(el.dataset.slideDot) === active));
    };
    preview.querySelectorAll('[data-slide-dot]').forEach((button) => button.addEventListener('click', () => activate(Number(button.dataset.slideDot))));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = setInterval(() => {
        if (!document.body.contains(preview) || state.activeTab !== 'video') { clearInterval(timer); return; }
        activate((active + 1) % preview.querySelectorAll('[data-slide]').length);
      }, 3200);
    }
  }
}

async function handleVideoExport() {
  const button = document.querySelector('[data-video]');
  button.disabled = true;
  button.textContent = '영상 렌더링 중…';
  try {
    state.videoProgress = 1;
    await createStoryVideo(state.analysis, (progress) => {
      state.videoProgress = progress;
      const bar = document.querySelector('.video-progress');
      if (bar) { bar.hidden = false; bar.querySelector('i').style.width = `${progress}%`; bar.querySelector('span').textContent = `${progress}%`; }
    });
    toast('30초 WebM 영상을 저장했습니다.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.videoProgress = 0;
    if (document.body.contains(button)) { button.disabled = false; button.innerHTML = `${icon('film')} 30초 WebM 만들기`; }
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.analysis, (key, value) => key === 'raw' ? undefined : value, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `${state.analysis.slug.replace('/', '-')}-buildstory.json`);
  toast('BuildStory JSON을 저장했습니다.', 'success');
}

function openShareDialog() {
  const dialog = document.querySelector('#share-dialog');
  const shareUrl = new URL(location.href);
  if (state.source === 'github') shareUrl.searchParams.set('repo', state.analysis.slug); else shareUrl.search = '';
  dialog.innerHTML = `
    <form method="dialog" class="dialog-head"><div><strong>BuildStory 공유</strong><p>${escapeHtml(state.analysis.slug)}</p></div><button class="icon-button close-button" value="cancel" aria-label="닫기">×</button></form>
    <div class="share-body">
      <label>공유 링크<input readonly value="${escapeHtml(shareUrl.toString())}"></label>
      <div class="share-actions"><button class="button button-primary" type="button" data-copy-link>링크 복사</button><button class="button button-ghost" type="button" data-native-share>공유 메뉴</button></div>
      <button class="share-card-button" type="button" data-story-card-dialog>${icon('download')} PNG 스토리 카드도 함께 저장</button>
    </div>`;
  dialog.showModal();
  dialog.querySelector('[data-copy-link]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareUrl.toString()); toast('공유 링크를 복사했습니다.', 'success'); }
    catch { toast('클립보드에 복사하지 못했습니다.', 'error'); }
  });
  dialog.querySelector('[data-native-share]').addEventListener('click', async () => {
    if (!navigator.share) { toast('이 브라우저는 시스템 공유 메뉴를 지원하지 않습니다.'); return; }
    try { await navigator.share({ title: `${state.analysis.slug} · BuildStory AI`, text: 'GitHub 개발 과정을 BuildStory로 확인해보세요.', url: shareUrl.toString() }); } catch { /* user cancelled */ }
  });
  dialog.querySelector('[data-story-card-dialog]').addEventListener('click', downloadStoryCard);
}

function downloadStoryCard() {
  const a = state.analysis;
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#07111f'; ctx.fillRect(0, 0, 1200, 630);
  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, 'rgba(72, 114, 255, .35)'); gradient.addColorStop(1, 'rgba(61, 217, 174, .08)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#75e4c4'; ctx.font = '700 28px system-ui, sans-serif'; ctx.fillText('BuildStory AI', 72, 78);
  ctx.fillStyle = '#f6fbff'; ctx.font = '800 50px system-ui, sans-serif'; ctx.fillText(a.slug, 72, 150);
  ctx.fillStyle = '#9db0c8'; ctx.font = '400 24px system-ui, sans-serif'; ctx.fillText(`${a.stats.commitsObserved} commits observed · ${a.stats.activeDays} active days · ${a.stats.releases} releases`, 72, 198);
  const items = a.milestones.slice(0, 4);
  items.forEach((item, index) => {
    const y = 278 + index * 76;
    ctx.fillStyle = '#75e4c4'; ctx.font = '700 18px system-ui, sans-serif'; ctx.fillText(`DAY ${item.day}`, 72, y);
    ctx.fillStyle = '#f6fbff'; ctx.font = '650 24px system-ui, sans-serif'; ctx.fillText(truncate(item.title, 58), 190, y);
    if (index < items.length - 1) { ctx.fillStyle = 'rgba(255,255,255,.11)'; ctx.fillRect(72, y + 26, 1056, 1); }
  });
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `${a.slug.replace('/', '-')}-story-card.png`);
    toast('스토리 카드 PNG를 저장했습니다.', 'success');
  }, 'image/png');
}

async function autoLoadFromUrl() {
  const params = new URLSearchParams(location.search);
  const repo = params.get('repo');
  if (!repo) return;
  document.querySelector('#repo-input').value = repo;
  document.querySelector('#repo-form').requestSubmit();
}

renderShell();
autoLoadFromUrl();
