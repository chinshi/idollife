# T-006 · mood / satiety 接入表达式变量域

- 状态：`done`（2026-11-02 14:40 验收通过）
- 验收记录（机枢 2026-11-02 14:40）：独立复跑 —— core **19 文件 75/75**、client 1/1、`check:data` ✓。代码核对：`expr-rules.js` 的 `FIXED_NAMES` 含 mood/satiety（只加一处，`validate-data.mjs` 未重复实现，同源机制被正确利用）；`expr.ts` 的 data 表取 `state.mood ?? 70` / `state.satiety ?? 70`，缺省 70 对齐 D-012。**两段反向验证我独立重做**：`requires` 写 `mood <= 50` → check:data ✓ 通过；写 `modd >= 3` → ✗ 报「第 58 行 manager-doubt/firm → 变量 "modd" 不存在（是否想写 "mood"？）」；事后已恢复 events.json。
- 未决问题裁定：① **中文别名（心情/饱腹）保留** —— docs/15 术语表与 ALIAS 既有中文别名传统（体力/资金/粉丝数），内容作者是中文语境，写中文更自然，不删。② **同源白名单全局生效，可接受且正是设计意图** —— 表达式是通用能力，不为单个字段位置开特例；`mood`/`satiety` 今后在 actions.displayCondition、results.condition、tasks 三种条件里同样可写，这是收益不是风险。
- 认领时间：2026-11-02 14:25
- 完成时间：2026-11-02 14:25
- 发起：机枢 ｜ 日期：2026-11-02 ｜ 优先级：P1
- 依据：docs/16 决策 **D-013 第 2 条**（T-005 遗留裁定）

## 背景（一句话）

表达式是内容作者唯一能直接写的逻辑，但 `mood` / `satiety` 现在**不能作为条件**——做不出「心情低于 60 才出现的倾诉选项」这类设计。而它们早已是选项的常驻**效果**量（choices 表有 mood/satiety 列），作为条件同样必要。

## 需求描述

### 1. 白名单接入（`packages/core/src/expr-rules.js`）

把 `mood`、`satiety` 加入固定变量（`FIXED_NAMES`），使其：

- 裸名可写：`mood >= 60`、`satiety < 30`
- 校验器自动放行（`validate-data.mjs` 与 `expr.ts` 共用本文件，**不需要改两处**，这是 T-005 已建立的同源机制，务必利用而不是绕开）
- 拼写建议（`NAME_CANDIDATES`）自动包含它们——若当前实现是基于 `KNOWN` 派生的，则无需额外动作；若有硬编码列表，一并补齐

**不要**给它们加分组前缀（不要 `state.mood` 这种），裸名即可。

### 2. 取值接入（`packages/core/src/expr.ts`）

`compileExpression` 构造的变量表（现有 `data` 对象，已有 `stamina` / `money` / `friends` 等）补上：

| 变量 | 取值 | 缺省 |
| --- | --- | --- |
| `mood` | `state.mood` | **70** |
| `satiety` | `state.satiety` | **70** |

缺省值 70 必须与 **D-012 第 3 条**（mood/satiety 缺省统一 70）一致，不得用 100 或其它值。

### 3. 中文别名（可选但推荐）

若 `ALIAS` 已支持「体力 / 资金」这类中文写法，顺手加：「心情」→ `mood`、「饱腹」→ `satiety`。保持与既有命名风格一致（见 docs/15 术语表）。

### 4. 测试（`packages/core/tests/`）

新建 `mood-expr.test.ts`，至少覆盖：

- A. `mood >= 60` 在 mood=70 时为真、mood=50 时为假
- B. `satiety < 30` 在 satiety=20 时为真、satiety=40 时为假
- C. **缺省值**：`state.mood` / `state.satiety` 为 `undefined` 时按 70 求值（`mood >= 70` 为真，`mood > 70` 为假）
- D. 复合：`mood >= 60 and satiety < 50` 正确求值
- E. 中文别名（若实现）：「心情 >= 60」等价于 `mood >= 60`

