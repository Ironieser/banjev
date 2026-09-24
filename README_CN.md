<img src="docs/logo.png" width="96" alt="BanJev logo">

# BanJev

**节约读论文时间，节约读论文的 token。**

[English](README.md) · 中文 · [排行榜页面](https://ironieser.github.io/banjev/)

![带 BanJev 标记的 arXiv 搜索结果](docs/arxiv.png)

BanJev 是一个 Chrome 插件（Manifest V3）。它在 **arXiv** 和 **Google Scholar** 上给**快速跟进的论文**（模型爆火后几周内出现的论文）及其作者打上 BanJev 的 logo 小图标 <img src="icons/16.png" width="14" alt="logo">。这样你在挑选要读的论文、或者要喂给大模型的论文时，可以把它们往后排。

## 为什么叫 BanJev？这不是针对 Jev

BanJev **不是**针对 Jev、TypeSafe AI，也不是针对基于 Jev 做东西的人。很多扎实的项目都在用它（见 [awesome-jev](https://github.com/yibie/awesome-jev)）。Jev 只是我们**观察到某种现象的地方**，名字指的是这个现象，而不是这个模型：

1. **2026-09-17**：Jev（TypeSafe AI 的 System One 模型）爆火。
2. **2 到 5 天后**：arXiv 上出现了一批标题里带 “Jev” 的预印本：“X with Jev”、“Jev for Y”、“Jev-as-a-Z”。
3. 认真的研究，包括实验、基线、消融和写作，通常要几周到几个月。研究几天前才发布的模型的论文，能用在这些工作上的时间非常少。
4. 读者的注意力和 token 预算都有限。模型发布后多快发论文，是一个成本很低但有用的信号。如果某位作者在发布后几天内就发了论文，那么把**他的**论文在阅读队列里往后排，是合理的。

所以，标记只表示一件事：**此人在 Jev 发布后几周内，往 arXiv 上发了以 Jev 为题的论文。**它不评价 Jev 本身，也不评价任何一篇具体论文的内容。它是一个阅读优先级过滤器。

为什么一作权重最高：一作通常是决定写这篇论文、并且实际做了工作的人；第五作者可能只是挂了个名。所以计分按作者位次加权（见下文）。

这套机制并不绑定 Jev，只需要一个关键词、一个起始日期和一份名单。下一波热点如果出现同样的现象，同一套流程就可以用来追踪。

## 收录哪些论文

名单**在本仓库里维护**，不依赖任何其他仓库。

- **自动收录**：2026-09-17 之后提交到 arXiv、标题或摘要里含 `Jev` 的论文。
- **人工维护**：[`data/manual.json`](data/manual.json)，通过 PR 修改（字段见下表）。
- **初始来源**：想法和起点来自 [yibie/awesome-jev](https://github.com/yibie/awesome-jev)。本仓库在 [`sources/awesome-jev/`](sources/awesome-jev/SOURCE.md) 保存了一份副本，副本里如果有 arXiv 链接也会收录。该列表目前只收项目，没有收论文。

`data/manual.json` 字段：

| 字段 | 作用 |
|---|---|
| `addPapers` | 手动添加论文。填 arXiv ID；不在 arXiv 上的论文填完整的 `{id, title, authors, published, url}` |
| `excludePapers` | 排除被误搜到、其实与 Jev 无关的论文 |
| `banAuthors` | 这些作者一律 ban |
| `allowAuthors` | 这些作者一律不 ban（确认是误伤的） |
| `scholarProfiles` | 作者名 → Google Scholar 用户 ID |

[GitHub Action](.github/workflows/update.yml) 每 6 小时运行一次，`manual.json` 有改动时也会立即运行。它会更新 [`data/papers.json`](data/papers.json) 和 [`data/authors.json`](data/authors.json)，自动提交，并发布[排行榜页面](https://ironieser.github.io/banjev/)。插件也是每 6 小时从本仓库拉一次 `data/papers.json`。

## 谁会被 ban

每篇收录论文给它的每位作者记 **作者位次权重 × 时间权重**：

| 作者位次 | 一作 | 二作 | 三作 | 四作及以后 |
|---|---|---|---|---|
| 权重 | 1 | 0.5 | 0.25 | 依次减半（0.125……） |

| 提交到 arXiv 的时间（从模型发布算起） | 第 1 周 | 第 2 周 | 第 3 周 | 第 4 周 | 更晚 |
|---|---|---|---|---|---|
| 权重 | ×2 | ×1 | ×0.5 | ×0.25 | ×0 |

**总分 ≥ 1** 的作者会被 ban。举例：
- 第 1 周的一作：1 × 2 = 2，ban；
- 第 1 周的二作：0.5 × 2 = 1，ban；
- 第 3 周的一作：1 × 0.5 = 0.5，除非还有别的论文，否则不 ban。

发布 4 周以后才提交的论文记 0 分，也不打标记：一个月左右是正常的研究节奏。`manual.json` 里的 `banAuthors` / `allowAuthors` 可以覆盖分数结果。

**这些都可以自定义**：插件 popup 里的 “Scoring” 可以修改每周的权重、作者位次权重和 ban 的阈值。你的设置只影响你自己的浏览器；仓库和排行榜页面使用上面的默认值。

### 为什么要按时间衰减？

真正的研究，包括实验、基线、消融和写作，都需要时间。一个全新的模型发布后，论文出现得越快，里面能包含的这些工作就越少。下面是一些相关证据：

- COVID-19 论文的接收时间中位数只有 **13 天**，对照组是 110 天；而在考察的每一种研究设计里，COVID-19 论文的**方法学质量都更低**。——Jung 等，*Methodological quality of COVID-19 clinical research*，Nature Communications 12:943 (2021)，[doi:10.1038/s41467-021-21220-5](https://doi.org/10.1038/s41467-021-21220-5)
- **17.2%** 的 COVID-19 预印本在正式发表时改变了结论，其他预印本只有 **7.2%**。受事件驱动的预印本更容易被大改。——Brierley 等，*Tracking changes between preprint posting and journal publication during a pandemic*，PLOS Biology (2022)，[doi:10.1371/journal.pbio.3001285](https://doi.org/10.1371/journal.pbio.3001285)
- 在蛋白质相互作用研究中，越热门的对象，相关结论**越不可靠**。——Pfeiffer & Hoffmann，*Large-Scale Assessment of the Effect of Popularity on the Reliability of Research*，PLoS ONE 4(6):e5996 (2009)，[doi:10.1371/journal.pone.0005996](https://doi.org/10.1371/journal.pone.0005996)
- ChatGPT 发布后的头七个月里，被收录的 533 篇相关文献中只有 **36.8%** 是实证研究。——Farhat 等，*The scholarly footprint of ChatGPT*，Frontiers in AI 6:1270749 (2023)，[doi:10.3389/frai.2023.1270749](https://doi.org/10.3389/frai.2023.1270749)
- 机器学习领域，Lipton 和 Steinhardt 指出“学术质量与短期成功指标之间的激励错位”。——*Troubling Trends in Machine Learning Scholarship*，[arXiv:1807.03341](https://arxiv.org/abs/1807.03341) (2018)

两点说明：
- 也有反面证据。Sevryugina 和 Dicks 发现，全部 COVID-19 论文的审稿时间中位数是 66 天，没有证据表明速度损害了研究诚信；最早那批快速发表的论文，主要是占了“先发者”的关注度优势。——*Learned Publishing* (2022)，[doi:10.1002/leap.1483](https://doi.org/10.1002/leap.1483)
- **我们没有找到任何研究直接衡量“论文质量”与“距 AI 模型发布的天数”之间的关系。**上面的证据来自其他领域和场景。第 1 到 4 周的衰减表、以及“一个月左右算正常”，都是**经验设定，不是拟合出来的曲线**。所以它们可以自定义。

## 插件怎么避免误伤同名的人

`Li Hua`、`Sam Smith` 这类名字，同名的研究者成百上千，所以打标记必须有证据：

| 标记 | 什么时候出现 |
|---|---|
| 论文标题前的 <img src="icons/16.png" width="14" alt="logo"> | 论文本身在名单里（按 arXiv ID 或标题完全匹配） |
| 作者名后的 <img src="icons/16.png" width="14" alt="logo"> | 被 ban 的作者，并且有身份证据：① 当前显示的就是名单论文，他是作者之一；② 同一篇名单论文的 ≥ 2 位作者一起出现；③ 已知的 Scholar 主页（来自 `scholarProfiles`，或之前在你的浏览器里验证过） |
| 半透明、带虚线框的 <img src="icons/16.png" width="14" alt="logo"> | **仅限 arXiv**：全名和某位被 ban 的作者一样，但没有其他证据。可以在 popup 里关闭 |

**Google Scholar 上绝不只凭名字打标记。** Scholar 主页只有满足下面任意一条才会被标记：
- 在 `scholarProfiles` 里；
- 主页的论文列表里有这篇名单论文，并且主页主人是作者之一；
- **合作者网络吻合**：主页上 ≥ 2 篇论文与名单论文有 ≥ 2 位相同的合作者（如果名单论文只有一位合作者，则需要 ≥ 3 篇）。Scholar 收录新 arXiv 论文可能要几周，靠这一条可以在收录之前就确认身份。

**一旦确认了某位作者的真实主页，其他同名研究者就不会受影响**：Scholar ID 不同的主页或作者链接，即使同名也不会被标记。

举例来说：一篇新的 arXiv 论文往往还没出现在作者的 Scholar 主页上。如果这个主页上已经有好几篇论文和同一批合作者一起写，就可以认定是同一个人。其他同名的人不受影响。

点击任意标记可以看到证据、这位作者的分数和作者位次。标错了可以点“Not this person”屏蔽，在 popup 里可以撤销。

点击工具栏图标弹出的 popup 显示**当前页面**上被标记的作者（带分数）、开关和更新状态。完整名单请看[排行榜页面](https://ironieser.github.io/banjev/)。

## 安装

1. 下载本仓库（`git clone` 或 Download ZIP）
2. 打开 `chrome://extensions`，打开右上角“开发者模式”
3. 点“加载已解压的扩展程序”，选择仓库根目录

## 开发与测试

```bash
npm install
npm test            # 单元测试：计分、匹配、Scholar 证据规则（包括一个真实主页）
npm run test:e2e    # 端到端测试：用 Puppeteer 把插件加载进 Chrome for Testing，
                    # 检查真实 arXiv 页面和 Scholar 夹具页面
npm run update-data # 重新生成 data/papers.json 和 data/authors.json
npm run build-site  # 把排行榜页面组装到 build/site/
npm run package     # 打包成 banjev.zip
npm run screenshot  # 重新生成 docs/arxiv.png（标题和作者名已模糊）
python3 scripts/make-icons.py  # 重新生成图标（需要 Pillow）
```

## 声明

标记只表示“此人在 Jev 爆火后发表过以 Jev 为题的论文”，是一个阅读过滤器，不评价具体论文的内容。

## 路线图

v0.0.1 只有基础功能。接下来计划做这些（欢迎 PR）：

- [ ] **更多热点关键词**：支持配置多波热点（关键词 + 起始日期），不再只写死一个 “Jev” 搜索，下一个爆火的模型也能用同一套流程追踪
- [ ] **更方便地提交作者和论文**：提供一个 issue 表单，把“添加这篇论文 / 这位作者 / 这个 Scholar 主页”自动转成修改 `manual.json` 的 PR
- [ ] **用 Jev 过滤**：对每篇候选论文问 Jev 一个 `Noul`（“这篇论文主要是对发布的快速响应，而不是在回答一个研究问题吗？”），用得到的概率筛选关键词命中的论文，减少误判
- [ ] **更准的作者身份识别**：有 ORCID / Semantic Scholar / DBLP 作者 ID 的就用这些 ID，自动发现 Scholar 主页，不再靠手工登记
- [ ] **支持更多网站**：Semantic Scholar、OpenReview、Hugging Face Papers、alphaXiv
- [x] **计分规则可配置**：时间衰减、位次权重和阈值都可以在 popup 里修改
- [ ] **上架 Chrome 应用商店**（以及 Firefox）

## 许可证

[Apache License 2.0](LICENSE)
