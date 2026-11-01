/**
 * 生成拆分的 Excel 内容模板：node scripts/content-template.mjs
 * 每张表一个 xlsx，放在 content/ 下（枚举字段都带「字段名 + 中文名」两列）
 */
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'packages', 'core', 'data');
const outDir = join(root, 'content');

const load = async (f) => JSON.parse(await readFile(join(dataDir, f), 'utf8'));

const attributes = await load('attributes.json');
const actions = await load('actions.json');
const actionResults = await load('action_results.json');
const events = await load('events.json');
const balance = await load('balance.json');
const endings = await load('endings.json');
const shop = await load('shop.json');
const members = await load('members.json');
const characters = await load('characters.json');
const logs = await load('logs.json');
const tasks = await load('tasks.json');
const channels = await load('channels.json');
const pools = await load('pools.json');

await mkdir(outDir, { recursive: true });

function build(file, sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'idollife';
  for (const { name, headers, rows } of sheets) {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    for (const r of rows) ws.addRow(r);
    ws.columns.forEach((c, i) => {
      c.width = Math.max(12, Math.min(60, (headers[i]?.length ?? 8) * 2 + 10));
    });
  }
  return wb.xlsx.writeFile(join(outDir, file)).catch((err) => {
    if (err.code === 'EBUSY') {
      console.warn(`  ⚠ ${file} 正被 Excel 打开，已跳过（关掉后重新运行）`);
      return;
    }
    throw err;
  });
}

// 1) 属性表
await build('attributes.xlsx', [
  {
    name: 'attributes',
    headers: ['属性分类', '分类字段名', '属性名称', '属性字段名', '是否隐藏', '关联属性'],
    rows: attributes.attributes.map((a) => [
      a.categoryName,
      a.category,
      a.name,
      a.key,
      a.hidden ? 'TRUE' : 'FALSE',
      a.linked,
    ]),
  },
]);

// 2) 行为表
await build('actions.xlsx', [
  {
    name: 'actions',
    headers: ['id', '行为名称', '行为分类', '分类字段名', '显示条件', '次数', '次数范围', '影响属性', '单次分钟'],
    rows: actions.actions.map((a) => [
      a.id,
      a.name,
      a.categoryName ?? '',
      a.category,
      a.displayCondition && Object.keys(a.displayCondition).length ? JSON.stringify(a.displayCondition) : '',
      a.times ?? 0,
      a.timesScope ?? 'run',
      (a.affectedStats ?? []).join(','),
      a.durationMinutes ?? '',
    ]),
  },
]);

// 2.5) 行为结果表
await build('action_results.xlsx', [
  {
    name: 'results',
    headers: ['结果id', '行为id', '行为名称', '行为条件', '优先级', '体力', '金钱', '粉丝', '演唱', '舞蹈', '演技', '口才', '行为文案'],
    rows: actionResults.results.map((r) => {
      const fx = r.effects ?? {};
      const st = fx.stats ?? {};
      const cell = (v) => (Array.isArray(v) ? `${v[0]}~${v[1]}` : (v ?? ''));
      return [
        r.id, r.actionId, r.actionName,
        r.condition && Object.keys(r.condition).length ? JSON.stringify(r.condition) : '',
        r.priority ?? 99,
        fx.stamina ?? '', fx.money ?? '', fx.fans ?? '',
        cell(st.vocal), cell(st.dance), cell(st.acting), cell(st.talk),
        r.text,
      ];
    }),
  },
]);
// 3) 事件表（routine / story / choices）
const choiceRows = [];
for (const e of events.story) {
  for (const c of e.choices) {
    const fx = c.effects ?? {};
    const ax = fx.axes ?? {};
    const st = fx.stats ?? {};
    choiceRows.push([
      e.id, c.id, c.label, c.text,
      fx.stamina ?? '', ax.self ?? '', ax.others ?? '', ax.fit ?? '',
      st.vocal ?? '', st.dance ?? '', st.acting ?? '', st.talk ?? '', c.setFlag ?? '',
    ]);
  }
}
await build('events.xlsx', [
  {
    name: 'routine',
    headers: ['id', 'text', 'stamina', 'stat', 'statName', 'gain'],
    rows: events.routine.map((r) => [
      r.id, r.text, r.stamina, r.stat ?? '', r.statName ?? '', r.gain ?? '',
    ]),
  },
  {
    name: 'story',
    headers: ['id', 'title', 'major', 'text', 'requires'],
    rows: events.story.map((e) => [
      e.id, e.title, e.major ? 'TRUE' : '', e.text,
      e.requires ? JSON.stringify(e.requires) : '',
    ]),
  },
  {
    name: 'choices',
    headers: ['eventId', 'id', 'label', 'text', 'stamina', 'self', 'others', 'fit', 'vocal', 'dance', 'acting', 'talk', 'setFlag'],
    rows: choiceRows,
  },
]);

