# T-013 线上三个 BUG 修复

- 状态：`review`（待策划验收）
- 认领时间：2026-11-02 19:52
- 完成时间：2026-11-02 19:55
- 发起：机枢 ｜ 日期：2026-11-02 19:45
- 来源：用户线上试玩反馈（截图 + 描述）
- 分支：在现有 `main` 上改，**不要**新建分支

---

## 背景（策划已定位到根因，按下面的结论改，不要另起方案）

三个 bug 我都独立复读过代码，根因如下。**先读一遍再动手，有疑问写在回执的「未决问题」里。**

---

## 1. 跨日/空档时时间冻结，推进卡住（bug 1）

### 根因

`App.tsx` 约 420–421 行，推进时钟的锚点是 `const`：

```js
const anchorPerf = performance.now();
const anchorGame = Math.max(runRef.current.at, gameNowRef.current);
```

tick 里：`target = Math.max(runRef.current.at, anchorGame + (nowPerf - anchorPerf) * speed)`。

heal 分支里有一步会把时间**直接前移**（`App.tsx` 约 490 行）：

```js
} else if (next && next.startAt > runRef.current.at) {
  const healed = { ...runRef.current, at: next.startAt };   // 对齐空档
  runRef.current = healed;
```

一旦这里跳到未来（跨日时最容易出现：一天 = 3 行动 = 30 游戏分钟，跳 1 天就是 30 分钟 = 1800 游戏秒），`runRef.current.at` 就会大于「锚点 + 已流逝」，于是 `target` 被钉死在 `runRef.current.at` 上，**倒计时冻结不动**，直到墙钟补上这段差——10× 速度下 1 天要 180 秒，跨 3 天要 9 分钟。玩家看到的就是「推进中 · 剩 N 秒」永远不动，以为卡死。

### 要求

1. `anchorPerf` / `anchorGame` 改成 `let`。
2. **凡是 heal 里改了 `runRef.current.at` 的地方，立刻重设锚点**：

   ```js
   const prevAt = runRef.current.at;                    // 改之前记下
   runRef.current = { ...runRef.current, at: next.startAt };
   setRun(runRef.current);
   anchorGame = runRef.current.at;
   anchorPerf = nowPerf;                                // tick 里的 performance.now()
   setGameNow(runRef.current.at);
   dbg('跨空档对齐：跳到 ' + String(next.startAt) +
       ' 跨越 ' + String(Math.floor((next.startAt - prevAt) / DAY_MS)) + ' 天');
   ```

   （`DAY_MS` 已从 `@idollife/core` 导入，直接用。）

3. **防「永远执行不了」的行程项被无限 repair**：在 effect 内加 `const stuckRef = useRef<{ id: string; n: number }>({ id: '', n: 0 })`。每次走进 `stoppedReason === 'exhausted' && stillPending` 这段：
   - `next.id === stuckRef.current.id` 则 `n += 1`，否则重置为 `{ id: next.id, n: 1 }`；
   - `n >= 3` 时**丢弃**这条（从 schedule 里移除）、`setNotice('有一条行程没法结算，已跳过。')`、写 dbg、并把 `stuckRef.current` 重置。
   - 意图：任何结算不了的行程最多卡 3 个 tick（0.3 秒）就被清掉，玩家不会再看到「永远不动的时间轴」。
4. `TimeAxis.tsx` 约 99 行：`remainMs === 0 && running && nextItem` 时，meta 显示 **「结算中…」**，不要显示「还剩 0 秒」（0 秒还在转圈是自相矛盾的文案）。

---

## 2. 任务状态被云端覆盖，变回未领取（bug 2）

### 根因（两处叠加）

