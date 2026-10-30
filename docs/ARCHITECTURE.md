# 网站、登录、结果保存与费用设计

状态：**静态演示网站已发布；下面的账号、数据库与费用方案仍是候选，尚未开通。** 调查日期：2026-10-29。

## 推荐最小方案

| 职责 | 组件 | 原因 |
| --- | --- | --- |
| 网站 | Astro 7 + Tailwind CSS 4 静态构建 → GitHub Pages（已上线）；Vercel 旧生产快照作回退 | 无账号问卷由浏览器直接运行。Pages 不提供服务端 API；未来需要私有数据 API 时先复用成熟认证及独立受控后端，不为了登录重写前端 |
| 登录 | Supabase Auth 的 GitHub OAuth | 不自己处理 OAuth 回调、会话等高风险细节 |
| 私有记录 | Supabase Postgres + Row Level Security（RLS） | 每条结果与身份绑定，数据库阻止访问别人的行 |
| 无账号体验 | 浏览器会话／本地临时状态 | 朋友不必为做一套娱乐测试注册 GitHub |
| 可选结果分享 | 用户主动生成的去身份化卡片 | 默认不包含用户名、逐题答案、账号 ID |
| 嘉宾匹配 | 同季公开嘉宾成绩数据 + 浏览器本地计算 | 不必把访客结果上传至服务器即可计算最相近嘉宾 |
| 嘉宾社媒目录 | 经过人工核实的公开账号及来源记录 | 网站展示资料来源和核查日期，不需要读取用户的社媒账户 |

题库采用版本化双语数据：`source_text_ko` 与 `translation_zh_cn` 是不同字段，韩文优先展示，逐题附 `origin`（官方原题／本站原创演示）、`source_url`、`rights_status`、`review_status` 和 `translation_version`。本地演示题不得声称官方测量等价；完整规则见 [翻译与题库标准](TRANSLATION-STANDARD.md)。

GitHub OAuth 只负责回答“用户是谁”，**不会自动存储测试答案**；持续保存需要自己的数据库。认证并不要求用户授权我们读取或修改其 GitHub 仓库。

## 初期费用（美元）

| 项目 | 小型非商业项目 | 可能开始产生费用的条件 |
| --- | --- | --- |
| GitHub 公共仓库与 OAuth App 注册 | $0 | 通常没有“每次 GitHub 登录收费” |
| GitHub Pages + 公共标准 GitHub Actions runner | $0（适用范围及限制内） | Pages 站点最多 1 GB、流量约 100 GB/月软限制；公共标准 runner 免费但大 runner、产物存储等另有计费规则 |
| Vercel Hobby | $0/月（额度内，仅限个人／非商业使用） | 商业化、使用限制或需要 Pro 功能 |
| Supabase Free（认证与数据库） | $0/月：50,000 月活用户、500 MB 数据库、5 GB 流量额度 | 超额／需要稳定在线；Pro 从 $25/月起 |
| 可选独立域名 | 可暂时 $0，使用提供商免费子域名 | 购买并每年续费自定义域名 |

**预期初始账单为 $0/月，不保证无限流量或持续免费。** Supabase 免费项目若一周缺乏足够活动可能暂停；需要长期可靠公开服务时应评估合适方案，不得未经批准自行升级。Vercel Hobby 同样受非商业使用条款和额度约束。GitHub Pages 的公开静态托管不等于免费提供数据库、动态 API 或无限 Actions artifact 存储。

