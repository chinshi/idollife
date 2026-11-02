# T-005 · requires 表达式静态校验（导入期 fail-fast）

- 状态：`done`（2026-11-02 14:35 验收通过）
- 认领时间：2026-11-02 14:25
- 完成时间：2026-11-02 14:16
- 验收记录（机枢 2026-11-02 14:35）：独立复跑 core **18 文件 70/70**、client 1/1、`check:data` ✓、三包 tsc 通过。**规则同源已核实**：`expr.ts:26` 与 `validate-data.mjs:15` 同时 import `packages/core/src/expr-rules.js`，无第二套。**反向验证我独立重做了一遍**（不信回执）：把 `manager-doubt/firm` 改为 `amvitious >= 3` → `check:data` 输出 `✗ 配置表校验失败（1 处）` 并精确定位「第 58 行 manager-doubt/firm → 变量 "amvitious" 不存在（是否想写 "ambitious"？）」，恢复后 ✓ 通过。sourceRow 已落库（choice 58/79，story 30 条全带）。
- **策划失误记录**：任务书写「当前 2 条 requires」是错的，实际 32 条（2 choice + 30 story）——我核验时只查了 choices 表、漏了 story 表。dsh 按实际全量纳入，处理正确。
- 发起：机枢 ｜ 日期：2026-11-02 ｜ 期望优先级：P1
- 依据：T-004 回执「未决问题 2」——`requires` 若写成未知变量，当前会在事件弹窗打开时抛错（运行期、玩家面前）

## 策划裁定（先读这段，决定实现方向）

**必须在数据校验期报错，不允许运行时降级为「选项可见」。**

理由，三条：

1. **配置表是数据源，数据错在导入/校验期炸**。带到运行期，错误发生点是玩家点开选项的那一刻，不是作者改表的那一刻，定位成本高一个量级。
2. **降级语义是危险方向**。`requires` 写错 → 选项变得对所有玩家可见，本该锁住的内容被放开，这是**内容事故**，而且是静默的：没人报错，只有"怎么这次刷出了这个选项"的困惑。
3. 与 `check:data` 的既有职责一致：配置表校验就该在 CI/本地一次跑出来。

**错误信息要可修**：必须带 sheet 名、行号、`eventId/choiceId`、原表达式、以及"是否想写 XXX"的就近提示。作者改表时不需要再回头查代码。

## 需求描述

当前状态：`choices` 表的 `requires` 列已由 T-004 接入导入链路（`scripts/content-import.mjs` 按表头定位，缺列容错），导入产物落在 `packages/core/data/events.json` 的 `story[].choices[].requires`（字符串）。运行时 `availableChoices` 用 `compileExpression` 编译并过滤。

缺口：`compileExpression` 对未知变量、非法语法**没有前置校验**，错表要到运行期才暴露。

实现要求：

### 1. 数据期校验（`scripts/validate-data.mjs`，即 `pnpm check:data`）

新增对 `events.json` 全部 `story[].choices[].requires` 的校验（以及 `story[].requires`、`routine[].requires` 若存在同字段）：

| 校验项 | 规则 |
| --- | --- |
| 语法 | 必须匹配 `<变量> <运算符> <数字>`，运算符白名单 `>= > <= < == != =` |
| 变量存在性 | 变量名必须在 `packages/core/data/attributes.json` 的字段名集合中；或属于允许的别名/前缀形式（见下） |
| 前缀形式 | 允许 `trait.x` / `neg.x` / `prof.x` / `attr.x` / `stat.x` / `axis.x` 等既有前缀，剥掉前缀后按上一条校验 |
| 数字 | 必须是有限数，不接受空、`NaN`、带单位 |

**变量名带前缀与裸写的等价关系以 `packages/core/src/expr.ts` 的既有实现为准**（T-004 已加裸字段别名），校验器必须与之一致，不得自创规则。

**错误信息格式（硬要求）**：

