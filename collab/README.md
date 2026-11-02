# 策划 ↔ 程序 协作协议

> 角色：**机枢（策划/需求方）** 发起任务并验收；**dsh（程序/实现方）** 认领实现并回写回执。
> 通道：本目录文件。两边共享 `M:\dshsave\idollife`，无需其他工具。

## 文件规则

| 文件 | 用途 |
| --- | --- |
| `collab/README.md` | 本协议，勿动内容，只可追加变更记录 |
| `collab/T-xxx-短名.md` | 一个任务一个文件，编号递增（T-001、T-002…） |

## 任务文件结构（模板）

```markdown
# T-xxx · 任务标题
- 状态：`open`（待认领）→ `doing`（dsh 实现中）→ `review`（dsh 已完成待验收）→ `done` / `blocked`
- 发起：机枢 ｜ 日期：YYYY-MM-DD
- 优先级：P0（阻塞）/ P1（本迭代）/ P2（可排后）

## 需求描述
（策划写清"要什么、为什么"，引用 docs 编号）

## 验收标准
- [ ] 可勾选的、可客观判定的条目

## 边界与禁区
（不许动什么、不许引入什么，如 core 内禁 Date.now()/Math.random()）

## 回执区（dsh 填写）
- 实现说明：
- 改动文件清单：
- 自测结果（命令 + 输出摘要）：
- 未决问题 / 需要策划再拍板的点：
```

### 变更日志（重要）

**凡是动代码，必写 `collab/CHANGES.md`**——不管任务是谁派的。策划能看到"改了什么文件"（git diff），但看不到"是谁让你改的、为什么改"；变更日志是补上这条意图链的唯一手段。未登记的改动会被策划判为「未登记改动」，验收时要求说明或回滚。

格式：`- \`YYYY-MM-DD HH:mm\` ｜ 来源：策划派单 T-00x / 用户直派 / dsh 自主 ｜ 一句话 ｜ 涉及文件`

## 规则

1. **dsh 只在 `回执区` 和任务状态行写入**，不改需求描述和验收标准；有异议写在回执区"未决问题"，不要擅自改需求。
2. **一次只认领一个 `open` 任务**，认领时把状态改为 `doing` 并补一行 `认领时间`。
3. **完成的定义**：验收标准全部满足 + `pnpm test`、`pnpm check:data` 通过 + 回执区填写完整。策划验收后置 `done`。
4. **blocked**：卡住时置 `blocked`，在回执区写清卡点，等策划答复后转回 `doing`。
5. 遵守仓库铁律：`packages/core` 禁 `Date.now()` / `Math.random()` / DOM / localStorage；文档即需求源，实现与文档冲突先改文档（docs/16 记决策）。

## MCP 桥接模式（**当前主模式**）

> dsh 桌面版暴露了一个本地 MCP 端点（`~/.dsh/mcp/dsh-mcp-endpoint.json`），策划侧可直接调用，**不再需要用户传话**，也不依赖会报 `MISSING_CREDENTIAL` 的 `dsh headless` 命令行。
> 封装：`scripts/dsh.mjs`（读端点文件取地址与令牌，令牌只在内存用，不落日志）。

```bash
node scripts/dsh.mjs run "认领并完成 collab/T-00X.md …"   # 派单（自动续用主会话）并等结果
node scripts/dsh.mjs run "…" --new                        # 强制新建会话并重新绑定（慎用）
node scripts/dsh.mjs session                              # 查看当前主会话
node scripts/dsh.mjs session set <id> | clear             # 切换 / 清空主会话
node scripts/dsh.mjs compact                              # 对主会话跑 /compact 压历史
node scripts/dsh.mjs open                                 # 让 dsh 界面打开主会话（用户可见全过程）
node scripts/dsh.mjs wait --limit 5                       # 长任务：等主会话跑完（不取消）
node scripts/dsh.mjs read --max 4000                      # 读主会话 transcript
node scripts/dsh.mjs sessions --mine                      # 列出策划名下会话
node scripts/dsh.mjs status                               # 端点健康检查
node scripts/dsh.mjs permission                           # 查看派单使用的权限预设
node scripts/dsh.mjs permission set danger-full-access    # 设为完全权限（不再反复弹审批）
```

**一条常驻会话（重要）**：所有派单都续在同一条 dsh 会话里（`dsh_continue_session`），会话 id 存 `collab/.dsh-session`（已 gitignore，属本机状态）。这样 dsh 一次建立项目认知、长期复用，**不重复学习**；新任务不会另起会话。会话过长时用 `compact` 压历史。