1. `App.tsx` 的 `doAccept` / `doReward`（约 1086–1105 行）只 `setRun(r.state)`，**没有** `pushWholeState`。而购物 `doBuy`、换装 `doEquip`、事件抉择 `choose` 都调了。所以服务端永远学不到 `task:<id>:acceptedAt` / 完成标记。
2. 服务端 `packages/server/src/app.ts` `/v1/sync`（约 132 行）：

   ```js
   const base = existing?.run ?? run;          // ← 只认自己存的那份
   const result = settle(base, schedule, from, to, seed);
   ```

   服务端用它自己那份（缺任务标记）重算，把 `result.state` 回给客户端。客户端 `sameState` 只比 `at/stamina/stats` 五个值，一旦这五个里有任何一个与服务端不同（比如领了奖励加了属性），就执行 `setRun(normalizeRun(res.state))`——**本地的任务标记被整份冲掉**，任务变回「未领取」。本地存档（250ms 防抖）随后也写进这份缺标记的状态，刷新也回不来。

### 要求

1. `doAccept` 与 `doReward` 成功后各补一行 `void pushWholeState(r.state);`（与 `doBuy`/`doEquip` 写法一致）。
2. `/v1/sync`：**客户端不落后时以客户端为准**。

   ```js
   if (existing && existing.run.at > run.at) {
     return c.json({ ...原来的 409 stale 响应... }, 409);   // 这行逻辑不变
   }
   const base = !existing || run.at >= existing.run.at ? run : existing.run;
   // 客户端已经是最新（或更靠前）时，直接存它带来的状态，不要重算覆盖掉任务标记
   const record = { ..., run: base, ... };
   ```

   注意：**不要**再对「以客户端为准」的这条路径调用 `settle`——`from` 会早于 `base.at`，`settle` 里 `cursor = Math.max(from, run.at)` 会把已执行的条目全部跳过，等于白算一遍还可能把 `stoppedReason` 搞乱。分支写成：

   - `run.at >= existing.run.at` → `run: run`（客户端原样存），`accepted: []`，`stoppedReason: null`；
   - `run.at < existing.run.at` → 走原来的 409（其实上面已经 return 了，这里是防御性兜底）。

   两条路径都要 bump `revision`，`lastSyncAt`/`updatedAt`/`seed`/`schedule` 照旧。

3. 回归验证（写进回执）：用一次「领取任务 → 推进 → 再看任务面板」的完整链路确认任务状态不再回到未领取。

---

## 3. 任务要求显示英文字段（bug 3）

### 根因

`packages/core/src/tasks.ts` 第 421–422 行：

```js
export function describeCondition(cond?: RawRequires | string): string {
  if (typeof cond === 'string') return cond.trim() || '无';   // ← 原样吐英文
```

T-004 之后配置里的条件全部改成了表达式 DSL 字符串（`talk >= 20`、`hasFlag("ev:fan-letter")`、`fans.stage >= 100`、`total >= 120 and not hasFlag("ev:debut")`），这个函数却只翻译对象型条件，字符串型原样返回。`TaskPanel` / `DivinePanel` / `FriendsPanel` / `BagPanel` / `PartyPanel` 全都用了它，所以到处都是英文。

### 要求

`describeCondition` 遇到字符串时做**表达式 → 中文**翻译，规则如下（放在 `tasks.ts` 或新建 `packages/core/src/describe-expr.ts`，你定）：

| 表达式 | 输出 |
| --- | --- |
| `talk >= 20` | `口才 ≥ 20` |
| `others >= 30` | `他人 ≥ 30` |
| `money >= 10000` | `资金 ≥ 10000` |
| `fans.stage >= 100` | `舞台粉 ≥ 100` |
| `fans.gachi >= 20` | `嘎起粉 ≥ 20` |
| `total >= 120` | `四项属性总和 ≥ 120` |
| `friends >= 1` | `朋友圈 ≥ 1 人` |
| `hasFlag("ev:fan-letter")` | `发生过「第一封信」` |
| `total >= 120 and not hasFlag("ev:debut")` | `四项属性总和 ≥ 120 且 未发生过「出道」` |

细则：

