// End-to-end: load the unpacked extension into Chrome for Testing and check
// badges on live arXiv pages plus Google Scholar pages served from fixtures
// (Scholar has not indexed the new papers yet and rate-limits bots).
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const ext = new URL('..', import.meta.url).pathname;
const fixture = (f) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const HEADLESS = process.env.HEADFUL ? false : 'new';

const browser = await puppeteer.launch({
  headless: HEADLESS,
  pipe: true,
  enableExtensions: [ext],
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (e) {
    failed++;
    console.log('  ✗', name, '\n     ', e.message);
  }
}

async function open(url, { serve } = {}) {
  const page = await browser.newPage();
  if (serve) {
    await page.setRequestInterception(true);
    page.on('request', (r) =>
      r.url().startsWith(url.split('?')[0]) && r.resourceType() === 'document'
        ? r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: serve })
        : r.continue()
    );
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('html[data-banjev-ready]', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 400));
  return page;
}

// badges after each author/title: [{ text, level, prev }]
const badges = (page) =>
  page.$$eval('.banjev-badge', (bs) =>
    bs.map((b) => ({ level: b.className.replace(/.*banjev-/, ''), prev: (b.previousSibling && b.previousSibling.textContent || '').trim() }))
  );

console.log('arXiv (live)');
await check('abstract page of a listed paper: paper badge + banned authors only', async () => {
  const p = await open('https://arxiv.org/abs/2609.26532');
  assert.equal(await p.$$eval('h1.title .banjev-paper', (x) => x.length), 1);
  const b = (await badges(p)).filter((x) => x.level === 'paper' && x.prev);
  // 1st author scores 1 (banned); 2nd author scores 0.5 (not banned)
  assert.deepEqual(b.map((x) => x.prev), ['Tiantong Wu']);
  await p.close();
});

await check('arXiv search "Jev": every listed result tagged', async () => {
  const p = await open('https://arxiv.org/search/?query=Jev&searchtype=all&order=-announced_date_first');
  const n = await p.$$eval('li.arxiv-result', (lis) => lis.filter((li) => li.querySelector('p.title .banjev-paper')).length);
  assert.ok(n >= 12, 'tagged results: ' + n);
  await p.setViewport({ width: 1100, height: 900 });
  await p.evaluate(() => scrollTo(0, 0));
  const box = await (await p.$('ol.breathe-horizontal')).boundingBox();
  await p.screenshot({ path: new URL('../docs/arxiv.png', import.meta.url).pathname, clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: 620 } });
  await p.close();
});

await check('unrelated abstract page: no false paper badge', async () => {
  const p = await open('https://arxiv.org/abs/1706.03762');
  assert.equal(await p.$$eval('.banjev-paper', (x) => x.length), 0);
  await p.close();
});

await check('author search for a listed author: name-only tags on their other papers', async () => {
  const p = await open('https://arxiv.org/search/?query=Robitza%2C+W&searchtype=author');
  const b = await badges(p);
  assert.ok(b.some((x) => x.prev === 'Werner Robitza' && x.level === 'name'), JSON.stringify(b.slice(0, 5)));
  await p.close();
});

console.log('Google Scholar (fixtures)');
await check('search results: listed paper, co-author pair, scores respected, noisy abbreviation skipped', async () => {
  const p = await open('https://scholar.google.com/scholar?q=jev', { serve: fixture('scholar-search.html') });
  const r = await p.evaluate(() =>
    ['r1', 'r2', 'r3'].map((id) => ({
      paper: !!document.querySelector(`#${id} .gs_rt .banjev-paper`),
      authors: [...document.querySelectorAll(`#${id} .gs_a .banjev-badge`)].map((b) => b.previousSibling.textContent.trim() + ':' + b.className.replace(/.*banjev-/, '')),
    }))
  );
  assert.deepEqual(r[0], { paper: true, authors: ['D Jiang:paper'] });
  assert.deepEqual(r[1], { paper: false, authors: ['D Li:confirmed', 'X Wang:confirmed'] });
  assert.deepEqual(r[2], { paper: false, authors: [] });
  await p.close();
});

