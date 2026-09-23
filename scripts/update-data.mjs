// Regenerate data/papers.json (the snapshot bundled with the extension).
// Sources: arXiv API search for Jev papers since the Jev epoch, plus any arXiv
// links in the awesome-jev README.  Usage: node scripts/update-data.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../src/lib/core.js');

async function text(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'BanJev-updater' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const searched = core.parseArxivAtom(await text(core.ARXIV_QUERY));
let linked = [];
const ids = core.extractArxivIds(await text(core.AWESOME_README));
if (ids.length) {
  linked = core.parseArxivAtom(await text(`https://export.arxiv.org/api/query?id_list=${ids.join(',')}&max_results=500`));
}
const papers = core.filterPapers(core.mergePapers(searched, linked));
if (!papers.length) throw new Error('no papers found; refusing to overwrite snapshot');

const out = { updatedAt: new Date().toISOString(), source: 'arXiv API + awesome-jev README', papers };
writeFileSync(new URL('../data/papers.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${papers.length} papers, ${core.authorList(papers).length} authors`);