- 变量名走 `tasks.ts` 里已有的 `LABELS`（vocal 演唱 / dance 舞蹈 / acting 演技 / talk 口才 / self 自我 / others 他人 / fit 适配 / stage 舞台粉 / gachi 嘎起粉 / music 音乐粉 / live 现场粉 / growth 养成粉 / power 实力粉）。`fans.<x>` → `LABELS[x]`。
- 额外补：`money → 资金`、`friends → 朋友圈 n 人`、`total → 四项属性总和`、`stamina → 体力`、`mood → 心情`、`satiety → 饱腹`。（LABELS 里没有的在这里补，不要改 LABELS 的既有值。）
- 比较符：`>=`→`≥`、`<=`→`≤`、`>`→`>`、`<`→`<`、`==`/`=`→`=`。
- 逻辑：`and`→`且`、`or`→`或`、`not X`→`未X`（`not hasFlag("ev:debut")` → `未发生过「出道」`）。
- `hasFlag("ev:xxx")` → 去 `ev:` 前缀查 `packages/core/data/events.json` 的 `story` 数组，用 `title` 字段：`发生过「<title>」`；查不到就 `触发过 xxx`。
- `sum(a, b)` → `（a + b）`（用同样的变量翻译）。
- **解析不了时返回原文，绝不抛错**（界面宁可显示英文也不能崩）。
- 字符串里有换行/`\n` 的先 trim。

### 测试（必须）

新增 `packages/core/tests/describe-condition.test.ts`：

1. 遍历 `tasks.json` 全部 24 条任务的 `acceptCondition` + `completeCondition`；
2. 遍历 `events.json` 的 `story`（30 条）的 `requires` 与每个 `choices[].requires`；
3. 断言：输出**不含**英文字段名残留（正则 `/[A-Za-z_]{3,}/`），且非空、不等于 `'无'`；
4. 断言上面表格里 6 条样例的**精确文案**。
5. 若有翻译不了、只能保留原文的，单独列 `FALLBACK` 白名单数组并在回执里写明是哪几条、为什么（不许静默通过）。

---

## 验收标准

- `pnpm test` 全绿（含新增用例），`packages/core` / `packages/client` / `packages/server` 三处 `tsc --noEmit` 均为 0；
- `pnpm check:data` 通过；
- **不动** `content/all.xlsx`（配置表由我负责）；
- 改了哪些文件、为什么，写进回执 + `collab/CHANGES.md` 顶部追加一行。

---

## 回执区（dsh 填）

### 实际改动

**bug 1 · 时间冻结**
- `packages/client/src/App.tsx:422-423`：`anchorPerf` / `anchorGame` 由 `const` 改 `let`（锚点必须可重设）。
- `packages/client/src/App.tsx:488-516`：空档 heal 分支重写——前移 `run.at` 后立刻 `anchorGame = runRef.current.at; anchorPerf = nowPerf; setGameNow(...)`，并打印「跨空档对齐：跳到 … 跨越 N 天」；`target` 不再被钉死在新的 `run.at` 上。
- `packages/client/src/App.tsx:294 + 474-496`：新增 `stuckRef`（组件级 `useRef`，effect 内按卡片规则计数——`useRef` 不能写在 effect 回调里，那是非法 hook 调用）。同一条行程连续 3 个 tick 结算不了 → 从 schedule 移除 + `setNotice('有一条行程没法结算，已跳过。')` + dbg + 重置计数。
- `packages/client/src/components/TimeAxis.tsx:98-100`：`running && nextItem && remainMs === 0` 时 meta 显示「结算中…」，不再显示「还剩 0 秒」。

**bug 2 · 任务状态被云端覆盖**
- `packages/client/src/App.tsx:1086-1130`：`doReward` / `doAccept` 成功后各补 `void pushWholeState(r.state);`（与 `doBuy`/`doEquip` 一致），任务标记 `acceptedAt` / `doneAt` / `count` 现在会推给服务端。
- `packages/server/src/app.ts:118-180`：`/v1/sync` 改为「客户端不落后时以客户端为准」——`run.at >= existing.run.at` 时直接用客户端 `run` 存库并原样回传（`accepted: []`、`stoppedReason: null`、bump `revision`），**不再调用 `settle`**；客户端落后仍是原来的 409 stale，另加了一条防御性兜底（不 settle）。顺带移除了不再使用的 `settle` 导入与 `from` 解构。

