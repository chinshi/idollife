# 变更日志

> **任何来源**的任务（策划派单 / 用户在 dsh 界面直接下指令 / dsh 自主修复）只要动了代码、配置表或文档，都必须在这里追加一行。
> 这是策划感知「非本人派单改动」的唯一手段。格式一行一条，倒序追加（新的在最上面）。

## 格式

```
- `YYYY-MM-DD HH:mm` ｜ 来源：`策划派单 T-00x` / `用户直派` / `dsh 自主` ｜ 一句话做了什么 ｜ 涉及文件（逗号分隔）
```

## 记录

- `2026-11-02 20:08` ｜ 来源：策划派单 T-014 ｜ 属性面板改版：删掉 `HIDDEN_CATEGORIES` 硬编码打码，改读 `hidden`/`linked`（`linked=0` 整组隐藏、`linked=2`/`hidden` 只加灰色小标）、分组顺序显式写死、成长/状态/性格/负向/三轴加百分比条、样貌只显示 `appearanceLabel` 文案（新增 core 导出 + 5 条测试）、底部实际属性改中文；新增纯 SVG 六轴粉丝雷达图 `FanRadar`（0 粉丝空态、max 归一化）；资源千分位 ｜ `packages/core/src/attributes.ts`、`packages/core/tests/attributes-appearance.test.ts`、`packages/client/src/components/{StatsPanel,FanRadar}.tsx`、`packages/client/src/styles.css`、`collab/T-014-属性面板改版.md`

- `2026-11-02 19:55` ｜ 来源：策划派单 T-013 ｜ 线上三 bug：① App 时钟锚点改 `let` + 空档 heal 后重设锚点 + `stuckRef` 连续 3 tick 丢弃卡死行程 + TimeAxis「结算中…」；② `doAccept`/`doReward` 补 `pushWholeState`，`/v1/sync` 改为客户端不落后时以客户端为准（不再 settle）；③ `describeCondition` 支持表达式 DSL→中文（变量/比较/逻辑/`hasFlag` 查事件标题/`sum`），新增 `describe-condition` 6 条测试 ｜ `packages/client/src/{App.tsx,components/TimeAxis.tsx}`、`packages/server/src/app.ts`、`packages/core/src/tasks.ts`、`packages/core/tests/describe-condition.test.ts`、`collab/T-013-线上三个BUG修复.md`

- `2026-11-02 16:36` ｜ 来源：用户直派 + 策划派单 T-012 ｜ 部署上线：四项前置检查（`pnpm test` / `pnpm build` / `pnpm install --frozen-lockfile` / `server build:vercel`）全过，工作区改动分两个 commit 提交（1 仓库卫生 + 1 本轮全部功能），随后 `push origin main` 触发 Vercel 自动构建 ｜ `.gitignore`、`packages/**`、`content/**`、`scripts/**`、`docs/**`、`README.md`、`pnpm-lock.yaml`、`collab/**`

- `2026-11-02 16:31` ｜ 来源：策划派单 T-011 ｜ 失败可见化：`expired` 当天由 `hidden` 改为可见不可操作（「已错过 / 明日起重新可领」，中性灰 `.missed`）；`expireTasks()` 加同日幂等守卫（防每行动刷一条超时日志）+ `expiredCount` 累计计数与 `expiredTimes()`；顺带修 T-007「上次领取的 expiredDay 污染本次判定、第二次起永不判超时」的真 bug（守卫改 `expired >= gameDay(acceptedAt)`）；面板三处文案统一「已错过」、分区标题带「今日 N 单」、`.task-req` 显示「错过 N 次」 ｜ `packages/core/src/tasks.ts`、`packages/client/src/components/TaskPanel.tsx`、`packages/client/src/styles.css`、`packages/core/tests/tasks-expire-visible.test.ts`（新增 7 条）、`packages/core/tests/tasks-s04.test.ts`（A3 语义变更）、`docs/25-模块命名与任务系统.md`、`collab/T-011-失败可见化.md`

