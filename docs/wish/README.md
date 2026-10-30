# 项目 Wish 路由

本仓库的现行、唯一可修改产品愿望所有者是根目录 **[WISH.md](../../WISH.md)**；其中开头的「北极星」明确要求：韩文题目和选项须有信达雅的中文译文，且同季、同版本、同一份实际答卷必须得到与官网逐字段一致的结果。不要在本目录维护另一份 `LATEST.md`，避免双份愿望漂移。

只按任务需要继续读取：

- **为什么做、先做什么、什么不算完成**：[WISH.md](../../WISH.md)。
- **官方题目、路径、结果是否已等价**：[题库与结果核验矩阵](../VERIFICATION-MATRIX.md)；对应可执行证据 `npm run audit:reproduction`，不能把演示版 PASS 当成官网等价 PASS。
- **韩文原文、中文译文、选项语义及审校**：[翻译与题库标准](../TRANSLATION-STANDARD.md)。
- **来源和版权、现有组件与实际实现**：[来源调查](../REUSE-RESEARCH.md)、[架构](../ARCHITECTURE.md)、[AGENTS.md](../../AGENTS.md)。

共享 Wish 生命周期和目录角色由 [mykcs/.agents Wish Protocol](https://github.com/mykcs/.agents/blob/main/docs/agents/WISH_PROTOCOL.md) 维护。这个轻量路由遵循该协议允许既有项目根 `WISH.md` 在迁移期间继续成为语义所有者的方式；不另建空白 `LATEST`、`DESIGN` 或 `ARCHIVE` 文件。当前不存在已完成的愿望迭代可以归档。
