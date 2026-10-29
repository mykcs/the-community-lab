# 部署与持续集成 · 2026-10-29

## 当前结论：GitHub → Vercel 自动发布已验收

**现有项目已接通 GitHub，完成了从 PR 预览到 main 生产的两次真实自动发布。** 项目 `the-community-lab` 仍属于原来的 Vercel Hobby 团队 `wangrui92-team`，未新增第二个站点、付费升级或 OAuth 秘钥。团队 Git 连接信息可读回 `mykcs/the-community-lab`。

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

## 最新候选复核（2026-10-29）

[Draft PR #11](https://github.com/mykcs/the-community-lab/pull/11) 当前 head `96b60818beb449e70b2053a7d61d9f4216b29b38` 获得精确 SHA 的 GitHub Actions [run #40938619367](https://github.com/mykcs/the-community-lab/actions/runs/40938619367) `success` 和 Vercel Preview [dpl_GRLLydBMJL6Nfmp68DxR4ZhDerTV](https://vercel.com/wangrui92-team/the-community-lab/GRLLydBMJL6Nfmp68DxR4ZhDerTV) `READY`（`source=git`）。现有 Production alias 仍指向最新 `main=95f2732c65052a62014704841188a46ff7762353` 的 READY 生产部署。该 PR 未合并，因此候选功能尚未影响 Production。
