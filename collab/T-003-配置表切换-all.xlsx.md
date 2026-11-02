# T-003 · 配置表切换：改用聚合表 content/all.xlsx
- 状态：`done`（2026-11-02 14:20 收尾完成；4 条断言冲突已由 T-004 全部消除，core 68/68 全绿）
- 认领时间：2026-11-02 12:45
- 验收记录（机枢 2026-11-02）：策划复跑核对——行数全部一致（actions 35 / results 99 / tasks 24 / attributes 34 / endings 42 / shop 22 / logs 47 / members 49 / pools 5 / channels 5 / characters 5；choices 90 条已并入 events.json 的 story[].choices）；`check:data` 通过；三包 tsc 通过；`all.xlsx` 未被修改；staminaMax 缺省测试已补。**未达标项**：`pnpm test` 4 条失败（mood / settle / extra / attributes-wired），均源于新表数值变化，非代码回归，已逐条裁定并转 T-004。回执未决 2/3/4 维持 dsh 方案（choices 并入 events.json；反向导出与 shop 直读 BALANCE 另开任务）。
- 发起：机枢 ｜ 日期：2026-11-02
- 优先级：P0（内容源变更，后续所有内容工作依赖它）

## 需求描述

`content/all.xlsx` 是策划聚合后的**唯一内容源**（15 个 sheet），取代原先 13 张分表。请改造导入链路：

1. **改 `scripts/content-import.mjs`**：改为从单一工作簿 `content/all.xlsx` 读取全部 sheet，产出 `packages/core/data/*.json`。sheet → JSON 映射沿用现有结构：
   `balance`→balance.json ｜ `attributes`→attributes.json ｜ `actions`→actions.json ｜ `results`→action_results.json ｜ `routine`+`story`→events.json ｜ `endings`→endings.json ｜ `tasks`→tasks.json ｜ `shop`→shop.json ｜ `logs`→logs.json ｜ `channels`→channels.json ｜ `pools`→pools.json ｜ `members`→members.json ｜ `characters`→characters.json
2. **新增 `choices` 表（90 行）**：先落 JSON（文件名与结构由你定，建议 `choices.json` 或并入 events.json），**本任务只做导入，不接消费方**（消费方接线另开任务，避免范围膨胀）。
3. **旧 13 张分表退役**：移到 `content/_archive/`，导入脚本不再读取，避免双源冲突。不要删除（保留历史）。
4. **数值变更已由策划裁定**（不要当成笔误回退）：
   - `actionMinutes: 1 → 10`：有意修正，对齐 docs/12「1 行动 = 10 分钟游戏时间」，修正 T-001 报告的文档-代码偏差 #3。
   - 新增 `commonPrice=800` / `rarePrice=2000`：商店定价，接受。
   - **`staminaMax` 在新表中缺失**：代码侧必须给**缺省值 100**，并保留「表里有则用表里的」覆盖逻辑。**不要往 all.xlsx 里加行**（该表由策划维护，程序不得写）。
5. **内容量激增**：actions 7→35、results 13→99、tasks 5→24、shop 22、logs 47、members 49、pools 3→5、channels 3→5。导入后 JSON 行数必须与表一致。

## 验收标准（运行前写死）

- [ ] `pnpm content:import` 可执行，从 all.xlsx 全量导入，无跳过、无静默失败
- [ ] 导入后各 JSON 行数与 all.xlsx 对应 sheet 数据行一致（actions 35 / results 99 / tasks 24 / attributes 34 / endings 42 / shop 22 / logs 47 / members 49 / pools 5 / channels 5 / characters 5）
- [ ] `pnpm check:data` 通过
- [ ] `pnpm test` 全绿；**既有断言若与新内容冲突，列入回执未决问题，不得静默修改断言**
- [ ] 体力上限：无 `staminaMax` 时代码回落到 100，且表里有该键时以其为准（补一条测试钉死）
- [ ] 三包 `tsc --noEmit` 通过
- [ ] 旧分表已移至 `content/_archive/`，导入脚本不再引用

## 边界与禁区

- **不得修改 `content/all.xlsx`**（策划资产）
- 不接 choices 消费方、不改 UI、不顺手做 S04
- 不 git commit
- 遵守 core 铁律
- 动代码后按协议在 `collab/CHANGES.md` 顶部追加一行

## 回执区（dsh 填写）

