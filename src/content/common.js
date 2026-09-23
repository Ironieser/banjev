/* Shared content-script runtime: state, badges, evidence popover, rescans. */
(function () {
  'use strict';
  const core = globalThis.BanJev;
  const ui = (globalThis.BanJevUI = {});
  let state = null;
  let index = null;
  let scanFn = null;
  // What is tagged on this page, for the toolbar popup.
  const found = { authors: new Map(), papers: new Map() };
  const RANK = { name: 0, confirmed: 1, paper: 2 };

  const LABEL = { paper: 'BanJev', confirmed: 'BanJev', name: 'BanJev?' };
  const WHY = {
    paper: 'This paper is on the Jev bandwagon list.',
    confirmed: 'Identity verified: ',
    name: 'Name match only. This may be a different person with the same name. ',
  };

  function send(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  async function load() {
    state = await send({ type: 'getState' });
    index = core.buildIndex(state.papers || [], state.settings, state.curation);
  }

  ui.index = () => index;
  ui.settings = () => state.settings;
  ui.send = send;

  // result: output of core.classifyAuthors / classifyProfile
  // ctx: { name, scholarId } used by the "not this person" / "confirm" buttons
  ui.badge = function (result, ctx) {
    if (!result) return null;
    const r = result.author;
    if (r) {
      const prev = found.authors.get(r.key);
      if (!prev || RANK[result.level] > RANK[prev.level]) {
        found.authors.set(r.key, { name: r.name, score: r.score, level: result.level, papers: r.papers.length });
      }
    } else if (result.level === 'paper') {
      result.papers.forEach((p) => found.papers.set(p.id, { id: p.id, title: p.title }));
    }
    const b = document.createElement('span');
    b.className = 'banjev-badge banjev-' + result.level;
    b.textContent = LABEL[result.level];
    b.setAttribute('data-banjev', '');
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    const titles = result.papers.map((p) => '• ' + p.title).join('\n');
    const who = result.author ? result.author.name + ' · score ' + fmt(result.author.score) + '\n' : '';
    b.title = who + WHY[result.level] + (result.level === 'confirmed' ? result.reason : '') + '\n' + titles;
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPopover(b, result, ctx || {});
    };
    b.addEventListener('click', open);
    b.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && open(e));
    return b;
  };

  ui.paperBadge = function (paper) {
    return ui.badge({ level: 'paper', papers: [paper], reason: 'listed paper' }, {});
  };

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) k === 'class' ? (n.className = v) : n.setAttribute(k, v);
    kids.forEach((k) => n.append(k));
    return n;
  }

  const fmt = (n) => String(Math.round(n * 1000) / 1000);
  const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

  function closePopover() {
    document.querySelectorAll('.banjev-pop').forEach((p) => p.remove());
  }

  function showPopover(anchor, result, ctx) {
    closePopover();
    const pop = el('div', { class: 'banjev-pop', 'data-banjev': '' });
    const head =
      result.level === 'paper'
        ? 'Jev bandwagon paper'
        : result.level === 'confirmed'
          ? 'Banned author (' + result.reason + ')'
          : 'Possibly a banned author (' + result.reason + '). This could be someone else with the same name.';
    pop.append(el('div', { class: 'banjev-pop-head' }, head));
    const r = result.author;
    if (r) {
      const parts = r.papers.map((x) => ordinal(x.position));
      pop.append(
        el('div', { class: 'banjev-pop-score' }, `${r.name}: score ${fmt(r.score)}` + (r.forced ? ' (manually banned)' : ` = ${parts.join(' + ')} author`))
      );
    }
    const ul = el('ul');
    for (const p of result.papers) {
      const pos = r ? (r.papers.find((x) => x.id === p.id) || {}).position : 0;
      const authors = p.authors.map((a) => {
        const rec = index.authors.get(core.normName(a));
        return a + (rec && rec.banned ? ' ⛔' : '');
      });
      ul.append(
        el(
          'li',
          {},
          el('a', { href: 'https://arxiv.org/abs/' + p.id, target: '_blank', rel: 'noopener' }, p.title),
          el('div', { class: 'banjev-pop-meta' }, [p.id, p.published, pos ? ordinal(pos) + ' author' : '', authors.join(', ')].filter(Boolean).join(' · '))
        )
      );
    }
    pop.append(ul);
    const actions = el('div', { class: 'banjev-pop-actions' });
    if (result.level !== 'paper' && (ctx.scholarId || ctx.name)) {
      const no = el('button', { type: 'button' }, 'Not this person');
      no.onclick = async () => {
        await send({ type: 'notThem', scholarId: ctx.scholarId, name: ctx.scholarId ? null : ctx.name });
        closePopover();
      };
      actions.append(no);
    }
    if (actions.childNodes.length) pop.append(actions);
    document.body.append(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.top = window.scrollY + rect.bottom + 6 + 'px';
    pop.style.left = Math.max(8, Math.min(window.scrollX + rect.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8)) + 'px';
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type !== 'pageSummary') return;
    const authors = [...found.authors.values()].sort((a, b) => RANK[b.level] - RANK[a.level] || b.score - a.score || a.name.localeCompare(b.name));
    reply({ enabled: !!(state && state.settings.enabled), authors, papers: [...found.papers.values()] });
  });

  document.addEventListener('click', (e) => !e.target.closest('.banjev-pop') && closePopover());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closePopover());

  function clear() {
    closePopover();
    found.authors.clear();
    found.papers.clear();
    document.querySelectorAll('.banjev-badge').forEach((b) => b.remove());
    document.querySelectorAll('[data-banjev-done]').forEach((n) => n.removeAttribute('data-banjev-done'));
    document.documentElement.removeAttribute('data-banjev-ready');
  }

  function run() {
    if (!state.settings.enabled || !scanFn) return;
    try {
      scanFn();
    } finally {
      document.documentElement.setAttribute('data-banjev-ready', String(index.papers.length));
    }
  }

  // Each site script calls this once with its scan function (must be idempotent
  // via data-banjev-done markers).
  ui.start = async function (fn) {
    scanFn = fn;
    await load();
    run();
    let t = null;
    new MutationObserver((muts) => {
      if (muts.every((m) => [...m.addedNodes].every((n) => n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-banjev')))) return;
      clearTimeout(t);
      t = setTimeout(run, 250);
    }).observe(document.body, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local' || !(changes.settings || changes.papers || changes.curation)) return;
      await load();
      clear();
      run();
    });
  };
})();