并且**反向验证一次**：`modd >= 60` 必须仍然报「未知变量」且建议 `mood`（证明拼写保护没被削弱）。在回执里贴输出。

### 5. 端到端可用性（必须做）

用 `check:data` 验证：临时在 `events.json` 某条 choice 的 `requires` 写 `mood <= 50`，`pnpm check:data` 应**通过**（不再是未知变量），验证后恢复原状。这条证明「作者在表里写 mood 终于能过了」。

## 验收标准

- [ ] `pnpm test` 全绿（core ≥ 75 条，含新增 mood-expr 至少 5 条；client 1 条）
- [ ] `pnpm check:data` 通过（actions=35 story=30 routine=90 endings=42 不变）
- [ ] 三包 `tsc --noEmit` 通过
- [ ] `modd >= 60` 仍报未知变量并建议 `mood`（贴输出）
- [ ] `requires` 写 `mood <= 50` 时 `check:data` 通过（贴输出，验证后恢复）
- [ ] 未新增变量白名单外的任何名字（不加 attr/stat/axis 前缀、不加其它状态字段）
- [ ] 回执四项填全，`collab/CHANGES.md` 顶部追加一行

## 边界与禁区

- 只加 `mood` / `satiety` 两个变量，**不顺带加别的**（`debuted`、`fans.total` 等一律不动，需要另开任务）
- 不改 `mood`/`satiety` 的结算语义、不改缺省值来源（D-012 已定 70）
- 不改 `content/all.xlsx`
- 不引入新依赖
- `packages/core` 禁 `Date.now()` / `Math.random()` / DOM / localStorage
- 不 git commit

## 回执区（dsh 填写）

- 实现说明：

  1. **白名单（同源接入，需求 1）**：`packages/core/src/expr-rules.js` 的 `FIXED_NAMES` 增加 `mood`、`satiety`（**裸名**，没加 `state.` 之类前缀）。`KNOWN` 与 `NAME_CANDIDATES` 都由 `FIXED_NAMES` 派生，所以「运行时编译白名单 / `check:data` 校验 / 拼写建议」三处**同时生效**；`scripts/validate-data.mjs` **一行都没改**——这就是 T-005 建的同源机制在起作用，没有绕开重写。
  2. **取值（需求 2）**：`packages/core/src/expr.ts` 的 `toData` 里**原本就已经有** `mood: state.mood ?? 70` / `satiety: state.satiety ?? 70`（D-012 第 3 条当初落地时一并加的），本次逻辑无需改动，只补了顶部变量注释。缺省 70 已由测试 C 钉死：`state.mood` 为 `undefined` 时 `mood >= 70` 为真、`mood > 70` 为假（satiety 同理）；`mood=0` 是有效值，不会被 `??` 顶成 70。
  3. **中文别名（需求 3，可选但推荐）**：`ALIAS` 增加「心情」→ `mood`、「饱腹」→ `satiety`，与 `attributes.json` 的显示名（心情 / 饱腹）和 docs/15 术语表一致；测试 E 覆盖「`心情 >= 60` 等价于 `mood >= 60`」。
  4. **测试（需求 4）**：新增 `packages/core/tests/mood-expr.test.ts`，5 条覆盖 A（`mood >= 60`）、B（`satiety < 30`）、C（缺省 70）、D（复合）、E（中文别名）。
  5. **端到端（需求 5）**：见下面反向验证 2，`requires` 写 `mood <= 50` 时 `check:data` 通过。
  6. 边界：**只加了这两个变量**（`debuted`、`fans.total` 等未动，未加 `attr./stat./axis.` 前缀）；未改 `content/all.xlsx`、未改 mood/satiety 的结算语义、未引新依赖、未 git commit。另外顺带核了一遍 core 里 mood/satiety 的缺省（`settle.ts` / `events.ts` / `attributes.ts` / `expr.ts`）都已是 70，没有残留 `?? 100`。