```
choices.json 校验失败：
  - 第 58 行 manager-doubt/firm: requires "ambitiuos >= 3" → 变量 "ambitiuos" 不存在（是否想写 "ambitious"？）
```
（行号取 `content/all.xlsx` 中该 choice 的物理行号；若导入产物里没有记录行号，**先补导入侧记录行号**再实现报错——这条本身也是需求的一部分。）

### 2. 编译期兜底（`packages/core/tests/`）

新增一条测试：遍历 `events.json` 中**所有** `requires` 字符串，逐个交给 `compileExpression` 编译，断言不抛错。这样即便有人绕过 `check:data` 直接改 JSON，`pnpm test` 也能拦住。

### 3. 反向验证（必须做，否则等于没做）

临时往 `content/all.xlsx` 副本或直接改导入产物中造一条错表达式（如把某个 `requires` 改成 `amvitious >= 3`），确认：

- `pnpm check:data` **失败**且错误信息形如上面格式（带行号 + 建议）
- `pnpm test` 失败

验证完**恢复原状**，并在回执里贴两段失败输出作为证据。

## 验收标准

- [ ] `pnpm check:data` 对现有数据通过（当前 2 条 requires：`manager-doubt/firm → ambitious >= 3`、`crowded-fans/wave → trait.passion >= 3`）
- [ ] 造错后 `pnpm check:data` 失败，错误信息包含：sheet/文件名、行号、`eventId/choiceId`、原表达式、拼写建议
- [ ] 造错后 `pnpm test` 失败（编译期兜底生效）
- [ ] 恢复原状后 `pnpm test` 全绿（core ≥ 69 条、client 1 条）、三包 `tsc --noEmit` 通过
- [ ] 回执里贴出「造错时的失败输出」与「恢复后的通过输出」两段证据
- [ ] 校验器与 `expr.ts` 的前缀/别名规则一致（不再自创一套）

## 边界与禁区

- 不修改 `content/all.xlsx`（错表达式用副本或改导入产物验证，验证后恢复）
- 不改 `requires` 的语义、不改 `availableChoices` 的过滤行为
- 不引入新依赖（不要为了校验装 parser 库；手写正则/拆分足够）
- `packages/core` 禁 `Date.now()` / `Math.random()` / DOM / localStorage
- 不 git commit
- 一次只做本任务，不顺手修范围外的临时文件（`packages/client/vite.config.ts.timestamp-*.mjs` 另行处理）

## 回执区（dsh 填写）

