#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const EXTERNAL_DIR = path.join(DATA_DIR, 'external');
const CONFIG_PATH = path.join(ROOT, 'config', 'sources.json');
const OUT = path.join(DATA_DIR, 'catalog.json');

const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const safeUrl = value => { try { const u = new URL(String(value || '')); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const files = fs.existsSync(EXTERNAL_DIR)
  ? fs.readdirSync(EXTERNAL_DIR).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()
  : [];
const sourceConfig = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {sources:[]};
const itemsById = new Map();

for (const name of files) {
  let payload;
  try { payload = JSON.parse(fs.readFileSync(path.join(EXTERNAL_DIR, name), 'utf8')); } catch { continue; }
  for (const raw of payload.items || []) {
    const url = safeUrl(raw.url);
    const category = String(raw.category || 'OTHER').toUpperCase();
    const title = norm(raw.title);
    if (!title || !url) continue;
    let domain = raw.sourceDomain || '';
    try { domain = domain || new URL(url).hostname.replace(/^www\./, ''); } catch {}
    const id = raw.id || `external:${crypto.createHash('sha256').update(`${url}|${title}`).digest('hex').slice(0,24)}`;
    if (itemsById.has(id)) continue;
    const item = {
      id, origin:'external', sourceId:raw.sourceId || '', date:raw.date || name.slice(0,10),
      category, categoryLabel:raw.categoryLabel || category, topic:raw.topic || '',
      title, summary:norm(raw.summary), detail:norm(raw.detail || raw.summary),
      source:norm(raw.source), sourceDomain:domain, url, author:norm(raw.author), collectedAt:raw.collectedAt || ''
    };
    item.searchText = [item.title,item.summary,item.detail,item.source,item.sourceDomain,item.category,item.topic].join(' ').toLocaleLowerCase('ko-KR');
    itemsById.set(id, item);
  }
}

const items = [...itemsById.values()].sort((a,b) => (b.date || '').localeCompare(a.date || '') || (b.collectedAt || '').localeCompare(a.collectedAt || ''));
const categories = new Map();
const sources = new Map();
for (const item of items) {
  categories.set(item.category, (categories.get(item.category) || 0) + 1);
  const key = item.source || item.sourceDomain || 'Unknown';
  sources.set(key, (sources.get(key) || 0) + 1);
}
const configuredCategories = [...new Set((sourceConfig.sources || []).map(s => String(s.category || '').toUpperCase()).filter(Boolean))];
const contentVersion = crypto.createHash('sha256').update(JSON.stringify(items.map(({id,date,category,title,url}) => ({id,date,category,title,url})))).digest('hex').slice(0,16);
const output = {
  schemaVersion: 2,
  product: 'NewsWeave',
  generatedAt: new Date().toISOString(),
  contentVersion,
  stats: {
    totalItems: items.length,
    externalItems: items.length,
    configuredSources: (sourceConfig.sources || []).length,
    enabledSources: (sourceConfig.sources || []).filter(s => s.enabled).length,
    categories: [...new Set([...configuredCategories, ...categories.keys()])].map(name => ({name,count:categories.get(name)||0})),
    sources: [...sources].sort((a,b) => b[1]-a[1]).slice(0,30).map(([name,count]) => ({name,count}))
  },
  items
};
fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`NewsWeave catalog built: ${items.length} items, ${output.stats.enabledSources} enabled sources.`);
