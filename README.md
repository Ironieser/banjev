<img src="docs/logo.png" width="96" alt="BanJev logo">

# BanJev

**Save time reading papers. Save tokens reading papers.**

English · [中文](README_CN.md) · [Ranking page](https://ironieser.github.io/banjev/)

![arXiv search with BanJev badges](docs/arxiv.png)

BanJev is a Chrome extension (Manifest V3) that puts the BanJev logo <img src="icons/16.png" width="14" alt="logo"> as a small badge on **fast-follow papers** (papers that appear within weeks of a model going viral) and their authors on **arXiv** and **Google Scholar**, so you can deprioritize them when you triage what to read, or what to feed an LLM.

## Why "BanJev"? This is not about Jev

BanJev is **not** aimed at Jev, TypeSafe AI, or anyone building on Jev. Many solid projects use it (see [awesome-jev](https://github.com/yibie/awesome-jev)). Jev is simply **where we noticed a pattern**, so the name marks the pattern, not the model:

1. **2026-09-17**: Jev (TypeSafe AI's System One model) goes viral.
2. **2 to 5 days later**: a batch of arXiv preprints shows up with "Jev" in the title: "X with Jev", "Jev for Y", "Jev-as-a-Z".
3. Careful research, with experiments, baselines, ablations and writing, usually takes weeks to months. A paper about a model released only days earlier has had very little time for that work.
4. A reader has limited attention and a limited token budget. How soon after a release someone publishes is a cheap, useful signal. If an author put out a paper within days of a release, you can reasonably move **their** papers lower in your reading queue.

So a badge means exactly one thing: **this person published a Jev-titled paper on arXiv within weeks of Jev's release.** It says nothing about Jev, and it is not a verdict on any specific paper. It is a reading-priority filter.

Why the first author carries the most weight: the first author is usually the one who decided to write the paper and did the work. A 5th author may have simply lent their name. That's why the score weights author position (below).

The mechanism is not tied to Jev: it needs only a keyword, a start date and a list. If the same pattern shows up in the next hype wave, the same pipeline can track it.

## Which papers are listed

The list is maintained **in this repository** and does not depend on any other repository.

- **Automatic**: arXiv papers submitted on or after 2026-09-17 that mention `Jev` in the title or abstract.
- **Manual**: [`data/manual.json`](data/manual.json), maintained by pull request (see the table below).
- **Initial source**: the idea and the starting point came from [yibie/awesome-jev](https://github.com/yibie/awesome-jev). A snapshot of it is kept in [`sources/awesome-jev/`](sources/awesome-jev/SOURCE.md), and any arXiv links in that copy are included. That list currently has projects only, no papers.

`data/manual.json` fields:

| Field | Purpose |
|---|---|
| `addPapers` | Papers to add: arXiv IDs, or full `{id, title, authors, published, url}` entries for papers not on arXiv |
| `excludePapers` | Search hits that aren't really Jev papers |
| `banAuthors` | Always ban these authors |
| `allowAuthors` | Never ban these authors (confirmed false positives) |
| `scholarProfiles` | Author name → Google Scholar user ID(s) |

A [GitHub Action](.github/workflows/update.yml) runs every 6 hours and on every change to `manual.json`. It updates [`data/papers.json`](data/papers.json) and [`data/authors.json`](data/authors.json), commits them, and publishes the [ranking page](https://ironieser.github.io/banjev/). The extension pulls `data/papers.json` from this repo on the same 6-hour schedule.

## Who gets banned

Each listed paper adds **author-position weight × time weight** to each of its authors:

| Author position | 1st | 2nd | 3rd | 4th, 5th, … |
|---|---|---|---|---|
| Weight | 1 | 0.5 | 0.25 | halving (0.125, …) |

| Submitted to arXiv, counted from the model's release | Week 1 | Week 2 | Week 3 | Week 4 | Later |
|---|---|---|---|---|---|
| Weight | ×2 | ×1 | ×0.5 | ×0.25 | ×0 |

An author with a **total of ≥ 1** is banned. Examples:
- a week-1 first author: 1 × 2 = 2, banned;
- a week-1 second author: 0.5 × 2 = 1, banned;
- a week-3 first author: 1 × 0.5 = 0.5, not banned unless they have more papers.

Papers submitted more than 4 weeks after the release count 0 and get no badge: about a month is a normal research pace. `banAuthors` / `allowAuthors` in `manual.json` override the score.

**You can change all of this**: the week weights, the position weights and the threshold are editable under "Scoring" in the extension popup. Your settings affect only your own browser. The repository and the ranking page use the defaults above.

### Why time decay?

Real work, meaning experiments, baselines, ablations and writing, takes time. The faster a paper about a brand-new model appears, the less of that work it can contain. There is some related evidence:

- COVID-19 papers were accepted in a median of **13 days**, against 110 days for matched controls, and scored **lower on methodological quality** in every study design examined. — Jung et al., *Methodological quality of COVID-19 clinical research*, Nature Communications 12:943 (2021), [doi:10.1038/s41467-021-21220-5](https://doi.org/10.1038/s41467-021-21220-5)
- The conclusions of **17.2%** of COVID-19 preprints changed by the time they were published in a journal, against **7.2%** of other preprints. Event-driven preprints get revised more. — Brierley et al., *Tracking changes between preprint posting and journal publication during a pandemic*, PLOS Biology (2022), [doi:10.1371/journal.pbio.3001285](https://doi.org/10.1371/journal.pbio.3001285)
- In protein-interaction research, findings on more popular topics were **less reliable**. — Pfeiffer & Hoffmann, *Large-Scale Assessment of the Effect of Popularity on the Reliability of Research*, PLoS ONE 4(6):e5996 (2009), [doi:10.1371/journal.pone.0005996](https://doi.org/10.1371/journal.pone.0005996)
- In the first seven months after ChatGPT's release, only **36.8%** of 533 indexed ChatGPT publications were empirical studies. — Farhat et al., *The scholarly footprint of ChatGPT*, Frontiers in AI 6:1270749 (2023), [doi:10.3389/frai.2023.1270749](https://doi.org/10.3389/frai.2023.1270749)
- On the ML side, Lipton & Steinhardt point to "misaligned incentives between scholarship and short-term measures of success". — *Troubling Trends in Machine Learning Scholarship*, [arXiv:1807.03341](https://arxiv.org/abs/1807.03341) (2018)

Two caveats:
- There is also counter-evidence. Across all COVID-19 papers, Sevryugina & Dicks found a median review time of 66 days and no evidence that speed compromised integrity. They found that the fastest early papers mostly benefited from an "early bird" attention effect. — *Learned Publishing* (2022), [doi:10.1002/leap.1483](https://doi.org/10.1002/leap.1483)
- **We know of no study that measures paper quality against days since an AI model's release.** The evidence above comes from other fields and settings. The week 1 to 4 schedule, and treating about a month as normal, are **heuristics, not a fitted curve**. That's why they are editable.

## How the extension avoids tagging the wrong person

Names like `Li Hua` or `Sam Smith` belong to hundreds of researchers, so a badge needs evidence:

| Badge | When |
|---|---|
| <img src="icons/16.png" width="14" alt="logo"> before a paper title | The paper is on the list (matched by arXiv ID or exact title) |
| <img src="icons/16.png" width="14" alt="logo"> after an author name | A banned author with identity evidence: (1) they are on the listed paper shown; (2) ≥ 2 co-authors of the same listed paper appear together; (3) a known Scholar profile (from `scholarProfiles`, or verified earlier in your browser) |
| Faded <img src="icons/16.png" width="14" alt="logo"> with a dashed outline | **arXiv only**: the full name matches a banned author, with no further evidence. Can be turned off in the popup |

**Google Scholar never tags by name alone.** A Scholar profile is tagged only if:
- it is listed in `scholarProfiles`, or
- its publication list contains the listed paper and the owner's name is on it, or
- **the co-author network matches**: ≥ 2 of its publications share ≥ 2 distinct co-authors with the listed paper (≥ 3 publications if the listed paper has only one co-author). Scholar can take weeks to index a new arXiv paper, and this rule confirms the author before that happens.

**Once an author's real profile is known, other researchers with the same name are left alone.** A profile or author link with a different Scholar ID is not tagged, even if the name matches.

For example, a new arXiv paper often isn't on its author's Scholar profile yet. If that profile already has several papers with the same collaborators, it is recognised as the same person. Nobody else who shares the name is affected.

Click any badge to see the evidence, the author's score and author positions. Use "Not this person" to hide a false positive; you can undo it in the popup.

The toolbar popup shows who is tagged **on the current page** (with scores), the on/off switches and the update status. The full list lives on the [ranking page](https://ironieser.github.io/banjev/).

## Install

1. Clone or download this repository
2. Open `chrome://extensions` and turn on Developer mode
3. Click "Load unpacked" and select the repository root

## Develop and test

```bash
npm install
npm test            # unit tests: scoring, matching, Scholar evidence rules (incl. a real profile)
npm run test:e2e    # end-to-end: loads the extension into Chrome for Testing with Puppeteer and checks
                    # live arXiv pages and Scholar fixture pages
npm run update-data # regenerate data/papers.json and data/authors.json
npm run build-site  # assemble the ranking page into build/site/
npm run package     # build banjev.zip
npm run screenshot  # regenerate docs/arxiv.png (titles and names blurred)
python3 scripts/make-icons.py  # regenerate icons (needs Pillow)
```

## Disclaimer

A badge only means "this person published a Jev-titled paper after Jev went viral". It is a reading filter, not a judgment of any individual paper's content.

## Roadmap

v0.0.1 has the basics. Planned next (PRs welcome):

- [ ] **More hype keywords**: configure several trend waves (keyword + start date) instead of one hard-coded "Jev" search, so the same pipeline can follow the next viral model
- [ ] **Easier author and paper submissions**: an issue form that turns "add this paper / this author / this Scholar profile" into a `manual.json` PR automatically
- [ ] **Filtering with Jev**: ask Jev a `Noul` ("Is this paper mainly a quick response to the launch rather than an answer to a research question?") per candidate paper, and use the probability to filter keyword hits and cut false positives
- [ ] **Better author identity**: use ORCID / Semantic Scholar / DBLP author IDs where available, and discover Scholar profiles automatically instead of by hand
- [ ] **More sites**: Semantic Scholar, OpenReview, Hugging Face Papers, alphaXiv
- [x] **Configurable scoring**: time decay, position weights and threshold are editable in the popup
- [ ] **Chrome Web Store release** (and Firefox)

## License

[Apache License 2.0](LICENSE)