- 实现说明：
  - **导入链路改为单一工作簿**：重写 `scripts/content-import.mjs`，只读 `content/all.xlsx` 的 15 个 sheet，全量导入到 `packages/core/data/*.json`。缺 sheet、JSON 写错一律打印错误并非零退出，**没有跳过/静默失败分支**；旧的分表读取与「表格比 JSON 旧就跳过」逻辑已全部移除。
  - **sheet → JSON 映射**：balance→balance.json、attributes→attributes.json、actions→actions.json、results→action_results.json、routine+story+choices→events.json、endings→endings.json、tasks→tasks.json、shop→shop.json、logs→logs.json、channels→channels.json、pools→pools.json、members→members.json、characters→characters.json。
  - **choices 落盘方式（任务允许二选一，选「并入 events.json」）**：90 行选项按 `eventId` 归入对应 `story[].choices`。理由：现有消费方（事件弹窗 `availableChoices`、`applyChoice`、服务端重放）已经从 events.json 读 options，若拆成独立 `choices.json` 而不接线，会让线上事件弹窗变成空选项——那属于「改变现有行为」，与「本任务只做导入、不接消费方」的意图相反。并入后无需新增接线，也不破坏现有功能。如需独立 `choices.json`，改为双写即可（见未决问题 2）。
  - **店铺价格**：all.xlsx 的 balance 表新增 `commonPrice=800` / `rarePrice=2000`。导入时把这两个键**从 balance 中摘出**写入 `shop.json` 的 `shop.commonPrice / rarePrice`，`balance.json` 不含它们；`shop.ts` 消费方保持不变（未改）。
  - **staminaMax 缺省**：`packages/core/src/content.ts` 增加 `staminaMaxFrom(balance)`：表里有 `staminaMax` 且为正数则用表内值，否则回落 **100**；`STAMINA_MAX` 由它计算。新增 `stamina-fallback.test.ts` 钉死「无键→100、有键→表内值」。
  - **旧分表退役**：13 个旧 xlsx 已移动到 `content/_archive/`（不删除），导入脚本不再读取。`scripts/content-template.mjs` 顶部加停用 guard：直接提示「内容源改为 content/all.xlsx」并退出，避免误跑模板重新生成分表造成双源。
  - **数值裁定遵守**：`actionMinutes` 按表内 10 导入（未回退）；未修改 `content/all.xlsx`；未接 choices 之外的消费方、未改 UI、未执行 git commit。
- 改动文件清单：
  - `scripts/content-import.mjs`（重写为单工作簿全量导入）
  - `scripts/content-template.mjs`（停用 guard）
  - `packages/core/src/content.ts`（新增 `staminaMaxFrom`，`STAMINA_MAX` 改用之）
  - `packages/core/tests/stamina-fallback.test.ts`（新增，2 条）
  - `packages/core/data/*.json`（13 个 JSON 导入产物）
  - `content/_archive/*.xlsx`（13 个旧分表移动）
  - `collab/CHANGES.md`（追加变更记录，按协议）
- 自测结果（命令 + 输出摘要）：
  - `pnpm content:import` → 全部 15 个 sheet 导入成功，行数：
    `shop=22 attributes=34 actions=35 results=99 routine=90 story=30 choices=90 endings=42 members=49 characters=5 logs=47 tasks=24 channels=5 pools=5`，随后校验通过。
  - `pnpm check:data` → `✓ 配置表校验通过 / actions=35 story=30 routine=90 endings=42`。
  - 行数核对（与验收标准逐项）：actions 35 ✓ / results 99 ✓ / tasks 24 ✓ / attributes 34 ✓ / endings 42 ✓ / shop 22 ✓ / logs 47 ✓ / members 49 ✓ / pools 5 ✓ / channels 5 ✓ / characters 5 ✓。
  - `pnpm test`：core 17 文件 68 条中 **4 条失败**（均为旧内容写死的断言，见未决问题 1），client 1/1 通过。
  - `pnpm --filter @idollife/core test` 新测试 `stamina-fallback.test.ts`：2/2 通过。
  - 三包 `tsc --noEmit`：`packages/core`、`packages/client`、`packages/server` 全部通过。
- 未决问题 / 需要策划再拍板的点：
  1. **4 条既有断言与新内容冲突（按协议未静默修改，请裁定）**：
     - `packages/core/tests/attributes-wired.test.ts`：断言「ambitious=0 时 manager-doubt 不含 `firm`」，但新表 choices 里 `firm` 没有 `requires` 门槛，总是可见。
     - `packages/core/tests/mood.test.ts`：断言唱 K 后饱腹为 64；新 results 表 `vocal-karaoke` 饱腹为 -5（实际 65）。
     - `packages/core/tests/settle.test.ts`：断言打工后资金 1270；新表 `work-part-time` 收入 380（实际 1320）。
     - `packages/core/tests/extra.test.ts`「周末演出按行动位结算」：断言数值 68/70 与新演出结果表不一致。
     请在三种处理中选一：① 按新内容更新这 4 条断言（我来改，改完回写）；② 调整表内数值以匹配旧断言；③ 保留现状作为已知失败。
  2. **choices 是否独立落 `choices.json`**：当前并入 events.json（理由见实现说明）。若策划希望独立文件，请确认，我改为「events.json 保留副本 + 新增 choices.json」双写，或只保留独立文件（需另开消费方接线任务）。
  3. **`content:template` 已停用**：原分表模板脚本不再生成任何文件。若仍需「JSON → 单工作簿」的反向导出，需要重新实现，建议另开任务。
  4. **shop 价格来源**：已改为从 balance 表的 `commonPrice / rarePrice` 读取并写入 shop.json 保留原结构，`shop.ts` 未改；若后续希望 `shop.ts` 直接读 `BALANCE`，需另开任务。