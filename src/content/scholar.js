/* Google Scholar: search results, author profiles, author search. */
(function () {
  'use strict';
  const core = globalThis.BanJev;
  const ui = globalThis.BanJevUI;

  function userId(href) {
    try {
      return new URL(href, location.href).searchParams.get('user');
    } catch (e) {
      return null;
    }
  }

  // Split the author part of a result's ".gs_a" line into elements, wrapping
  // plain-text names in spans so badges can be placed next to each of them.
  function authorEls(gsA) {
    const out = [];
    for (const node of [...gsA.childNodes]) {
      if (node.nodeType === 1 && node.tagName === 'A') {
        out.push(node);
        continue;
      }
      if (node.nodeType !== 3) continue;
      const t = node.textContent;
      const dash = t.search(/\s[-–]\s/);
      const head = dash >= 0 ? t.slice(0, dash) : t;
      const frag = document.createDocumentFragment();
      head.split(/(,\s*)/).forEach((piece) => {
        const name = piece.trim();
        if (name && name !== ',' && !/^[….]+$/.test(name)) {
          const s = document.createElement('span');
          s.className = 'banjev-author';
          s.textContent = piece;
          frag.append(s);
          out.push(s);
        } else if (piece) frag.append(piece);
      });
      if (dash >= 0) frag.append(t.slice(dash));
      node.replaceWith(frag);
      if (dash >= 0) break;
    }
    return out;
  }

  function resultArxivId(r) {
    const a = r.querySelector('a[href*="arxiv.org/abs/"], a[href*="arxiv.org/pdf/"]');
    if (a) return core.normArxivId(a.href);
    const m = (r.querySelector('.gs_a') || r).textContent.match(/arXiv:(\d{4}\.\d{4,5})/i);
    return m ? m[1] : '';
  }

  function resultTitle(rt) {
    const a = rt.querySelector('a');
    const t = (a || rt).textContent;
    return t.replace(/^\s*(\[[^\]]+\]\s*)+/, '').trim();
  }

  function scanResults() {
    const index = ui.index();
    document.querySelectorAll('.gs_r .gs_ri:not([data-banjev-done]), .gs_ri:not([data-banjev-done])').forEach((ri) => {
      ri.setAttribute('data-banjev-done', '');
      const rt = ri.querySelector('.gs_rt');
      const gsA = ri.querySelector('.gs_a');
      const paper = { id: resultArxivId(ri.closest('.gs_r') || ri), title: rt ? resultTitle(rt) : '' };
      const listed = core.findPaper(index, paper);
      if (listed && rt) {
        const b = ui.paperBadge(listed);
        if (b) rt.prepend(b);
      }
      if (!gsA) return;
      const els = authorEls(gsA);
      const authors = els.map((e) => ({ name: e.textContent, abbreviated: true, scholarId: e.tagName === 'A' ? userId(e.href) : null }));
      const res = core.classifyAuthors(index, paper, authors, { site: 'scholar' });
      els.forEach((e, i) => {
        const b = ui.badge(res[i], { name: e.textContent.trim(), scholarId: authors[i].scholarId });
        if (b) e.after(b);
      });
    });
  }

  function scanProfile() {
    const nameEl = document.querySelector('#gsc_prf_in');
    const id = userId(location.href);
    if (!nameEl || !id) return;
    const index = ui.index();
    const rows = [...document.querySelectorAll('#gsc_a_b .gsc_a_tr')];
    const pubs = rows.map((r) => ({
      title: (r.querySelector('.gsc_a_at') || {}).textContent || '',
      authors: ((r.querySelector('.gs_gray') || {}).textContent || '').split(',').map((x) => x.trim()).filter((x) => x && x !== '...'),
    }));

    // Publication rows that are listed papers
    rows.forEach((r, i) => {
      if (r.hasAttribute('data-banjev-done')) return;
      r.setAttribute('data-banjev-done', '');
      const listed = core.findPaper(index, { title: pubs[i].title });
      const at = r.querySelector('.gsc_a_at');
      if (listed && at) {
        const b = ui.paperBadge(listed);
        if (b) at.before(b);
      }
    });

    // The profile owner (re-evaluated when "Show more" loads further rows)
    if (!nameEl.dataset.banjevName) nameEl.dataset.banjevName = nameEl.textContent.trim();
    const name = nameEl.dataset.banjevName;
    const res = core.classifyProfile(index, { scholarId: id, name, pubs });
    if (res && res.learn && !index.scholarToKey.has(id)) ui.send({ type: 'learnProfile', scholarId: id, key: res.learn });
    const prev = nameEl.querySelector('.banjev-badge');
    if (prev && prev.dataset.level === (res && res.level)) return;
    if (prev) prev.remove();
    const b = ui.badge(res, { name, scholarId: id });
    if (b) {
      b.dataset.level = res.level;
      nameEl.append(b);
    }
  }

  // Co-author sidebar on profiles and the author-search page list full names.
  function scanPeople() {
    const index = ui.index();
    document
      .querySelectorAll('#gsc_rsb_co a[href*="user="]:not([data-banjev-done]), .gs_ai_name a[href*="user="]:not([data-banjev-done])')
      .forEach((a) => {
        a.setAttribute('data-banjev-done', '');
        const author = { name: a.textContent, scholarId: userId(a.href) };
        const [res] = core.classifyAuthors(index, null, [author], { site: 'scholar' });
        const b = ui.badge(res, author);
        if (b) a.after(b);
      });
  }

  ui.start(() => {
    scanResults();
    scanProfile();
    scanPeople();
  });
})();