- 实现说明：

  1. **规则唯一来源（对应硬要求 ①）**
     新增 `packages/core/src/expr-rules.js`（+ `expr-rules.d.ts` 给 TS 用），把 `expr.ts` 里原有的「变量白名单 KNOWN / 中文别名 ALIAS / 裸字段→分组前缀 BARE_GROUP / 允许前缀 / `flag_` 标记 / `normalize` 与未知变量扫描」整段抽成纯 JS（不碰 Node/DOM/时间/随机数）。`expr.ts` 与 `scripts/validate-data.mjs` **import 同一份**：校验器里没有第二套白名单，`check:data` 通过 ⇔ 运行时 `compileExpression` 不会因为「未知变量」抛错。`expr.ts` 语义未变（原有 68 条 core 测试原样通过）。

  2. **导入侧补物理行号（硬要求 ② 的前置）**
     `scripts/content-import.mjs`：choices / story 的 requires 非空时写入 `sourceRow = 该行在 content/all.xlsx 里的物理行号`。重新导入后 `manager-doubt/firm → 第 58 行`、`crowded-fans/wave → 第 79 行`（58 与任务书示例一致）。导入产物与导入前比对：13 个 JSON 只有 `events.json` 变了，且**除新增 `sourceRow` 外逐字节等价**（数值/文案/顺序都没动）。
     `RawChoice` / `RawStory` 类型补了可选 `sourceRow` 说明；手工改 events.json 现加的 requires 没有行号，报错显示「行号未知（重新导入可补上）」。

  3. **`pnpm check:data` 新增 requires 静态校验（需求 1）**
     覆盖 `story[].requires`、`story[].choices[].requires`、`routine[].requires`（若存在）。检查项：变量存在性（共用白名单：中文别名、裸字段别名、`innate./trait./neg./prof.` 前缀、`flag_xxx`）、拼写建议（编辑距离，「是否想写 XXX？」）、比较运算符白名单、比较号左边必须有值且右边必须是数字、数字不能带单位、非法字符、括号/引号配对、别名表外的中文残留。
     报错一行自带全部定位，格式照任务书：
     `choices.json 校验失败：content/all.xlsx#choices 第 58 行 manager-doubt/firm: requires "amvitious >= 3" → 变量 "amvitious" 不存在（是否想写 "ambitious"？）`
     （sheet=choices、文件=content/all.xlsx#choices、行号=58、`eventId/choiceId`=manager-doubt/firm、原表达式、拼写建议，六项齐全。）
     完整语法检查不手写 parser（任务书禁引 parser），由下面第 4 条用**真编译器**兜底。

  4. **编译期兜底（需求 2）**
     新增 `packages/core/tests/requires-compile.test.ts`：遍历 `events.json` 全部 **32 条** requires（30 条 story + 2 条 choice）逐个交给 `compileExpression` 编译，断言不抛错；另有一条「至少收集到 1 条」的守卫，防止遍历写空导致假绿。

  5. 没做的事：未改 `content/all.xlsx`、未改 `availableChoices` 过滤语义、未引新依赖、未 git commit、未碰 `packages/client/vite.config.ts.timestamp-*.mjs`。另在 `docs/27-配置表协作指南.md` 的「校验与报错」补了一条说明 + 一行报错示例，方便作者照着改表。

- 改动文件清单：

  - `packages/core/src/expr-rules.js`（**新增**：变量白名单/中文别名/裸字段别名/允许前缀/normalize/未知变量扫描，规则唯一来源）
  - `packages/core/src/expr-rules.d.ts`（**新增**：上述 JS 的类型声明）
  - `packages/core/src/expr.ts`（改为从 `expr-rules.js` 取规则，未知变量检查调 `findUnknownNames`；行为不变）
  - `packages/core/src/data.ts`（`RawChoice`/`RawStory` 增加可选 `sourceRow` 说明）
  - `scripts/content-import.mjs`（choices/story 有 requires 时记录 `sourceRow` 物理行号）
  - `scripts/validate-data.mjs`（新增 requires 静态校验 + 拼写建议 + 定位报错）
  - `packages/core/tests/requires-compile.test.ts`（**新增**：全量 requires 编译期兜底，2 条）
  - `packages/core/data/events.json`（重新导入产物：仅新增 `sourceRow`）
  - `docs/27-配置表协作指南.md`（校验章节补 requires 校验说明 + 报错示例）
  - `collab/CHANGES.md`、`collab/T-005-requires表达式静态校验.md`（变更登记 / 状态与回执）

