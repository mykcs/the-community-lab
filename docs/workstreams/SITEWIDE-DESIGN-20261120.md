# The Community Lab 全站排版、间距与日期标准

本文件是本站的长期交付合同。当前实施、浏览器、合并与发布证据在 [PR #407](https://github.com/mykcs/the-community-lab/pull/407) 及其 Actions 中记录。其他网站保留自己的设计值。

## 可执行规则的唯一来源

`src/styles/tokens.css` 维护字体、语义字号、字重、行高、间距和阅读宽度。`global.css` 及 Astro 页面只使用这些角色；Tailwind 的字体、字级、字重和间距工具类桥接同一来源。

两份 reviewer 保持可独立下载、通过 `file://` 打开。`npm run sync:design` 将同一 token 文件嵌入两个 HTML 的受管理区块。构建只检查同步是否完成，不静默产生未提交的第二份规则；token 或嵌入内容不同会失败。离线脚本、原始 JSON、CSP 和禁止联网的边界不因样式迁移改变。

| 角色 | 本站标准 |
| --- | --- |
| 普通字体 | Inter / 系统无衬线，中文回退 PingFang SC / Microsoft YaHei |
| 韩文字体 | Apple SD Gothic Neo / Noto Sans KR / Malgun Gothic，回退普通字体 |
| 源码与来源标识 | 系统等宽字体 |
| 字级 | meta 12px，caption 14px，body 16px，lead 18px，subheading 20px，card 24px，section 28px，title 32px；display 和响应式 hero/question 为显式独立角色 |
| 字重 | light 300、regular 400、medium 500、semibold 600、bold 700、display 800 |
| 行高 | display 1.2、heading 1.3、compact 1.5、body 1.65、reading 1.85；纯装饰符号 0.8 |
| 间距 | 4px 根单位；2 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 96 / 112 / 128px 有限尺度，负向对齐仍通过同一变量计算 |
| 宽度 | site 96rem、content 72rem、wide-reading 60rem、reading 48rem、copy 36rem、card 24rem、aside 16rem |
| 日期 | 展示为 `YYYY-MM-DD`；仅有年月用 `YYYY-MM`，仅年保持 `YYYY`；日期不经过时区转换，不补造精度。时间戳、原始审校材料、输入内容、URL 和 JSON 保持原样 |

首页及问卷保留现有深色暖红风格，reviewer 保留浅色蓝色工具界面；这两种主题共享字体、字级和布局尺度。既有三轴示意图的坐标、图形大小、触控目标尺寸、断点以及 `.full-sr-only` 的 1px 无障碍裁剪盒属于明确几何约束，不是正文间距例外。

## 页面与动态状态

默认 Pages 构建枚举全部 HTML，目前为 `/`、`/questionnaire/`、`/translation-review/`、`/original-question-translation-review/` 四个路由。新增 HTML 也自动进入归属和浏览器检查；两个 reviewer 同时检查 HTTP 与离线打开。

问卷选择、答题、证据折叠区、完成回顾与导入导出沿用既有功能和隐私验收。新排版验收再覆盖真实答题态、展开来源、reviewer 季别筛选和真实文本输入控件；不使用真实个人答卷或审校身份。

## 验收门禁

1. `npm run check`：既有题库、来源、翻译状态、隐私、部署策略与复现审计；新增样式源、离线同步、日期正反例检查。
2. `npm run build`：正式 Pages 路径构建，staging 两份离线 HTML，检查所有生成 HTML 的实际样式依赖与显示日期。
3. `npm run test:browser`：保留全部 Chromium 桌面 1440×900 与手机 440×956 功能回归；全路由标准专项另运行 Chromium/WebKit 两个引擎、两种宽度和离线页面。
4. 正式浏览器在页面实际 body、main 正文布局、reviewer 卡片上改变字体、字号、行高、间距根单位和内容宽度，确认计算样式跟随变化并恢复。只有 CSS 文件存在或公共页头正常不能代替这项证据。
5. 阻止遗漏样式、普通硬编码字号/间距、无效/倒置的日期格式。包含故意漏接页面和 `calc(18px)` / 正负混合间距的已知坏例。
6. 当前候选的所有必要检查通过，审看桌面和手机截图后合并 main；核对 Pages 发布的 `release-commit.txt` 与合并 SHA，再读真实路由。

`browser-qa.yml` 只验收并上传绑定提交的报告；`pages.yml` 继续作为唯一发布入口。Vercel 只保留既有回退用途。样式工作不提升 AI 初译、人类审校、原件许可或官方计分等价的状态。

## 本地实施证据

两份 reviewer 的嵌入源题 JSON 与执行脚本逐字保持一致，因此 CSP 脚本哈希不变。页面仍使用同一 124 题、550 选项来源。具体提交 SHA、正式 CI、截图与最终发布证据以 PR 当前记录为准。
