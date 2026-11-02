# T-001 · 项目现状盘点报告

> 盘点人：dsh ｜ 日期：2026-11-02 ｜ 方式：只读盘点 ｜ 范围：`packages/{core,client,server}`、`docs/`、`packages/core/data`、`content/*.xlsx`

## 0. 执行摘要

- 规模：core 19 文件 2253 行；client 20 文件 3374 行；server 8 文件 461 行；测试 13 文件 62 条 841 行。
- 盘面：27 个系统/模块中，已实现 8、半成品 12、未开工 7；单机主循环（行动→结算→日志→存档）代码链路完整，联机/设置/成就/多偶像未开工。
- 最高优先级缺口：docs/03 的 P0「通告与工作」没有对应模块；结算随机数按调用批次重置，客户端增量结算与服务端一次重放结果不一致。
- 数据正确性缺口：repeat 任务完成后永久 done，`times` 不生效；存档无迁移/备份；招募不检查组合上限。
- 测试：`pnpm check:data` 通过；`pnpm test` 在本次沙箱因 `spawn EPERM` 无法启动 vitest（13 个测试文件 0 条执行），不能判定断言绿/红；core/client/server 三包 tsc 直跑均通过。
- 文档：docs/03 仍为 🟡 待填且缺 7 个已实现系统；全库 96 处【待填】；docs 04/10/11/12/16/17/25/26 与代码有明确偏差。
- 结论：单机核心可继续迭代；联机与“服务端权威”不具备上线条件；建议先修确定性与数据正确性，再做组合接入演出。

## 1. 功能清单对照

> docs/03 状态仍为 🟡 待填，S01–S20 表可用但缺 7 个已落地系统；以下保留 S 编号，S21–S27 按 `packages/core/src` 实际模块补齐。状态只取三档：`已实现` / `半成品（缺什么）` / `未开工`。

| 编号 | 系统 | 状态 | 依据与缺口 |
| --- | --- | --- | --- |
| S01 | 时间与排程 | 半成品 | `settle`、排程、自动推进、事件暂停可用；服务端无离线重放任务，客户端补时上限 6 小时（App.tsx:263）。 |
| S02 | 偶像属性 | 半成品 | 34 属性/8 类已落表；`weight`、`desire`、`scandal`、`lead`、`coop`、`independent` 在 core 无消费方；acting/talk 无熟练度；`settle` 缺省 mood 为 100，UI 缺省 70。 |
| S03 | 行动与日程 | 已实现 | 6 行动 + 排程 + 次数/分类/预览；内容只有 7 行动 13 结果，属内容厚度不足。 |
| S04 | 通告与工作 | 未开工 | 无通告定义、接单、截止、失败、合同报酬；只有打工与演出替代。 |
| S05 | 经济与钱包 | 已实现 | 收入/支出/房租/商店/招募/占卜扣款；负数策略仍待 docs/04 拍板。 |
| S06 | 存档 | 半成品 | localStorage v1 + 云快照；`version !== 1` 直接丢弃，无迁移、备份、多槽（save.ts:83）。 |
| S07 | 文本日志与反馈 | 已实现 | `LogEntry` + `LogPanel` + 筛选 + notice。 |
| S08 | 剧情事件 | 半成品 | 5 个 story + 12 个 routine + major 暂停 + 选项 flag；无 20+ 内容、无生涯记录/回放。 |
| S09 | 粉丝与舆情 | 半成品 | 6 类粉丝/4 层忠诚/好感转化/演出涨粉；无 reputation/舆论，`loseFans` 生产代码无调用，无负面事件。 |
| S10 | 离线/回归结算 | 半成品 | 客户端墙上时钟补 6 小时 + 自动续跑；服务端无定时重放、无收益/速率校验。 |
| S11 | 设置与无障碍 | 未开工 | 无设置页、字号、深色模式、老板键。 |
| S12 | 赞助入口 | 未开工 | 无赞助入口与感谢页。 |
| S13 | 多偶像/多存档 | 未开工 | 单 `RunState`、单存档 key；多组合不等于多偶像。 |
| S14 | 账号与云存档 | 半成品 | Supabase 登录 + sync/choice/latest；无 clientSeq 幂等、无速率/收益上限、`/choice` 信任整档。 |
| S15 | 成就与图鉴 | 未开工 | 42 结局已定义，但无 MetaSave、解锁、图鉴、跨周目持久化。 |
| S16 | 演出报名与撮合 | 未开工 | 无 show_windows/entries/撮合。 |
| S17 | 异步演出结算 | 未开工 | 无窗口批结算/战报；`shows.ts` 未接线。 |
| S18 | 组合与阵容 | 半成品 | 组合/招募/邀请/踢人/memberStats；`recruit` 不查 10 人上限，无定位/贡献度，组合不影响演出评分。 |
| S19 | 商店与库存 | 半成品 | 每周 3 普通 + 1 稀有、买/装备 1 槽；无阶段解锁、限购、消耗品、7 槽、多词条。 |
| S20 | 招募与卡池 | 已实现 | 3 渠道 + 3 卡池 + 重复 +1%/上限 10；组合上限缺口归 S18。 |
| S21 | 占卜 | 已实现 | `divination.ts` + `DivinePanel`；成本按天翻倍，只出档位。 |
| S22 | 任务 | 半成品 | 5 任务/状态机/奖励；repeat 完成后永久 done（tasks.ts:79-83、99），`times` 不生效。 |
| S23 | 结局/周目 | 半成品 | 42 结局 + 判定 + 730 天 endAt + 结局 UI；无 Meta/图鉴/生涯记录；重开复用同一 `initialRun`，L0 不重 roll。 |
| S24 | 朋友圈/频道 | 已实现 | 3 渠道/3 卡池/认识/默契/冷却/邀请。 |
| S25 | 条件表达式 DSL | 已实现 | filtrex + 中文别名 + 旧 JSON 兼容；条件只在运行时编译，导入/check:data 不校验。 |
| S26 | 演出评分/战报 | 半成品 | `shows.ts` 有 performShow/applyShow，但无调用；实际 show 走 action_results；两套 fanType 逻辑并存。 |
| S27 | 配置表体系 | 已实现 | Excel→JSON 13 表 + validate-data；`characters.json`/`logs.json` 无消费方，Excel/JSON 同步无 CI 校验。 |

