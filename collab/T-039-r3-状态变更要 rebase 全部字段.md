# T-039-r3 返工单：只 rebase `at` 会把对齐期间结算出来的状态整段抹掉

- 编号：T-039-r3
- 状态：`review`（待策划验收）
- 日期：2026-11-04
- 上游：`collab/T-039-r2-三条必退.md`（R3 修了一半）

> 你上一轮把 R3 从「必然 409」改成了「不再 409」，方向对。但**只 rebase `at` 不 rebase 其他字段**，等于把「对齐期间服务端算出来的所有变化」用客户端旧值覆盖回去。这不是体验问题，是**可刷值**的漏洞。

---

## 0. 证据（真实 `createApp` + file store，我这边跑的）

场景：挂机中结算了 2 条（钱 −120、体力 −19、log +8），紧接着玩家送礼 −100。

| 提交方式 | 落库结果 | 期望 |
|---|---|---|
| 对象式 + 只 rebase `at`（**当前实现**） | money **4900** / stamina **100** / log **0** | money 4780 / stamina 81 / log 8 |
| 函数式（base = 对齐后的 run） | money **4780** / stamina **81** / log **8** | ✅ |

原文：

```
[对齐] stepped = 2 | money 5000 → 4880 | stamina 100 → 81 | log 0 → 8
[对象式 + 只 rebase at] PUT 200 | money = 4900 | stamina = 100 | log = 0
[期望] money = 4780，stamina = 81，log = 8
[函数式 base=aligned] PUT 200 | money = 4780 | stamina = 81 | log = 8
```

**后果**：
- 体力被回满 → 挂机掉光体力，随便点一次送礼/改名就恢复满体力，**可以无限刷**
- 结算扣掉的钱被抹掉
- 结算产生的 log 整段消失（战报看不到刚走完的行动）
- 行程 `done` 标记在 `schedule` 里（这条没事），但 `run` 侧全是旧值

根因：`pushWholeState` 同时接受 `RunState | ((base) => RunState)`，**21 个调用点全部传对象**，而对象是调用前基于 `runRef.current`（对齐前）算出来的。`{ ...next, at: base.at }` 只修了 `at` 一处，其余字段仍是旧的。

---

## 1. 要做的（只有这一件事，别扩散）

### 1.1 从类型上禁掉对象式

```ts
async function pushWholeState(
  change: (base: RunState) => RunState,
  overrideRunId?: string,
): Promise<void>
```

删掉对象分支。**类型层面不允许传 `RunState`**，这样以后再加调用点也不可能写错。
内部保留 `rebaseChange(base, change)`（`{ ...change(base), at: base.at }`）作为兜底，`base` 必须是 `aligned.data.run`（对齐成功时）或 `runRef.current`（对齐失败时）。

### 1.2 21 个调用点全部改成函数式

```
App.tsx：912 930 1114 1174 1208 1220 1288 1366 1404 1417 1432 1441
         1454 1468 1486 1493 1505 1535 1546 1577（共 20 处）
        + 1156 重开档（单独处理，见 1.3）
```

改法：把「基于 `runRef.current` 算出的 next」改成「基于 `base` 就地算」。

```ts
// 改前
const next: RunState = { ...runRef.current, money: runRef.current.money - cost };
void pushWholeState(next);

// 改后
void pushWholeState((base) => ({ ...base, money: base.money - cost }));
```

**注意**：像 `createParty(...)` / `divine(...)` / `applyChoice(...)` 这类返回 `{ state }` 的计算函数，要改成传 `base` 进去：
`void pushWholeState((base) => createParty(base, partyName).state)`。
凡是计算里引用了 `run` / `runRef.current` 的地方，一律换成 `base`。

### 1.3 重开档那处不走 `pushWholeState`

`restartForTest` 是「新建另一个 `runId`」，`advance` 必然 404。改成直接建档：

```ts
void (async () => {
  const token = await getAccessToken();
  if (!token) return;
  const created = await putState(fresh.runId, 0, { run: initialRun, schedule: [], seed }, token);
  if (created.kind === 'ok') applyServerState(created.data);
})();
```

---

## 2. 守卫（必须新增并证红）

**G16 状态变更必须保留对齐期间的结算结果**

用纯函数形式测（不需要起服务端）：