await check('profile: verified by listed paper, learned, co-author tagged', async () => {
  const url = 'https://scholar.google.com/citations?user=YUBOLI000AAJ&hl=en';
  const p = await open(url, { serve: fixture('scholar-profile.html') });
  assert.equal(await p.$eval('#gsc_prf_in .banjev-badge', (b) => b.className), 'banjev-badge banjev-confirmed');
  assert.equal(await p.$$eval('#gsc_a_b .banjev-paper', (x) => x.length), 1);
  const co = await p.$$eval('#gsc_rsb_co .banjev-badge', (bs) => bs.map((b) => b.previousSibling.textContent + ':' + b.className.replace(/.*banjev-/, '')));
  // Rema Padman is 4th author (0.125): not banned. Amir Rafe is banned but a name alone never counts on Scholar.
  assert.deepEqual(co, []);
  // popover shows evidence and "Not this person" hides the badge
  await p.click('#gsc_prf_in .banjev-badge');
  const pop = await p.$eval('.banjev-pop', (x) => x.textContent);
  assert.match(pop, /JEV-as-a-Judge/);
  assert.match(pop, /Yubo Li: score 1 = 1st author/);
  await p.evaluate(() => [...document.querySelectorAll('.banjev-pop button')].find((b) => b.textContent === 'Not this person').click());
  await p.waitForFunction(() => !document.querySelector('#gsc_prf_in .banjev-badge'), { timeout: 5000 });
  await p.close();
});

await check('real profile (Dongming Jiang, FZLU_acAAAAJ): confirmed; same-name profile elsewhere: untouched', async () => {
  const html = fixture('scholar-profile-jiang.html');
  const p = await open('https://scholar.google.com/citations?hl=en&user=FZLU_acAAAAJ', { serve: html });
  assert.equal(await p.$eval('#gsc_prf_in .banjev-badge', (b) => b.className), 'banjev-badge banjev-confirmed');
  await p.click('#gsc_prf_in .banjev-badge');
  assert.match(await p.$eval('.banjev-pop', (x) => x.textContent), /Jev-Mem/);
  await p.close();
  const q = await open('https://scholar.google.com/citations?hl=en&user=SAMENAME0AAJ', { serve: html });
  assert.equal(await q.$$eval('#gsc_prf_in .banjev-badge', (x) => x.length), 0);
  await q.close();
});

console.log('Popup');
await check('popup: shows who is tagged on the current page, not the whole list; refresh works', async () => {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker');
  const id = new URL(sw.url()).host;
  const arxiv = await open('https://arxiv.org/abs/2609.22753');
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${id}/src/popup/popup.html`);
  // not an arXiv/Scholar tab: explains itself
  await p.waitForFunction(() => !/Loading/.test(document.querySelector('#page').textContent));
  assert.match(await p.$eval('#page', (x) => x.textContent), /Open an arXiv or Google Scholar page/);
  const tabId = await p.evaluate(async () => {
    for (const t of await chrome.tabs.query({})) {
      try {
        const r = await chrome.tabs.sendMessage(t.id, { type: 'pageSummary' });
        if (r && r.authors.length) return t.id;
      } catch (e) {}
    }
    return null;
  });
  assert.ok(tabId, 'arXiv tab answers pageSummary');
  await p.goto(`chrome-extension://${id}/src/popup/popup.html?tabId=${tabId}`);
  await p.waitForSelector('#page li');
  const rows = await p.$$eval('#page li', (li) => li.map((x) => [...x.children].map((c) => c.textContent.trim()).join(' ')));
  // 2609.22753: Delong Li (1st, score 2), Xu Wang (2nd twice, score 1); others below 1
  assert.deepEqual(rows, ['BanJev Delong Li score 2', 'BanJev Xu Wang score 1']);
  assert.equal(await p.$$eval('#papers li', (x) => x.length), 0, 'no full paper list in the popup');
  await p.setViewport({ width: 368, height: 420 });
  await p.screenshot({ path: new URL('../docs/popup.png', import.meta.url).pathname });
  await p.click('#refresh');
  await p.waitForFunction(() => !document.querySelector('#refresh').disabled, { timeout: 60000 });
  const updated = await p.$eval('#updated', (x) => x.textContent);
  assert.match(updated, /^updated/, updated);
  await p.close();
  await arxiv.close();
});

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall e2e checks passed');
process.exit(failed ? 1 : 0);