官方参考：[GitHub Pages 限额](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)、[GitHub Actions 计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[GitHub OAuth App 注册](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)、[Supabase GitHub 登录](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)、[Supabase 价格](https://supabase.com/pricing)、[Supabase 免费项目暂停](https://supabase.com/docs/guides/platform/free-project-pausing)、[Vercel Hobby](https://vercel.com/docs/plans/hobby)。实际开通时重新检查实时价格。

## 数据流与用户决定权

1. 访客在浏览器答题，临时答案先留在本地，不向数据库发送。
2. 结束后显示中文结果和同季最相近的 3–5 位嘉宾；相似度在浏览器本地计算，不上传个人分数。每张嘉宾卡可打开经证实的公开社交主页。
3. 用户可直接离开、下载本地结果，或点击「保存到我的账号」。
4. 保存时弹出易懂的隐私告知并要求**单独、主动同意**；尚未登录则可选择 GitHub 登录。
5. 只写入其账号的测试版本、归一化结果、时间戳等最小必要字段。原始逐题答案默认不上传。
6. 用户可以回看／删除；取消保存同意时有明确的数据删除路径，不能只在前端隐藏。

## 数据模型与服务端限制

建议 `test_runs(id, owner_id, season, question_version, scoring_version, result_json, created_at)`；原始答案如未来确需保存，必须单独设置 `consent_version` 和明确用途。所有记录默认私有，禁止公开查询个人测试结果。

嘉宾目录与私人用户表分开维护：`guest_profiles`（公开节目昵称、季别）、`guest_results`（可核实的公开数值和版本、证据来源）、`guest_social_accounts`（平台、公开链接、本人归属证据、最后核验时间、活动核验时间）。不储存嘉宾私人联系方式。初期可用代码内版本化静态数据而非另开一套可写数据库。

具体匹配算法、资料核验和「最活跃平台」判定见 [docs/GUEST-MATCHING.md](GUEST-MATCHING.md)。

必须实施并实测：

- `owner_id = auth.uid()` 的 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 行级策略；禁止匿名绕过。
- 后端验证用户会话、参数、测试版本；绝不把数据库 service role key 发到浏览器。
- 双账号隔离测试、退出后不可访问、删除后服务端确认、URL 不泄露结果。
- 登录仅申请必要范围；不要申请 `repo` 或 `read:org` 等与测试无关权限。
- 错误日志不得记录答题内容、政治观点、GitHub OAuth code 或 access token。
- 公开展示的统计若将来需要，先另行取得同意、设计最低人数阈值和去识别措施。

## 敏感信息与合规提示

政治／性别／价值观题目可能推断私人政治观点。欧盟委员会将揭示政治观点的数据列为 GDPR 特殊类别，可能需要额外合法依据与明确同意；其他地区也可能适用隐私法规。上线真实账户保存功能前，应确定运营地域、发布隐私政策、保存期限、删除机制并按适用法律审查。参见 [欧盟委员会：个人数据与特殊类别](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en)。

这是一份工程方案，不构成法律意见，也不授权开始收集真实个人信息。

当前 Astro + Tailwind 双季静态演示版已在 [GitHub Pages](https://mykcs.github.io/the-community-lab/) 发布。2026-10-30 [PR #50](https://github.com/mykcs/the-community-lab/pull/50) 合并后，对提交 `7cbb659c5d16c6002767ee32a0bd062d516badbf` 的 [Actions 运行](https://github.com/mykcs/the-community-lab/actions/runs/41028239651) 已核对 `build`、`deploy` 均成功，正式首页、译审子页、JS/CSS 均 HTTP 200；浏览器走通了第二季 6 题、第一季 8 题、暂停续答和结果卡，440×956 CSS px 手机模拟视口没有横向溢出（并非实体手机）。

原 [Vercel](https://the-community-lab.vercel.app/) 生产版通过精确 SHA 的 Git 自动部署发布过，现只保留为历史回退快照，`vercel.json` 已关闭后续自动 Git 部署，避免再次触发 Hobby 限额；之前的部署历史与 CI 证据见 [部署记录](DEPLOYMENT.md)。GitHub Pages 仍只有浏览器本地计算，尚无 OAuth、数据库或真实用户答卷保存。服务器功能需要未来单独设计、授权和验证；不得创建宽权限 GitHub Token 来绕过现有边界。