- `2026-11-02 16:30` ｜ 来源：策划派单 T-011 ｜ 失败可见化：过期当天由 `hidden` 改为 `expired`（可见但不可操作）、`expireTasks()` 加同日幂等守卫、新增 `expiredCount` / `expiredTimes()`、面板「已错过」文案 + 「明日起重新可领」+ 「错过 N 次」+ 分区「今日 N 单」；既有 `tasks-s04` A3 断言随语义更新（hidden → expired） ｜ `packages/core/src/tasks.ts`、`packages/client/src/components/TaskPanel.tsx`、`packages/client/src/styles.css`、`packages/core/tests/{tasks-expire-visible,tasks-s04}.test.ts`、`collab/T-011-失败可见化.md`

- `2026-11-02 15:23` ｜ 来源：策划（机枢，验收 T-010）｜ 补写时限的界面规格：`docs/25 §2.4` 新增「时限的展示」四档文案与口径（领取前「时限 N 天」/ active 倒计时 / 到点同刻「期限已到」/ expired「已超时」，completable 不催）；§3 相关代码表更正为真实文件与函数名；§4 待办勾掉倒计时并登记「真正的限时通告任务」缺口。T-010 置 `done` 并写验收记录 ｜ `docs/25-模块命名与任务系统.md`、`collab/T-010-任务倒计时UI.md`

- `2026-11-02 15:40` ｜ 来源：策划（机枢，内容侧）｜ 首批任务时限数值 v1：15 条任务填 `deadlineDays`（1/3/5/7 天），3 条 repeat 显式填 `reset=daily`，9 条剧情旗标与长线攒钱任务保持无限期；重新导入后 `tasks.json` 仅 15 条任务的 deadline/reset 变化，其余字段零改动 ｜ `content/all.xlsx`（tasks 表 15/16 列）、`packages/core/data/tasks.json`（导入产物）、`docs/25-模块命名与任务系统.md`

- `2026-11-02 15:17` ｜ 来源：策划派单 T-010 ｜ 任务倒计时 UI：core 新增 `TaskDeadline` / `taskDeadline()`（唯一真源，`remainingSlots` 向上取整、`due` 用 `>=` 不动 `pastDeadline` 的 `>`）、`content.ts` 补导出 `ACTION_MS`；TaskPanel 在 active/expired 行显示四档文案 + `title` 复用 `dayLabel`；新增 8 条测试 ｜ `packages/core/src/{content,tasks}.ts`、`packages/client/src/components/TaskPanel.tsx`、`packages/client/src/styles.css`、`packages/core/tests/tasks-deadline.test.ts`、`collab/T-010-任务倒计时UI.md`

- `2026-11-02 15:19` ｜ 来源：策划派单 T-010（R2 修订）｜ 倒计时文案改按 status 分叉（expired→已超时、active+due→期限已到，删掉 0 行动死分支）；`.task-req` 新增领取前「时限 N 天」静态项（无限期不渲染） ｜ `packages/client/src/components/TaskPanel.tsx`、`collab/T-010-任务倒计时UI.md`

- `2026-11-02 15:22` ｜ 来源：策划派单 T-009 ｜ 任务时限单位由「游戏小时」改为「游戏日」：`deadlineHours` → `deadlineDays`、判定改 `deadlineDays * DAY_MS`；表头只认「时限(天)」/「时限（天）」/`deadlineDays`，旧「时限(小时)」不识别；A1～A4 按天重写，导入后 tasks.json 与改前逐字节一致 ｜ `packages/core/src/{tasks,settle}.ts`、`packages/core/src/task-headers.{js,d.ts}`、`scripts/content-import.mjs`、`packages/core/tests/tasks-s04.test.ts`、`collab/T-009-时限单位改为游戏日.md`

- `2026-11-02 15:06` ｜ 来源：策划派单 T-008（裁定落实）｜ 任务进度 `target <= 0`（如 `vocal >= 0`）改为返回 null、降级纯文字，补 P8 测试 ｜ `packages/core/src/task-progress.ts`、`packages/core/tests/task-progress.test.ts`、`collab/T-008-S04收尾-任务进度条.md`

