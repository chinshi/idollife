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
const events = await load('events.json');
const balance = await load('balance.json');
const endings = await load('endings.json');
const shop = await load('shop.json');
const members = await load('members.json');
const characters = await load('characters.json');
const logs = await load('logs.json');

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
  return wb.xlsx.writeFile(join(outDir, file));
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

// 2) 行动表
await build('actions.xlsx', [
  {
    name: 'actions',
    headers: [
      'id', 'name', 'category', 'categoryName', 'stat', 'statName',
      'stamina', 'gainMin', 'gainMax', 'cost', 'money', 'text',
    ],
    rows: actions.actions.map((a) => [
      a.id, a.name, a.category, a.categoryName ?? '',
      a.stat ?? '', a.statName ?? '',
      a.stamina, a.gain?.[0] ?? '', a.gain?.[1] ?? '',
      a.cost ?? '', a.money ?? '', a.text,
    ]),
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

console.log('✓ 已生成 9 个模板文件到 content/（枚举字段均含中英文两列）');
