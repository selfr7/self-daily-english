# Self Daily English

> A small spaced-repetition app for Chinese speakers practising spoken English with an AI.
> After each speaking session, your AI writes a "practice sheet"; paste it in and review the
> words, phrases and sentences as cards and typing drills. Runs as a Claude artifact or as a
> local Next.js app with SQLite. UI in English, explanations in Chinese.

每天和 AI 练英语口语，练完让 AI 按固定格式出一份「练习单」，粘贴进来，就会变成卡片：

- **复习**：词汇、词组、固定搭配，正面中文、背面英文，左右滑动评价，用 FSRS 安排下次复习。
- **练习**：句子按由短到长的步骤逐词输入，带句子成分和词性的颜色标注。
- **统计**：练习天数、连续天数、日历；可以导出 / 导入 JSON 备份，复习进度一起带走。

有两种用法，数据格式相同，可以互相导入导出：

| | Claude Artifact 版 | 本地版 |
| --- | --- | --- |
| 在哪运行 | claude.ai（电脑、手机都行） | 自己电脑的浏览器 |
| 数据存在哪 | 你自己 artifact 的数据库（只有你能读写） | `data/english.db` |
| 需要 | claude.ai 账号 | Node.js 22.13 以上 |

## 第一步：让 AI 按固定格式出练习单

练习单格式的说明（提示词）写在 [`shared/practice-sheet.js`](shared/practice-sheet.js) 的 `SHEET_PROMPT` 里，Artifact 页面的 **Stats → Import & export → Practice sheet format** 也有，点 **Copy format** 就能复制。

把它发给你用来练口语的 AI，或者放进它的自定义指令。之后每次练完说「总结」，AI 会回一个代码块，大致像这样：

```
#练习单 v1
日期: 2026-11-06
主题: 周末野餐

【词汇】
picnic | 野餐

【词组】
get out of the rain | 躲雨

【句子】
We ran to a coffee shop to get out of the rain. | 我们跑进咖啡店躲雨。
= 主:We | 谓:ran | 状:to a coffee shop | 状:to get out of the rain
> a coffee shop | 一家咖啡店

【纠错】
We run to a coffee shop for hide. => We ran to a coffee shop to get out of the rain.
```

复制这个代码块，在应用里选 **Import** 粘贴即可。同一天同一主题再导入只会追加新卡片，已有的复习进度不变。完整格式见 [IMPORT_PLAN.md](IMPORT_PLAN.md)。

## 用法一：Claude Artifact 版

1. 下载本仓库的 [`artifact/daily-english.html`](artifact/daily-english.html)。
2. 在 claude.ai（或 Claude Code / 桌面版）里把文件交给 Claude，发这句话：

   > 请把这个 HTML 文件原样发布成我自己的 artifact，开启 `db` 能力（只有我能读写）和 `downloads` 能力，不要修改页面内容。

3. 打开 Claude 给你的链接，登录状态下就能用。这个 artifact 和里面的数据都属于你自己，默认是私有的。

页面通过 `window.claude.use('db')` 读写数据：`lessons/<id>` 存每次练习的记录，`cards/<id>~<序号>` 存每张卡片和复习进度。`downloads` 用来导出 JSON 备份。

### 修改页面

- `artifact/daily-english.src.html` 是源文件，改这里。
- `artifact/daily-english.html` 是生成出来的、实际发布的文件。运行下面这条命令，会把 `shared/practice-sheet.js`（练习单解析，和本地版共用）内联进去：

  ```bash
  node scripts/build-artifact.mjs
  ```

改完重新构建，再让 Claude 把新文件发布到原来的 artifact 链接上（更新，不是新建），数据不会丢。

## 用法二：本地版（Next.js + SQLite）

```bash
npm install
```

```bash
npm run dev
```

然后打开 http://localhost:3000 。也可以 `npm run build` 后用 `npm run start` 运行正式版本。

- 数据在 `data/english.db`，第一次导入时自动创建，已在 `.gitignore` 里，不会被提交。备份就是复制这个文件。
- 想换位置：启动前设置环境变量 `DATA_DIR`。
- 用的是 Node 自带的 `node:sqlite`，不需要额外装数据库。不需要登录，也不联网（只接受同源请求）。

本地版「导入」除了练习单，还能认：

- 本应用或 Artifact 版导出的 JSON（连复习进度一起恢复）；
- 带 `cards` 的 JSON、只有卡片的数组（`[{"zh":"拿铁","en":"Latte"}]`，也认 `front/back`、`question/answer`）、JSONL；
- 纯文本，每行一张卡：Tab、竖线 `|`、逗号、箭头 `->` 隔开都行，CSV 和 Anki 导出也行。用 `日期: 2026-11-04`、`主题: 咖啡` 或 `# 标题` 另起一组。

已存在的记录不会被覆盖，所以重复导入是安全的。

## 开发

```bash
npm test
```

| 内容 | 位置 |
| --- | --- |
| 练习单解析与提示词（两边共用） | `shared/practice-sheet.js` |
| Artifact 页面 | `artifact/daily-english.src.html` |
| 本地版页面与接口 | `app/`、`lib/db.ts` |
| 复习调度（FSRS） | `app/review-scheduler.ts` |
| 测试 | `scripts/test-*.mjs` |

## 许可证

[MIT](LICENSE)
