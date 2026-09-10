#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let failures = 0;
function ok(cond, msg){ if(cond) console.log(`✓ ${msg}`); else { console.error(`✗ ${msg}`); failures++; } }
const read = f => fs.readFileSync(path.join(ROOT,f),'utf8');
const json = f => JSON.parse(read(f));
const catalog = json('data/catalog.json');
const sources = json('config/sources.json');
const collections = json('config/collections.json');
const index = read('index.html');
const app = read('collections.html');
const bootstrap = read('github-bootstrap.cmd');
const bootstrapPs = read('tools/github-bootstrap.ps1');

ok(catalog.product === 'NewsWeave', 'catalog identifies NewsWeave');
ok(Array.isArray(catalog.items), 'catalog items array exists');
ok((sources.sources||[]).length >= 8, 'multiple topic sources configured');
ok(new Set((sources.sources||[]).map(s=>s.category)).size >= 8, 'multiple topic categories configured');
ok((sources.sources||[]).some(s=>s.category==='AI') && (sources.sources||[]).some(s=>s.category==='ECONOMY'), 'AI is one category among broader topics');
ok((collections.categories||[]).includes('WORLD') && (collections.categories||[]).includes('SPORTS'), 'collections support broad categories');
ok(index.includes('NewsWeave') && !index.includes('45호'), 'landing page is NewsWeave, not legacy archive');
ok(app.includes('NewsWeave') && app.includes('분야별로 자동 수집한 뉴스'), 'collections UI has NewsWeave multi-topic branding');
ok(app.includes('articleDialog') && app.includes('guideDialog') && app.includes('starterGrid'), 'article overlay, collection guide, and starter cards are present');
ok(read('assets/collections.js').includes('openArticleDialog') && read('assets/collections.js').includes('openGuideDialog'), 'card overlay and guide interactions are implemented');
ok(read('tools/build-index.js').includes('sourceDialog') && read('tools/build-index.js').includes('Run workflow'), 'landing source cards provide overlay details and collection instructions');
ok(fs.existsSync(path.join(ROOT,'CATALOG-GUIDE.md')), 'catalog collection guide exists');
ok(read('service-worker.js').includes('newsweave-v1.1.3'), 'service worker cache namespace is independent');
ok(read('assets/collections.css').includes('[hidden]{display:none!important}'), 'hidden loading and error states are actually hidden');
ok(read('site.webmanifest').includes('NewsWeave'), 'manifest branding present');
ok(fs.existsSync(path.join(ROOT,'.newsweave-project')), 'fresh project marker exists');
ok(fs.existsSync(path.join(ROOT,'github-create-repo-only.cmd')), 'fallback repository create-and-push command exists');
ok(bootstrap.includes('REPO_NAME=newsweave-news-hub'), 'bootstrap targets new repository name');
ok(bootstrapPs.includes('.newsweave-project'), 'bootstrap validates NewsWeave project marker');
ok(bootstrapPs.includes("@('repo','create'") && bootstrapPs.includes("@('run','watch'"), 'bootstrap creates repo and verifies deployment');

ok(bootstrapPs.includes("if ($AllowFailure) { return '' }") && bootstrapPs.includes('Is-GitHubRepoUrl'), 'bootstrap discards failed probe bodies and validates repository URL');
ok(bootstrapPs.includes("Ignoring invalid repository probe output") && bootstrapPs.includes("Repository does not exist yet; this is normal for first bootstrap."), 'bootstrap treats GitHub 404 as create-repository path');
ok(!bootstrapPs.includes('git push --force') && !bootstrapPs.includes('git push -f '), 'bootstrap never force-pushes');
ok(!fs.existsSync(path.join(ROOT,'editions')), 'legacy AI edition archive removed');

const legacyData = fs.readdirSync(path.join(ROOT,'data')).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f));
ok(legacyData.length === 0, 'legacy dated AI data removed');
if(failures){ console.error(`Smoke test failed: ${failures}`); process.exit(1); }
console.log('NewsWeave smoke test passed.');