## 2. 文档-代码偏差

| # | 文档说法 | 代码/仓库事实 |
| --- | --- | --- |
| 1 | docs/03 状态 🟡 待填；MVP 写「专注 → 训练 → 接一次通告」；系统表只到 S20 | 专注/番茄钟已由 docs/16 D-009 废弃；代码已实现占卜、任务、结局、朋友圈、表达式、配置表、演出模块，共 7 个系统未进清单；S04 通告无代码。 |
| 2 | docs/10 写 `core/src/systems/`、`rules/`，client 写 `app/`、`ui/`、`content/`，server 写 `routes/`、`jobs/`、`db/`；并称用 eslint 与构建期 Zod 拦截 | 实际 core/src 为 19 个平铺 `.ts`；client 用 `components/`、`state/`、`api/`、`auth/`；server 用 `src/store/`；仓库无 eslint 配置/脚本、无 zod 依赖，校验脚本是自定义 `scripts/validate-data.mjs`。 |
| 3 | docs/12 写「1 行动 = 10 分钟游戏时间」，阶段行动跨度为 1 日/数日–1 周/1–4 周 | `balance.json` 的 `actionMinutes = 1`，6 个行动 `durationMinutes` 均为 1，演出为 3；每日 3 个行动位；周目 730 天。 |
| 4 | docs/04 写 7 个装备槽、6 类道具、10 种服装风格、4 类词条、3 档稀有度、每周 3–5 普通 + 1 稀有 | `EquipItem.slot` 只有 `outfit`；商店只有服装，无道具/消耗品；`EquipItem` 无风格字段，古风/Lolita/摇滚/打歌服只出现在服装名；词条只有 1 条 stat；稀有度只有 common/rare；每周固定 3 普通 + 1 稀有。 |
| 5 | docs/04 §9.1 写心情/饱腹初始 70/70 | `App.tsx` 与 `normalizeRun` 给 70；`settle` 在字段缺失时用 `?? 100`（settle.ts:107-108），core 与 UI 的缺省语义不一致。 |
| 6 | docs/04 §9.3 写「熟练度乘区尚未接通」，§9.4 又写「已接」 | 代码只接 song/choreo 训练熟练度与 stage_prof 演出熟练度；acting/talk 无熟练度。文档自身前后矛盾。 |
| 7 | docs/11 定义 MetaSave、Fans.reputation、7 槽 Inventory、Member.source/templateId、ScheduleItem.withMemberId、settings | 实际 `RunState` 平铺、无 MetaSave；Fans 无 reputation；inventory 是数组；Member 只有 id/name/bias/dupCount；ScheduleItem 无 withMemberId；无 settings。 |
| 8 | docs/10/11/14 要求存档迁移、覆盖前备份、30 天数值模拟与快照回归 | `save.ts` 只认 version 1，其他版本返回 null；写档直接覆盖；无迁移测试；无 simulate-30days/快照测试；`tmp-advance.test.ts` 只有 2 条连续推进用例。 |
| 9 | docs/16 D-008 正文写「属性与结算由服务端持有」，同页表格又写「降级：无榜单，只需基础校验」 | 代码是客户端权威：客户端先 `settle`，服务端 `/v1/sync` 再重放；`/v1/choice` 直接接收并保存客户端整份 `RunState`，未做数值/速率校验。 |
| 10 | docs/17 仍把 Q1 玩家视角、Q3 时间模型、Q4 账号列为「待定」；docs/16 头部仍 🟡 待填 | docs/16 与 README 已写定：经纪人、真实时间、账号要做；17 与 16 未同步。 |
| 11 | README 写「不登录也能玩」「core 单测（3 条）」「初始化代码仓库」未勾选 | App 在无 user 时直接返回登录欢迎页，无 Supabase 环境变量时整页显示「未配置后端」；实际 13 个测试文件 62 条用例；packages/core、client、server 已存在。 |
| 12 | docs/25 列 `taskVisible`/`taskClaimable`/`taskRemaining`/`claimTask`，示例字段用 `claimCondition`，并写「完成时自动发奖」 | 实际导出是 `taskStatus`/`claimableTasks`/`activeTasks`/`claimTaskReward`；字段是 `acceptCondition`；UI 需要点「领取奖励」，不是自动发奖；同页还有两个 §2.3。 |
| 13 | docs/26 写「导入表格写错语法会直接报错」「运行时表达式不会抛异常」 | `content-import.mjs` 的 parseCond 只校验 JSON 语法，表达式字符串原样写入；导入与 `check:data` 都不编译表达式；`compileExpression` 对未知变量直接 throw。 |

