# 私人历史候选：默认关闭，尚未通过真实账户验收

本候选保留 Astro 静态网站，用 Supabase JS 2.118.0 的 GitHub PKCE 登录与 Postgres RLS 提供可选历史。没有创建 Supabase 项目或 GitHub OAuth App，没有启用生产采集。游客答题仍只使用页面内存；只有主动同意保存才准备最小结果。

当前代码可以在本机使用合成数据验收。真实 GitHub、Supabase 网关及服务器会话的验收未完成，不能据此打开生产保存。此工作线保持 Draft PR，真实服务配置、运营区域、服务器保留政策和双账号验收完成后再评审发布。

## 代码与数据的职责

| 职责 | 当前 owner |
| --- | --- |
| 最小结果白名单、不可变版本身份 | `lib/history-contract.mjs`；SQL 中的 append-only 版本目录受测试约束 |
| 明确同意、15 分钟同标签页交接 | `lib/history-save.mjs`、`lib/history-handoff.mjs` |
| SDK PKCE、会话存储和返回 | `lib/history-browser.mjs`、`history-auth-storage.mjs`、`history-callback.mjs` |
| 本人列表、完整分页导出、删除读回 | `lib/history-service.mjs`、`history-page.mjs` |
| 服务端账号注销及两项独立读回 | `supabase/functions/_shared/account-delete.mjs` 唯一核验核心；`supabase/functions/account-delete/` 为 Pages 所需 Edge 服务入口；`api/account-delete.js` 仅作旧 Vercel 回退入口 |
| 数据库约束、授权、RLS 与新增保存开关 | `supabase/migrations/202610290001_private_history.sql` |

`public.test_runs` 只接收季别、题库／评分／译文版本、原创示例标识、精确维度分数、同意版本与防重复请求 UUID。账号、主键与时间由数据库生成。逐题答案、任意 JSON、客户端提供的 owner/time、UPDATE 均不允许。历史不是官方成绩，也不用于真实嘉宾排名。

每个数据请求固定使用操作开始时的 Supabase 用户令牌；整个导出绑定同一会话。会话改变或刷新时丢弃在途结果并要求重试。分页保留数据库微秒时间，直到读取空页才宣告导出结束；短页不代表完成。

## 两层新增保存开关

配置字段以仓库根目录 `.env.example` 为准，不在此维护第二份可编辑清单。所有布尔开关默认 `false`，区域与期限保持空白。浏览器只接受 `sb_publishable_` key，服务端 secret 永远不能使用 `PUBLIC_` 前缀。

应用保存需要：有效且**专用于本站的精确 origin** 与 Supabase 配置、Auth 开关、保存开关、隐私批准、可用的注销流程，以及已决定的区域和服务器期限。不得把认证配置到 GitHub Pages 默认的 `*.github.io` origin：同一所有者的不同项目路径共享 origin，而 PKCE／Supabase 会话存在按 origin 隔离的 `sessionStorage` 中，其他同源项目代码在同一标签页可能读取它们。GitHub Pages 默认主机因此只能保持游客模式；只有用户选定隔离的专用域名／主机后才可讨论启用认证。数据库另外默认 `enabled=false`，客户端不能修改。只改前端开关不能开始写入。

Supabase Data API 的 `public.history_capabilities()` 仅作 `SECURITY INVOKER` 薄封装；读取受限设置的 `SECURITY DEFINER` 实现在 `community_private`。该 schema 不得加入 Exposed schemas。

关闭**新增保存**不应关闭已有账号访问：保留 Auth 和删除端点，使记录仍可查看、导出、删除与注销。不能用整体移除身份配置作为正常停采方式。

## 登录和存储

SDK 使用 `flowType=pkce`、`detectSessionInUrl=false`；保存 SDK 返回的 flowId，返回页带同一 flowId 显式交换 code 一次。只允许配置 origin 下固定的 `/auth/callback`，不接受任意返回地址，也不为 flowId 扩大 URL 白名单。返回页移除 code/error 查询信息并使用 no-referrer。成功、失败和取消时清理本站命名空间的 legacy／slot／index 校验缓存，包括遗留的孤立 slot；保留已有会话与其他网站存储。

当前标签页的 sessionStorage 保存 Supabase 会话及 PKCE 交接；GitHub provider token 在写入前被剔除，不写入 localStorage。关闭标签页清除本机内容不等于服务器退出；普通退出明确使用 SDK 的 `scope=local`。

只有勾选保存同意后，才产生不含逐题答案的待保存结果。15 分钟限制其使用期限，取消、确认保存或拒绝登录返回时清理；过期在下次读取时清理。浏览器在 GitHub 页面停留时，本站不能保证定时删除 sessionStorage，因此告知不承诺到点物理擦除。浏览器拒绝清理时不显示清理成功。

GitHub 登录目前默认涉及提供给 Supabase 的账号标识／资料／邮箱，告知不能声称“登录不处理个人信息”。不申请 `repo` 或 `read:org`。登录本身不会自动保存结果；必须有仍有效的显式保存交接。