// 4) 结局表
await build('endings.xlsx', [
  {
    name: 'endings',
    headers: ['id', 'title', 'group', 'groupName', 'text'],
    rows: endings.endings.map((e) => [e.id, e.title, e.group, e.groupName ?? '', e.text]),
  },
]);

// 5) 装备表
await build('shop.xlsx', [
  {
    name: 'shop',
    headers: ['kind', 'name', 'stat', 'statName', 'value'],
    rows: [
      ...shop.shop.common.map((i) => ['common', i.name, i.stat, i.statName ?? '', i.value]),
      ...shop.shop.rare.map((i) => ['rare', i.name, i.stat, i.statName ?? '', i.value]),
    ],
  },
]);

// 6) NPC 池
await build('members.xlsx', [
  {
    name: 'members',
    headers: ['type', 'value', 'name'],
    rows: [
      ...members.members.namePool.map((n) => ['name', n, '']),
      ...members.members.biases.map((b) => ['bias', b, members.members.biasNames?.[b] ?? '']),
    ],
  },
]);

// 7) 全局数值
await build('balance.xlsx', [
  {
    name: 'balance',
    headers: ['key', 'value'],
    rows: Object.entries({
      ...balance.balance,
      commonPrice: shop.shop.commonPrice,
      rarePrice: shop.shop.rarePrice,
    }).map(([k, v]) => [k, v]),
  },
]);

// 8) 主角模板
await build('characters.xlsx', [
  {
    name: 'characters',
    headers: ['id', 'name', 'desc', 'money', 'stamina'],
    rows: characters.characters.map((c) => [
      c.id, c.name, c.desc, c.initial?.money ?? '', c.initial?.stamina ?? '',
    ]),
  },
]);

// 9) 日志文案
await build('logs.xlsx', [
  {
    name: 'logs',
    headers: ['key', 'text'],
    rows: Object.entries(logs.logs).map(([k, v]) => [k, v]),
  },
]);


// 10) 任务表
await build('tasks.xlsx', [
  {
    name: 'tasks',
    headers: ['id', '类型', '任务名', '显示条件', '领取条件', '完成条件', '资金', '体力', '粉丝', '属性奖励', '次数', '任务内容', '任务简报', '优先级'],
    rows: tasks.tasks.map((x) => [
      x.id,
      x.type,
      x.name,
      x.displayCondition && Object.keys(x.displayCondition).length ? JSON.stringify(x.displayCondition) : '',
      x.acceptCondition && Object.keys(x.acceptCondition).length ? JSON.stringify(x.acceptCondition) : '',
      x.completeCondition && Object.keys(x.completeCondition).length
        ? JSON.stringify(x.completeCondition)
        : '',
      x.rewards?.money ?? '',
      x.rewards?.stamina ?? '',
      x.rewards?.fans ?? '',
      x.rewards?.stats ? JSON.stringify(x.rewards.stats) : '',
      x.times ?? 0,
      x.content,
      x.brief,
      x.priority,
    ]),
  },
]);

// 11) 朋友圈渠道表
await build('channels.xlsx', [
  {
    name: 'channels',
    headers: ['id', '名称', '花费', '偏向', '资质最小', '资质最大', '卡池id', '文案'],
    rows: channels.channels.map((c) => [
      c.id,
      c.name,
      c.cost,
      (c.biasPool ?? []).join(','),
      c.quality?.[0] ?? '',
      c.quality?.[1] ?? '',
      c.poolId ?? '',
      c.text,
    ]),
  },
]);

// 12) NPC 卡池表
await build('pools.xlsx', [
  {
    name: 'pools',
    headers: ['id', '卡池名称', '成员（逗号分隔）'],
    rows: pools.pools.map((p) => [p.id, p.name, (p.members ?? []).join(',')]),
  },
]);
console.log('✓ 已生成模板文件到 content/（含 tasks / channels / pools）');
