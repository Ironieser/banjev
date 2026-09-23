# awesome-jev snapshot

A copy of the README of [yibie/awesome-jev](https://github.com/yibie/awesome-jev), kept here so that
BanJev's list never depends on another repository at runtime.

- Upstream commit: [`be162200bf24`](https://github.com/yibie/awesome-jev/tree/be162200bf2407266ac04e47d6a4d3cdb2e71f5a)
- Copied: 2026-09-23
- Licence: see the upstream repository

`scripts/update-data.mjs` reads arXiv links from this local copy. awesome-jev currently lists
projects only (no arXiv papers), so today it contributes no papers; the list is maintained in
[`data/manual.json`](../../data/manual.json) plus the automatic arXiv search. To refresh the copy:

```bash
curl -sL https://raw.githubusercontent.com/yibie/awesome-jev/main/README.md -o sources/awesome-jev/README.md
```
