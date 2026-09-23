// Regenerate docs/arxiv.png: a live arXiv search with the extension loaded, with
// paper titles, author names, IDs and abstracts blurred so only the badges stay readable.
// Usage: node scripts/screenshot.mjs
import puppeteer from 'puppeteer';

const ext = new URL('..', import.meta.url).pathname;
const browser = await puppeteer.launch({ headless: 'new', pipe: true, enableExtensions: [ext] });
const p = await browser.newPage();
await p.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 });
await p.goto('https://arxiv.org/search/?query=Jev&searchtype=all&order=-announced_date_first', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('html[data-banjev-ready]');
await new Promise((r) => setTimeout(r, 500));

await p.evaluate(() => {
  const style = document.createElement('style');
  style.textContent = '.bj-blur { filter: blur(6px); user-select: none; }';
  document.head.append(style);
  const blur = (el) => el && el.classList.add('bj-blur');
  // wrap text so the badges next to/inside these elements stay sharp
  const blurText = (el) =>
    el &&
    [...el.childNodes].forEach((n) => {
      if (n.nodeType === 3 && n.textContent.trim()) {
        const s = document.createElement('span');
        s.className = 'bj-blur';
        s.textContent = n.textContent;
        n.replaceWith(s);
      }
    });
  document.querySelectorAll('li.arxiv-result').forEach((li) => {
    blur(li.querySelector('.list-title a'));
    blurText(li.querySelector('p.title'));
    li.querySelectorAll('p.authors a').forEach(blur);
    blur(li.querySelector('p.abstract'));
    li.querySelectorAll('p.comments, p.is-size-7').forEach(blur);
  });
  scrollTo(0, 0);
});

const box = await (await p.$('ol.breathe-horizontal')).boundingBox();
await p.screenshot({ path: new URL('../docs/arxiv.png', import.meta.url).pathname, clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: 620 } });
await browser.close();
console.log('wrote docs/arxiv.png');