## 删除与注销

单条删除先确认本人可见记录，删除后再读服务器，只有仍为同一有效会话且结果为空才显示成功。身份改变、服务错误或读回仍有记录时，不从列表移除该条。

GitHub Pages 不执行 `/api`。账号注销从浏览器以已登录用户 JWT 调用 Supabase `functions.invoke('account-delete')`，仅允许精确配置的网站 Origin，通过 CORS 预检后处理 POST JSON；要求单独确认和 Bearer 会话。Edge Functions 的 `verify_jwt` 明确保持 `true`，共享核心再验证调用者及活动会话，自己派生 user ID；请求不能提供目标 ID。用户数据的常规操作仍走用户 JWT，不走管理 secret。

Edge 由托管 Supabase 注入 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEYS` 和 `SUPABASE_SECRET_KEYS`，只读取映射中 `default` 键。后两个 key 映射绝不能给浏览器。服务端 `PUBLIC_HISTORY_AUTH_ENABLED`、`PUBLIC_HISTORY_SITE_ORIGIN` 和 `HISTORY_ACCOUNT_DELETE_ENABLED` 均须明确配置，删除功能默认关闭。前端 `PUBLIC_HISTORY_SITE_ORIGIN` 填纯 origin；Astro `BASE_URL` 决定固定登录回调和内部导航路径，不接受可控跳转目标。即使设置了 Pages 项目路径前缀，也不能消除 `*.github.io` 的共享 origin；该主机的登录／历史配置会 fail closed。专用自有域名或项目专属主机需另行配置并实测。备用 Vercel 函数不会因为存在于仓库而在 Pages 上运行。

服务端调用 GoTrue hard delete 后，必须同时证明 Auth 的 `404/user_not_found` 和该 owner 历史精确计数为 0。任一证据不足返回 `202/pendingVerification`，不能显示成功，也不能保证重复登录能修复已部分删除的身份。管理角色对 `test_runs` 仅有 `SELECT(id,owner_id)` 用于读回，没有分数读取或写权限。

## 已有本地证据与实际界限

`npm run check` 包括最小载荷、默认关闭配置、同意与交接、会话切换、分页、SDK 注销核心、Edge CORS 和 Pages 路由，以及 canonical SQL 的真实 PostgreSQL 执行；`npm run build` 保持静态输出。测试命令的 `--no-wasm-async-compilation` 解决本机 Node 23 的 WASM 初始化停滞，不改变产品数据库语义。Edge 适配器的 Node 测试不等于实际部署到 Supabase runtime 或真实 JWT 验收。

SQL 测试使用 PGlite 0.5.13 / PostgreSQL 18.6，实际 SET ROLE 为非超级用户、非 BYPASSRLS 的普通角色；管理读回角色单独测试。Auth users/sessions/JWT 为合成夹具，证据标记 `PG_RULES_WITH_SYNTHETIC_AUTH`。服务端测试使用真正 Supabase SDK 加受控 HTTP 返回，标记 `TRANSPORT_FIXTURE`。两者都不证明真实 Supabase 或 GitHub 已通过。

## 真实服务开放前还缺什么

1. 用户指定隔离的 Supabase 测试目标，确认免费方案、运营／数据区域、服务器保留与清理政策、隐私责任。不要把凭据写进聊天、仓库、截图或日志。
2. 依当前目标的 Postgres/Auth schema 实际验证同一 migration，确认 `auth.sessions` 和 API schema 暴露范围；`community_private` 不能加入 Data API exposed schemas。未知或已有同名对象必须先调查，不自动覆盖。
3. 控制端配置 GitHub OAuth 与精确的 Supabase、网站返回地址；读取实际权限，不要求仓库范围。服务端 secret 只由服务端消费者使用。
4. 两个真实 GitHub 测试账号仅写入虚构分数：直接 Data API 交叉读取、猜 ID、owner 冒充、拒绝写入后原记录完好；退出及注销后旧 access JWT 的读写重放均被拒绝；单条删除与账号注销取得真实服务器读回。
5. 在精确 Preview head 上通过游客／同意／取消／PKCE／导出／删除／退出／注销的 440×956 和桌面验收，检查 URL、网络、存储、日志。GitHub Pages 默认 `*.github.io` origin 必须验证认证导航和保存入口保持关闭；只有选定隔离的专用 origin 后，才在该 origin 上测试回调、历史页及跨域 `OPTIONS` 预检。随后在拟用生产目标保持采集关闭，核对权限及隐私；全部证据与独立审查通过后才讨论开放。

官方依据：[Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)、[GitHub 登录](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)、[signOut 与 JWT 生命周期](https://supabase.com/docs/reference/javascript/auth-signout)、[deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Edge Functions Auth](https://supabase.com/docs/guides/functions/auth)、[跨域调用](https://supabase.com/docs/guides/functions/cors)、[注入环境变量](https://supabase.com/docs/guides/functions/secrets)、[Vercel 根目录 api 函数](https://vercel.com/docs/functions/quickstart)。这些说明不代替目标服务的实测。