- `2026-11-02 15:02` ｜ 来源：策划派单 T-008 ｜ S04 收尾 D：任务进度条——`expr.ts` 抽出 `buildExprData()`（编译求值共用，行为零变化），新增 `task-progress.ts`（只认 `变量 >= 数字` / `变量 > 数字`，复合降级 null），TaskPanel 显示 `label current/target` + 进度条（超 100% 截断、已完成不显示），新增 P1～P7 测试 ｜ `packages/core/src/{expr.ts,expr-rules.js,task-progress.ts,index.ts}`、`packages/client/src/components/TaskPanel.tsx`、`packages/client/src/styles.css`、`packages/core/tests/task-progress.test.ts`、`collab/T-008-S04收尾-任务进度条.md`

- `2026-11-02 14:56` ｜ 来源：策划派单 T-007（列名兼容补充）｜ tasks 可选列表头映射抽成 `task-headers.js`：中英都认、全半角括号都认、trim + 忽略大小写，导入脚本与测试共用；补一条表头映射单元测试 ｜ `packages/core/src/task-headers.{js,d.ts}`、`scripts/content-import.mjs`、`packages/core/tests/tasks-s04.test.ts`、`collab/T-007-S04收尾-过期重置任务链.md`

- `2026-11-02 14:51` ｜ 来源：策划派单 T-007（补充约定）｜ tasks 三个新列改为**中文表头按名定位**（`时限(小时)` / `重置周期` / `前置任务`，trim 空白、半角括号，英文表头兜底），并用临时工作簿验证中文表头导入；导入产物仍逐字节不变；B3 断言改为只测行为 ｜ `scripts/content-import.mjs`、`packages/core/tests/tasks-s04.test.ts`、`collab/T-007-S04收尾-过期重置任务链.md`

- `2026-11-02 14:42` ｜ 来源：策划派单 T-007 ｜ S04 收尾 A/B/C：任务过期（`expired` + `expiredDay` 冷却，不消耗 times）+ 重置周期 `reset`（缺省保持 D-011 旧行为）+ 任务链 `prerequisite`（hidden + check:data 环检测报路径），三个字段按表头导入、缺列时导入产物逐字节不变 ｜ `scripts/{content-import,validate-data}.mjs`、`packages/core/src/{tasks,settle}.ts`、`packages/core/src/task-prerequisite.{js,d.ts}`、`packages/core/tests/tasks-s04.test.ts`、`packages/client/src/components/TaskPanel.tsx`、`collab/T-007-S04收尾-过期重置任务链.md`

- `2026-11-02 14:25` ｜ 来源：策划派单 T-006 ｜ mood/satiety 接入表达式变量域（裸名可写 + 心情/饱腹中文别名），白名单改在 `expr-rules.js` 同源生效（校验器未改一行）、取值沿用 `toData` 的 `?? 70`，新增 mood-expr 5 条测试 ｜ `packages/core/src/{expr-rules.js,expr.ts}`、`packages/core/tests/mood-expr.test.ts`、`docs/26-条件表达式.md`、`collab/T-006-mood-satiety接入表达式.md`

- `2026-11-02 14:16` ｜ 来源：策划派单 T-005 ｜ requires 表达式导入期静态校验（规则与 `expr.ts` 共用 `expr-rules.js`，报错带 sheet/行号/`eventId/choiceId`/原表达式/拼写建议）+ 编译期兜底测试 + 导入侧记录物理行号 ｜ `packages/core/src/{expr.ts,expr-rules.js,expr-rules.d.ts,data.ts}`、`scripts/{validate-data,content-import}.mjs`、`packages/core/tests/requires-compile.test.ts`、`packages/core/data/events.json`、`docs/27-配置表协作指南.md`、`collab/T-005-requires表达式静态校验.md`

- `2026-11-02 14:10` ｜ 来源：策划派单 T-004 ｜ 表格修正 firm 的 requires 后重新导入，core 68/68 全绿，任务转 review ｜ `packages/core/data/events.json`、`collab/T-004-断言去硬编码与选项解锁条件.md`

