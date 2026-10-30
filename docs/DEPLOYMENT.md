# 部署与持续集成 · 2026-10-29 起

## 2026-10-30 · GitHub Pages 正式主站（已真实验收）

- **正式首页：** https://mykcs.github.io/the-community-lab/；**独立译审草稿：** https://mykcs.github.io/the-community-lab/translation-review/；**原题复核独立静态页：** https://mykcs.github.io/the-community-lab/original-question-translation-review/。旧 `https://the-community-lab.vercel.app/` 保留作历史生产快照，不再作为最新主站。
- **当前 Pages 发布身份：** [PR #103](https://github.com/mykcs/the-community-lab/pull/103) 合并后的 Pages 发布 [run #41123232996](https://github.com/mykcs/the-community-lab/actions/runs/41123232996) 在 `main` SHA `541492aa67e1b758f8d7cb72126ada310d9acce1` 上成功，`build` 与 `deploy` 均成功。当前 `main` 已推进至 `cec7e966a76d3a93c2d3dea0686ac175821f67f6`；后续 [PR #105](https://github.com/mykcs/the-community-lab/pull/105) 只改了 CI 测试文件，精确 head 的 [标准验证 run #41124136311](https://github.com/mykcs/the-community-lab/actions/runs/41124136311) 成功，未改变已发布站点源码。
- **线上访问验收：** 本轮对首页、`/questionnaire/?season=2`、`/translation-review/` 与 `/original-question-translation-review/` 做实时 GET，四个路径均返回 HTTP 200。原题复核页为 135,936 字节，线上内容与 `541492aa67e1b758f8d7cb72126ada310d9acce1` 的源文件逐字节一致，SHA-256 为 `8f334b4c1c559399efce91da807ef1355ed7d0983131cb62cab2dba351b43c73`。该页仍标注 124 道原题为 AI 草稿，独立韩中人工复核为 `0/124`；不表示正式译文或官方评分。440×956 与 1440×900 CSS px 浏览器验收记录见 [Issue #1](https://github.com/mykcs/the-community-lab/issues/1#issuecomment-6529806750)；这是浏览器视口模拟，不是实体 iPhone 验收。
- **Vercel 回退快照：** 当前 `vercel.json` 已禁用 Git 自动部署。Vercel 项目当前读回的 Production 部署 `dpl_gdaqpNx6J19EPLDAkHdh2aMks8LA` 为 `READY`，`source=git`、branch 为 `main`，对应 SHA `efd25fa64c95ea2813e8edd55dddde1ef9763690`，alias 仍包含 `the-community-lab.vercel.app`。该 SHA 早于当前 Pages 发布；Vercel 域名保留作历史回退快照，不代表当前正式站发布身份。
- **尚未完成的产品目标：** 两季原题的正式复刻仍未验收；独立韩中人工复核为 `0/124`，官方评分与同季可比嘉宾成绩仍为 `UNKNOWN`。PR #11 的 OAuth/私人历史记录不是静态 Pages 功能，保持隔离。Pages 免费不是无限资源，约束见下文。

## 历史迁移计划快照（已被上述正式验收取代）

- **用户目标：** 将已公开的 `mykcs/the-community-lab` 轻量 Astro 静态问卷站迁到 GitHub Pages，降低 Vercel Hobby 部署额度压力；不新增付费额度。预计新网址：`https://mykcs.github.io/the-community-lab/`。
- **分工：** `main` 的源代码和标准项目检查继续由 GitHub Actions 管理；新的 `.github/workflows/pages.yml` 在静态构建通过后，将 124 题未复核的独立译审草稿复制到 `dist/translation-review/index.html`，与主问卷一起上传一个 Pages artifact，只允许 `main` 或手动触发发布。此前另一个 Pages 工作流只能继续**验证**译审草稿，不能再单独部署、覆盖同一 Pages 网址。Vercel 当前 Production 在 Pages 完整验收前保留回退能力。`astro.config.mjs` 按 `COMMUNITY_DEPLOY_TARGET=github-pages` 选择 GitHub Pages 子路径，其他构建保持 Vercel 原 URL 与根路径。
- **Pages 设置已启用（待本站合并版发布）：** 2026-10-30 使用仓库管理员已有的 GitHub CLI 会话将 Pages 的 `build_type` 设为 `workflow`，随后 `GET /repos/mykcs/the-community-lab/pages` 读回 `build_type=workflow`、网址 `https://mykcs.github.io/the-community-lab/`。之后已有独立的 124 题译审草稿工作流成功部署**到根目录**；在本次迁移前该地址并非正式问卷。普通 `GITHUB_TOKEN` 不能替代首次管理员设置。合并统一工作流后，必须检查 Pages 发布的 main SHA、首页及 `/translation-review/` 均 HTTP 可达、JS/CSS 无丢失、两季 8＋6 原创演示题均能完成。未通过前不得改 README 正式问卷入口、禁用旧站或声称切换完成。
- **范围：** 此工作流只发布 `main` 当前静态站。GitHub Pages 不执行 `api/*`、Vercel Functions 或 Node 服务器；[草稿 PR #11](https://github.com/mykcs/the-community-lab/pull/11) 的 OAuth／账户保存／注销 API 不在此迁移范围，仍要经过隐私、双账号隔离、删除读回等独立验收，且需要单独后端承载。当前网站无账号与个人答卷上传，不应为了迁移引入新的数据收集。
- **免费不等于无限：** GitHub Pages 对公共仓库免费；公共仓库标准 GitHub-hosted runner 不扣月度计费计算额度（不含 larger runner）。Pages 站点上限 1 GB、每月约 100 GB 软流量限制；默认每小时 10 次构建软限制不适用于自定义 Actions 工作流，仍可能限速。参考 [GitHub Pages 官方限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)及 [Actions 计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。

下面各节是迁移前的计划快照、先前 Vercel 和译文草稿独立部署的历史证据，保留供回退核验；**判断当前主站状态以上面正式验收为准**。

## GitHub Pages：公开译文复核草稿

首次[公开复核页](https://mykcs.github.io/the-community-lab/)由 `.github/workflows/github-pages-translation-review.yml` 从 `docs/translation-review/` 独立发布，2026-10-30 的该工作流 `push` 运行成功。为避免以后每次译文更新覆盖主问卷首页，统一工作流将它调整为[独立复核子页面](https://mykcs.github.io/the-community-lab/translation-review/)，原工作流只负责内容验证、不再发布。该目录不放入 Astro 的 `public/`，因此不会混入 Vercel 正式产品站点。页面明确标为非官方 AI 翻译草稿，124 题均未完成独立人工韩中复核；浏览器中的审校修改保存在访问者本地，不上传。用户已确认取得公开材料的非营利翻译许可，许可原件因隐私不公开，项目无法独立展示或核验原件。

## 历史验收：GitHub → Vercel 自动发布曾经通过

GitHub Pages 接管主站之前，项目曾完成 PR 预览与 main 生产的真实 Vercel Git 自动发布。项目 `the-community-lab` 当时仍属于 Vercel Hobby 团队 `wangrui92-team`，未新增第二个站点、付费升级或 OAuth 秘钥。该自动发布链路后来按当前 Pages 主站策略关闭；上表记录当前主站和最新部署证据。

| 验收 | GitHub 证据 | Vercel 证据与结论 |
| --- | --- | --- |
| PR 预览自动构建 | [PR #7](https://github.com/mykcs/the-community-lab/pull/7)，head `7a039802a3e28d8535db27337ff6a3c21ed1c20a` | [dpl_Dj8VYdDu8YBY5B6NuB8aRyknmpSd](https://vercel.com/wangrui92-team/the-community-lab/Dj8VYdDu8YBY5B6NuB8aRyknmpSd)：`READY`、`source=git`、SHA 一致 |
| 正式 CI | [GitHub Actions #40928001277](https://github.com/mykcs/the-community-lab/actions/runs/40928001277) | `success`，包含 npm ci/check/build |
| main 自动生产发布 | [合并 commit `44bf2f7`](https://github.com/mykcs/the-community-lab/commit/44bf2f7ffc377d77c4dfa6ad89347d3295679596) | [dpl_3DD17FdVKpCmLTUttyonbP1HkByT](https://vercel.com/wangrui92-team/the-community-lab/3DD17FdVKpCmLTUttyonbP1HkByT)：`READY`、`source=git`、`target=production`、SHA 一致、alias 包含 `the-community-lab.vercel.app` |
| 浏览器交互回归 | [QA 记录](QA-2026-10-29.md) | 生产域名在 Chrome 440×956 和 1440×900 CSS px 双视口：第一季 8/8、第二季 6/6，韩先中后、分别暂停恢复和结果卡、无横向溢出、JS 页面错误 0、非 GET 写入请求 0 |

此处的移动视口是**真实 Chrome 的窗口模拟**，并非实体 iPhone 18 Pro Max。后续每次部署都需核实当前 main SHA、Vercel `source=git` 和生产域名的版本身份，不把上表快照永久视作最新。

## 本轮线上身份快照（2026-10-29，文档变更前）

- 本轮复核时 main：`d3891389bb107a4418b47af5c81dccbe61178821`。
- 当时 Production：[dpl_BGR5tvXaMSRtALdkicqDQKz6vpSY](https://vercel.com/wangrui92-team/the-community-lab/BGR5tvXaMSRtALdkicqDQKz6vpSY) 为 `READY`、`source=git`、`target=production`；Vercel Git SHA 与 main 一致，alias 包含 `the-community-lab.vercel.app`。正式域名 HTTP GET 返回 200，页面标题为「同频实验室 · The Community Lab」。
- 当时 PR #11 是 Draft，候选 head `140971f0bee67c02c85d8177d9a2ad4d447c7517`，基于上述 main。其 Preview 和精确 SHA CI 状态见 [QA 验收记录](QA-2026-10-29.md)；候选没有进入 Production。
- 本轮复核当时 Production SHA 尚未完成整套浏览器回归；随后在文档 PR #22 合并后的精确 Production SHA 完成验收，见下节。

## 文档 PR #22 合并后的 Production 浏览器验收（2026-10-29）

PR #22 合并后生产版本为 main `8f719869da1c842297b9286f5a20feadd2c88340`，Vercel [dpl_9gkoNH5GQDdZaCQaofqq1RmEbgCJ](https://vercel.com/wangrui92-team/the-community-lab/9gkoNH5GQDdZaCQaofqq1RmEbgCJ) 状态 `READY`、`source=git`、`target=production`，SHA 一致且 alias 包含正式域名。对此精确版本运行 Chrome/Playwright 两季全流程：第一季 8/8、第二季 6/6，均在 440×956 和 1440×900 CSS px 完成。两季题干和选项中韩文及中文非空，结果页出现；无横向溢出、浏览器错误、失败响应或非 GET 请求，localStorage 与 sessionStorage 均为空。仅使用合成答案；这是浏览器视口模拟，不是实体 iPhone 测试，也不验证节目官方算法。

## 历史故障（已解决）

2026-10-29 早些时候首次尝试 `vercel git connect` 时，Vercel GitHub namespace `mykcs` 处于 selected-repository 受限状态，现有项目无法关联新仓库，返回访问错误。旧版本因此曾用 Vercel CLI 直接部署。后来仓库的 Vercel GitHub App 访问已恢复、原有 Vercel 项目完成 Git 连接；上表两项 `source=git` 实测结果证明自动发布已生效。历史操作、错误原文及旧版本 SHA 可从 [此前文档提交](https://github.com/mykcs/the-community-lab/blob/bebfd3f35c3011532df95815782d9f6ff81eb851/docs/DEPLOYMENT.md) 追溯，而不是当作当前阻碍。

## 版权、用户隐私与科学正确性仍有独立门槛

网页是**双季原创韩中双语演示**：第一季原站观测 87 题、第二季 37 题；本站原创题 8 和 6。后续已获得对应 87＋37 个**客户端源题标识与元数据索引**，这仍不代表可以合法复制原题、已经完成真人韩中双语审校或掌握官方评分金标准。真实嘉宾排名与社媒归属未经核验，不提供虚构榜单。

当前不要求登录、不上传答题数据、未启用数据库或 GitHub OAuth；服务器存储个人结果需先取得用户主动同意并通过 RLS、双用户交叉隔离和删除读回。仅以 Vercel Hobby 和现有工具执行，不增加付费服务。参考 [WISH](../WISH.md)、[AGENTS](../AGENTS.md)、[逐题核验门槛](VERIFICATION-MATRIX.md) 和 [翻译标准](TRANSLATION-STANDARD.md)。

## 2026-10-29 续接快照：自动连接可用，免费部署额度仍需治理

Vercel Git Deployment Context 当前仍将 `the-community-lab` 关联到 `mykcs/the-community-lab`；没有扩展 GitHub App 权限。本轮 main 为 `756faf5e10fd900a4734db09ee3c75fd3de0c27e`，Production `dpl_9ANedrsw9TyNpsD26EDp9ASE7Rbn` 是 `READY`、Git SHA 精确匹配。账户仍是 Hobby；PR #29 Preview 与此 Production 已证明 GitHub→Vercel 能工作。

在 2026-10-29 23:17 UTC 的滚动 24 小时只读列表中，团队返回 113 条部署记录（分页为 100＋13），项目自身返回 76 条（51 Preview、25 Production）。这是记录计数，不是可用额度的直接读回；Issue #30 仍有 `api-deployments-free-per-day` 失败证据且保持 OPEN。新的代码 PR 可能会触发 Preview，因此额度治理完成前不为本地候选推送或重复探测。未升级付费计划，也没有用 Ignore Build Step 绕开计数。

### 2026-10-29 23:42 UTC 额度记录刷新

- Vercel 只读列表以 `since=2026-10-28T23:42:42Z` 分页：团队共 112 条记录（103 `READY`、9 `CANCELED`），其中 `the-community-lab` 项目 76 条（均 `READY`）。项目的最新 Production 仍是 `dpl_9ANedrsw9TyNpsD26EDp9ASE7Rbn`，Git SHA `756faf5e10fd900a4734db09ee3c75fd3de0c27e`，Production 状态 `READY`。
- Vercel [官方 Limits 文档](https://vercel.com/docs/limits#deployments-per-day-hobby)目前列出 Hobby 每 86,400 秒 100 次部署，`api-deployments-free-per-day` 的 scope 标为 `owner`。列表记录数不是额度计数器读回；本窗口 112 条记录与期间成功发布同时存在，因此不能单凭此列表断言当前限额状态已恢复或一定耗尽。之前的真实拒绝仍有效，候选推送与 Preview 继续等待可核验的额度状态；未升级计划，也未使用 Ignore Build Step。

### 2026-10-30 00:22 UTC 线上与用量面板刷新

- `git fetch origin main` 后，GitHub `main` 仍为 `3e61def01e896f51806748f6444d668e5d88d74c`。Vercel 项目详情确认最新 Production `dpl_FbeHqqUC573txFgd88Df25FsA3GS` 为 `READY`、`target=production`；部署元数据的 ref 为 `main`、Git SHA 与该 head 完全一致。该部署 aliases 包含 `the-community-lab.vercel.app`，正式项目和自动 Git 连接均仍可用。
- 登录后的 Vercel Team Usage 面板在最近 24 小时（`2026-10-28 18:00` 至 `2026-10-29 18:00`，`America/Los_Angeles`）显示 **Number of Builds：Completed 114、Errored 0**；面板标注数据在读取时约 15 分钟前更新。该 build 指标不是 `api-deployments-free-per-day` 的剩余额度，也不能换算成余额。Usage 页没有展示该 owner-scope 部署额度的可用余额；此前真实限流拒绝仍未被解释或证实已恢复。
- 本地交付候选 `fix/demo-translation-precision-20261029` 的 HEAD 是 `dd15a424acd1c6d8e5012a7d300dfc51ad5b4bd3`，已包含首页社媒目录实现；目录对应的隔离源码候选 `2404a5a3b93dc0798ba7b7c889205dbe80358679` 经两名独立 Agent 逐条核查 13/13 个主页关联 PASS。候选尚未 push，未创建 Preview，也未部署。可靠余额证据出现前，不用新的 Preview 或 Production 尝试配额。

## 2026-10-30 PR #32 自动发布验收

此前出现的 `api-deployments-free-per-day` 拒绝后，PR #32 已完成一次完整自动发布：GitHub Actions 和精确 head `526b8d1eafe04bad9b2f083b049343b803b573cd` 的 Vercel Preview `dpl_8sGgRfFsop5x67HNQJJ9ge9N4VqZ` 均成功；合并后，main `078a02213f26f129bbaf8c9a48d03ce9df8e42f7` 的 Vercel Git Production `dpl_7Tx4U1ZrwWXEeAo4j298EW8XHKhc` 为 `READY`，alias 包含 `the-community-lab.vercel.app`。这证明当前 GitHub Preview 与 main Production 自动链路可用；Issue #30 已据此关闭。

此验收没有改变 Vercel Hobby 的每日限制，也没有读到该额度的剩余余额；之后的新部署仍须观察平台实际状态。没有升级付费计划或绕过限制。

## 2026-10-30 PR #35 自动发布验收

- PR #35 head `2b355d9af854c576ae54d00b33661fdf71a82103` 的 GitHub Actions run [#40997558072](https://github.com/mykcs/the-community-lab/actions/runs/40997558072) 成功；Vercel Git Preview `dpl_FpWobo8dsYvpfVmG5AfiNa5sM69h` 为 `READY`、`source=git`，SHA 与 head 精确一致。
- PR #35 已合并为 main `4a2eed51552a6894e60bcaa0dd74dd55ad61c93b`；Vercel Git Production `dpl_CBjmj7e9oxcuNHxsZqoMsnrMPqeY` 为 `READY`、`target=production`、`source=git`，SHA 与 main 一致，alias 包含 `the-community-lab.vercel.app`。正式站浏览器已确认页面可打开；本次代码仅加强嘉宾匹配输入校验，不改变页面交互。
- 此部署前 PR #35 的旧 head 曾被 Vercel `api-deployments-free-per-day` 拒绝。更新到最新 main 后的 Preview 和合并后 Production 均成功，故 Issue #30 已关闭。这个成功结果不等于读取到部署额度余额；剩余额度仍未知，未来仍需观察平台状态。未升级计划、未加收费服务、未使用 Ignore Build Step。


## 2026-10-30 PR #39 / #40 合并与精确 Production 刷新

- [PR #40](https://github.com/mykcs/the-community-lab/pull/40) 的 Vercel 分支策略仅对 `docs/**` 与 `research/**` 关闭 Git 自动部署；未列出的 `main`、`fix/**`、`feat/**`、`ops/**` 仍保持默认行为。PR #40 的 `ops/**` 验收分支有真实 Preview，但这**不验证** `docs/**` 的抑制效果。
- [PR #39](https://github.com/mykcs/the-community-lab/pull/39) 修复缺少题库／计分版本时演示结果丢失版本来源的问题。其精确 head 的 GitHub Actions run [#41001092175](https://github.com/mykcs/the-community-lab/actions/runs/41001092175) 成功，PR 已合入。
- 当前 main merge commit `4b2e3ee0926411c229c9ba1d494bf7c83cf0b80f` 的 GitHub Vercel status 为 `success`。Production deployment [dpl_CwsfwhXP8DfWeVthm5zzRCvM99Zd](https://vercel.com/wangrui92-team/the-community-lab/CwsfwhXP8DfWeVthm5zzRCvM99Zd) 为 `READY`、`source=git`、`target=production`，Git SHA 与 main 精确一致，并带正式域名 `the-community-lab.vercel.app` alias。正式域名可加载新首页和当前核验状态。
- 文档分支的真实验收：[PR #41](https://github.com/mykcs/the-community-lab/pull/41) 的 `docs/**` head `e4e2925c996529cd477dd6a146e8f5c4b8936f2c` 运行 GitHub Actions [#41008346764](https://github.com/mykcs/the-community-lab/actions/runs/41008346764) 成功（`npm ci`、`npm run check`、`npm run build`）；Vercel 按该 SHA 查询返回 0 条 deployment。该次文档分支因此通过 Actions 且没有创建 Preview；同一分支规则减少了这一次 Preview deployment。Vercel 未提供每日限额余额，无法把单次抑制换算成剩余额度或保证未来不会限流。
