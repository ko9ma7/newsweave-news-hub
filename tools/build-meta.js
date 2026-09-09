#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const baseUrl = (process.env.SITE_URL || 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const file = path.join(ROOT, 'collections.html');
let html = fs.readFileSync(file, 'utf8');
const pageUrl = baseUrl + 'collections.html';
const imageUrl = baseUrl + 'og-image.png';
html = html
  .replace(/(<link rel="canonical" href=")[^"]+(" data-site-meta="canonical">)/, `$1${pageUrl}$2`)
  .replace(/(<meta property="og:url" content=")[^"]+(" data-site-meta="og-url">)/, `$1${pageUrl}$2`)
  .replace(/(<meta property="og:image" content=")[^"]+(" data-site-meta="og-image">)/, `$1${imageUrl}$2`)
  .replace(/(<meta name="twitter:image" content=")[^"]+(" data-site-meta="twitter-image">)/, `$1${imageUrl}$2`)
  .replace(/(<script type="application\/ld\+json" id="appSchema">)(.*?)(<\/script>)/s, (_, a, json, c) => {
    const data = JSON.parse(json); data.url = pageUrl; return a + JSON.stringify(data) + c;
  });
fs.writeFileSync(file, html, 'utf8');
fs.writeFileSync(path.join(ROOT,'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${baseUrl}sitemap.xml\n`, 'utf8');
fs.writeFileSync(path.join(ROOT,'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${baseUrl}</loc></url>\n  <url><loc>${baseUrl}collections.html</loc></url>\n</urlset>\n`, 'utf8');
console.log(`NewsWeave metadata applied: ${baseUrl}`);
