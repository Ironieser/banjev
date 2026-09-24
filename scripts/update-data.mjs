// Regenerate data/papers.json and data/authors.json.
// Sources: arXiv API search for Jev papers since the Jev epoch, arXiv links in the
// local awesome-jev snapshot (sources/awesome-jev), and the hand-maintained data/manual.json.
// Nothing here depends on another GitHub repository at run time.
// Usage: node scripts/update-data.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../src/lib/core.js');
const file = (f) => new URL('../data/' + f, import.meta.url);
const readJson = (f, d) => (existsSync(file(f)) ? JSON.parse(readFileSync(file(f), 'utf8')) : d);

async function text(url) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'BanJev-updater (github.com/Ironieser/banjev)' } });
    if (res.ok) return res.text();
    if (i >= 4) throw new Error(`${url}: HTTP ${res.status}`);
    // arXiv's API returns 503 for minutes at a time; back off 30s, 60s, 120s, 240s
    await new Promise((r) => setTimeout(r, 30000 * 2 ** i));
  }
}
const byIds = async (ids) =>
  ids.length ? core.parseArxivAtom(await text(`https://export.arxiv.org/api/query?max_results=500&id_list=${ids.join(',')}`)) : [];

const manual = readJson('manual.json', {});
const previous = readJson('papers.json', { papers: [] });

// 1. automatic: arXiv search + awesome-jev links, restricted to the Jev epoch
const searched = core.parseArxivAtom(await text(core.ARXIV_QUERY));
const snapshot = new URL('../sources/awesome-jev/README.md', import.meta.url);
const linked = existsSync(snapshot) ? await byIds(core.extractArxivIds(readFileSync(snapshot, 'utf8'))) : [];
// keep earlier finds so a flaky/partial API response never shrinks the list
const auto = core.filterPapers(core.mergePapers(previous.papers.filter((p) => !p.manual), searched, linked));

// 2. manual additions (bypass the epoch filter)
const add = manual.addPapers || [];
const addIds = add.filter((a) => typeof a === 'string' || !a.authors).map((a) => core.normArxivId(a.id || a)).filter(Boolean);
const addFull = add.filter((a) => a && a.authors).map((a) => ({ ...a, id: core.normArxivId(a.id) || a.id }));
const manualPapers = [...(await byIds(addIds)), ...addFull].map((p) => ({ ...p, manual: true }));

// 3. exclusions
const excluded = new Set((manual.excludePapers || []).map((e) => core.normArxivId(e.id || e) || e.id || e));
const papers = core.mergePapers(auto, manualPapers).filter((p) => !excluded.has(p.id));
if (!papers.length) throw new Error('no papers found; refusing to overwrite snapshot');

const names = (list) => (list || []).map((a) => (typeof a === 'string' ? a : a.name));
const curation = { banAuthors: names(manual.banAuthors), allowAuthors: names(manual.allowAuthors), scholarProfiles: manual.scholarProfiles || {} };
const authors = core.scoreAuthors(papers, curation);

// Only touch updatedAt when content changed, so the scheduled job doesn't commit noise.
const body = JSON.stringify({ papers, ...curation });
const prevBody = JSON.stringify({ papers: previous.papers, banAuthors: previous.banAuthors || [], allowAuthors: previous.allowAuthors || [], scholarProfiles: previous.scholarProfiles || {} });
const updatedAt = body === prevBody && previous.updatedAt ? previous.updatedAt : new Date().toISOString();
const meta = { updatedAt, source: 'arXiv API + data/manual.json (+ sources/awesome-jev snapshot)' };

writeFileSync(file('papers.json'), JSON.stringify({ ...meta, papers, ...curation }, null, 2) + '\n');
writeFileSync(
  file('authors.json'),
  JSON.stringify(
    {
      ...meta,
      rule:
        'paper weight = position weight (1st 1, 2nd 0.5, 3rd 0.25, then halving) x time weight (weeks after ' +
        core.JEV_EPOCH + ': week 1 x2, week 2 x1, week 3 x0.5, week 4 x0.25, later x0); banned when the total >= 1 (or listed in manual.json banAuthors)',
      epoch: core.JEV_EPOCH,
      scoring: core.DEFAULT_SCORING,
      threshold: core.BAN_THRESHOLD,
      authors: authors.map(({ key, ...r }) => {
        const ids = Object.entries(curation.scholarProfiles).filter(([n]) => core.normName(n) === key).flatMap(([, v]) => [].concat(v));
        return ids.length ? { ...r, scholarProfiles: ids } : r;
      }),
    },
    null,
    2
  ) + '\n'
);
console.log(`${papers.length} papers, ${authors.length} authors, ${authors.filter((a) => a.banned).length} banned`);
