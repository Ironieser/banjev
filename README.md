<img src="docs/logo.png" width="96" alt="BanJev logo">

# BanJev

**节约读论文时间，节约读论文的 token。**
**Save time reading papers. Save tokens reading papers.**

[中文](#中文) · [English](#english)

![arXiv search with BanJev badges](docs/arxiv.png)

---

## 中文

BanJev 是一个 Chrome 插件（Manifest V3）。Jev（TypeSafe AI 的 System One 模型）2026-09-17 爆火之后，arXiv 上很快出现了一批“蹭热点”论文。插件会在 **arXiv** 和 **Google Scholar** 上给这些论文和它们的作者打上 `BanJev` 标记，方便你一眼跳过。

### 名单从哪里来

- **arXiv API**：搜索 2026-09-17 之后提交、标题或摘要里含 `Jev` 的论文。这和 Frontier Lab 帖子里那张“近期论文”表格的来源一致。
- **awesome-jev README**：[yibie/awesome-jev](https://github.com/yibie/awesome-jev) 里如果出现 arXiv 链接，也会自动收录。目前这个仓库只收项目，没有收论文。
- 插件每 6 小时自动更新一次，popup 里也可以点“Update list now”立即更新。仓库里的 `data/papers.json` 是离线快照。

### 三种标记（重点：避免误伤同名的人）

`Yi Li`、`Yu Sun`、`Delong Li` 这类名字在学术界有成百上千个同名者。只按名字匹配会冤枉大量无关的人，所以插件把标记分成三级：

| 标记 | 含义 | 判定依据 |
|---|---|---|
| <kbd>BanJev</kbd> 实心红 · 论文 | 这篇论文本身在名单里 | arXiv ID 或标题完全匹配 |
| <kbd>BanJev</kbd> 实心红 · 作者 | 基本确定是同一个人 | ① 就是名单论文的作者；② 同一篇名单论文的 ≥2 位作者同时出现在一篇文章里；③ Scholar 主页的论文列表里有名单论文（插件会记住这个主页）；④ 你手动确认过 |
| <kbd>BanJev?</kbd> 虚线 | 只有名字相同，可能不是同一个人 | 全名完全一致 |

- Google Scholar 搜索结果里的作者名是缩写（如 `Y Li`），误伤率极高，所以默认**不按缩写名单独匹配**，只采用上面的 ①②③④。可以在 popup 里手动打开。
- 点击任意标记会弹出证据：是哪几篇论文、作者是谁。
- 误伤的话，点“Not this person”就会屏蔽该名字或 Scholar 主页；在 popup 里可以撤销。
- 某篇论文其实跟 Jev 无关？在 popup 里点 Exclude 把它排除。
- 注意：Google Scholar 收录新论文通常要几天到几周。在那之前，Scholar 主页大多只会显示虚线的 `BanJev?`，等收录后会自动升级为实心标记。

### 支持的页面

- arXiv：摘要页、`/list` 列表、搜索结果、作者检索
- Google Scholar：搜索结果、个人主页（主页主人、论文列表、合作者栏）、作者搜索

### 安装

1. 下载本仓库（`git clone` 或 Download ZIP）
2. 打开 `chrome://extensions`，打开右上角“开发者模式”
3. 点“加载已解压的扩展程序”，选择仓库根目录

### 开发与测试

```bash
npm install
npm test            # 单元测试：名字归一化、arXiv 解析、分级匹配、误伤处理
npm run test:e2e    # 端到端测试：用 Puppeteer 把插件加载进 Chrome for Testing，
                    # 在真实 arXiv 页面和 Scholar 夹具页面上检查标记
npm run update-data # 从 arXiv 重新生成 data/papers.json
npm run package     # 打包成 banjev.zip
python3 scripts/make-icons.py  # 重新生成图标（需要 Pillow）
```

### 声明

标记只表示“此人在 Jev 爆火后发表过以 Jev 为题的论文”，是一个阅读过滤器，不评价具体论文的内容。

---

## English

BanJev is a Chrome extension (Manifest V3). After Jev (TypeSafe AI's System One model) went viral on 2026-09-17, a wave of bandwagon papers showed up on arXiv. BanJev adds a `BanJev` badge to those papers and their authors on **arXiv** and **Google Scholar**, so you can skip them.

### Where the list comes from

- **arXiv API**: papers submitted on or after 2026-09-17 that mention `Jev` in the title or abstract. This is the same source as the "recent papers" table in the Frontier Lab post.
- **awesome-jev README**: arXiv links in [yibie/awesome-jev](https://github.com/yibie/awesome-jev) are picked up too. Right now that repo lists projects only, no papers.
- The list refreshes every 6 hours; use "Update list now" in the popup to refresh right away. `data/papers.json` is the bundled offline snapshot.

### Three kinds of badge (so people who share a name aren't tagged by mistake)

Names like `Yi Li`, `Yu Sun` and `Delong Li` belong to hundreds of researchers. Matching on the name alone would tag lots of unrelated people, so BanJev uses three levels:

| Badge | Meaning | Evidence |
|---|---|---|
| <kbd>BanJev</kbd> solid · paper | The paper itself is on the list | arXiv ID or exact title |
| <kbd>BanJev</kbd> solid · author | Almost certainly the same person | (1) an author of the listed paper; (2) ≥2 co-authors of the same listed paper appear together; (3) their Scholar profile contains a listed paper (the profile is remembered); (4) you confirmed it by hand |
| <kbd>BanJev?</kbd> dashed | The name matches, but it may be someone else | Exact full-name match |

- Google Scholar search results abbreviate names (e.g. `Y Li`), which would produce far too many false positives. By default an abbreviated name on its own is **not** matched; only evidence (1) to (4) counts. You can turn it on in the popup.
- Click any badge to see the evidence: which papers and which authors.
- Tagged the wrong person? Click "Not this person" to hide that name or Scholar profile. You can undo this in the popup.
- Is a paper not really about Jev? Click "Exclude" in the popup.
- Note: Google Scholar takes days to weeks to index new papers. Until then, most Scholar profiles only get the dashed `BanJev?` badge. Once the paper is indexed, the badge turns solid automatically.

### Supported pages

- arXiv: abstract pages, `/list` listings, search results, author search
- Google Scholar: search results, profiles (the owner, the publication list, the co-author sidebar), author search

### Install

1. Clone or download this repository
2. Open `chrome://extensions` and turn on Developer mode
3. Click "Load unpacked" and select the repository root

### Develop and test

```bash
npm install
npm test            # unit tests: name normalization, arXiv parsing, tiered matching, false-positive controls
npm run test:e2e    # end-to-end: loads the extension into Chrome for Testing with Puppeteer and checks
                    # badges on live arXiv pages and on Scholar fixture pages
npm run update-data # regenerate data/papers.json from arXiv
npm run package     # build banjev.zip
python3 scripts/make-icons.py  # regenerate icons (needs Pillow)
```

### Disclaimer

A badge only means "this person published a Jev-titled paper after Jev went viral". It is a reading filter, not a judgment of any individual paper's content.
