#!/usr/bin/env node
/**
 * collect-sources.js
 * RSS/Atom 또는 Google News RSS 검색 결과를 정규화해 data/external/YYYY-MM-DD.json에 누적한다.
 * 모든 소스가 disabled이면 네트워크 호출 없이 종료한다.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'sources.json');
const OUT_DIR = path.join(ROOT, 'data', 'external');

const decodeEntities = (value) => String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const stripHtml = (value) => decodeEntities(value)
  .replace(/<br\s*\/?\s*>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? stripHtml(m[1]) : '';
};

function linkFromBlock(block) {
  const rss = block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
  if (rss) return stripHtml(rss[1]);
  const atom = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  return atom ? decodeEntities(atom[1]).trim() : '';
}

function normalizeDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function parseFeed(xml) {
  const blocks = [
    ...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...String(xml).matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ].map(m => m[1]);
  return blocks.map(block => ({
    title: tag(block, 'title'),
    url: linkFromBlock(block),
    summary: tag(block, 'description') || tag(block, 'summary') || tag(block, 'content') || tag(block, 'content:encoded'),
    publishedAt: tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date'),
    author: tag(block, 'author') || tag(block, 'dc:creator'),
  })).filter(x => x.title && x.url);
}

function sourceUrl(source, defaults) {
  if (source.type === 'rss') return source.url;
  if (source.type === 'google-news-rss') {
    const q = new URLSearchParams({
      q: source.query || '',
      hl: `${source.language || defaults.language || 'ko'}-${source.country || defaults.country || 'KR'}`,
      gl: source.country || defaults.country || 'KR',
      ceid: `${source.country || defaults.country || 'KR'}:${source.language || defaults.language || 'ko'}`,
    });
    return `https://news.google.com/rss/search?${q.toString()}`;
  }
  throw new Error(`지원하지 않는 source type: ${source.type}`);
}

function matchesTerms(text, include, exclude, mode = 'any') {
  const hay = String(text || '').toLocaleLowerCase('ko-KR');
  const inc = (include || []).map(x => String(x).toLocaleLowerCase('ko-KR')).filter(Boolean);
  const exc = (exclude || []).map(x => String(x).toLocaleLowerCase('ko-KR')).filter(Boolean);
  if (exc.some(term => hay.includes(term))) return false;
  if (!inc.length) return true;
  const checks = inc.map(term => hay.includes(term));
  return mode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

function stableId(sourceId, url, title) {
  return `external:${crypto.createHash('sha256').update(`${sourceId}|${url}|${title}`).digest('hex').slice(0, 24)}`;
}

function normalizeEntry(entry, source) {
  let sourceDomain = '';
  try { sourceDomain = new URL(entry.url).hostname.replace(/^www\./, ''); } catch (_) {}
  const date = normalizeDate(entry.publishedAt);
  const sourceName = source.name || source.id;
  const searchText = [entry.title, entry.summary, sourceName, sourceDomain, source.category].join(' ').toLocaleLowerCase('ko-KR');
  return {
    id: stableId(source.id, entry.url, entry.title),
    origin: 'external',
    sourceId: source.id,
    date,
    weekday: '',
    edition: '',
    kind: 'external',
    rank: 99,
    category: String(source.category || 'OTHER').toUpperCase(),
    categoryLabel: String(source.category || 'OTHER').toUpperCase(),
    topic: source.topic || '',
    catClass: '',
    title: entry.title,
    summary: entry.summary || '',
    detail: entry.summary || '',
    source: sourceName,
    sourceDomain,
    url: entry.url,
    author: entry.author || '',
    collectedAt: new Date().toISOString(),
    searchText,
  };
}

function mergeIntoDailyFiles(items) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const byDate = new Map();
  items.forEach(item => {
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  });
  let written = 0;
  for (const [date, rows] of byDate) {
    const file = path.join(OUT_DIR, `${date}.json`);
    let existing = { schemaVersion: 1, date, items: [] };
    if (fs.existsSync(file)) {
      try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
    }
    const map = new Map((existing.items || []).map(x => [x.id || x.url, x]));
    let added = 0;
    rows.forEach(row => {
      if (!map.has(row.id)) { map.set(row.id, row); added += 1; }
    });
    if (!added) continue;
    const merged = [...map.values()].sort((a, b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''));
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, date, updatedAt: new Date().toISOString(), items: merged }, null, 2) + '\n', 'utf8');
    written += added;
  }
  return written;
}

async function collect() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const defaults = config.defaults || {};
  const sources = (config.sources || []).filter(s => s.enabled);
  if (!sources.length) {
    console.log('활성화된 외부 수집 소스가 없습니다. config/sources.json에서 enabled=true로 설정하세요.');
    return { sources: 0, collected: 0 };
  }
  const all = [];
  for (const source of sources) {
    try {
      const url = sourceUrl(source, defaults);
      const res = await fetch(url, {
        headers: { 'user-agent': 'NewsWeave-Collector/1.0 (+GitHub Actions)' },
        signal: AbortSignal.timeout(Number(source.timeoutMs || 20000)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const max = Number(source.maxItemsPerSource || defaults.maxItemsPerSource || 30);
      const mode = source.matchMode || defaults.matchMode || 'any';
      const parsed = parseFeed(xml)
        .filter(entry => matchesTerms(`${entry.title} ${entry.summary}`, source.includeKeywords, source.excludeKeywords, mode))
        .slice(0, max)
        .map(entry => normalizeEntry(entry, source));
      all.push(...parsed);
      console.log(`✓ ${source.name || source.id}: ${parsed.length}개 수집`);
    } catch (error) {
      console.error(`✗ ${source.name || source.id}: ${error.message}`);
      if (source.failOnError) throw error;
    }
  }
  const unique = [...new Map(all.map(x => [x.id, x])).values()];
  const written = mergeIntoDailyFiles(unique);
  console.log(`외부 자료 수집 완료 — ${sources.length}개 소스, ${written}개 항목 처리`);
  return { sources: sources.length, collected: written };
}

function selfTest() {
  const sample = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Global science research expands]]></title><link>https://example.com/a</link><description><![CDATA[science technology health news]]></description><pubDate>Tue, 08 Sep 2026 01:00:00 GMT</pubDate></item></channel></rss>`;
  const parsed = parseFeed(sample);
  if (parsed.length !== 1 || parsed[0].title !== 'Global science research expands') throw new Error('RSS parser self-test failed');
  if (!matchesTerms(`${parsed[0].title} ${parsed[0].summary}`, ['science'], [], 'any')) throw new Error('keyword self-test failed');
  const item = normalizeEntry(parsed[0], { id:'test', name:'Test', category:'SCIENCE' });
  if (item.category !== 'SCIENCE' || !item.id.startsWith('external:')) throw new Error('normalize self-test failed');
  console.log('collect-sources self-test passed.');
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) selfTest();
  else collect().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { parseFeed, matchesTerms, normalizeEntry, sourceUrl, collect, selfTest };