- 改动文件清单：

  - `packages/core/src/expr-rules.js`（`FIXED_NAMES` += `mood` / `satiety`；`ALIAS` += 心情 / 饱腹）
  - `packages/core/src/expr.ts`（**仅补变量注释**；取值与缺省 70 原已存在，未改逻辑）
  - `packages/core/tests/mood-expr.test.ts`（**新增**：A～E 共 5 条）
  - `docs/26-条件表达式.md`（变量表补 `mood` / `satiety` 两行，中文别名行补 心情 / 饱腹）
  - `collab/T-006-mood-satiety接入表达式.md`（状态 + 回执）
  - `collab/CHANGES.md`（变更登记）

- 自测结果（命令 + 输出摘要）：

  **反向验证 1 · 拼写保护没被削弱（临时把 `manager-doubt/firm` 的 requires 写成 `modd >= 60`，验证后已还原）**
  ```
  $ node scripts/validate-data.mjs

  ✗ 配置表校验失败（1 处）

    - choices.json 校验失败：content/all.xlsx#choices 第 58 行 manager-doubt/firm: requires "modd >= 60" → 变量 "modd" 不存在（是否想写 "mood"？）

  [ELIFECYCLE] Command failed with exit code 1.
  check:data exit=1
  ```

  **反向验证 2 · 作者写 mood 能过（临时改成 `mood <= 50`，验证后已还原）**
  ```
  $ node scripts/validate-data.mjs
  ✓ 配置表校验通过
    actions=35 story=30 routine=90 endings=42
  check:data exit=0
  ```
  （两次都从备份还原，`events.json` 哈希与造错前完全一致；还原后 `check:data` 再次通过。）

  **全量**
  - `pnpm test` → core **19 文件 75 条全绿**（含新增 `mood-expr.test.ts` 5 条）、client 1 条全绿、`check:data` 通过（actions=35 story=30 routine=90 endings=42）。
  - 三包 `tsc --noEmit` → core / client / server 全部 exit=0。
  - 环境说明：本次初跑时沙箱为 workspace-write，vitest 被 Vite 的 Windows realpath 子进程探测拦成 `spawn EPERM`（非测试失败）；放开一次后实跑通过，最后一轮复跑无限制，结果如上。策划复跑以 `pnpm test` + `pnpm check:data` + 三包 tsc 为准。

  **策划独立复跑（2026-11-02，普通终端）**
  - `pnpm test` → core 19 文件 **75/75** 通过、client **1/1** 通过
  - `pnpm check:data` → ✓ 通过（actions=35 story=30 routine=90 endings=42）
  - 反向验证 A：`requires` 写 `"mood <= 50"` → `check:data` ✓ 通过（mood 已被白名单接受）
  - 反向验证 B：`requires` 写 `"modd >= 3"` → ✗ 失败：「第 58 行 manager-doubt/firm → 变量 "modd" 不存在（是否想写 "mood"？）」
  - 代码核对：`expr-rules.js` FIXED_NAMES 已含 mood/satiety；`expr.ts` 已为 mood/satiety 取值且缺省 70；`mood-expr.test.ts` 已存在
  - `events.json` 已确认恢复原状

- 未决问题 / 需要策划再拍板的点：

  1. **中文别名是按 §3「可选但推荐」加的**（心情 / 饱腹）。如果策划希望变量域严格只认英文名，说一声我删掉 `ALIAS` 那两行和测试 E。
  2. **同源白名单是全局生效的**：`mood` / `satiety` 现在不只 `choices.requires` 能写，`actions.displayCondition`、`results.condition`、`tasks` 的三种条件也一并能写（这是共用 `expr-rules.js` 的必然结果，不建议为单个位置开特例）。T-006 只要求选项，请确认这个「顺带变宽」可接受。
  3. 无其它阻塞项。
