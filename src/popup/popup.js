/* global BanJev */
const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));
const RANKING = 'https://ironieser.github.io/banjev/';
const MAX = 8;
let state;

function el(tag, attrs, ...kids) {
  const n = Object.assign(document.createElement(tag), attrs || {});
  n.append(...kids);
  return n;
}

async function pageSummary() {
  try {
    const forced = Number(new URLSearchParams(location.search).get('tabId')); // used by tests
    const id = forced || (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id;
    return await chrome.tabs.sendMessage(id, { type: 'pageSummary' });
  } catch (e) {
    return null; // no content script here: not arXiv / Scholar
  }
}

function renderPage(sum) {
  const box = $('page');
  box.textContent = '';
  box.className = 'muted';
  if (!sum) return box.append('Open an arXiv or Google Scholar page to see tagged authors here.');
  if (!sum.enabled) return box.append('BanJev is turned off.');
  if (!sum.authors.length && !sum.papers.length) return box.append('Nothing tagged on this page.');
  box.className = '';
  const ul = el('ul');
  for (const a of sum.authors.slice(0, MAX)) {
    const solid = a.level !== 'name';
    ul.append(
      el(
        'li',
        {},
        el('img', { className: 'chip' + (solid ? '' : ' dash'), src: '../../icons/48.png', alt: solid ? 'BanJev' : 'BanJev (name match only)', title: solid ? 'BanJev' : 'Name match only' }),
        el('span', { className: 'n' }, el('a', { href: RANKING + '#q=' + encodeURIComponent(a.name), target: '_blank', textContent: a.name })),
        el('span', { className: 's', textContent: 'score ' + a.score })
      )
    );
  }
  box.append(ul);
  const extra = [];
  if (sum.authors.length > MAX) extra.push(`+${sum.authors.length - MAX} more authors`);
  if (sum.papers.length) extra.push(`${sum.papers.length} listed paper${sum.papers.length > 1 ? 's' : ''} on this page`);
  if (extra.length) box.append(el('div', { className: 'more muted', textContent: extra.join(' · ') }));
}

function render() {
  const s = state.settings;
  for (const k of ['enabled', 'showNameMatches']) $(k).checked = !!s[k];
  const banned = BanJev.scoreAuthors(state.papers, state.curation, s.scoring).filter((a) => a.banned).length;
  renderScoring(BanJev.scoringOf(s.scoring), !!s.scoring);
  $('stats').textContent = `${banned} banned · ${state.papers.length} papers`;
  $('updated').textContent = state.lastError ? 'update failed' : 'updated ' + new Date(state.updatedAt).toLocaleDateString();
  $('updated').title = state.lastError || new Date(state.updatedAt).toLocaleString();

  const items = [...s.notThem.names.map((v) => ['name', v]), ...s.notThem.scholarIds.map((v) => ['scholarId', v])];
  $('fp').hidden = !items.length;
  $('fpCount').textContent = items.length;
  const fp = $('fpList');
  fp.textContent = '';
  for (const [kind, v] of items) {
    const undo = el('button', { textContent: 'Undo' });
    undo.onclick = () =>
      save({ notThem: { names: s.notThem.names.filter((x) => x !== v), scholarIds: s.notThem.scholarIds.filter((x) => x !== v) } });
    fp.append(el('li', {}, kind === 'name' ? v : 'Scholar profile ' + v, undo));
  }
}

const SC_FIELDS = [
  ['w1', 'weekWeights', 0], ['w2', 'weekWeights', 1], ['w3', 'weekWeights', 2], ['w4', 'weekWeights', 3],
  ['p1', 'positionWeights', 0], ['p2', 'positionWeights', 1], ['p3', 'positionWeights', 2],
];

function renderScoring(sc, custom) {
  for (const [id, key, i] of SC_FIELDS) if (document.activeElement !== $(id)) $(id).value = sc[key][i];
  if (document.activeElement !== $('threshold')) $('threshold').value = sc.threshold;
  $('scReset').hidden = !custom;
  $('scState').textContent = custom ? '(custom)' : '(default)';
}

function readScoring() {
  const sc = { weekWeights: [], positionWeights: [], threshold: Number($('threshold').value) };
  for (const [id, key, i] of SC_FIELDS) sc[key][i] = Number($(id).value);
  const ok = [...sc.weekWeights, ...sc.positionWeights].every((x) => Number.isFinite(x) && x >= 0) && sc.threshold > 0;
  return ok ? sc : null;
}

async function save(patch) {
  state.settings = await send({ type: 'setSettings', patch });
  render();
  setTimeout(async () => renderPage(await pageSummary()), 400); // page re-tags after a settings change
}

document.querySelectorAll('#scoring input').forEach((i) => (i.onchange = () => {
  const sc = readScoring();
  if (sc) save({ scoring: sc });
}));
$('scReset').onclick = () => save({ scoring: null });
for (const k of ['enabled', 'showNameMatches']) $(k).onchange = (e) => save({ [k]: e.target.checked });
$('refresh').onclick = async () => {
  $('refresh').disabled = true;
  $('updated').textContent = 'updating…';
  await send({ type: 'refresh' });
  state = await send({ type: 'getState' });
  $('refresh').disabled = false;
  render();
};

(async () => {
  state = await send({ type: 'getState' });
  render();
  renderPage(await pageSummary());
})();