## 3. 技术债与测试现状

### 3.1 实际执行

| 命令 | 结果 | 输出摘要 |
| --- | --- | --- |
| `pnpm check:data` | 通过，exit 0 | `✓ 配置表校验通过`；`actions=7 story=5 routine=12 endings=42`。 |
| `pnpm test` | 失败，exit 1 | `$ vitest run`；Unhandled Error `spawn EPERM`（tinypool fork）；`Test Files no tests`、`Tests no tests`、`Errors 1`；13 个测试文件未执行。 |
| `vitest run --pool=threads` 重试 | 失败 | 13 个 suite failed；同一 `spawn EPERM`，栈在 `vite:esbuild` transform。 |
| `tsc --noEmit`（core/client/server 直跑） | 通过，exit 0 | 三个包均无类型错误。 |

> 测试失败点是沙箱禁止创建子进程，不是断言失败。未在普通终端复跑前，测试状态只能记为「未验证」，不能记为「全绿」。

### 3.2 TODO/FIXME 与覆盖

- 第一方源码 TODO/FIXME：0。分布为 0 不等于无债，只说明债没有登记。
- 生成文件 `packages/server/api/[...path].js`：1.06 MB、约 2.88 万行，含 3 处 TODO、1 处 `@ts-ignore`（均为打包进来的第三方代码）。
- 文档待填：19 个 docs 文件共 96 处 `【待填】`；docs/03、13、14、16、17 头部仍是 🟡 待填。
- 测试覆盖：13 文件/62 条/841 行；覆盖 settle、attributes、expr、endings、fans、friends、members、shop、tasks、mood、stamina。缺存档迁移、服务端 auth/sync/ownership、client、30 天模拟、shows.ts、characters/logs 消费方、Excel/JSON 一致性。
- 工程守卫：无 CI、无 eslint、无 prettier；core 铁律（Date.now/Math.random/DOM/localStorage）经检索无违规，仅注释提及。

