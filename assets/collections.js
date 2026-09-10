(() => {
  'use strict';

  const DB_NAME = 'newsweave-collections';
  const DB_VERSION = 1;
  const PAGE_SIZE = 40;
  const DEFAULT_CATEGORIES = ['WORLD','ECONOMY','TECHNOLOGY','SCIENCE','HEALTH','CLIMATE','SPACE','CULTURE','SPORTS','AI'];

  const state = {
    db: null,
    catalogMeta: null,
    config: { categories: DEFAULT_CATEGORIES, defaultCollections: [] },
    catalogItems: [],
    customItems: [],
    allItems: [],
    collections: [],
    saved: [],
    activity: [],
    selectedIds: new Set(),
    visibleLimit: PAGE_SIZE,
    activeView: 'explore',
    activeCollectionId: null,
    filters: { q: '', category: '', sort: 'newest' },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const nowIso = () => new Date().toISOString();
  const today = () => new Date().toLocaleDateString('sv-SE');
  const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const norm = (value) => String(value ?? '').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
  const splitTerms = (value) => String(value ?? '').split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
  const safeExternalHref = (value) => {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  };
  const fmtDate = (value) => {
    try { return new Intl.DateTimeFormat('ko-KR', {year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(`${value}T00:00:00`)); }
    catch { return value; }
  };
  const fmtDateTime = (value) => {
    try { return new Intl.DateTimeFormat('ko-KR', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)); }
    catch { return value; }
  };

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('collections')) db.createObjectStore('collections', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('saved')) {
          const store = db.createObjectStore('saved', { keyPath: 'id' });
          store.createIndex('collectionId', 'collectionId', { unique: false });
          store.createIndex('itemId', 'itemId', { unique: false });
        }
        if (!db.objectStoreNames.contains('custom')) db.createObjectStore('custom', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('activity')) db.createObjectStore('activity', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB를 열 수 없습니다.'));
    });
  }

  function storeAction(storeName, mode, action) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try { result = action(store); } catch (e) { reject(e); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error(`${storeName} 저장소 작업 실패`));
      tx.onabort = () => reject(tx.error || new Error(`${storeName} 저장소 작업 중단`));
    });
  }

  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function getOne(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const put = (store, value) => storeAction(store, 'readwrite', s => s.put(value));
  const del = (store, key) => storeAction(store, 'readwrite', s => s.delete(key));
  const clearStore = (store) => storeAction(store, 'readwrite', s => s.clear());
  const bulkPut = (storeName, rows) => storeAction(storeName, 'readwrite', store => rows.forEach(row => store.put(row)));

  function toast(title, detail = '', tone = 'good') {
    const node = document.createElement('div');
    node.className = `toast ${tone}`;
    node.innerHTML = `<b>${esc(title)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}`;
    $('#toastStack').append(node);
    setTimeout(() => node.remove(), 3600);
  }

  function currentCategories() {
    const fromCatalog = state.catalogMeta?.stats?.categories?.map(x => x.name) || [];
    return [...new Set([...fromCatalog, ...(state.config.categories || DEFAULT_CATEGORIES), ...state.customItems.map(i => i.category).filter(Boolean)])];
  }

  function collectionSavedCount(id) {
    return state.saved.filter(x => x.collectionId === id).length;
  }

  function savedCollectionNames(itemId) {
    const ids = state.saved.filter(x => x.itemId === itemId).map(x => x.collectionId);
    return state.collections.filter(c => ids.includes(c.id)).map(c => c.name);
  }

  function itemMap() {
    return new Map(state.allItems.map(item => [item.id, item]));
  }

  function hasRule(collection) {
    const r = collection.rules || {};
    return (r.categories?.length || 0) + (r.keywords?.length || 0) + (r.sources?.length || 0) > 0;
  }

  function matchesRule(item, collection) {
    const r = collection.rules || {};
    const categories = r.categories || [];
    const keywords = (r.keywords || []).map(norm).filter(Boolean);
    const sources = (r.sources || []).map(norm).filter(Boolean);
    const searchable = item.searchText || norm([item.title,item.summary,item.detail,item.source,item.sourceDomain,item.category,item.topic].join(' '));
    const sourceText = norm(`${item.source || ''} ${item.sourceDomain || ''}`);

    if (categories.length && !categories.includes(item.category)) return false;
    if (keywords.length) {
      const checks = keywords.map(k => searchable.includes(k));
      if ((r.mode || 'any') === 'all' ? !checks.every(Boolean) : !checks.some(Boolean)) return false;
    }
    if (sources.length && !sources.some(s => sourceText.includes(s))) return false;
    return hasRule(collection);
  }

  async function logActivity(type, collection, detail, itemId = '') {
    const record = {
      id: uid('log'),
      at: nowIso(),
      type,
      collectionId: collection?.id || '',
      collectionName: collection?.name || '',
      itemId,
      detail,
    };
    await put('activity', record);
    state.activity.unshift(record);
  }

  async function saveItemsToCollection(collectionId, itemIds, source = 'manual') {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) throw new Error('저장할 모음집을 찾을 수 없습니다.');
    const existing = new Set(state.saved.filter(s => s.collectionId === collectionId).map(s => s.itemId));
    const timestamp = nowIso();
    const rows = [...new Set(itemIds)].filter(id => !existing.has(id)).map(itemId => ({
      id: `${collectionId}::${itemId}`,
      collectionId,
      itemId,
      addedAt: timestamp,
      addedBy: source,
      note: '',
      tags: [],
    }));
    if (!rows.length) return 0;
    await bulkPut('saved', rows);
    state.saved.push(...rows);
    await logActivity(source === 'rule' ? 'auto-transfer' : 'manual-transfer', collection, `${rows.length}개 자료가 저장되었습니다.`);
    return rows.length;
  }

  async function runAutoSort(collection, quiet = false) {
    if (!hasRule(collection)) {
      if (!quiet) toast('자동 정리 규칙이 없습니다.', `${collection.name}의 규칙을 먼저 설정해주세요.`, 'error');
      return 0;
    }
    const matched = state.allItems.filter(item => matchesRule(item, collection)).map(item => item.id);
    const added = await saveItemsToCollection(collection.id, matched, 'rule');
    if (!quiet) toast('자동 정리 완료', added ? `${collection.name}에 ${added}개 자료를 새로 저장했습니다.` : `${collection.name}에는 새로 들어갈 자료가 없습니다.`);
    return added;
  }

  async function runAllAutoSort({ autoOnly = false, quiet = false } = {}) {
    const targets = state.collections.filter(c => (!autoOnly || c.autoSync) && hasRule(c));
    let total = 0;
    for (const c of targets) total += await runAutoSort(c, true);
    if (!quiet) toast('전체 자동 정리 완료', total ? `${targets.length}개 모음집에 새 자료 ${total}개를 전이했습니다.` : '새로 분류할 자료가 없습니다.');
    return total;
  }

  async function seedCollectionsIfNeeded() {
    if (state.collections.length) return;
    const t = nowIso();
    const defaults = state.config.defaultCollections?.length ? state.config.defaultCollections : [
      { name:'경제 · 시장', description:'경제, 금융, 기업과 시장 변화를 자동으로 모읍니다.', rules:{categories:['ECONOMY'],keywords:[],sources:[],mode:'any'}, autoSync:true },
      { name:'기술 · AI', description:'기술 산업과 인공지능 흐름을 함께 추적합니다.', rules:{categories:['TECHNOLOGY','AI'],keywords:[],sources:[],mode:'any'}, autoSync:true },
      { name:'과학 · 건강', description:'연구, 과학, 의료·바이오 뉴스를 한곳에 정리합니다.', rules:{categories:['SCIENCE','HEALTH'],keywords:[],sources:[],mode:'any'}, autoSync:true },
    ];
    const seed = defaults.map(c => ({...c, id:uid('col'), createdAt:t, updatedAt:t}));
    await bulkPut('collections', seed);
    state.collections = seed;
    await runAllAutoSort({ autoOnly:true, quiet:true });
    toast('시작용 모음집을 만들었습니다.', '규칙을 수정하거나 새 모음집을 추가해 바로 사용할 수 있습니다.');
  }

  async function maybeAutoSyncNewCatalog() {
    const old = await getOne('settings', 'catalogVersion');
    const current = state.catalogMeta?.contentVersion || state.catalogMeta?.generatedAt || '';
    if (!current || old?.value === current) return;
    await runAllAutoSort({ autoOnly:true, quiet:true });
    await put('settings', { key:'catalogVersion', value:current, updatedAt:nowIso() });
  }

  function renderSidebar() {
    const totalSaved = state.saved.length;
    $('#sideStats').textContent = `${state.collections.length}개 저장소 · ${totalSaved.toLocaleString()}건 저장`;
    $('#collectionList').innerHTML = state.collections.map(c => `
      <button class="collection-link ${state.activeCollectionId === c.id ? 'is-active' : ''}" type="button" data-open-collection="${esc(c.id)}">
        <strong><span>${esc(c.name)}</span><span class="count-badge">${collectionSavedCount(c.id)}</span></strong>
        <small>${esc(c.description || ruleSummary(c))}</small>
      </button>`).join('') || `<div class="empty"><strong>모음집이 없습니다.</strong>새 저장소를 만들어보세요.</div>`;
    renderBulkOptions();
  }

  function renderBulkOptions() {
    const select = $('#bulkCollection');
    const prev = select.value;
    select.innerHTML = state.collections.length
      ? `<option value="">모음집 선택</option>${state.collections.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}`
      : `<option value="">모음집 없음</option>`;
    if (state.collections.some(c => c.id === prev)) select.value = prev;
  }

  function renderHeroMetrics() {
    const uniqueSaved = new Set(state.saved.map(s => s.itemId)).size;
    const autoCount = state.saved.filter(s => s.addedBy === 'rule').length;
    const catalogCount = state.catalogItems.length;
    const externalCount = Number(state.catalogMeta?.stats?.externalItems || 0);
    const customCount = state.customItems.length;
    $('#heroMetrics').innerHTML = [
      [catalogCount.toLocaleString(), '수집된 뉴스 카탈로그'],
      [state.collections.length.toLocaleString(), '모음집 저장소'],
      [uniqueSaved.toLocaleString(), '저장한 고유 자료'],
      [(externalCount + customCount).toLocaleString(), '자동 수집 + 직접 추가'],
    ].map(([v,l]) => `<div class="metric"><strong>${v}</strong><span>${l}</span></div>`).join('');
  }


  function resolveGithubRepoContext() {
    try {
      const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
      const url = new URL(canonical, location.href);
      if (!url.hostname.endsWith('.github.io')) return null;
      const owner = url.hostname.replace(/\.github\.io$/i, '');
      const repo = url.pathname.split('/').filter(Boolean)[0];
      if (!owner || !repo) return null;
      return { owner, repo, base: `https://github.com/${owner}/${repo}` };
    } catch { return null; }
  }

  function openGuideDialog() {
    const ctx = resolveGithubRepoContext();
    const actionsLink = $('#actionsWorkflowLink');
    const configLink = $('#sourcesConfigLink');
    if (ctx) {
      actionsLink.href = `${ctx.base}/actions/workflows/deploy.yml`;
      configLink.href = `${ctx.base}/edit/main/config/sources.json`;
      actionsLink.textContent = 'GitHub Actions에서 지금 수집';
      configLink.textContent = 'sources.json 바로 편집';
    } else {
      actionsLink.href = 'https://github.com/';
      configLink.href = 'https://github.com/';
      actionsLink.textContent = 'GitHub에서 Actions 열기';
      configLink.textContent = 'GitHub에서 sources.json 편집';
    }
    $('#guideDialog').showModal();
  }

  function renderStarterCards() {
    const total = state.allItems.length;
    const cards = [
      {
        icon: '01', action: 'guide',
        title: total ? `카탈로그 ${total.toLocaleString()}건 확인` : '뉴스를 먼저 수집하기',
        description: total ? '현재 자동 수집된 기사가 있습니다. 카드를 눌러 수집·갱신 방법을 확인합니다.' : 'Actions의 Run workflow를 누르면 10개 기본 분야를 즉시 수집합니다.',
        footer: total ? '수집 구조 보기 →' : '가장 먼저 할 일 →'
      },
      { icon: '02', category: 'ECONOMY', title: '경제 · 시장 뉴스', description: '경제·금융·기업 관련 카탈로그만 바로 필터링합니다.', footer: 'ECONOMY 필터 →' },
      { icon: '03', category: 'TECHNOLOGY', title: '기술 · 산업 뉴스', description: '기술·반도체·소프트웨어 관련 카탈로그를 탐색합니다.', footer: 'TECHNOLOGY 필터 →' },
      { icon: '04', action: 'collection', title: '내 모음집 만들기', description: '카테고리·키워드·출처 조건을 저장하면 새 뉴스가 자동 정리됩니다.', footer: '자동 분류 규칙 만들기 →' },
    ];
    $('#starterGrid').innerHTML = cards.map(card => `<button class="starter-card" type="button" ${card.category ? `data-starter-category="${esc(card.category)}"` : ''} ${card.action ? `data-starter-action="${esc(card.action)}"` : ''}>
      <span class="starter-icon">${esc(card.icon)}</span><strong>${esc(card.title)}</strong><span>${esc(card.description)}</span><em>${esc(card.footer)}</em>
    </button>`).join('');
  }

  function openArticleDialog(itemId) {
    const item = state.allItems.find(row => row.id === itemId);
    if (!item) return;
    const safeUrl = safeExternalHref(item.url);
    const savedNames = savedCollectionNames(item.id);
    const source = item.source || item.sourceDomain || '출처 미상';
    const detail = item.detail || item.summary || '본문 요약이 제공되지 않았습니다. 원문에서 자세한 내용을 확인하세요.';
    const origin = item.origin === 'custom' ? '직접 추가' : '자동 수집';
    $('#articleDialogTitle').textContent = '뉴스 상세';
    $('#articleDialogBody').innerHTML = `
      <div class="article-kicker"><span class="cat-tag ${esc(item.category)}">${esc(item.category)}</span><span>${esc(fmtDate(item.date))}</span><span>${esc(origin)}</span></div>
      <h3 class="article-title">${esc(item.title)}</h3>
      ${item.summary ? `<p class="article-summary">${esc(item.summary)}</p>` : ''}
      <div class="article-detail">${esc(detail)}</div>
      <div class="article-source"><b>${esc(source)}</b>${item.author ? `<span>· ${esc(item.author)}</span>` : ''}${item.sourceDomain ? `<span>· ${esc(item.sourceDomain)}</span>` : ''}</div>
      <div class="article-links">${safeUrl ? `<a class="btn soft" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">원문 새 탭에서 열기 ↗</a>` : ''}</div>
      <div class="article-savebox">
        <select id="articleCollectionSelect" aria-label="저장할 모음집">${state.collections.length ? state.collections.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('') : '<option value="">모음집 없음</option>'}</select>
        <button class="btn primary" type="button" data-article-save="${esc(item.id)}">모음집에 저장</button>
      </div>
      <div class="article-saved">${savedNames.length ? `현재 저장: ${esc(savedNames.join(', '))}` : '아직 모음집에 저장되지 않았습니다.'}</div>`;
    $('#articleDialog').showModal();
  }

  function renderFilters() {
    const categories = currentCategories();
    $('#categoryFilter').innerHTML = `<option value="">전체</option>${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}`;
    $('#categoryFilter').value = state.filters.category;
    $('#categoryRail').innerHTML = [`<button type="button" class="filter-chip ${!state.filters.category?'is-active':''}" data-cat="">전체</button>`, ...categories.map(c => `<button type="button" class="filter-chip ${state.filters.category===c?'is-active':''}" data-cat="${esc(c)}">${esc(c)} <span>${state.allItems.filter(i=>i.category===c).length}</span></button>`)].join('');
    $('#materialCategory').innerHTML = categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('#ruleCategories').innerHTML = categories.map(c => `<label class="rule-check"><input type="checkbox" name="ruleCategory" value="${esc(c)}">${esc(c)}</label>`).join('');
  }

  function filteredItems() {
    const terms = norm(state.filters.q).split(' ').filter(Boolean);
    let rows = state.allItems.filter(item => {
      if (state.filters.category && item.category !== state.filters.category) return false;
      if (terms.length) {
        const text = item.searchText || norm([item.title,item.summary,item.detail,item.source,item.sourceDomain,item.category,item.topic].join(' '));
        if (!terms.every(term => text.includes(term))) return false;
      }
      return true;
    });
    const sort = state.filters.sort;
    rows = rows.slice().sort((a,b) => {
      if (sort === 'oldest') return a.date.localeCompare(b.date) || a.rank - b.rank;
      if (sort === 'title') return a.title.localeCompare(b.title, 'ko-KR');
      return b.date.localeCompare(a.date) || (a.rank || 99) - (b.rank || 99);
    });
    return rows;
  }

  function resultRow(item) {
    const savedNames = savedCollectionNames(item.id);
    const safeUrl = safeExternalHref(item.url);
    const sourceLink = safeUrl ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${esc(item.source || item.sourceDomain || '원문')} ↗</a>` : '';
    const editionLink = '';
    const originLabel = item.origin === 'custom' ? '직접 추가' : '자동 수집';
    return `<article class="result-row" data-item-id="${esc(item.id)}" data-card-item="${esc(item.id)}">
      <input class="result-check" type="checkbox" aria-label="${esc(item.title)} 선택" data-select-item="${esc(item.id)}" ${state.selectedIds.has(item.id)?'checked':''}>
      <div class="result-main">
        <div class="result-meta"><span class="cat-tag ${esc(item.category)}">${esc(item.category)}</span><span>${esc(fmtDate(item.date))}</span>${item.topic?`<span>${esc(item.topic)}</span>`:''}<span>${originLabel}</span></div>
        <h3><button class="result-title" type="button" data-open-item="${esc(item.id)}">${esc(item.title)}</button></h3>
        <p>${esc(item.summary || item.detail || '요약 없음')}</p>
        <div class="result-links">${sourceLink}${editionLink}</div>
      </div>
      <div class="result-actions">
        <button class="btn soft" type="button" data-save-one="${esc(item.id)}">모음집에 저장</button>
        <span class="saved-in">${savedNames.length ? `${savedNames.length}곳 저장 · ${esc(savedNames.slice(0,2).join(', '))}${savedNames.length>2?'…':''}` : '미저장'}</span>
      </div>
    </article>`;
  }

  function renderResults() {
    const rows = filteredItems();
    const visible = rows.slice(0, state.visibleLimit);
    $('#resultCount').textContent = `${rows.length.toLocaleString()}개 자료`;
    $('#resultHint').textContent = state.filters.q || state.filters.category ? '현재 검색·필터 조건에 맞는 결과입니다.' : `전체 ${state.allItems.length.toLocaleString()}개 자료를 최신순으로 표시합니다.`;
    $('#resultList').innerHTML = visible.length ? visible.map(resultRow).join('') : (state.allItems.length ? `<div class="empty"><strong>검색 결과가 없습니다.</strong>키워드나 카테고리 조건을 바꿔보세요.<div class="empty-actions"><button class="btn ghost" type="button" data-cat="">전체 자료 보기</button></div></div>` : `<div class="empty"><strong>아직 수집된 뉴스가 없습니다.</strong>저장소 생성은 완료됐지만 첫 수집이 아직 반영되지 않은 상태입니다. <b>GitHub Actions에서 Run workflow</b>를 실행하면 카탈로그를 바로 채울 수 있습니다.<div class="empty-actions"><button class="btn primary" type="button" data-open-guide>수집 방법 보기</button><button class="btn soft" type="button" data-starter-action="material">링크 직접 추가</button></div></div>`);
    $('#loadMoreBtn').hidden = visible.length >= rows.length;
    updateSelectionUI();
  }

  function updateSelectionUI() {
    const count = state.selectedIds.size;
    $('#selectedCount').textContent = count;
    $('#bulkSaveBtn').disabled = count === 0 || !state.collections.length;
    const visibleIds = filteredItems().slice(0,state.visibleLimit).map(i=>i.id);
    $('#selectAllVisible').checked = visibleIds.length > 0 && visibleIds.every(id=>state.selectedIds.has(id));
  }

  function ruleSummary(c) {
    const r = c.rules || {};
    const parts = [];
    if (r.categories?.length) parts.push(r.categories.join(' · '));
    if (r.keywords?.length) parts.push(`키워드 ${r.keywords.length}개`);
    if (r.sources?.length) parts.push(`출처 ${r.sources.length}개`);
    return parts.join(' / ') || '자동 정리 규칙 없음';
  }

  function renderCollectionsGrid() {
    $('#collectionsGrid').innerHTML = state.collections.length ? state.collections.map(c => `
      <article class="repo-card">
        <span class="micro">${c.autoSync?'AUTO SYNC ON':'MANUAL'}</span>
        <h3>${esc(c.name)}</h3>
        <p>${esc(c.description || '설명 없음')}</p>
        <div class="repo-stat">${collectionSavedCount(c.id)}</div>
        <div class="repo-rule">${(c.rules?.categories||[]).map(x=>`<span class="rule-pill">${esc(x)}</span>`).join('')}${(c.rules?.keywords||[]).slice(0,3).map(x=>`<span class="rule-pill">${esc(x)}</span>`).join('') || (!hasRule(c)?'<span class="rule-pill">규칙 없음</span>':'')}</div>
        <div class="repo-actions"><button class="btn soft" type="button" data-open-collection="${esc(c.id)}">열기</button><button class="btn ghost" type="button" data-edit-collection="${esc(c.id)}">규칙 편집</button></div>
      </article>`).join('') : `<div class="empty"><strong>아직 모음집이 없습니다.</strong>카테고리와 키워드 규칙을 가진 저장소를 만들어보세요.</div>`;
  }

  function renderCollectionDetail() {
    const c = state.collections.find(x => x.id === state.activeCollectionId);
    if (!c) { switchView('collections'); return; }
    const map = itemMap();
    const savedRows = state.saved.filter(x => x.collectionId === c.id).sort((a,b)=>b.addedAt.localeCompare(a.addedAt));
    const items = savedRows.map(s => ({saved:s,item:map.get(s.itemId)})).filter(x=>x.item);
    $('#collectionDetail').innerHTML = `
      <div class="detail-hero">
        <div><span class="micro">${c.autoSync?'AUTO-FILING ENABLED':'MANUAL COLLECTION'}</span><h1>${esc(c.name)}</h1><p>${esc(c.description || '설명 없음')}</p></div>
        <div class="detail-actions"><button class="btn soft" type="button" data-sync-collection="${esc(c.id)}">규칙 지금 적용</button><button class="btn ghost" type="button" data-edit-collection="${esc(c.id)}">규칙 편집</button><button class="btn ghost" type="button" data-delete-collection="${esc(c.id)}">삭제</button></div>
      </div>
      <div class="detail-rule"><b>자동 정리 기준:</b> ${esc(ruleSummary(c))} · 키워드 판정 ${c.rules?.mode==='all'?'모두 포함':'하나라도 포함'} · 자동 동기화 ${c.autoSync?'사용':'사용 안 함'}</div>
      <div class="result-toolbar"><div><strong>${items.length.toLocaleString()}개 저장</strong><span>수동 저장과 규칙 기반 전이 결과가 함께 표시됩니다.</span></div></div>
      <div class="result-list">${items.length ? items.map(({saved,item}) => `<article class="result-row" data-card-item="${esc(item.id)}">
        <div></div><div class="result-main"><div class="result-meta"><span class="cat-tag ${esc(item.category)}">${esc(item.category)}</span><span>${esc(fmtDate(item.date))}</span><span>${saved.addedBy==='rule'?'자동 전이':'수동 저장'}</span></div><h3><button class="result-title" type="button" data-open-item="${esc(item.id)}">${esc(item.title)}</button></h3><p>${esc(item.summary||item.detail||'')}</p><div class="result-links">${safeExternalHref(item.url)?`<a href="${esc(safeExternalHref(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.source||'원문')} ↗</a>`:''}${item.edition?`<a href="${esc(item.edition)}">해당 호 보기 →</a>`:''}</div></div><div class="result-actions"><button class="btn ghost" type="button" data-remove-saved="${esc(saved.id)}">이 모음집에서 제거</button></div>
      </article>`).join('') : `<div class="empty"><strong>저장된 자료가 없습니다.</strong>탐색 화면에서 자료를 저장하거나 자동 정리 규칙을 적용하세요.</div>`}</div>`;
  }

  function renderActivity() {
    $('#activityList').innerHTML = state.activity.length ? state.activity.map(log => `
      <article class="activity-item"><div class="activity-time">${esc(fmtDateTime(log.at))}</div><div><strong>${esc(log.collectionName || activityLabel(log.type))}</strong><p>${esc(log.detail || activityLabel(log.type))}</p></div></article>`).join('') : `<div class="empty"><strong>아직 정리 기록이 없습니다.</strong>자료를 저장하거나 자동 정리를 실행하면 이곳에 기록됩니다.</div>`;
  }

  function activityLabel(type) {
    return ({'auto-transfer':'자동 전이','manual-transfer':'수동 저장','collection-created':'모음집 생성','collection-updated':'모음집 수정','collection-deleted':'모음집 삭제','custom-added':'외부 자료 추가'}[type] || type || '기록');
  }

  function renderAll() {
    renderSidebar();
    renderHeroMetrics();
    renderStarterCards();
    renderFilters();
    renderResults();
    renderCollectionsGrid();
    if (state.activeCollectionId) renderCollectionDetail();
    renderActivity();
  }

  function switchView(name, collectionId = null) {
    state.activeView = name;
    if (collectionId) state.activeCollectionId = collectionId;
    $$('.view').forEach(v => v.hidden = true);
    if (name === 'explore') $('#exploreView').hidden = false;
    if (name === 'collections') $('#collectionsView').hidden = false;
    if (name === 'collection-detail') { $('#collectionDetailView').hidden = false; renderCollectionDetail(); }
    if (name === 'activity') { $('#activityView').hidden = false; renderActivity(); }
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === (name === 'collection-detail' ? 'collections' : name)));
    renderSidebar();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function openCollectionDialog(collection = null) {
    $('#collectionForm').reset();
    $('#collectionId').value = collection?.id || '';
    $('#collectionDialogTitle').textContent = collection ? '모음집 규칙 편집' : '새 모음집';
    $('#collectionName').value = collection?.name || '';
    $('#collectionDescription').value = collection?.description || '';
    $('#ruleKeywords').value = (collection?.rules?.keywords || []).join(', ');
    $('#ruleSources').value = (collection?.rules?.sources || []).join(', ');
    $('#ruleMode').value = collection?.rules?.mode || 'any';
    $('#ruleAutoSync').checked = collection ? !!collection.autoSync : true;
    const selected = new Set(collection?.rules?.categories || []);
    $$('input[name="ruleCategory"]').forEach(x => x.checked = selected.has(x.value));
    $('#collectionDialog').showModal();
    setTimeout(() => $('#collectionName').focus(), 30);
  }

  async function handleCollectionSubmit(e) {
    e.preventDefault();
    const id = $('#collectionId').value || uid('col');
    const existing = state.collections.find(c => c.id === id);
    const collection = {
      id,
      name: $('#collectionName').value.trim(),
      description: $('#collectionDescription').value.trim(),
      rules: {
        categories: $$('input[name="ruleCategory"]:checked').map(x => x.value),
        keywords: splitTerms($('#ruleKeywords').value),
        sources: splitTerms($('#ruleSources').value),
        mode: $('#ruleMode').value,
      },
      autoSync: $('#ruleAutoSync').checked,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    if (!collection.name) return;
    await put('collections', collection);
    if (existing) state.collections = state.collections.map(c => c.id === id ? collection : c);
    else state.collections.push(collection);
    await logActivity(existing ? 'collection-updated' : 'collection-created', collection, existing ? '모음집 설정과 자동 정리 규칙을 수정했습니다.' : '새 모음집을 만들었습니다.');
    $('#collectionDialog').close();
    if (hasRule(collection)) await runAutoSort(collection, true);
    renderAll();
    toast(existing ? '모음집을 수정했습니다.' : '모음집을 만들었습니다.', hasRule(collection) ? '저장과 동시에 현재 카탈로그에 규칙을 적용했습니다.' : '탐색 화면에서 자료를 직접 저장할 수 있습니다.');
  }

  async function handleMaterialSubmit(e) {
    e.preventDefault();
    const url = $('#materialUrl').value.trim();
    let domain = '';
    try { domain = url ? new URL(url).hostname.replace(/^www\./,'') : ''; } catch {}
    const item = {
      id: uid('custom'), origin:'custom', date:$('#materialDate').value || today(), weekday:'', edition:'', kind:'custom', rank:99,
      category: $('#materialCategory').value || 'OTHER', categoryLabel:$('#materialCategory').value || 'OTHER', topic:'', catClass:'',
      title:$('#materialTitle').value.trim(), summary:$('#materialSummary').value.trim(), detail:$('#materialSummary').value.trim(),
      source:$('#materialSource').value.trim() || domain, sourceDomain:domain, url,
    };
    item.searchText = norm([item.title,item.summary,item.source,item.sourceDomain,item.category].join(' '));
    await put('custom', item);
    state.customItems.unshift(item);
    state.allItems = [...state.customItems, ...state.catalogItems];
    await logActivity('custom-added', null, `외부 자료 “${item.title}”을 추가했습니다.`, item.id);
    $('#materialDialog').close();
    await runAllAutoSort({autoOnly:true,quiet:true});
    renderAll();
    toast('외부 자료를 추가했습니다.', '자동 정리 규칙이 활성화된 모음집에도 즉시 반영했습니다.');
  }

  async function removeSaved(savedId) {
    const row = state.saved.find(s => s.id === savedId);
    if (!row) return;
    await del('saved', savedId);
    state.saved = state.saved.filter(s => s.id !== savedId);
    renderAll();
    toast('모음집에서 제거했습니다.');
  }

  async function deleteCollection(id) {
    const c = state.collections.find(x=>x.id===id);
    if (!c) return;
    if (!confirm(`“${c.name}” 모음집을 삭제할까요? 저장된 연결 기록도 함께 삭제됩니다.`)) return;
    const related = state.saved.filter(s => s.collectionId === id);
    for (const row of related) await del('saved', row.id);
    await del('collections', id);
    state.saved = state.saved.filter(s=>s.collectionId!==id);
    state.collections = state.collections.filter(x=>x.id!==id);
    await logActivity('collection-deleted', c, '모음집과 저장 연결을 삭제했습니다.');
    state.activeCollectionId = null;
    renderAll();
    switchView('collections');
    toast('모음집을 삭제했습니다.');
  }

  async function exportBackup() {
    const payload = {
      schema:'newsweave-collections-backup',version:1,exportedAt:nowIso(),
      collections:state.collections,saved:state.saved,customItems:state.customItems,activity:state.activity,
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `newsweave-collections-${today()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast('백업 파일을 만들었습니다.');
  }

  async function importBackup(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.schema !== 'newsweave-collections-backup' || !Array.isArray(data.collections) || !Array.isArray(data.saved)) throw new Error('NewsWeave 모음집 백업 형식이 아닙니다.');
    if (!confirm('현재 브라우저의 모음집 데이터를 백업 파일 내용으로 교체할까요?')) return;
    for (const name of ['collections','saved','custom','activity']) await clearStore(name);
    await bulkPut('collections', data.collections || []);
    await bulkPut('saved', data.saved || []);
    await bulkPut('custom', data.customItems || []);
    await bulkPut('activity', data.activity || []);
    await reloadLocalState();
    renderAll();
    $('#backupDialog').close();
    toast('백업을 복원했습니다.', `${state.collections.length}개 모음집을 불러왔습니다.`);
  }

  async function reloadLocalState() {
    state.collections = await getAll('collections');
    state.saved = await getAll('saved');
    state.customItems = (await getAll('custom')).sort((a,b)=>b.date.localeCompare(a.date));
    state.activity = (await getAll('activity')).sort((a,b)=>b.at.localeCompare(a.at));
    state.allItems = [...state.customItems, ...state.catalogItems];
  }

  function bindEvents() {
    $$('.tab').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
    ['#createCollectionBtn','#sideCreateBtn'].forEach(sel => $(sel).addEventListener('click',()=>openCollectionDialog()));
    document.addEventListener('click', async (e) => {
      const guide = e.target.closest('[data-open-guide]'); if (guide) { openGuideDialog(); return; }
      const openItem = e.target.closest('[data-open-item]'); if (openItem) { openArticleDialog(openItem.dataset.openItem); return; }
      const starterCategory = e.target.closest('[data-starter-category]'); if (starterCategory) { state.filters.category=starterCategory.dataset.starterCategory; $('#categoryFilter').value=state.filters.category; state.visibleLimit=PAGE_SIZE; renderFilters(); renderResults(); $('#resultList').scrollIntoView({behavior:'smooth',block:'start'}); return; }
      const starterAction = e.target.closest('[data-starter-action]'); if (starterAction) {
        if (starterAction.dataset.starterAction === 'guide') { openGuideDialog(); return; }
        if (starterAction.dataset.starterAction === 'collection') { openCollectionDialog(); return; }
        if (starterAction.dataset.starterAction === 'material') { $('#materialForm').reset(); $('#materialDate').value=today(); $('#materialDialog').showModal(); return; }
      }
      const articleSave = e.target.closest('[data-article-save]'); if (articleSave) {
        const target = $('#articleCollectionSelect')?.value || state.collections[0]?.id;
        if (!target) { $('#articleDialog').close(); openCollectionDialog(); return; }
        const added = await saveItemsToCollection(target,[articleSave.dataset.articleSave],'manual'); renderAll(); openArticleDialog(articleSave.dataset.articleSave); toast(added?'자료를 저장했습니다.':'이미 저장된 자료입니다.', state.collections.find(c=>c.id===target)?.name || ''); return;
      }
      const card = e.target.closest('[data-card-item]');
      if (card && !e.target.closest('button,a,input,select,label,textarea')) { openArticleDialog(card.dataset.cardItem); return; }
      const create = e.target.closest('[data-action="create-collection"]'); if (create) openCollectionDialog();
      const open = e.target.closest('[data-open-collection]'); if (open) switchView('collection-detail', open.dataset.openCollection);
      const edit = e.target.closest('[data-edit-collection]'); if (edit) openCollectionDialog(state.collections.find(c=>c.id===edit.dataset.editCollection));
      const sync = e.target.closest('[data-sync-collection]'); if (sync) { const c=state.collections.find(x=>x.id===sync.dataset.syncCollection); if(c){await runAutoSort(c);renderAll();renderCollectionDetail();} }
      const remove = e.target.closest('[data-remove-saved]'); if (remove) await removeSaved(remove.dataset.removeSaved);
      const deletion = e.target.closest('[data-delete-collection]'); if (deletion) await deleteCollection(deletion.dataset.deleteCollection);
      const cat = e.target.closest('[data-cat]'); if (cat) { state.filters.category=cat.dataset.cat; $('#categoryFilter').value=state.filters.category; state.visibleLimit=PAGE_SIZE; renderFilters(); renderResults(); }
      const close = e.target.closest('[data-close-dialog]'); if (close) document.getElementById(close.dataset.closeDialog)?.close();
      const saveOne = e.target.closest('[data-save-one]'); if (saveOne) {
        if (!state.collections.length) { openCollectionDialog(); return; }
        const target = $('#bulkCollection').value || state.collections[0].id;
        const added = await saveItemsToCollection(target,[saveOne.dataset.saveOne],'manual');
        renderAll(); toast(added?'자료를 저장했습니다.':'이미 저장된 자료입니다.', state.collections.find(c=>c.id===target)?.name || '');
      }
    });
    $('#guideBtn').addEventListener('click',openGuideDialog);
    $$('.modal').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }));
    $('#backCollectionsBtn').addEventListener('click',()=>switchView('collections'));
    $('#searchForm').addEventListener('submit', e => { e.preventDefault(); state.filters.q=$('#searchInput').value.trim();state.filters.category=$('#categoryFilter').value;state.filters.sort=$('#sortFilter').value;state.visibleLimit=PAGE_SIZE;renderFilters();renderResults(); });
    $('#searchInput').addEventListener('input', e => { state.filters.q=e.target.value.trim();state.visibleLimit=PAGE_SIZE;renderResults(); });
    $('#categoryFilter').addEventListener('change', e=>{state.filters.category=e.target.value;state.visibleLimit=PAGE_SIZE;renderFilters();renderResults();});
    $('#sortFilter').addEventListener('change', e=>{state.filters.sort=e.target.value;state.visibleLimit=PAGE_SIZE;renderResults();});
    $('#loadMoreBtn').addEventListener('click',()=>{state.visibleLimit+=PAGE_SIZE;renderResults();});
    $('#selectAllVisible').addEventListener('change', e=>{filteredItems().slice(0,state.visibleLimit).forEach(i=>e.target.checked?state.selectedIds.add(i.id):state.selectedIds.delete(i.id));renderResults();});
    $('#resultList').addEventListener('change', e=>{if(e.target.matches('[data-select-item]')){e.target.checked?state.selectedIds.add(e.target.dataset.selectItem):state.selectedIds.delete(e.target.dataset.selectItem);updateSelectionUI();}});
    $('#bulkSaveBtn').addEventListener('click', async()=>{
      const id=$('#bulkCollection').value || state.collections[0]?.id; if(!id){openCollectionDialog();return;}
      const added=await saveItemsToCollection(id,[...state.selectedIds],'manual');state.selectedIds.clear();renderAll();toast(added?`${added}개 자료를 저장했습니다.`:'선택한 자료가 이미 저장되어 있습니다.',state.collections.find(c=>c.id===id)?.name||'');
    });
    $('#syncAllBtn').addEventListener('click',async()=>{await runAllAutoSort();renderAll();});
    $('#addMaterialBtn').addEventListener('click',()=>{ $('#materialForm').reset();$('#materialDate').value=today();$('#materialDialog').showModal(); });
    $('#collectionForm').addEventListener('submit',handleCollectionSubmit);
    $('#materialForm').addEventListener('submit',handleMaterialSubmit);
    $('#backupBtn').addEventListener('click',()=>$('#backupDialog').showModal());
    $('#exportBtn').addEventListener('click',exportBackup);
    $('#importInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{await importBackup(f);}catch(err){toast('백업을 불러오지 못했습니다.',err.message,'error');}finally{e.target.value='';}});
    $('#clearActivityBtn').addEventListener('click',async()=>{if(!state.activity.length)return;if(!confirm('정리 기록을 모두 비울까요? 모음집과 저장된 자료는 유지됩니다.'))return;await clearStore('activity');state.activity=[];renderActivity();toast('정리 기록을 비웠습니다.');});
  }

  async function init() {
    try {
      if (!('indexedDB' in window)) throw new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.');
      const [response, configResponse] = await Promise.all([
        fetch('data/catalog.json', { cache:'no-store' }),
        fetch('config/collections.json', { cache:'no-store' }).catch(() => null),
      ]);
      if (!response.ok) throw new Error(`catalog.json 요청 실패 (${response.status})`);
      state.catalogMeta = await response.json();
      if (configResponse?.ok) state.config = await configResponse.json();
      state.catalogItems = Array.isArray(state.catalogMeta.items) ? state.catalogMeta.items : [];
      state.db = await openDB();
      await reloadLocalState();
      renderFilters();
      await seedCollectionsIfNeeded();
      await maybeAutoSyncNewCatalog();
      await reloadLocalState();
      bindEvents();
      $('#loadingState').hidden = true;
      $('#exploreView').hidden = false;
      renderAll();
    } catch (error) {
      console.error(error);
      $('#loadingState').hidden = true;
      $('#errorState').hidden = false;
      $('#errorMessage').textContent = error?.message || '알 수 없는 오류가 발생했습니다.';
    }
  }

  init();
})();
