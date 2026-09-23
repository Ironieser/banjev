/* global BanJev */
const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));
let state;

function render() {
  const s = state.settings;
  for (const k of ['enabled', 'showNameMatches']) $(k).checked = !!s[k];
  const excluded = new Set(s.excludedPapers);
  const live = state.papers.filter((p) => !excluded.has(p.id));
  const banned = BanJev.scoreAuthors(live, state.curation).filter((a) => a.banned).length;
  $('stats').textContent = `${live.length} papers · ${banned} banned authors`;
  $('updated').textContent = state.lastError
    ? 'Update failed: ' + state.lastError
    : 'Updated ' + new Date(state.updatedAt).toLocaleString();

  const q = $('filter').value.trim().toLowerCase();
  const ul = $('papers');
  ul.textContent = '';
  for (const p of state.papers) {
    if (q && !(p.title + ' ' + p.authors.join(' ')).toLowerCase().includes(q)) continue;
    const li = document.createElement('li');
    if (excluded.has(p.id)) li.className = 'off';
    const a = Object.assign(document.createElement('a'), { href: 'https://arxiv.org/abs/' + p.id, target: '_blank', textContent: p.title });
    const au = Object.assign(document.createElement('div'), { className: 'authors', textContent: p.authors.join(', ') });
    const meta = document.createElement('div');
    meta.className = 'meta';
    const btn = Object.assign(document.createElement('button'), {
      textContent: excluded.has(p.id) ? 'Include' : 'Exclude',
      title: 'Exclude a paper that is not really a Jev paper',
    });
    btn.onclick = () => {
      const set = new Set(s.excludedPapers);
      set.has(p.id) ? set.delete(p.id) : set.add(p.id);
      save({ excludedPapers: [...set] });
    };
    meta.append(`${p.id} · ${p.published}`, btn);
    li.append(a, au, meta);
    ul.append(li);
  }

  const fp = $('fpList');
  fp.textContent = '';
  const items = [...s.notThem.names.map((n) => ['name', n]), ...s.notThem.scholarIds.map((id) => ['scholarId', id])];
  $('fpCount').textContent = items.length;
  for (const [kind, v] of items) {
    const li = document.createElement('li');
    li.append(kind === 'name' ? v : 'Scholar profile ' + v);
    const b = Object.assign(document.createElement('button'), { textContent: 'Undo' });
    b.onclick = () => {
      const notThem = { names: s.notThem.names.filter((x) => x !== v), scholarIds: s.notThem.scholarIds.filter((x) => x !== v) };
      save({ notThem });
    };
    li.append(b);
    fp.append(li);
  }
}

async function save(patch) {
  state.settings = await send({ type: 'setSettings', patch });
  render();
}

for (const k of ['enabled', 'showNameMatches']) $(k).onchange = (e) => save({ [k]: e.target.checked });
$('filter').oninput = render;
$('refresh').onclick = async () => {
  $('refresh').disabled = true;
  $('updated').textContent = 'Updating…';
  await send({ type: 'refresh' });
  state = await send({ type: 'getState' });
  $('refresh').disabled = false;
  render();
};

(async () => {
  state = await send({ type: 'getState' });
  render();
})();