- `2026-11-02 14:05` ｜ 来源：策划派单 T-004 ｜ 三条测试断言去硬编码（区间/配置派生）、choices.requires 按表头定位导入 + 裸字段别名、缺列容错 ｜ `packages/core/src/expr.ts`、`scripts/content-import.mjs`、`packages/core/tests/{mood,settle,extra}.test.ts`、`packages/core/data/events.json`

- `2026-11-02 12:52` ｜ 来源：策划派单 T-003 ｜ 导入链路切换为单一工作簿 content/all.xlsx（15 sheet 全量导入，choices 并入 events.json，旧分表归档 _archive，模板脚本停用，staminaMax 缺省 100 抽出并补测试） ｜ `scripts/content-import.mjs`、`scripts/content-template.mjs`、`packages/core/src/content.ts`、`packages/core/tests/stamina-fallback.test.ts`、`packages/core/data/*.json`、`content/_archive/`

- `2026-11-02 12:30` ｜ 来源：用户直派 ｜ 新增配置表说明文档（项目说明 + 13 表逐列说明 + 条件表达式 + 校验） ｜ `docs/27-配置表协作指南.md`、`README.md`
- `2026-11-02 12:10` ｜ 来源：用户直派 ｜ 属性八层全部接入玩法：固有属性参与粉丝判定、熟练度乘区、负向惩罚、性格解锁选项、心情/饱腹效率、体力上限外显 ｜ `packages/core/src/{settle,results,events,expr,attributes,types,content,data}.ts`、`packages/core/data/{attributes,balance,action_results,events}.json`、`packages/client/src/{App.tsx,components/StatsPanel.tsx,components/SidePanel.tsx,components/Modals.tsx,state/save.ts,styles.css}`
- `2026-11-01 21:00` ｜ 来源：用户直派 ｜ 条件系统改为 filtrex 表达式（Godot/SQL 风格），旧 JSON 条件保留兼容；配置表条件列全部改写 ｜ `packages/core/src/expr.ts`、`packages/core/src/{events,tasks,data,content}.ts`、`scripts/{content-template,content-import}.mjs`、`docs/26-条件表达式.md`
- `2026-11-01 20:00` ｜ 来源：用户直派 ｜ 前端 App.tsx 按模块拆分到 components/（时间轴/日志/任务/朋友圈/组合/属性/背包/商店/占卜/右栏/弹窗），AppApi 集中类型 ｜ `packages/client/src/App.tsx`、`packages/client/src/components/*`
- `2026-11-01 19:40` ｜ 来源：用户直派 ｜ 任务系统（可领取/进行中/可领奖/已完成）、朋友圈抽取与记录、退团确认等 UI 修复并发布线上 ｜ `packages/core/src/{tasks,friends}.ts`、`packages/client/src/**`、`content/*.xlsx`
- `2026-11-02 12:15` ｜ 来源：策划派单 T-002 ｜ 结算随机流按行动派生、repeat 任务跨日重置、存档 v1→v2 迁移与写前备份、招募上限、mood 缺省统一 70 ｜ `packages/core/src/settle.ts`、`tasks.ts`、`members.ts`、`events.ts`、`packages/client/src/state/save.ts`、`App.tsx`、`packages/client/{package.json,tsconfig.json}`、`packages/client/tests/`、`packages/core/tests/{settle-deterministic,tasks-repeat,members-limit}.test.ts`
- `2026-11-02 11:56` ｜ 来源：策划派单 T-001 ｜ 只读盘点，产出 `collab/T-001-report.md`，未改代码 ｜ `collab/T-001-项目现状盘点.md`、`collab/T-001-report.md`
- `2026-11-02 11:50` ｜ 来源：策划 ｜ 建立协作协议、发起 T-001、新增 `collab/` 与 `scripts/collab-status.mjs`、docs/16 归档 D-010～D-012 ｜ `collab/README.md`、`docs/16-决策记录.md`、`README.md`