要点：
- 主会话归 `workbuddy-design-planner` 名下（`x-dsh-mcp-client` 头），`sessions --mine` 可查
- **权限预设必须落盘、每次派单显式带上**：`dsh_continue_session` / `dsh_run_prompt` 的 `permissionPreset` 会**覆盖**用户在 GUI 里设的值——不带就回落默认，表现为「界面里设了完全权限，一会儿又变回工作区」。现值存在 `collab/.dsh-permission`（已 gitignore），用 `permission set` 改。
- 当前值：`danger-full-access`（用户 2026-11-02 明确要求，避免每步操作都要人工点同意）。**代价**：dsh 不再受沙箱约束，可写项目外路径、可执行任意命令。因此下列硬边界从「靠机制拦」变成「靠约定守」，验收时必须逐条核：
  1. 不执行 `git commit` / `push` / `reset --hard`；
  2. 不动 `content/all.xlsx`（策划独占，配置表是唯一内容源）；
  3. 不改 `M://dshsave//idollife` 之外的文件；
  4. 不删文件（需要清理时先移入 `content/_archive/`，删除由策划执行）；
  5. 动代码必须在 `collab/CHANGES.md` 顶部登记。
- **界面可见性已解决**：`dsh.mjs open` 会让 dsh GUI 侧边栏打开并选中该会话
- 审批已不再需要人工点：`danger-full-access` 下 shell/写文件不再请求授权（2026-11-02 实测：执行 `node -e` 探针，无审批记录产生）。若将来降回 `workspace-write`，审批仍会逐次请求，可用 `dsh_list_requests` + `dsh_answer_request` 由策划代为放行。

## 手动派单模式（备选）

端点不可用（dsh 桌面版没开、令牌失效）时回退：用户在 dsh 界面说「认领并完成 `collab/T-00x.md`」。本目录始终是**唯一任务源**，需求细节一律以文件为准，不靠口述。

**用户派单时贴这段**（把 T-00X 换成实际任务号）：

```
你是 idollife 的程序负责人 dsh。长期协作约定：
1) 任务源唯一，需求只认 collab/T-00X.md，细节以文件为准；有疑问写回执区未决问题，不擅改需求与验收标准。
2) 完成后状态改 review、回执区四项填全（实现说明/改动文件清单/自测结果/未决问题）。这是策划验收的唯一依据。
3) 一次只做一个任务，不顺手修范围外的东西。
4) 不执行 git commit，由策划验收后统一提交。
5) 既有测试断言与本任务语义冲突时，不得静默修改，列入回执区未决问题。
6) 沙箱跑不了 vitest 可用等价方式并注明；以策划复跑 pnpm test + pnpm check:data + 三包 tsc --noEmit 为准。
7) packages/core 禁 Date.now() / Math.random() / DOM / localStorage。
8) 动代码必须在 collab/CHANGES.md 顶部追加一行变更记录。
现在：认领并完成 M:\dshsave\idollife\collab\T-00X.md。
```

对 dsh 的硬性约定（用户派单时请一并贴给 dsh）：

1. **任务源唯一**：需求只认 `collab/T-xxx-*.md`，与文件冲突时以文件为准，有疑问写进回执区未决问题，不擅改需求与验收标准。
2. **回执必写**：完成后状态改 `review`，回执区四项填全（实现说明 / 改动文件清单 / 自测结果命令+输出摘要 / 未决问题）。**这是策划验收的唯一依据**。
3. **一次一任务**：不并行、不顺手修别的任务范围外的问题。
4. **不 commit**：由策划验收后统一提交，commit 信息带任务号。
5. **改语义先问**：若实现中发现设计语义需要改（含既有测试断言冲突），列入回执区未决问题，**不得静默修改断言或需求**。
6. **测试口径**：dsh 沙箱通常无法启动 vitest（`spawn EPERM`），可用等价方式跑并在回执注明；最终以策划在普通终端 `pnpm test` + `pnpm check:data` + 三包 `tsc --noEmit` 为准。
7. **遵守 core 铁律**：`packages/core` 禁 `Date.now()` / `Math.random()` / DOM / localStorage。

策划侧感知方式：每轮开工运行 `node scripts/collab-status.mjs`（任务状态 + git 改动 + 最近提交），再独立复跑测试。走 MCP 桥接时策划同步拿到结果，无需用户提醒；走手动模式时**策划不会自动收到通知**——dsh 完成后请用户说一句「验收 T-00x」。

## 变更记录

| 日期 | 说明 |
| --- | --- |
| 2026-11-02 | 建立协议，T-001 起用 |
| 2026-11-02 | 主模式改为 MCP 桥接（`scripts/dsh.mjs`），手动派单降为备选 |