### 3.3 已知坑（按影响排序）

1. **结算随机数按调用批次重置**：`settle` 每次调用都 `mulberry32(hashSeed(seed))`（settle.ts:67）；客户端每约 100ms 调一次（App.tsx:463），服务端按 from→to 一次重放（app.ts:133）。同一排程分多次算与一次算的随机序列不同，含随机区间的行动结果会分叉。
2. **repeat 任务只能完成一次**：`taskStatus` 在 `accepted && doneAt > 0` 时直接返回 done（tasks.ts:79-83），`acceptTask` 对 done 返回失败（tasks.ts:99）；`task-first-show` 的 `times: 5` 实际无效。
3. **存档无迁移/备份**：`loadSave` 对非 v1 直接丢弃（save.ts:83），写档直接覆盖；docs/11 §10 与 docs/14 的迁移/备份要求未实现。
4. **服务端信任客户端**：`/v1/choice` 保存任意 `run`（app.ts:162-193）；`/v1/sync` 只比较 `existing.run.at > run.at`，无速率/收益上限；客户端 `sameState` 只比 at/stamina/四属性（App.tsx:165-173），money/fans/log 的服务端修正会被忽略。
5. **组合/演出脱节**：`recruit` 不检查 `PARTY_MAX`（members.ts:95-135）；`shows.ts` 的 performShow/applyShow 无调用；实际 show 只按玩家四属性走 action_results，成员与组合不加分。
6. **同步遗漏**：`doKick` 与 `doSwitchParty` 只改本地 state，不 `pushWholeState`（App.tsx:1106、1168）；`doStop` 直接丢弃 batch，不推服务端。
7. **重开无随机性**：`initialRun` 在模块加载时用 Math.random 生成一次（App.tsx:108-111），`doRestart` 复用它（App.tsx:1025）；新档 seed 固定 `run-demo`（App.tsx:197），每局 L0 与随机序列相同。
8. **条件校验后置**：配置导入与 `check:data` 不编译表达式；字符串条件每次调用都编译（expr.ts:221-228），拼错变量在首次求值时 throw，不是构建期报错。
9. **日志无上限**：`RunState.log` 只增不减，客户端整档写 localStorage/上传；docs/11 §10 的 500 条上限未实现。
10. **死代码/死数据**：`shows.ts`、`characters.json`（5 条）、`logs.json` 无消费方；`results.ts:68` 与 `shows.ts:25` 两套 fanType 判定。

## 4. 下一步建议（程序视角，按性价比）

1. **统一结算边界与随机种子（P0，约 0.5–1 天）**：把「一次排程批次」作为唯一 `settle` 调用边界，或把随机种子改为按行动 ID + 时间派生；补一条「一次算 vs 分多次算结果一致」的测试，再加客户端/服务端同输入对比。先修这个，联机重放才有意义。
2. **修数据正确性与存档（P0，约 1 天）**：repeat 任务完成后重置 acceptedAt/doneAt 并校验 `times`；`loadSave` 加 v1→v2 迁移与覆盖前备份；`recruit` 补 10 人上限；统一 mood/satiety 缺省为 70。配套 4–6 条回归测试。
3. **组合接入演出并清死代码（P1，约 1–2 天）**：只保留一条演出结算路径，让 `Party.members` 的 `memberStats` 参与评分；删除或接线 `shows.ts`、`characters.json`、`logs.json`；同步补 S16/S17 的窗口与战报数据结构。

## 5. 需要策划拍板

- **测试门槛**：本次沙箱无法启动 vitest，是否接受「`check:data` 通过 + 三包 tsc 通过 + 报告已出」先置 review，由你在普通终端复跑 `pnpm test` 后再 done？
- **S04 通告系统**：docs/03 标 P0，但代码完全没有；是否作为下一个开发任务优先派？
- **repeat 任务语义**：完成后是「立即重置可再领」还是「等下一个游戏周/日重置」？`times=5` 的 5 次如何计时？
- **服务端权威范围**：D-007 无榜单，是否只做基础防篡改（收紧 `/v1/choice`、加速率/收益上限），还是继续只做快照同步？
- **登录策略**：README 写「不登录也能玩」，App 当前强制登录；以哪个为准？