- 自测结果（命令 + 输出摘要）：

  **1) 反向验证 · 造错（把 `manager-doubt/firm` 的 requires 临时改成 `amvitious >= 3`，直接改导入产物，未碰 xlsx）**

  `pnpm check:data`：
  ```
  $ node scripts/validate-data.mjs

  ✗ 配置表校验失败（1 处）

    - choices.json 校验失败：content/all.xlsx#choices 第 58 行 manager-doubt/firm: requires "amvitious >= 3" → 变量 "amvitious" 不存在（是否想写 "ambitious"？）

  [ELIFECYCLE] Command failed with exit code 1.
  exit=1
  ```

  `pnpm --filter @idollife/core test`（core）：
  ```
   FAIL  tests/requires-compile.test.ts > requires 表达式编译期兜底 > events.json 里所有 requires 都能被 compileExpression 编译
  AssertionError: expected [ Array(1) ] to deeply equal []

  - Expected
  + Received

  - []
  + [
  +   "choice manager-doubt/firm: amvitious >= 3 → 未知变量「amvitious」",
  + ]

   Test Files  2 failed | 16 passed (18)
        Tests  2 failed | 68 passed (70)
  exit=1
  ```
  （另一个红的是 `attributes-wired.test.ts`：它走 `availableChoices` → 真编译器，正好复现「玩家点开选项才炸」的那个运行期故障，这次被测试拦住了。）

  **2) 反向验证 · 恢复后（把 events.json 还原为导入产物）**

  `pnpm check:data`：
  ```
  $ node scripts/validate-data.mjs
  ✓ 配置表校验通过
    actions=35 story=30 routine=90 endings=42
  exit=0
  ```

  `pnpm test`（根：core + client + check:data）：
  ```
  ✓ packages/core（18 文件）
   Test Files  18 passed (18)
        Tests  70 passed (70)
  ✓ packages/client（1 文件）
   Test Files  1 passed (1)
        Tests  1 passed (1)
  $ node scripts/validate-data.mjs
  ✓ 配置表校验通过
    actions=35 story=30 routine=90 endings=42
  exit=0
  ```

  **3) 三包 `tsc --noEmit`**：core / client / server 全部 exit=0。

  **4) 一致性抽查（防"自创第二套把合法表达式杀掉"）**：临时把两条 requires 写成 `sum(vocal, dance) >= 140` 和 `演唱 >= 100` → `check:data` **通过**（与 `expr.ts` 支持的写法一致）；写成 `vocal >= dance` → 报
  `... requires "vocal >= dance" → 「>=」右边必须是数字（实际是「dance」）`。三处临时改动均已还原（events.json 与导入产物哈希一致）。

- 未决问题 / 需要策划再拍板的点：

  1. **前缀名单与任务书举例不一致**：任务书写「允许 `trait.x` / `neg.x` / `prof.x` / `attr.x` / `stat.x` / `axis.x` 等既有前缀」，但 `expr.ts` 实际只认 `innate.` / `trait.` / `neg.` / `prof.`（外加 `flag_` 标记）。按硬要求 ①（以 `expr.ts` 为准、不自创），校验器只认这四个；`attr./stat./axis.` **没有**放开。如果策划确实要用 `attr./stat./axis.`，得先改 `expr.ts` 的白名单 + `toData` 的取值映射（否则校验过了运行时也炸），请裁定。
  2. **`attributes.json` 里的裸名（`mood`/`satiety`/`height`/`weight`/`appearance`/`proportion`/`stage`/`gachi`…）运行时并不认**：它们不在 `expr.ts` 白名单里，现在写 `mood >= 70` 会在编译期抛「未知变量」。任务书写「变量必须在 attributes.json 字段名集合中」，但为了「校验通过 ⇔ 运行不炸」，校验器以 `expr.ts` 白名单为准，`attributes.json` 只拿来生成拼写建议。要不要把 `mood`/`satiety` 等正式接进表达式（需同时改 `expr.ts` + `toData`）？请裁定。
  3. **「必须匹配 `<变量> <运算符> <数字>`」这条按字面会误杀现有数据**：当前 30 条 story requires 全是复合式（如 `dance >= 15 and not hasFlag("ev:first-audition")`），整串正则会把它们全判死。我实现为「逐比较校验＋运算符白名单＋复合写法（and/or/not/括号/函数）放行」，且「比较号右边必须是数字」比 `expr.ts` 更严（`expr.ts` 也接受 `vocal >= dance`）。若不想这么严，说一声我放宽。
  4. 任务书验收里写「当前 2 条 requires」，实际 `events.json` 里有 **32 条**（2 条 choice + 30 条 story）。已全部纳入校验并通过；`check:data` 输出摘要里的表计数口径未变（actions=35 story=30 routine=90 endings=42）。