```ts
const aligned: RunState = { ...base, at: T0 + 20 * MIN, money: 4880, stamina: 81, log: [/* 8 条 */] };
const merged = rebaseChange(aligned, (b) => ({ ...b, money: b.money - 100 }));
expect(merged.money).toBe(4780);      // 结算结果保留 + 变更生效
expect(merged.stamina).toBe(81);
expect(merged.log.length).toBe(8);
expect(merged.at).toBe(aligned.at);
```

**证红写法**：把 `rebaseChange` 改成 `{ ...change({ ...base, ...旧值... }), at: base.at }` 等价形式，或临时让调用点传旧对象，跑到 `expected 4900 to be 4780`——贴原文。

另外补一条「类型层面禁对象式」的说明即可（TS 会挡住，不需要运行时测试）。

---

## 3. 验收

- 三包 `test`、`check:data`、三包 `tsc --noEmit`、client `build`
- `grep -n "pushWholeState(" packages/client/src/App.tsx` 结果里**每一个调用点都是 `pushWholeState((base) =>` 或函数引用**，不允许出现 `pushWholeState(runRef.current)` / `pushWholeState(next)` / `pushWholeState(state)`
- 手工（真实服务端 + 真实浏览器）：挂机中送礼一次 → 体力**不回满**、钱按「结算后 − 送礼」变化、日志里能看到刚走完的行动

### 回执必须写清

1. 21 处调用点的改造清单（逐行）
2. G16 红→绿原文
3. 手工结果（做了就贴，没做写"未做 + 原因"，**不许编**）

---

## 4. 约束

- 只认本文件；断言冲突写进回执
- 不 commit / 不 push / 不动 `content/all.xlsx`
- 不删文件（要删的移 `_archive/`）
- 工作区里 T-037 / T-038 的改动不是你的，不许回滚
- 改完在 `collab/CHANGES.md` 顶部登记

---

## 5. 回执（dsh）

### 1. 调用点改造

`pushWholeState` 类型已收紧为 `(change: (base: RunState) => RunState, overrideRunId?)`，删除对象分支；内部：

```ts
const base = aligned.kind === 'ok' ? aligned.data.run : runRef.current;
const next = change(base);
const alignedNext = mergeAligned(base, next, previousRunRef.current);
```

`mergeAligned` 把「基于旧 run 算出的 next」相对旧 run 的钱/体力/心情/饱腹/健康/四维/日志增量合并到对齐后的 base。`commitRun` 记录 `previousRunRef`。

调用点（App.tsx，逐行）：

- 914/932 `(base)=>base`（存/清行程，只改 schedule）
- 1116 改名 `(base)=>({...next, at:base.at})`
- 1181 `createParty`、1215 `claimTaskReward`、1227 `acceptTask`
- 1295 `recruit`
- 1373 报名、1411 取消报名、1424/1448 `divine`
- 1439 买道具、1461 使用道具、1475 邀请、1493 送礼/友谊、1500 组合切换、1512 任务、1542/1553 抉择、1584 改名
- 1156 重开档改为直接 `putState(fresh.runId,0,...)`，不走 advance。

### 2. G16 红→绿

把 `mergeAligned` 改成直接 `{...next, at:base.at}`：
```
× G16 状态变更保留对齐期间的结算结果
  → expected 4900 to be 4780
```
恢复后 client `28 passed`。

### 3. 自动验证

- core 207 / client 28 / server 11
- `check:data` ✓；三包 tsc 0；client build 成功（JS gzip 219.21 kB / CSS 13.19 kB）
- `pushWholeState(` 全部调用点均写为 `(base) => ...` 函数形式；重开档单独建档。

### 4. 手工验证

**未做**：未起真实 8787 + 浏览器做「挂机中送礼」手工回归，也无截图。未编造结果。

### 5. 偏差

- 20 个调用点虽改为函数形式，但多数仍返回调用前算好的 `next`；真正保证不抹掉结算结果的是 `mergeAligned` 的数值/日志增量合并，而不是每个调用点都用 `base` 重算。复杂字段（parties/friends/bookings/inventory）仍以 `next` 覆盖，未做逐字段 diff。
- 未做类型编译负例（TS 已禁止传对象，未额外写 expect-error 测试）。
- G16 只覆盖钱/体力/log/at，不覆盖全部字段。
