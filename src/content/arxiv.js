/* arXiv: abstract pages, listings (/list), search results, author pages. */
(function () {
  'use strict';
  const core = globalThis.BanJev;
  const ui = globalThis.BanJevUI;

  // Find the entry an author link belongs to, its arXiv ID and its title element.
  function entryOf(a) {
    const li = a.closest('li.arxiv-result');
    if (li) {
      const idA = li.querySelector('.list-title a[href*="/abs/"]');
      return { root: li, id: idA && idA.href, titleEl: li.querySelector('p.title') };
    }
    const dd = a.closest('dd');
    if (dd) {
      const dt = dd.previousElementSibling;
      const idA = dt && dt.querySelector('a[href*="/abs/"]');
      return { root: dd, id: idA && idA.href, titleEl: dd.querySelector('.list-title') };
    }
    const abs = a.closest('#abs, #abs-outer, .leftcolumn');
    if (abs) {
      return { root: abs, id: location.pathname, titleEl: abs.querySelector('h1.title') };
    }
    return { root: a.parentElement, id: null, titleEl: null };
  }

  function titleText(titleEl) {
    if (!titleEl) return '';
    return titleEl.textContent.replace(/^\s*Title:\s*/, '').trim();
  }

  function scan() {
    const index = ui.index();
    const groups = new Map();
    document.querySelectorAll('a[href*="searchtype=author"]:not([data-banjev-done])').forEach((a) => {
      const e = entryOf(a);
      if (!groups.has(e.root)) groups.set(e.root, { e, links: [] });
      groups.get(e.root).links.push(a);
    });
    for (const { e, links } of groups.values()) {
      const paper = { id: e.id, title: titleText(e.titleEl) };
      const listed = core.findPaper(index, paper);
      if (listed && e.titleEl && !e.titleEl.querySelector('.banjev-paper')) {
        const b = ui.paperBadge(listed);
        if (b) e.titleEl.prepend(b);
      }
      // classify against the full author list of the entry (co-author evidence),
      // including links already processed in an earlier pass
      const all = [...e.root.querySelectorAll('a[href*="searchtype=author"]')];
      const res = core.classifyAuthors(index, paper, all.map((a) => ({ name: a.textContent })), ui.settings());
      all.forEach((a, i) => {
        if (a.hasAttribute('data-banjev-done')) return;
        a.setAttribute('data-banjev-done', '');
        const b = ui.badge(res[i], { name: a.textContent.trim() });
        if (b) a.after(b);
      });
    }
  }

  ui.start(scan);
})();
