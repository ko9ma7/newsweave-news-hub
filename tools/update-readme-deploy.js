#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'README.md');
const raw = process.argv[2] || process.env.SITE_URL || '';
if (!raw) {
  console.error('Usage: node tools/update-readme-deploy.js <https://owner.github.io/repo/>');
  process.exit(2);
}
let url;
try {
  url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error('http/https only');
} catch (error) {
  console.error(`Invalid deployment URL: ${raw}`);
  process.exit(2);
}
let normalized = url.toString().replace(/\/?$/, '/');
let md = fs.readFileSync(file, 'utf8');
const marker = /<!-- BOOTSTRAP_DEPLOY_URL_START -->[\s\S]*?<!-- BOOTSTRAP_DEPLOY_URL_END -->/;
const block = `<!-- BOOTSTRAP_DEPLOY_URL_START -->\n**Deployment URL:** ${normalized}\n<!-- BOOTSTRAP_DEPLOY_URL_END -->`;
if (!marker.test(md)) {
  console.error('README deployment URL markers are missing.');
  process.exit(2);
}
md = md.replace(marker, block);
fs.writeFileSync(file, md, 'utf8');
console.log(`README deployment URL updated: ${normalized}`);