**bug 3 · 条件显示英文**
- `packages/core/src/tasks.ts:421-640`：在原有 `LABELS` 之后新增「表达式 DSL → 中文」翻译器（tokenizer + 递归下降解析器）：
  - 变量名：`LABELS` 优先 → 补充表（资金/朋友圈/四项属性总和/体力/心情/饱腹…）→ `attributes.json` 中文名（含 `trait.` / `neg.` / `prof.` / `fans.` 前缀与裸字段名）。
  - 比较符 `>= ≤ > < = ≠`；逻辑 `and 且` / `or 或` / `not 未X`；`hasFlag("ev:xxx")` 查 `events.json` 的 `story[].title` → `发生过「标题」`（查不到 → `触发过 xxx`）；`sum(a,b)` → `（a + b）`；`friends` 比较补「 人」。
  - `packages/core/src/tasks.ts:642-646`：`describeCondition` 字符串分支改为「翻译成功用译文，失败回退原文」，**绝不抛错**。
- `packages/core/tests/describe-condition.test.ts`（新增 6 条）：覆盖 24 条任务的 `accept/complete/displayCondition`、30 条剧情的 `requires` 与全部 `choices[].requires`，断言无英文残留、非空、不是「无」；9 条样例文案精确匹配；带换行表达式；解析失败回退；旧 JSON 对象条件回归。`FALLBACK` 白名单**为空**（数据里没有翻译不了的条件）。

### 自测结果

- 测试条数：core **24 文件 114 条**（新增 6 条）、client **1 条**，全绿
- tsc：core **0** / client **0** / server **0**
- check:data：✓（actions=35 story=30 routine=90 endings=42）

**bug 2 逻辑复现（本机无 Supabase 登录态，无法真正打 `/v1/sync`，用核心逻辑对比新旧两条路径）**
```
客户端领取后 flags.task:task-vocal-20:acceptedAt = 5400000
旧逻辑回传 state.flags.task:task-vocal-20:acceptedAt = undefined   （丢失 → 客户端被覆盖）
新逻辑保存 state.flags.task:task-vocal-20:acceptedAt = 5400000      （保留）
```
补：`acceptTask` 后 `taskStatus=active`、标记在；`claimTaskReward` 后 `taskStatus=done`、`doneAt` 在（领奖链路本身未受影响）。

**bug 3 真实数据文案抽查**
```
talk >= 20                                    → 口才 ≥ 20
friends >= 1                                  → 朋友圈 ≥ 1 人
hasFlag("ev:fan-letter")                      → 发生过「第一封信」
total >= 120 and not hasFlag("ev:debut")      → 四项属性总和 ≥ 120 且 未发生过「出道」
neg.stress >= 40 and not hasFlag("ev:insomnia") → 精神压力 ≥ 40 且 未发生过「失眠」
trait.passion >= 3                            → 热情 ≥ 3
ambitious >= 3                                → 好强 ≥ 3
fans.stage >= 500                             → 舞台粉 ≥ 500
```

### 未决问题

1. **bug 1 无法用自动化测试覆盖**：修复点在 React effect + `performance.now()`（core 禁 `Date.now()`/DOM），本机只能做代码级确认；需要线上实测一次「跨日/空档后倒计时是否继续走、时间轴是否不再冻住」。
2. **bug 2 端到端同样需要登录态**：`/v1/sync` 依赖 Supabase `auth.getUser`，本机无 `SUPABASE_URL`/`SERVICE_ROLE_KEY`，所以上面贴的是逻辑复现 + 代码核对；建议线上做一次「领取 → 推进 → 刷新」验证。
3. **服务端不再补算离线进度**：改为「客户端为准」后，`/v1/sync` 不再对客户端提交的状态调用 `settle`——这是卡片要求的行为；若以后需要「客户端落后时由服务端补算」，要单独设计（当前的 409 stale 会直接把服务端旧状态回给客户端）。
4. 卡片说 `stuckRef`「在 effect 内加」，但 `useRef` 在 effect 回调里属于非法 hook 调用；已改为组件级 `useRef`（行为与卡片意图一致，计数逻辑仍写在 effect 里）。

### 需要策划拍板的

无（上述 4 条为知悉项；如第 3 条需要「服务端补算离线进度」，请另开任务）。
